/* TODO: add Soundcloud support (https://github.com/inspiredtolive/music-bot/blob/7a9a7df0b4bf2ec6f8161709b5e3e0383de2f1bc/lib/module.js)
    instead of request node-fetch (with json method)
    loading metadata via soundcloud api: line 14
    loading stream via soundcloud api: line 91
*/

const _ = undefined;

var config = require('./config.json');

if(config.https){
    var fs = require( 'fs' );
    var app = require('express')();
    var https = require('https');
    var httpsServer = https.createServer({ 
        key: fs.readFileSync('/etc/letsencrypt/live/foramitti.com/privkey.pem'),
        cert: fs.readFileSync('/etc/letsencrypt/live/foramitti.com/fullchain.pem') 
    },app);
    httpsServer.listen(8081);
    var io = require('socket.io').listen(httpsServer);
}
else var io = require('socket.io')(8081);

const anchorme = require("anchorme").default;
const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const ytsr = require('ytsr');
const ytpl = require('ytpl');
const fetch = require('node-fetch');
const mailTransport = require('nodemailer').createTransport({
    host: 'mail.foramitti.com',
    port: 587,
    auth: config.email,
    tls: {
        rejectUnauthorized: false
    }
});

var mongodb;
const MongoClient = require('mongodb').MongoClient;
MongoClient.connect('mongodb://localhost:27017', {useNewUrlParser: true, useUnifiedTopology: true}, (err,client)=>{
    if(err) console.error(err);
    else mongodb = client.db('pnp');
});

const mysql = require('mysql');
mysql.connectResolves = [];
mysql.query = async function(query){
    if(!mysql.connectionReady){
        await new Promise(resolve => mysql.connectResolves.push(resolve));
    }
    try{
        return await new Promise((resolve, reject) => {
            mysql.connection.query(query, (err, result)=>{
                if(err) reject(err);
                else resolve(result);
            });
        });
    }  
    catch(e){
        throw new Error(e);
    }
};

mysql.safeConnect = function(connectionConfig) {
    this.connection = this.createConnection(connectionConfig);

    this.connection.connect((err)=>{
        if(err){
            console.error('Error while connecting to MySQL: ',err);
            setTimeout(()=>this.safeConnect(connectionConfig), 2000);
        } 
        else{
            this.connectionReady = true;
            for(let resolve of this.connectResolves) resolve();
        }
    });

    this.connection.on('error', (err)=>{
        this.connectionReady = false;
        if(err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.log('Lost MySQL connection, reconnecting...');
            this.safeConnect(connectionConfig);
        } else {
            throw err;
        }
    });
}
  
mysql.safeConnect(config.mysql);



// these methods are not complete!!! they just cover hex entities
String.prototype.encodeHTML = function(){
    return this.replace(/[^ \{\|\}~!#\$%\(\)\*\+,-./\d:;\=\?@ABCDEFGHIJKLMNOPQRSTUVWXYZ\[\]\\\^_]/gi, (match) => '&#x'+match.charCodeAt(0).toString(16)+';');
}
String.prototype.decodeHTML = function(){
    return this.replace(/&#x([\dabcdef]+);/gi, (match, numString) => String.fromCharCode(parseInt(numString, 16)));
}
Object.defineProperty(String.prototype, "encodeHTML", {enumerable: false});
Object.defineProperty(String.prototype, "decodeHTML", {enumerable: false});

Math.sum = function(...summands){
    let s = 0;
    for(let x of summands){
        s += parseFloat(x);
    }
    return s;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

Discord.TextChannel.prototype.confirm = async function confirm(msgTxt, func, ...args){
    let reply = await this.send(msgTxt);
    let toggle = true;
    reply.awaitReactions(
        (reaction, user) => {
            if(toggle && reaction.emoji.name === '✅' && user !== this.guild.me.user){
                toggle = false;
                func(...args);
            }
        }, 
        { time: 120000 }
    );
    reply.react('✅');
};
Discord.TextChannel.prototype.sendPages = function sendPages(pages){
    let channel = this;
    if(typeof pages == 'string'){
        let tmpPages = [];
        let offset = 0;
        while(pages.length - offset > 1800){
            let newOffset = pages.lastIndexOf('\n',offset + 1800);
            let skip = 1;
            if(newOffset - offset < 800){
                newOffset = pages.lastIndexOf(' ',offset + 1800);
                if(newOffset - offset < 800){
                    newOffset = offset + 1800;
                    skip = 0;
                }
            }
            tmpPages.push(pages.slice(offset,newOffset));
            offset = newOffset+skip;
        }
        tmpPages.push(pages.slice(offset));
        pages = tmpPages;
    }
    async function sendPage(i){
        let reply = await channel.send(pages[i] + '\n\n[page '+(i+1)+'/'+pages.length+']');
        let toggle = true;
        reply.awaitReactions(
            (reaction, user) => {
                if(!toggle || user === this.guild.me.user) return;
                if(i < pages.length-1 && reaction.emoji.name === '➡️'){
                    toggle = false;
                    sendPage(i+1);
                }
                else if(i > 0 && reaction.emoji.name === '⬅️'){
                    toggle = false;
                    sendPage(i-1);
                }
            }, 
            { time: 180000 }
        );
        if(i > 0) reply.react('⬅️');
        if(i < pages.length-1) reply.react('➡️');
    }
    sendPage(0);
};
Object.defineProperty(Discord.TextChannel.prototype, "confirm", {enumerable: false});
Object.defineProperty(Discord.TextChannel.prototype, "sendPages", {enumerable: false});

Discord.Guild.prototype.getRoles = async function getRoles(){
    return (await this.roles.fetch())
    .cache.filter(role => !['ADMIN','@everyone','Rythm','PnPBot'].includes(role.name)).array();
}
Object.defineProperty(Discord.Guild.prototype, "getRoles", {enumerable: false});


function getReferenceName(name){
    return name.toLowerCase().replace(/\s+/g,'_').replace(/[^\w]/g,'');
}


const Duration = {
    parseISO8601(iso8601Duration) { // returns seconds
        var matches = iso8601Duration.match(/(-)?P(?:([.,\d]+)Y)?(?:([.,\d]+)M)?(?:([.,\d]+)W)?(?:([.,\d]+)D)?(?:T(?:([.,\d]+)H)?(?:([.,\d]+)M)?(?:([.,\d]+)S)?)?/);
    
        return ((matches[1] === undefined)?1:-1)*(
            (matches[8] === undefined ? 0 : parseFloat(matches[8])) + 
            (matches[7] === undefined ? 0 : parseFloat(matches[7])) * 60 + 
            (matches[6] === undefined ? 0 : parseFloat(matches[6])) * 3600 +
            (matches[5] === undefined ? 0 : parseFloat(matches[5])) * 86400 +
            (matches[4] === undefined ? 0 : parseFloat(matches[4])) * 604800 +
            (matches[3] === undefined ? 0 : parseFloat(matches[3])) * 2592000 +
            (matches[2] === undefined ? 0 : parseFloat(matches[2])) * 31536000
        );
    },

    parseClockFormat(durationString){
        let duration = durationString.split(':').map(x => parseInt(x)).reverse();
        if(duration.some(x => Number.isNaN(x))) throw new Error('invalid format');
        return duration[0] + (duration[1] ? (duration[1]*60) : 0) + (duration[2] ? (duration[2]*3600) : 0);
    },

    convertSeconds(seconds){
        let durationObject = {
            sign: seconds < 0 ? '-' : '',
            years: 0,
            months: 0,
            weeks: 0,
            days: 0,
            hours: 0,
            minutes: 0,
            seconds: 0
        };
        if(seconds < 0) seconds = -seconds;
        if(seconds >= 31536000){
            durationObject.years = Math.floor(seconds/31536000);
            seconds = seconds % 31536000;
        }
        if(seconds >= 2592000){
            durationObject.months = Math.floor(seconds/2592000);
            seconds = seconds % 2592000;
        }
        if(seconds >= 604800){
            durationObject.weeks = Math.floor(seconds/604800);
            seconds = seconds % 604800;
        }
        if(seconds >= 86400){
            durationObject.days = Math.floor(seconds/86400);
            seconds = seconds % 86400;
        }
        if(seconds >= 3600){
            durationObject.hours = Math.floor(seconds/3600);
            seconds = seconds % 3600;
        }
        if(seconds >= 60){
            durationObject.minutes = Math.floor(seconds/60);
            seconds = seconds % 60;
        }
        durationObject.seconds = seconds;
        return durationObject;
    }
};

function getURLParameters(url){
    if(!url.includes('?')) return {};
    return Object.fromEntries(url.split('?')[1].split('&').map(x => {
        x = x.split('=');
        x[1] = decodeURIComponent(x[1]);
        return x;
    }));
}

const Youtube = {
    parseTimestamps(description){
        if(!/\d:\d\d/.test(description)) return [];
        let timestamps = [];
        for(let line of description.split('\n')){
            let match = line.match(/(\d+:)?\d+:\d\d/);
            if(!match) continue;
            let timestamp = {};
            timestamp.time = Duration.parseClockFormat(match[0]);
            if(match.index < (line.length - match[0].length)/2){ // timestamp is on the left side of line, e.g. '3:45 - Title of song'
                timestamp.name = line.slice(match.index+match[0].length).trim();
            }
            else{ // timestamp is on the right side of line, e.g. 'Title of song, 3:45'
                timestamp.name = line.slice(0, match.index).trim();
            }
            while(timestamp.name.startsWith('-') || timestamp.name.startsWith(',') || timestamp.name.startsWith(';') || timestamp.name.startsWith('|') || timestamp.name.startsWith(')'))
                timestamp.name = timestamp.name.slice(1).trim();
            while(timestamp.name.endsWith('-') || timestamp.name.endsWith(',') || timestamp.name.endsWith(';') || timestamp.name.endsWith('|') || timestamp.name.endsWith('('))
                timestamp.name = timestamp.name.slice(0,-1).trim();
            
            timestamps.push(timestamp);
        }
        timestamps.sort((a,b) => a.time - b.time);
        return timestamps;
    },

    async search(searchPhrase, {type, nextpageRef, limit}){
        let data = await ytsr(searchPhrase, {limit, nextpageRef});
        if(!data?.items) return {items:[]};

        for(let i in data){
            if(i != 'items' && i != 'nextpageRef') delete data[i];
        }
        let items = [];
        for(let item of data.items){
            if(!type || item.type == type){
                if(item.type == 'video'){
                    if(!item.title) continue;

                    if(!item.duration) continue;
                    item.duration = Duration.parseClockFormat(item.duration);
                    if(!item.duration) continue;

                    if(!item.thumbnail) item.thumbnail = 'https://i.ytimg.com/vi/invalid/hqdefault.jpg';

                    if(!item.author) item.author = {name:''};
                    for(let i in item.author){
                        if(i != 'name' && i != 'ref') delete item.author[i];
                    }

                    item.contentId = item.link?.split('v=')[1];
                    if(!item.contentId) continue;

                    for(let i in item){
                        if(i != 'type' && i != 'title' && i != 'contentId' && i != 'thumbnail' && i != 'author' && i != 'duration') delete item[i];
                    }
                    items.push(item);
                }

                else if(item.type == 'playlist'){
                    if(!item.title) continue;

                    item.length = parseInt(item.length);
                    if(!item.length) continue;

                    if(!item.thumbnail) item.thumbnail = 'https://i.ytimg.com/vi/invalid/hqdefault.jpg';

                    if(!item.author) item.author = {name:''};
                    for(let i in item.author){
                        if(i != 'name' && i != 'ref') delete item[i];
                    }

                    item.contentId = item.link?.split('list=')[1];
                    if(!item.contentId) continue;

                    for(let i in item){
                        if(i != 'type' && i != 'title' && i != 'contentId' && i != 'thumbnail' && i != 'author' && i != 'length') delete item[i];
                    }
                    items.push(item);
                }
            }
        }
        data.items = items;
        return data;
    },

    async videoInfo(videoId){
        let item = await ytdl.getBasicInfo(videoId);
        if(!item.title) throw new Error('no title found for video');

        item.duration = parseInt(item.length_seconds);
        if(!item.duration) throw new Error('invalid duration');

        item.thumbnail = item.playerResponse?.videoDetails?.thumbnail?.thumbnails?.[0]?.url; // 0 for lowest quality
        if(!item.thumbnail) item.thumbnail = 'https://i.ytimg.com/vi/invalid/hqdefault.jpg';

        if(!item.author) item.author = {name:''};
        if(item.author.channel_url) item.author.ref = item.author.channel_url;
        for(let i in item.author){
            if(i != 'name' && i != 'ref') delete item.author[i];
        }

        item.contentId = item.video_id;
        if(!item.contentId) throw new Error('invalid content id');

        if(item.description) item.timestamps = this.parseTimestamps(item.description);
        else item.timestamps = [];

        for(let i in item){
            if(i != 'title' && i != 'contentId' && i != 'thumbnail' && i != 'author' && i != 'duration' && i != 'timestamps') delete item[i];
        }
        
        return item;
    },

    async playlistItems(playlistId){
        let data = await ytpl(playlistId,{limit:Infinity});
        if(!data?.items) return [];

        // more efficient, since no secondary call needed, but does not provide description for timestamp retrieval:
        /*let items = [];
        for(let item of data.items){
            if(!item.title) continue;

            if(!item.duration) continue;
            item.duration = Duration.parseClockFormat(item.duration);
            if(!item.duration) continue;

            if(!item.thumbnail) item.thumbnail = 'https://i.ytimg.com/vi/invalid/hqdefault.jpg';

            if(!item.author) item.author = {name:''};
            for(let i in item.author){
                if(i != 'name' && i != 'ref') delete item.author[i];
            }

            item.contentId = item.id;
            if(!item.contentId) continue;

            for(let i in item){
                if(i != 'title' && i != 'contentId' && i != 'thumbnail' && i != 'author' && i != 'duration') delete item[i];
            }
            items.push(item);
            return items;
        }*/
        return await Promise.all(data.items.map(x => this.videoInfo(x.id)));
    }
};

var objectSets = {
    Queue: new Map(),
    Song: new Map()
}


class Queue {
    static nextId = 0;

    constructor(name, songs){
        this.id = Queue.nextId++;
        if(Queue.nextId >= Number.MAX_SAFE_INTEGER) Queue.nextId = 0;
        objectSets.Queue.set(this.id, this);
        this.name = name;
        this.songs = songs ?? []; // contains actual object references
        this.currentSong = null;
    }

    removeSong(song){
        this.songs.splice(this.songs.indexOf(song), 1);
        objectSets.Song.delete(song.id);
        io.emit('music_updateQueue_'+this.id,{songs: this.songs.map(x => x.id)});
    }

    addSongs(songs){
        this.songs.push(...songs);
        io.emit('music_updateQueue_'+this.id,{songs: this.songs.map(x => x.id)});
    }

    clear(){
        for(let song of this.songs) objectSets.Song.delete(song.id);
        this.songs = [];
        io.emit('music_updateQueue_'+this.id,{songs: this.songs.map(x => x.id)});
    }

    next(settings){
        let index = this.songs.indexOf(this.currentSong);
        if(index < 0) return null;

        if(settings.autoclean && this.songs.length > 1){
            this.songs.splice(index, 1);
            io.emit('music_updateQueue_'+this.id,{songs: this.songs.map(x => x.id)});
        }
        else index++;

        if(this.songs.length == 0) return null;

        if(settings.shuffle){
            if(settings.autoclean && this.songs.length < 2) return null;
            return this.songs[Math.floor(Math.random()*this.songs.length)];
        }
        else if(this.songs[index]) return this.songs[index];
        else if(settings.wrapAround) return this.songs[0];
        else return null;
    }

    previous(settings){
        let index = this.songs.indexOf(this.currentSong);
        if(index < 0) return null;

        index--;

        if(settings.shuffle) return this.songs[Math.floor(Math.random()*this.songs.length)];
        else if(this.songs[index]) return this.songs[index];
        else if(settings.wrapAround) return this.songs[this.songs.length-1];
        else this.songs[0];
    }

    moveSong(song, newIndex){
        let index = this.songs.indexOf(song);
        if(index < 0) return false;
        this.songs.splice(index, 1);
        this.songs.splice(newIndex, 0, song);
        io.emit('music_updateQueue_'+this.id,{songs: this.songs.map(x => x.id)});
        return true;
    }

    rename(newName){
        this.name = newName;
        io.emit('music_updateQueue_'+this.id,{name: this.name});
    }

    getData(){
        return {
            id: this.id,
            name: this.name,
            songs: this.songs.map(x => x.id)
        };
    }
}

class Song {
    static nextId = 0;

    constructor(queue, service, contentId, name, author, thumbnail, duration, timestamps){
        this.id = Song.nextId++;
        if(Song.nextId >= Number.MAX_SAFE_INTEGER) Song.nextId = 0;
        objectSets.Song.set(this.id, this);

        this.queue = queue;
        this.service = service; // string
        this.contentId = contentId; // string
        this.name = name; // string
        this.author = author; // {name[, ref(url to author)]}
        this.thumbnail = thumbnail; // string url
        this.duration = duration; // number in seconds
        this.timestamps = timestamps ?? []; // array of timestamp objects: {name, time<number in seconds>}
    }

    getStream(){
        if(this.service === 'YouTube'){
            return ytdl('https://www.youtube.com/watch?v='+this.contentId, {
                filter: 'audioonly',
                quality: 'lowestaudio',
                highWaterMark: 10485760 // buffer size: 10 megabytes
            });
        }
        else{
            return null;
        }
    }

    getData(){
        return {
            id: this.id,
            service: this.service,
            contentId: this.contentId,
            name: this.name,
            author: this.author,
            thumbnail: this.thumbnail,
            duration: this.duration,
            timestamps: this.timestamps
        };
    }

    static async getFromURL(url, queue){
        if(url.startsWith('https://')) url = url.substring(8);
        if(url.startsWith('http://')) url = url.substring(7);
        if(url.startsWith('www.')) url = url.substring(4);

        if(this.isCollection(url)) return (await this.getCollection(url, queue));
        return [await this.getSingle(url, queue)];
    }

    static async getSingle(url, queue){
        // var urlParameters = getURLParameters(url);

        if(url.startsWith('youtube.com/watch')){
            if(!ytdl.validateURL(url)) throw 'Not a valid youtube url';
            
            let ytData;
            try{
                ytData = await Youtube.videoInfo(url);
            }
            catch(e){
                throw 'Unable to fetch video meta data. Error: '+e.stack;
            }
            if(!ytData) throw 'Unable to fetch video meta data.';
            return new Song(queue, 'YouTube', ytData.contentId, ytData.title, ytData.author, ytData.thumbnail, ytData.duration, ytData.timestamps);
        }

        
    }

    static async getCollection(url, queue){
        var songs = [];
        // var urlParameters = getURLParameters(url);

        if(url.startsWith('youtube.com/playlist')){
            if(!ytpl.validateURL(url)) throw 'Not a valid youtube url';
            
            let ytData;
            try{
                ytData = await Youtube.playlistItems(await ytpl.getPlaylistID(url));
            }
            catch(e){
                throw 'Unable to fetch playlist data. Error: '+e.stack;
            }
            if(!ytData) throw 'Unable to fetch playlist data.';

            for(let x of ytData){
                songs.push(new Song(queue, 'YouTube', x.contentId, x.title, x.author, x.thumbnail, x.duration, x.timestamps));
            }
        }

        return songs;
    }

    static isCollection(url){
        if(url.startsWith('youtube.com/playlist')) return true;
        if(url.startsWith('youtube.com/watch')) return false;
    }
}

var discord = {
    client: new Discord.Client(),
    PREFIX: config.discord.commandPrefix,
    server: {
        async init(guild){
            this.guild = guild;
            this.music.guild = guild;
    
            let promises = [];
            for(let memberId of (await guild.members.fetch()).keyArray()){
                promises.push(this.initUser(memberId));
            }
            await Promise.all(promises);

            this.music.checkStreamHealth();
    
            this.ready();
        },
    
        initUser(id){
            return mongodb.collection('DiscordUser').updateOne(
                {_id:id},
                {$setOnInsert:{
                    notifications:{
                        discord: false,
                        email: [],
                        push: [],
                        telegram: []
                    }
                }},
                {upsert: true}
            );
        },
    
        music: {
            currentQueue: new Queue('Default'),
            currentSong: null,
            playing: false,
            startedPlayingFrom: 0,
    
            voiceConnection: null,
            dispatcher: null,
            stream: null,
            lastVoiceChannel: null,
            streamHealthLastTimestamp: null,
            streamHealthCheckingPause: false,
    
            settings: {
                autoplay: true,
                loop: false,
                wrapAround: true,
                autoclean: false,
                shuffle: false
            },

            async checkStreamHealth(){
                if(this.playing && !this.streamHealthCheckingPause){
                    let timestamp = await this.getCurrentPostion();
                    if(this.streamHealthLastTimestamp == timestamp){
                        console.error('stream died -> restart from ', this.streamHealthLastTimestamp);
                        // stream died -> restart from last timestamp
                        await this.destroyDispatcher();
                        this.play(this.streamHealthLastTimestamp);
                    }
                    this.streamHealthLastTimestamp = timestamp;
                }
                setTimeout(()=>this.checkStreamHealth(), 3000);
            },


            abortPauseStreamHealthChecking: ()=>{},

            pauseStreamHealthChecking(duration=60){
                // duration in seconds

                this.abortPauseStreamHealthChecking();
                this.streamHealthCheckingPause = true;

                let aborted = false;
                this.abortPauseStreamHealthChecking = ()=>{
                    aborted = true;
                }

                setTimeout(()=>{
                    if(!aborted) this.streamHealthCheckingPause = false;
                }, duration * 1000);
            },

    
            async joinVoiceChannel(msg){
                await this.onready;
                // if no message given, join the last voice channel
                if(!msg){
                    if(await this.getVoiceConnection()) return true;
                    if(this.lastVoiceChannel){
                        this.voiceConnection = await this.lastVoiceChannel.join();
                    }
                    else{
                        throw 'No message given to retrieve author\'s voice channel, nor remembers the last voice connection.';
                    }
                }
                // else join the same voice channel as the author of the message
                else if(!msg.guild?.voice || !this.voiceConnection){
                    if(!msg.member?.voice){
                        msg.channel.send('The bot is currently not in a Voice Channel. Please first join a voice channel to indicate where the bot should join.');
                        return false;
                    }
                    this.lastVoiceChannel = msg.member.voice.channel;
                    this.voiceConnection = await msg.member.voice.channel.join();
                }
                else if(msg.member.voice?.channel && msg.member.voice.channel !== msg.guild.voice.channel){
                    msg.channel.send('command from member in another voice channel -> changing channel');
                    this.lastVoiceChannel = msg.member.voice.channel;
                    this.voiceConnection = await msg.member.voice.channel.join();
                }
                this.voiceConnection.on('disconnect',()=>{
                    this.voiceConnection = null;
                    this.dispatcher = null;
                    this.playing = false;
                    io.emit('music_playing',false);
                });
                return true;
            },
    
            async play(position=0){
                // postion in seconds
                await this.onready;
                if(this.currentQueue.songs.length === 0 || !(await this.getVoiceConnection())){
                    console.error('unable to play (no songs or no voice connection)', this.currentQueue.songs.length, await this.getVoiceConnection());
                    return false; // unable to play (no songs or no voice connection)
                }
                if(await this.getDispatcher()) return await this.resume(); // if already playing nothing to do
    
                this.pauseStreamHealthChecking();

                if(!this.currentSong){ // if no current song, take first song of current queue
                    this.currentSong = this.currentQueue.currentSong = this.currentQueue.songs[0];
                    io.emit('music_currentSong',this.currentSong.id);
                }
                let stream = this.currentSong.getStream();
                
                this.dispatcher = (await this.getVoiceConnection()).play(stream, {
                    seek: position,
                    highWaterMark: 48
                });
                this.playing = true;
                this.startedPlayingFrom = position;
                io.emit('music_playing',true);
                io.emit('music_syncTime',position);
    
                this.dispatcher.on('finish', () => this.handleEndOfStream());
    
                return true;
            },
    
            handleEndOfStream(){
                this.dispatcher = null;

                if(!this.settings.autoplay || this.currentQueue.songs.length === 0){
                    this.playing = false;
                    io.emit('music_playing', false);
                    this.dispatcher = null;
                    return;
                }
    
                if(this.settings.loop) this.play();
                else this.next();
            },
    
            async skipToTime(position){
                await this.onready;
                // postion in seconds
                if(this.currentSong?.duration<position) return false;
                await this.destroyDispatcher();
                this.play(position);
                return true;
            },
    
            async getCurrentPostion(){
                await this.onready;
                let dispatcher = await this.getDispatcher();
                if(!dispatcher) return null;
                return this.startedPlayingFrom + (dispatcher.streamTime/1000); // in seconds
            },
    
            async resume(){
                await this.onready;
                let dispatcher = await this.getDispatcher();
                if(!dispatcher) return await this.play();
                if(this.playing) return true;
                dispatcher.resume();
                this.playing = true;
                io.emit('music_playing',true);
                return true;
            },
    
            async pause(){
                await this.onready;
                let dispatcher = await this.getDispatcher();
                if(!dispatcher) return false;
                dispatcher.pause();
                this.playing = false;
                io.emit('music_playing',false);
                return true;
            },
    
            async stop(){
                await this.onready;
                let dispatcher = await this.getDispatcher();
                if(!dispatcher) return false;
                await this.destroyDispatcher();
                (await this.getVoiceConnection()).disconnect();
                this.playing = false;
                io.emit('music_playing',false);
                io.emit('music_syncTime',0);
                return true;
            },
    
            async next(){
                await this.onready;
                
                await this.destroyDispatcher();
                let song = this.currentQueue.next(this.settings);
                if(song){
                    this.currentSong = this.currentQueue.currentSong = song;
                    io.emit('music_currentSong',this.currentSong.id);
                    this.play();
                }
                else{
                    this.playing = false;
                    io.emit('music_playing',false);
                    io.emit('music_syncTime',0);
                }
            },
    
            async previous(){
                await this.onready;
    
                await this.destroyDispatcher();
                let song = this.currentQueue.previous(this.settings);
                if(song){
                    this.currentSong = this.currentQueue.currentSong = song;
                    io.emit('music_currentSong',this.currentSong.id);
                    this.play();
                }
                else{
                    this.playing = false;
                    io.emit('music_playing',false);
                    io.emit('music_syncTime',0);
                }
            },
    
            async playSong(songId){
                await this.onready;

                let song = objectSets.Song.get(songId);
                if(!song) return false;
    
                if(song == this.currentSong) return true;
    
                await this.destroyDispatcher();
    
                this.currentQueue.currentSong = null;
                this.currentQueue = song.queue;
                this.currentSong = this.currentQueue.currentSong = song;
                io.emit('music_currentSong',this.currentSong.id);
                this.play();
                return true;
            },

            async skipToIndex(index){
                if(index < 0 || index >= this.currentQueue.songs.length) throw 'index out of bound';

                let song = this.currentQueue.songs[index];
                if(!song) throw 'song not found';
    
                if(song == this.currentSong) return true;
    
                await this.destroyDispatcher();
    
                this.currentSong = this.currentQueue.currentSong = song;
                io.emit('music_currentSong',this.currentSong.id);
                this.play();
                return true;
            },
    
            async removeSong(songId){
                await this.onready;

                let song = objectSets.Song.get(songId);
                if(!song) return false;
    
                if(song == this.currentSong){
                    await this.destroyDispatcher();
    
                    this.currentSong = this.currentQueue.currentSong = this.currentQueue.songs[this.currentQueue.songs.indexOf(song)+1];
                    io.emit('music_currentSong',this.currentSong?.id);

                    if(this.playing){
                        if(!this.settings.autoplay || !this.currentSong){
                            this.playing = false;
                            io.emit('music_playing', false);
                        }
                        else this.play();
                    }
                }

                song.queue.removeSong(song);
            },

            async removeQueue(queueId){
                await this.onready;

                if(objectSets.Queue.size < 2) throw 'Last queue cannot be removed';

                let queue = objectSets.Queue.get(queueId);
                if(!queue) return false;

                if(this.currentSong?.queue == queue){
                    await this.destroyDispatcher();

                    objectSets.Queue.delete(queueId);

                    this.currentQueue = objectSets.Queue.values().next().value;
                    this.currentSong = this.currentQueue.currentSong = this.currentQueue.songs[0];
                    io.emit('music_currentSong',this.currentSong?.id);
                    
                    if(this.playing){
                        if(this.currentSong) this.play();
                        else{
                            this.playing = false;
                            io.emit('music_playing',false);
                            io.emit('music_syncTime',0);
                        }
                    }
                }
                else{
                    objectSets.Queue.delete(queueId);
                }

                io.emit('music_removeQueue_'+queueId);
                return true;
            },

            addQueue(name){
                let queue = new Queue(name);
                io.emit('music_addQueue', queue.getData());
            },

            async clearQueue(queueId){
                await this.onready;

                let queue = objectSets.Queue.get(queueId);
                if(!queue) return false;

                if(this.currentSong?.queue == queue){
                    await this.destroyDispatcher();
                    this.playing = false;
                    io.emit('music_playing',false);
                    io.emit('music_syncTime',0);
                    this.currentSong = null;
                    io.emit('music_currentSong',null);
                }

                queue.clear();

                return true;
            },
    
            moveSong(songId, newIndex){
                let song = objectSets.Song.get(songId);
                if(!song) return false;
    
                return song.queue.moveSong(song, newIndex);
            },

            addSongs(queueId, songs){
                let queue = objectSets.Queue.get(queueId);
                if(!queue) return false;

                let songObjs = [];
                for(let song of songs){
                    if('service' in song && 'contentId' in song && 'name' in song && 'author' in song && 'thumbnail' in song && 'duration' in song && 'name' in song.author)
                        songObjs.push(new Song(queue, song.service, song.contentId, song.name, song.author, song.thumbnail, song.duration));
                }

                queue.addSongs(songObjs);
            },

            async addURL(queueId, url){
                let queue = objectSets.Queue.get(queueId);
                if(!queue) throw 'invalid queueId';

                let songs = await Song.getFromURL(url, queue);
                if(!songs.length) throw 'unable to retrieve songs from URL';
                queue.addSongs(songs);
                return songs[0].id;
            },
    
            updateSetting(setting, value){
                if(setting in this.settings){
                    this.settings[setting] = value;
                    io.emit('music_updateSetting', setting, value);
                }
            },
        
            async getVoiceConnection(){
                await this.onready;
                if(!this.guild.voice || !this.guild.voice.channel) this.voiceConnection = null;
                return this.voiceConnection;
            },
        
            async getDispatcher(){
                await this.onready;
                if(!(await this.getVoiceConnection())) this.dispatcher = null;
                return this.dispatcher;
            },
        
            async destroyDispatcher(){
                await this.onready;
                (await this.getDispatcher())?.destroy();
                this.dispatcher = null;
            }
        }
    }
};
discord.server.onready = discord.server.music.onready = new Promise(resolve => {discord.server.ready = resolve});



discord.client.on('ready', () => {
    console.log('Bot is online');
});

discord.client.on('guildMemberAdd', member => {
    discord.server.initUser(member.user.id);
});

const notifications = {
    push(user, text, url){
        if(!user.notifications.push.length) return;
        for(let device of user.notifications.push){
            if(device.token) fetch('https://fcm.googleapis.com/fcm/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'key='+config.firebase.messagingServerKey
                },
                body: JSON.stringify({
                    "notification": {
                        "title": "P&P Announcement",
                        "body": text,
                        "click_action": url,
                        "icon": "https://foramitti.com/elias/pnp/logo/favicon-192x192-maskable.png"
                    },
                    "to": device.token
                })
            });
        }
    },

    email(user, text, url){
        if(!user.notifications.email.length) return;
        text = anchorme({
            input: text,
            options: {
                attributes: {
                    target: "_blank"
                }
            }
        });
        mailTransport.sendMail(
            {
                from: 'elias@foramitti.com', // Sender address
                to: user.notifications.email,         // List of recipients
                subject: 'P&P Announcement',
                html: 
`<h3>P&P Announcement:</h3>
${text}<br><br><br>
Original discord message: <a href="${url}">${url}</a>`
            }, function(err, info) {
            if (err) {
              console.error('Error while sending email', user.notifications.email, err);
            }
        });
    },

    telegram(user, text, url){

    },

    async discord(user, text, url){
        if(!user.notifications.discord) return;
        try{
            user = await discord.server.guild.members.fetch(user._id);
        }
        catch(e){
            return console.error('Error while looking for user when sending announcement, id: ', user._id, ', error: ', e);
        }
        if(!user) return console.error('User not found when sending announcement');
        user.send('P&P Announcement:\n' + text + '\n\nOriginal message: ' + url);
    },

    all(user, text, url){
        this.push(user, text, url);
        this.email(user, text, url);
        this.telegram(user, text, url);
        this.discord(user, text, url);
    }
}

discord.client.on('message', async function(msg){
    if(msg.mentions.everyone && msg.content.startsWith('@everyone')){ // announcement
        let text = msg.content.substring(9);
        // read initialized users from MongoDB (only use those with notification settings)
        let users = await mongodb.collection('DiscordUser').find().toArray();
        for(let i=0; i<users.length; i++){
            if(
                !users[i].notifications.discord && 
                !users[i].notifications.email.length &&
                !users[i].notifications.push.length &&
                !users[i].notifications.telegram.length
            ){
                users.splice(i,1);
                i--;
            }
        }
        
        for(let user of users){
            let member;
            try{
                member = await msg.guild.members.fetch(user._id);
            }
            catch(e){
                return;
            }
            let role = (await msg.guild.getRoles()).find(x => x.name.toLowerCase() == msg.channel.name.toLowerCase());
            if(role){
                if(member.roles.cache.has(role.id)){
                    // send notifications on various platforms
                    notifications.all(user, text, msg.url);
                }
            }
            else{ // fallback to reading permissions
                if(msg.channel.permissionsFor(member).has(Discord.Permissions.FLAGS.VIEW_CHANNEL)){
                    // send notifications on various platforms
                    notifications.all(user, text, msg.url);
                }
            }
        }
    }

    else if(msg.channel.name == 'bot' && msg.content.startsWith(discord.PREFIX)){ // command
        
        let args = msg.content.substring(discord.PREFIX.length).replace(/ +/g,' ').split(" ");
        args[0] = args[0].toLowerCase();
        let reply;

        switch(args[0]){
            case 'ping':
                msg.channel.send('pong');
                break;
            
            case 'init':
                msg.channel.send(`Initalization link for <@${msg.author.id}>: https://foramitti.com/elias/pnp/?init=${msg.author.id}`);
                break;
            
            case 'roles':
                msg.channel.send(
                    'Available roles:\n'+
                    (await msg.guild.getRoles())
                    .map(role => '`'+role.name+'`')
                    .join('\n')
                );
                break;
            
            case 'role':
                args[1] = args[1].toLowerCase();
                if(args[1] == 'add'){
                    let role = (await msg.guild.getRoles()).find(x => x.name.toLowerCase() == args[2].toLowerCase());
                    if(!role) return msg.channel.send('Unknown role as third argument. You can take a look at the list of available roles via the command `'+discord.PREFIX+'roles`');
                    await msg.member.roles.add(role);
                    msg.channel.send(`Added role \`${role.name}\` to <@${msg.author.id}>`);
                }
                else if(args[1] == 'rem' || args[1] == 'remove'){
                    let role = (await msg.guild.getRoles()).find(x => x.name.toLowerCase() == args[2].toLowerCase());
                    if(!role) return msg.channel.send('Unknown role as third argument. You can take a look at the list of available roles via the command `'+discord.PREFIX+'roles`');
                    await msg.member.roles.remove(role);
                    msg.channel.send(`Removed role \`${role.name}\` from <@${msg.author.id}>`);
                }
                else msg.channel.send('The second argument has to be either `add` or `remove`/`rem`, e.g. to assign yourself the role ura-cycle-1 type `'+
                discord.PREFIX+'role add ura-cycle-1`');
                break;

            case 'join':
                await discord.server.music.joinVoiceChannel(msg);
            break;

            case 'add':  case 'append':
                if(!args[1]){
                    msg.channel.send('You need to provide a link to append');
                    break;
                }
            case 'play':

                if(args[1]){
                    // interpret as adding passed link into queue
                    
                    try{
                        let firstSongId = await discord.server.music.addURL(discord.server.music.currentQueue.id, args[1]);
                        if(args[0] == 'play'){
                            if(!(await discord.server.music.joinVoiceChannel(msg))) break;
                            // for some reason it does not play without this delay
                            // (altough everything is loaded and some stream is retrieved, somehow the song seems to be not ready to produce a *healthy* stream immediatelly)
                            await sleep(1500);
                            await discord.server.music.playSong(firstSongId);
                        }
                    }
                    catch(e){
                        if(e instanceof Error) e = e.stack;
                        msg.channel.send('Error: '+e);
                        break;
                    }
                    
                    break;
                }

                //else interpret as resume ->
            case 'resume':
                if(!(await discord.server.music.joinVoiceChannel(msg))) break;
                discord.server.music.resume();
            break;

            case 'pause':
                discord.server.music.pause();
            break;
            
            case 'stop':
                discord.server.music.stop();
            break;

            case 'clear':
                msg.channel.confirm('Are you sure you want to clear the music queue?', () => discord.server.music.clearQueue(discord.server.music.currentQueue.id));
            break;

            // TODO:
            /*case 'remove':
            break;*/

            case 'autoplay':
                discord.server.music.updateSetting('autoplay', !discord.server.music.settings.autoplay);
                msg.channel.send('Autoplay **' + (discord.server.music.settings.autoplay?'on':'off') + '**');
            break;

            case 'loop':
                discord.server.music.updateSetting('loop', !discord.server.music.settings.loop);
                msg.channel.send('Loop **' + (discord.server.music.settings.loop?'on':'off') + '**');
            break;
            
            case 'wraparound': case 'wrap':
                discord.server.music.updateSetting('wrapAround', !discord.server.music.settings.wrapAround);
                msg.channel.send('Wrap Around **' + (discord.server.music.settings.wrapAround?'on':'off') + '**');
            break;

            case 'autoclean':
                discord.server.music.updateSetting('autoclean', !discord.server.music.settings.autoclean);
                msg.channel.send('Autoclean **' + (discord.server.music.settings.autoclean?'on':'off') + '**');
            break;

            case 'shuffle':
                discord.server.music.updateSetting('shuffle', !discord.server.music.settings.shuffle);
                msg.channel.send('Shuffle **' + (discord.server.music.settings.shuffle?'on':'off') + '**');
            break;

            case 'info':
                msg.channel.send(
                    'Playing: **' + (discord.server.music.playing?'yes':'no') + 
                    '**\nAutoplay: **' + (discord.server.music.settings.autoplay?'on':'off') + 
                    '**\nWrapping around: **' + (discord.server.music.settings.wrapAround?'on':'off') + 
                    '**\nLoop: **' + (discord.server.music.settings.loop?'on':'off') + 
                    '**\nShuffle: **' + (discord.server.music.settings.shuffle?'on':'off') + 
                    '**\nAutoclean: **' + (discord.server.music.settings.autoclean?'on':'off') + '**\n'
                );
            break;
            
            case 'queue': case 'playlist': case 'list':
                reply = 'Queue:\n';
                if(!discord.server.music.currentQueue?.songs?.length) reply += '   *empty*'
                else for(let i in discord.server.music.currentQueue.songs){
                    reply += `${discord.server.music.currentQueue.songs[i] == discord.server.music.currentSong ? ' ▸':'     '} ${parseInt(i)+1}. ${
                        discord.server.music.currentQueue.songs[i].name.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\|/g,'\\|').replace(/\*/g,'\\*').replace(/_/g,'\\_')
                        .replace(/~/g,'\\~').replace(/>/g,'\\>').replace(/:/g,'\\:').replace(/#(?! )/g,'# ').replace(/@(?! )/g,'@ ')
                    }` + '\n';
                }
                if(reply.length > 1800){
                    reply = reply.split('\n');
                    reply.shift;
                    let pages = ['Queue:'];
                    for(let line of reply){
                        if(pages[pages.length-1].length + line.length < 1800) pages[pages.length-1] += '\n'+line;
                        else pages.push(line);
                    }
                    msg.channel.sendPages(pages);
                }
                else msg.channel.send(reply);
            break;

            case 'np': case 'nowplaying': case 'nowplay': case 'cp': case 'currentlyplaying': 
            case 'currentlyplay': case 'currentplaying': case 'currentplay':
                let dispatcher = await discord.server.music.getDispatcher();
                if(discord.server.music.currentSong && dispatcher){
                    let progress = dispatcher.streamTime/discord.server.music.currentSong.duration/1000;
                    msg.channel.send(
                        `${
                            discord.server.music.currentSong.name.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\|/g,'\\|').replace(/\*/g,'\\*').replace(/_/g,'\\_')
                            .replace(/~/g,'\\~').replace(/>/g,'\\>').replace(/:/g,'\\:').replace(/#(?! )/g,'# ').replace(/@(?! )/g,'@ ')
                        } (${discord.server.music.currentSong.service})`+'\n'+
                        '▬'.repeat(Math.round(progress*18))+
                        ':radio_button:'+
                        '▬'.repeat(Math.round((1-progress+0.0001)*18))
                    );
                }
                else msg.channel.send('Nothing playing at the moment');
            break;

            case 'skipto':
                if(!args[1]) return msg.channel.send('You need to specify the queue position where to skip to as a positive integer or provide a timestamp of the form hh:mm:ss or mm:ss');

            case 'skip': 
                if(args[1]){
                    if(args[1].includes(':')){ // jumpToPosition mm:ss or hh:mm:ss
                        try{
                            let time = Duration.parseClockFormat(args[1]);
                            discord.server.music.skipToTime(time);
                        }
                        catch(e){
                            return msg.channel.send('You need to specify the queue position where to skip to as a positive integer or provide a timestamp of the form hh:mm:ss or mm:ss');
                        }
                    }
                    else{ // interpret as index
                        let index = parseInt(args[1])-1;
                        if(Number.isNaN(index))
                            return msg.channel.send('You need to specify the queue position where to skip to as a positive integer or provide a timestamp of the form hh:mm:ss or mm:ss');
                        try{
                            await discord.server.music.skipToIndex(index);
                        }
                        catch(e){
                            if(e instanceof Error) e = e.stack;
                            msg.channel.send('Error: '+e);
                        }
                    }
                    break;
                }
                // else interpret as next ->
            case 'next':
                discord.server.music.next();
            break;

            case 'prev': case 'previous': case 'last':
                discord.server.music.previous();
            break;

            case 'dice': case 'd':
                if(!args[1]){
                    // msg.channel.send('You need to specify a dice with eg. `!dice 2d6` or `!dice 2D6` or `!dice 2 6` with the first number being the number of dice and the second the number of faces.\nSpecial dices:\n- d2^n');
                    msg.channel.send('You need to specify a dice with eg. `!dice 2d6`');
                    break;
                }

                formula = args.slice(1).join(' ');

                let match = formula.search(/[^\s\ddklh\+\-\*\/\^\(\)abs]/i);
                if(match > 0) return msg.channel.send(`Error: contains invalid character '${formula[match]}' at position ${match}`);

                match = formula.match(/(\d*d\d+(k\d*(l|h)?)?|\+|\-|\*|\/|\^|\(|\)|\d|abs|\s)+/i);
                if(!match) return msg.channel.send('Error: invalid syntax');
                if(match.index != 0) return msg.channel.send('Error: invalid syntax at the beginning');
                if(match[0].length != formula.length) return msg.channel.send(`Error: invalid syntax anywhere starting from postion ${match[0]}: '${formula.slice(match[0].length)}'`);

                let bracket = 0;
                for(let x of formula){
                    if(x == '(') bracket++;
                    else if(x == ')') bracket--;
                    if(bracket < 0) return msg.channel.send('Error: unbalanced brackets');
                }
                if(bracket != 0) return msg.channel.send('Error: unbalanced brackets');

                match = formula.search(/[\+\-\*\/\^]\s*[\+\-\*\/\^\)]/i);
                if(match > 0) return msg.channel.send(`Error: algebraic symbol at position ${match} is followed directly by another algebraic symbol or closing bracket`);

                match = formula.search(/\(\s*[\+\*\/\^]/i);
                if(match > 0) return msg.channel.send(`Error: opening bracket at position ${match} is followed directly by algebraic symbol`);
                match = formula.search(/\(\s*\)/i);
                if(match > 0) return msg.channel.send(`Error: empty brackets at position ${match}`);

                match = formula.search(/\d*d\d+(k\d*(l|h)?)?\s*(\d*d\d+(k\d*(l|h)?)?|\(|abs)/i);
                if(match > 0) return msg.channel.send(`Error: dice specifier at position ${match} is not followed by algebraic symbol or closing bracket`);

                match = formula.search(/\d\s*(abs|\()/i);
                if(match > 0) return msg.channel.send(`Error: number at position ${match} is followed by abs or opening bracket`);

                match = formula.search(/abs\s*[^\s\(]/i);
                if(match > 0) return msg.channel.send(`Error: abs at position ${match} is not followed by an opening bracket`);

                match = formula.matchAll(/(\d*)d\d+k(\d*)(l|h)?/ig);
                for(let x of match){
                    let number = x[1] === '' ? 1 : parseInt(x[1]);
                    if(!number) return msg.channel.send(`Error: dice specifier '${x[0]}' at position ${x.index} has invalid number of dice`);
                    let keep = x[2] === '' ? 1 : parseInt(x[2]);
                    if(!number) return msg.channel.send(`Error: dice specifier '${x[0]}' at position ${x.index} has invalid number of dice to keep`);
                    if(keep > number) return msg.channel.send(`Error: dice specifier '${x[0]}' at position ${x.index} has invalid number of dice to keep (more than overall number)`);
                }

                formula = formula.trim();
                if(formula[0] == '+' || formula[0] == '/' || formula[0] == '*' || formula[0] == '^') return msg.channel.send('Error: invalid syntax at the beginning');
                let l = formula.length-1;
                if(formula[l] == '+' || formula[l] == '-' || formula[l] == '/' || formula[l] == '*' || formula[l] == '^') return msg.channel.send('Error: invalid syntax at the end');


                formula = formula.toLowerCase().replace(/\s/g,'').replace(/\^/g,'**').replace(/abs/g, 'Math.abs');
                formula = formula.replace(/(\d*)d(\d+)(k(\d*)(l|h)?)?/ig, function(match, number, faces, keepSubMatch, keep, keepType){
                    number = parseInt(number);
                    if(!number) number = 1;
                    faces = parseInt(faces);
                    let rolls = [];
                    for(let i = 0; i < number; i++) rolls.push(Math.ceil(Math.random()*faces));
                    if(keepSubMatch){
                        keep = parseInt(keep);
                        if(!keep) keep = 1;
                        rolls.sort((a,b)=>a-b);
                        if(keepType == 'l') rolls = rolls.slice(0,keep);
                        else rolls = rolls.slice(-keep);
                    }
                    return Math.sum(...rolls);
                });
                try{
                    msg.channel.send('Result: ' + eval(formula));
                }
                catch(e){
                    if(e instanceof Error) e = e.stack;
                    msg.channel.send('Error during eval: '+e);
                    return;
                }
            break;

            case 'web':
                msg.channel.send('https://foramitti.com/elias/pnp/');
            break;

            case 'help': case 'commands':
                msg.channel.sendPages(
`List of available commands:
**GENERAL:**
\`${discord.PREFIX}web\`: sends the url to the web interface
\`${discord.PREFIX}init\`: sends a link to connect/initialize the web interface on a new device with the discord user (enables you to adjust cross-device settings like notifications etc.)
\`${discord.PREFIX}roles\`: provides a list of all available roles
\`${discord.PREFIX}role add/rem role_name\`: adds/removes roles to/from your discord account (Every storyline has its own role and channel. To prevent cluttering only channels which you are part of are visible to you. You can add/remove roles to control which channels you want to see. The voyeur role enables you to see all channels.)
\`${discord.PREFIX}subscribe email some.email@address.com\`: adds an email to your email notification list
\`${discord.PREFIX}unsubscribe email some.email@address.com\`: removes an email from your email notification list
\`${discord.PREFIX}subscribe discord\`: activates discord private message notifications for you
\`${discord.PREFIX}unsubscribe discord\`: deactivates discord private message notifications for you
\`${discord.PREFIX}subscriptions\`: shows all your notification subscriptions
(For controlling push notifications, you need to use the web interface (Settings > Notifications))

**MUSIC:**
\`${discord.PREFIX}join\`: joins/switches to the same voice channel as the member, who set off the command, is in
\`${discord.PREFIX}add source_url\` / \`${discord.PREFIX}append source_url\`: adds a new song/new songs to the end of the queue (supported source urls: YouTube video, YouTube playlist)
\`${discord.PREFIX}play source_url\`: adds a new song to the end of the queue and starts/resumes playing (supported source urls: YouTube video, YouTube playlist)
\`${discord.PREFIX}play\` / \`${discord.PREFIX}resume\`: starts/resumes playing (joins/switches to the same voice channel as the member, who set off the command, is in)
\`${discord.PREFIX}pause\`: pauses the music stream
\`${discord.PREFIX}stop\`: stops the music stream (will restart at the same song but not the same song position)
\`${discord.PREFIX}clear\`: clears the song queue
\`${discord.PREFIX}queue\` / \`${discord.PREFIX}list\` / \`${discord.PREFIX}playlist\`: displays the song queue
\`${discord.PREFIX}np\` / \`${discord.PREFIX}nowplaying\` / \`${discord.PREFIX}nowplay\` / \`${discord.PREFIX}cp\` / \`${discord.PREFIX}currentlyplaying\` / \`${discord.PREFIX}currentlyplay\` /  \`${discord.PREFIX}currentplaying\` /  \`${discord.PREFIX}currentplay\`: displays the currently playing song
\`${discord.PREFIX}skip index/time\` / \`${discord.PREFIX}skipto index/time\`: jumps to the provided queue index if a positive integer is given or to a timestamp of the form hh:mm:ss or mm:ss inside the current song
\`${discord.PREFIX}skip\` / \`${discord.PREFIX}next\`: jumps to the next song
\`${discord.PREFIX}prev\` / \`${discord.PREFIX}previous\` / \`${discord.PREFIX}last\`: jumps to the previous song
\`${discord.PREFIX}autoplay\`: toggles if the bot automatically jumps to the next song after finishing the current song
\`${discord.PREFIX}loop\`: toggles if the bot loops the current song
\`${discord.PREFIX}wraparound\`: toggles if the bot jumps back to the first song after finishing the queue
\`${discord.PREFIX}shuffle\`: toggles random song selection
\`${discord.PREFIX}autoclean\`: toggles if the bot deletes finished songs from the queue
\`${discord.PREFIX}info\`: displays current settings

**P&P:**
\`${discord.PREFIX}d dice_specifier\` / \`${discord.PREFIX}dice dice_specifier\`: rolls the dice specified by dice_specifier, e.g. \`?d 2d6\` rolls two six-sided dice, adds them up and displays the result (for a full explanation on dice notation please refer to the web interface (Game > Dice))
`);
            break;


            case 'subscribe':
                if(!args[1]){
                    msg.channel.send('You need to specify a service on which you want to subscribe for anouncement notifications as the 1st argument, e.g. `'+discord.PREFIX+'subscribe email john.doe@example.com`');
                    break;
                }

                switch(args[1]){
                    case 'discord':
                        mongodb.collection('DiscordUser').findOneAndUpdate(
                            {'_id':msg.author.id},
                            {$set: {'notifications.discord':true}},
                            {returnOriginal:false}
                        ).then(user => {
                            if(user?.value) io.emit('updateDiscordUser_'+user.value._id,user.value);
                        });
                        msg.channel.send('Discord private message notifications activated');
                        break;
                    
                    case 'email':
                        if(!args[2]?.includes('@') || args[2].split('@').reduce((res, curr) => res || curr.length == 0, false)){
                            msg.channel.send('You need to provide an email address as 2nd argument, e.g. `'+config.discord.commandPrefix+'subscribe email john.doe@example.com`');
                            break;
                        }
                        mongodb.collection('DiscordUser').findOneAndUpdate(
                            {'_id':msg.author.id},
                            {$addToSet: {'notifications.email':args[2]}},
                            {returnOriginal:false}
                        ).then(user => {
                            if(user?.value) io.emit('updateDiscordUser_'+user.value._id,user.value);
                        });
                        msg.channel.send(args[2] + ' added to notification list');
                        break;
                    
                    default:
                        if(!args[1]){
                            msg.channel.send('The provided service (1st argument) is not supported. Supported services: discord, email');
                            break;
                        }
                }
                break;

            case 'unsubscribe':
                if(!args[1]){
                    msg.channel.send('You need to specify a service from which you want to unsubscribe as the 1st argument, e.g. `'+discord.PREFIX+'unsubscribe email john.doe@example.com`');
                    break;
                }

                switch(args[1]){
                    case 'discord':
                        mongodb.collection('DiscordUser').findOneAndUpdate(
                            {'_id':msg.author.id},
                            {$set: {'notifications.discord':false}},
                            {returnOriginal:false}
                        ).then(user => {
                            if(user?.value) io.emit('updateDiscordUser_'+user.value._id,user.value);
                        });
                        msg.channel.send('Discord private message notifications deactivated');
                        break;
                    
                    case 'email':
                        if(!args[2]?.includes('@') || args[2].split('@').reduce((res, curr) => res || curr.length == 0, false)){
                            msg.channel.send('You need to provide an email address as 2nd argument, e.g. `'+config.discord.commandPrefix+'unsubscribe email john.doe@example.com`');
                            break;
                        }
                        mongodb.collection('DiscordUser').findOneAndUpdate(
                            {'_id':msg.author.id},
                            {$pull: {'notifications.email':args[2]}},
                            {returnOriginal:false}
                        ).then(user => {
                            if(user?.value) io.emit('updateDiscordUser_'+user.value._id,user.value);
                        });
                        msg.channel.send(args[2] + ' removed from notification list');
                        break;
                    
                    default:
                        if(!args[1]){
                            msg.channel.send('The provided service (1st argument) is not supported. Supported services: discord, email');
                            break;
                        }
                }
                break;
            
            case 'subscriptions':
                let user = await mongodb.collection('DiscordUser').findOne({'_id':msg.author.id});
                if(!user) msg.channel.send('Error: user not found');
                msg.channel.send(
`**Discord private messages:** ${user.notifications?.discord ? 'on' : 'off'}

**Email:**
${user.notifications?.email?.length ? user.notifications.email.join('\n') : '*none*'}`);
                break;
            
            default:
                msg.channel.send('Unknown command. Type `'+discord.PREFIX+'help` or `'+discord.PREFIX+'commands` for a list of commands');
        }
    }
})


discord.client.login(config.discord.botToken).then(() => {
    let guild = discord.client.guilds.resolve(config.discord.guildId);
    if(!guild) throw new Error('guild not found');
    discord.server.init(guild);
}).catch(err => console.error('Error when connecting to Discord: '+err.message));

let raisedHandUsers = new Map();
let diceCollection = new Map();
let diceId = 0;
for(let dice of config.dice.initial){
    diceCollection.set(diceId ,dice);
    diceId++;
}

io.on('connection', async (socket) => {

    await discord.server.onready;
    
    // MUSIC CALLS:
    {
        socket.on('music_requestServerInfo', () => {
            socket.emit('music_serveServerInfo', {
                currentSong: discord.server.music.currentSong?.id,
                currentQueue: discord.server.music.currentQueue?.id,
                playing: discord.server.music.playing,
                settings: discord.server.music.settings
            });
        });

        socket.on('music_syncTime', async () => {
            let position = await discord.server.music.getCurrentPostion();
            if(position != null) socket.emit('music_syncTime',position);
        });

        async function autoSync(){
            if(discord.server.music.playing && await discord.server.music.getDispatcher()){
                let position = await discord.server.music.getCurrentPostion();
                if(position != null) socket.emit('music_syncTime',position);
            }
            setTimeout(autoSync, 10000);
        }
        autoSync();

        socket.on('music_playSong', (songId) => discord.server.music.playSong(songId));

        socket.on('music_resume', async function(){
            try{
                await discord.server.music.joinVoiceChannel();
            }
            catch(e){
                if(e instanceof Error) e = e.stack;
                socket.emit('err',
                    'An error occured while connecting the bot to a voice channel. Probably the bot is not yet in one and does not remember the last voice channel it was in. To fix this:\n\n'+
                    '1. open Discord and navigate to the respective discord server\n'+
                    '2. join the voice channel, in which you want the bot to play music\n'+
                    '3. while staying the voice channel, open the bot-text-channel and type \'?join\'\n\n'+
                    'The bot should now have joined the voice channel and be controllable from this webinterface. You can now of course leave the voice channel again, if you want to.\n\n'+
                    'Error message: '+e
                );
                return;
            }
            if(!(await discord.server.music.resume()))
                socket.emit('err','An error occured while starting to play');
        });

        socket.on('music_pause', () => discord.server.music.pause());

        socket.on('music_stop', () => discord.server.music.stop());

        socket.on('music_next', () => discord.server.music.next());

        socket.on('music_previous', () => discord.server.music.previous());

        socket.on('music_skipToTime', (seconds) => discord.server.music.skipToTime(seconds));

        socket.on('music_updateSetting', (setting, value) => discord.server.music.updateSetting(setting, value));

        socket.on('music_moveSong', (songId, newIndex) => discord.server.music.moveSong(songId, newIndex));

        socket.on('music_addQueue', (name) => discord.server.music.addQueue(name));

        socket.on('music_addSongs', (queueId, ...songs) => discord.server.music.addSongs(queueId, songs));

        socket.on('music_addURL', async (queueId, url) => {
            try{
                await discord.server.music.addURL(queueId, url);
            }
            catch(e){
                if(e instanceof Error) e = e.stack;
                socket.emit('err',e);
            }
        });

        socket.on('music_removeSong', (songId) => discord.server.music.removeSong(songId));

        socket.on('music_clearQueue', (queueId) => discord.server.music.clearQueue(queueId));

        socket.on('music_renameQueue', (queueId, newName) => objectSets.Queue.get(queueId)?.rename(newName));

        socket.on('music_removeQueue', async (queueId) => {
            try{
                await discord.server.music.removeQueue(queueId);
            }
            catch(e){
                if(e instanceof Error) e = e.stack;
                socket.emit('err',e);
            }
        });

        socket.on('music_requestQueues', () => socket.emit('music_serveQueues', Array.from(objectSets.Queue.values()).map(x => x.getData()) ));

        socket.on('music_requestSong', (songId) => {
            let song = objectSets.Song.get(songId);
            if(song) socket.emit('music_serveSong_'+songId, song.getData());
        });

        socket.on('music_searchYoutube', async (id, phrase, options) => {
            // id: an arbitrary but unique id to identify the search request
            // options: type: 'video' | 'playlist', nextpageRef, limit
            if(!options) options = {};
            if(!options.limit) options.limit = 25;
            socket.emit('music_searchYoutube_'+id, await Youtube.search(phrase, options));
        });
    }

    // DATA CALLS:
    {
        socket.on('addDice', ()=>{
            diceCollection.set(diceId,{formula:'2d6',result:0});
            io.emit('addDice',diceId,'2d6');
            diceId++;
        });

        socket.on('removeDice', (id)=>{
            diceCollection.delete(id);
            io.emit('removeDice_'+id);
        });

        socket.on('updateDice', (id, data)=>{
            let dice = diceCollection.get(id);
            if(!dice) return;
            if(data.formula != undefined) dice.formula = data.formula;
            if(data.result != undefined) dice.result = data.result;
            io.emit('updateDice_'+id, data);
        });

        socket.on('requestDice', ()=>{
            socket.emit('serveDice', Array.from(diceCollection.entries()).map(x => ({id: x[0], result: x[1].result, formula: x[1].formula})));
        });

        socket.on('raiseHand', async function(id){
            await discord.server.onready;
            try{
                let member = (await discord.server.guild.members.fetch(id));
                let username = member.nickname ? member.nickname : member.user.username;
                raisedHandUsers.set(id, username);
                io.emit('raiseHand',id,username);
            }
            catch(e){
                socket.emit('err','invalid discord user id, please reinitialize your device (via the bot command \''+config.discord.commandPrefix+'init\' on discord)');
            }
        });

        socket.on('unraiseHand', function(id){
            raisedHandUsers.delete(id);
            io.emit('unraiseHand',id);
        });

        socket.on('requestRaisedHands', function(){
            socket.emit('serveRaisedHands', Array.from(raisedHandUsers.entries()));
        });


        socket.on('requestDiscordUser', async function(id){
            // check if id is valid
            let user = await mongodb.collection('DiscordUser').findOne({_id:id});
            if(!user) socket.emit('serveDiscordUser',null);
            await discord.server.onready;
            try{
                let member = (await discord.server.guild.members.fetch(user._id));
                if(member.nickname) user.name = member.nickname;
                else user.name = member.user.username;
            }
            catch(e){
                console.error('Error while looking for user when serving it, id: ', user._id, ', error: ', e);
            }
            socket.emit('serveDiscordUser',user);
        });

        socket.on('notifications_subscribePush', async function(id, token, device){
            let user = (await mongodb.collection('DiscordUser').findOneAndUpdate(
                {'_id':id, 'notifications.push.device.id': {$ne:device.id}},
                {$push: {'notifications.push':{token,device}}},
                {returnOriginal:false}
            ))?.value;

            if(!user){
                user = (await mongodb.collection('DiscordUser').findOneAndUpdate(
                    {'_id':id, 'notifications.push.device.id':device.id},
                    {$set: {'notifications.push.$.token': token}},
                    {returnOriginal:false}
                ))?.value;
            }

            if(user){
                io.emit('updateDiscordUser_'+user._id,user);
                setTimeout(()=>fetch('https://fcm.googleapis.com/fcm/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'key='+config.firebase.messagingServerKey
                    },
                    body: JSON.stringify({
                        "notification": {
                            "title": "P&P Announcement",
                            "body": 'You have successfully activated push notifications for P&P announcements',
                            "click_action": 'https://foramitti.com/elias/pnp/',
                            "icon": "https://foramitti.com/elias/pnp/logo/favicon-192x192-maskable.png"
                        },
                        "to": token
                    })
                }), 60000);
            }
        });

        socket.on('notifications_testPush', async (id, deviceId)=>{
            let user = await mongodb.collection('DiscordUser').findOne(
                {'_id':id, 'notifications.push.device.id':deviceId}
            );

            if(user){
                let token = user.notifications.push.find(x => x.device.id == deviceId)?.token;

                if(token) setTimeout(()=>fetch('https://fcm.googleapis.com/fcm/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'key='+config.firebase.messagingServerKey
                    },
                    body: JSON.stringify({
                        "notification": {
                            "title": "P&P Announcement",
                            "body": 'Push notifications for P&P announcements are activated and working correctly for this device',
                            "click_action": 'https://foramitti.com/elias/pnp/',
                            "icon": "https://foramitti.com/elias/pnp/logo/favicon-192x192-maskable.png"
                        },
                        "to": token
                    })
                }), 60000);
            }
        });

        socket.on('notifications_unsubscribePush', async function(id, deviceId){
            let user = (await mongodb.collection('DiscordUser').findOneAndUpdate(
                {'_id':id, 'notifications.push.device.id':deviceId},
                {$pull: {'notifications.push':{'device.id':deviceId}}},
                {returnOriginal:false}
            ))?.value;

            if(user) io.emit('updateDiscordUser_'+user._id,user);
        });

        socket.on('notifications_updatePush', async function(id, deviceId, token){
            let user = (await mongodb.collection('DiscordUser').findOneAndUpdate(
                {'_id':id, 'notifications.push.device.id':deviceId},
                {$set: {'notifications.push.$.token': token}},
                {returnOriginal:false}
            ))?.value;

            if(user) io.emit('updateDiscordUser_'+user._id,user);
        });

        socket.on('notifications_setDiscordPM', async function(id, value){
            let user = (await mongodb.collection('DiscordUser').findOneAndUpdate(
                {'_id':id},
                {$set: {'notifications.discord':Boolean(value)}},
                {returnOriginal:false}
            ))?.value;

            if(user) io.emit('updateDiscordUser_'+user._id,user);
        });

        socket.on('notifications_setEmails', async function(id, emails){
            let user = (await mongodb.collection('DiscordUser').findOneAndUpdate(
                {'_id':id},
                {$set: {'notifications.email':emails}},
                {returnOriginal:false}
            ))?.value;

            if(user) io.emit('updateDiscordUser_'+user._id,user);
        });


        socket.on('requestData', async function(collection, id){
            if(!mongodb) return socket.emit('err',`requestData(collection:${collection}, id:${id}): database inactive`);
            socket.emit('serveData_'+collection+'_'+id, await mongodb.collection(collection).findOne({'_id':id}));
        });

        socket.on('requestData_storylineNames', async function(){
            if(!mongodb) return socket.emit('err','requestData_storylineNames(): database inactive');
            socket.emit('serveData_storylineNames', (await mongodb.collection('Storyline').find().toArray()).map(x => [x._id, x.name]));
        });

        socket.on('requestData_images', async function(id, upperBound){
            try{
                if(id == undefined) socket.emit('serveData_images', (await mysql.query('SELECT id, tags FROM images')));
                else if(Array.isArray(id)) socket.emit('serveData_images', (await mysql.query('SELECT id, tags FROM images WHERE id IN ('+id.join(',')+')')));
                else if(upperBound == undefined) socket.emit('serveData_images', (await mysql.query('SELECT id, tags FROM images WHERE id = '+id)));
                else socket.emit('serveData_images', (await mysql.query('SELECT id, tags FROM images WHERE id BETWEEN '+id+' AND '+upperBound)));
            }
            catch(e){
                if(e instanceof Error) e = e.stack;
                socket.emit('err','requestData_images(): '+e);
            }
        });


        socket.on('buttonPressed', function(id){
            socket.broadcast.emit('buttonPressed_'+id);
        });
        

        socket.on('updateData', async function(collection, id, data){
            function error(msg){
                let inputs = {collection, id, data};
                socket.emit('err',`updateData(collection:${collection}, id:${id}): ${msg}`,inputs);
            }
            if(!mongodb) return error('database inactive');

            if(!Object.keys(data).length) return;

            // data sanitation:
            let tmpData = {};

            if(data.protected != undefined) tmpData.protected = Boolean(data.protected);
            if(data.writingProtected != undefined) tmpData.writingProtected = Boolean(data.writingProtected);

            if(data.name != undefined) tmpData.name = String(data.name);

            if(collection.endsWith('Category') || collection == 'StorylineInfoType'){
                if(data.entities != undefined){
                    tmpData.entities = data.entities;
                    if(collection.startsWith('Cell')){
                        if(!Array.isArray(tmpData.entities) || tmpData.entities.some(x => x != 'br' && x != 'hr' && !Number.isInteger(x))){
                            delete tmpData.entities;
                            error('entities must be an array of numerical ids, \'br\', and/or \'hr\'');
                        }
                    }
                    else{
                        if(!Array.isArray(tmpData.entities) || tmpData.entities.some(x => !Number.isInteger(x))){
                            delete tmpData.entities;
                            error('entities must be an array of numerical ids');
                        }
                    }
                }
                
                if(data.categories != undefined){
                    tmpData.categories = data.categories;
                    if(!Array.isArray(tmpData.categories) || tmpData.categories.some(x => !Number.isInteger(x))){
                        delete tmpData.categories;
                        error('categories must be an array of numerical ids');
                    }
                }
            }
            else if(collection.endsWith('Entity')){
                if(data.description != undefined) tmpData.description = String(data.description);

                if(data.coordinates != undefined){
                    tmpData.coordinates = data.coordinates;
                    if(!Array.isArray(tmpData.coordinates) || 
                        tmpData.coordinates.some(x => (!Array.isArray(x) || x.length != 2 || x.some(y => typeof y != 'number')))){
                            delete tmpData.coordinates;
                            error('coordinates must be an array of [x,y] objects filled with numbers');
                    }
                }

                if(data.path != undefined) tmpData.path = Boolean(data.path);

                if(data.images != undefined){
                    tmpData.images = data.images;
                    if(!Array.isArray(tmpData.images) || tmpData.images.some(x => !Number.isInteger(x))){
                        delete tmpData.images;
                        error('images must be an array of numerical ids');
                    }
                }
            }

            switch(collection){
                case 'ItemEntity': 
                    if(data.amount != undefined){
                        tmpData.amount = data.amount;
                        if(!Number.isInteger(tmpData.amount) || tmpData.amount < 0){
                            delete tmpData.amount;
                            error('amount must be a positive integer');
                        }
                    }
                    break;
                
                case 'ItemEffectEntity': 
                    if(data.items != undefined){
                        tmpData.items = data.items;
                        if(!Array.isArray(tmpData.items) || tmpData.items.some(x => typeof x != 'object' || typeof x.mult != 'number' || !Number.isInteger(x.item))) {
                            delete tmpData.items;
                            error('items must be an array of objects of form {mult: Float, item: Int[id]}');
                        }
                    }
                    break;
                
                case 'SkillEntity': 
                    if(data.learned != undefined) tmpData.learned = Boolean(data.learned);

                    if(data.requirements != undefined) tmpData.requirements = String(data.requirements);
                    break;
                
                case 'CellEntity': 
                    if(data.savedValue != undefined) tmpData.savedValue = data.savedValue;
                    if(data.valueFunction != undefined) tmpData.valueFunction = String(data.valueFunction);
                    if(data.resetFunction != undefined) tmpData.resetFunction = String(data.resetFunction);
                    if(data.offsetAbsolute != undefined) tmpData.offsetAbsolute = Boolean(data.offsetAbsolute);
                    break;
                
                case 'PlayerEntity':
                    for(let property of ['items','itemEffects','skills','cells','notes']){
                        if(data[property]?.entities != undefined){
                            if(!tmpData[property]) tmpData[property] = {};
                            tmpData[property].entities = data[property].entities;
                            if(!Array.isArray(tmpData[property].entities) || tmpData[property].entities.some(x => x != 'br' && x != 'hr' && !Number.isInteger(x))){
                                delete tmpData[property].entities;
                                error(property+'.entities must be an array of numerical ids');
                            }
                        }
                        
                        if(data[property]?.categories != undefined){
                            if(!tmpData[property]) tmpData[property] = {};
                            tmpData[property].categories = data[property].categories;
                            if(!Array.isArray(tmpData[property].categories) || tmpData[property].categories.some(x => !Number.isInteger(x))){
                                delete tmpData[property].categories;
                                error(property+'.categories must be an array of numerical ids');
                            }
                        }

                        if(tmpData[property] && !Object.keys(tmpData[property]).length) delete tmpData[property];
                    }
                    break;
                
                case 'Storyline':
                    if(data.info?.types != undefined){
                        if(!tmpData.info) tmpData.info = {};
                        tmpData.info.types = data.info.types;
                        if(!Array.isArray(tmpData.info.types) || tmpData.info.types.some(x => !Number.isInteger(x))){
                            delete tmpData.info.types;
                            error('info.types must be an array of numerical ids');
                        }
                    }
                    if(data.info?.general != undefined){
                        if(!tmpData.info) tmpData.info = {};
                        tmpData.info.general = data.info.general;
                        if(!Array.isArray(tmpData.info.general) || tmpData.info.general.some(x => !Number.isInteger(x))) {
                            delete tmpData.info.general;
                            error('info.general must be an array of numerical ids');
                        }
                    }
                    if(tmpData.info && !Object.keys(tmpData.info).length) delete tmpData.info;

                    if(data.players?.entities != undefined){
                        if(!tmpData.players) tmpData.players = {};
                        tmpData.players.entities = data.players.entities;
                        if(!Array.isArray(tmpData.players.entities) || tmpData.players.entities.some(x => !Number.isInteger(x))) {
                            delete tmpData.players.entities;
                        }
                    }
                    if(tmpData.players && !Object.keys(tmpData.players).length) delete tmpData.players;

                    if(data.board?.entities != undefined){
                        if(!tmpData.board) tmpData.board = {};
                        tmpData.board.entities = data.board.entities;
                        if(!Array.isArray(tmpData.board.entities) || tmpData.board.entities.some(x => !Number.isInteger(x))) {
                            delete tmpData.board.entities;
                            error('board.entities must be an array of numerical ids');
                        }
                    }
                    if(data.board?.environments != undefined){
                        if(!tmpData.board) tmpData.board = {};
                        tmpData.board.environments = data.board.environments;
                        if(!Array.isArray(tmpData.board.environments) || tmpData.board.environments.some(x => !Number.isInteger(x))) {
                            delete tmpData.board.environments;
                            error('board.environments must be an array of numerical ids');
                        }
                    }
                    if(data.board?.activeEnvironment != undefined){
                        if(!tmpData.board) tmpData.board = {};
                        tmpData.board.activeEnvironment = data.board.activeEnvironment;
                        if(!Number.isInteger(tmpData.board.activeEnvironment)){
                            delete tmpData.board.activeEnvironment;
                            error('board.activeEnvironment must be a numerical id');
                        }
                    }
                    if(tmpData.board && !Object.keys(tmpData.board).length) delete tmpData.board;

                    if(data.writingProtected != undefined) tmpData.writingProtected = Boolean(data.writingProtected);
                    break;
            }

            if(tmpData.name != undefined){
                if(['ItemEntity','ItemEffectEntity','SkillEntity','CellEntity'].includes(collection)){
                    tmpData.reference_name = getReferenceName(data.name.decodeHTML());
                    player = (await mongodb.collection(collection).findOne({_id: id}, {projection: {_id:0, player:1}}))?.player;
                    if(player == undefined) return error('player entity id not found');
                    if(await mongodb.collection(collection).findOne({reference_name: tmpData.reference_name, player, _id: {$ne: id}})){
                        error('there is already an entity of this type with an equivalent name within this player entity, '+
                        'which would create ambiguity in dynamically coded values');
                        delete tmpData.name;
                        delete tmpData.reference_name;
                    }
                }
        
                if(collection == 'PlayerEntity'){
                    tmpData.reference_name = getReferenceName(data.name.decodeHTML());
                    storyline = (await mongodb.collection(collection).findOne({_id: id}, {projection: {_id:0, storyline:1}}))?.storyline;
                    if(storyline == undefined) return error('storyline entity id not found');
                    if(await mongodb.collection(collection).findOne({reference_name: tmpData.reference_name, storyline, _id: {$ne: id}})){
                        error('there is already an entity of this type with an equivalent name within this storyline entity, '+
                        'which would create ambiguity in dynamically coded values');
                        delete tmpData.name;
                        delete tmpData.reference_name;
                    }
                }
            }

            data = tmpData;

            // prepare data for mongo:
            // nested documents could be partial and therefore need to be set to dot notation of mongo
            let mongoData = {};
            function recursivePrepareMongoData(currData, currPath){
                if(!currPath) currPath = [];
                for(let i in currData){
                    if(currData[i] && typeof(currData[i]) == 'object' && !Array.isArray(currData[i])){
                        recursivePrepareMongoData(currData[i], currPath.concat([i]));
                    }
                    else{
                        mongoData[currPath.concat([i]).join('.')] = currData[i];
                    }
                }
            }
            recursivePrepareMongoData(data);
            if(!Object.keys(mongoData).length) return;

            await mongodb.collection(collection).updateOne({'_id':id}, {$set: mongoData});
            io.emit('updateData_'+collection+'_'+id, data);
        });


        async function addData(collection, data, {loose,parentId,position,generalInfo,playerId,template,templateMask,templateMaskDefault,
                templateChildKeepOrderPromises,templateItemsIdMap,templateBuildItemsIdMap,templateItemPromises}){
            function error(msg){
                let inputs = {collection,data,loose,parentId,position,generalInfo,playerId,template,templateMask,templateMaskDefault,
                    templateChildKeepOrderPromises,templateItemsIdMap,templateBuildItemsIdMap,templateItemPromises};
                socket.emit('err',`addData(collection:${collection}): ${msg}`,inputs);
            }
            if(!mongodb) return error('database inactive');
            if(!data) data = {};

            if(template != undefined){
                template = await mongodb.collection(collection).findOne({_id: template});
                if(!template) return error('template entity not found');
            }

            let updateId = {};
            updateId[collection] = 1;
            let id = (await mongodb.collection('ids').findOneAndUpdate({}, {$inc: updateId})).value[collection];

            // data sanitation and template handling:
            let tmpData = {};

            tmpData.protected = Boolean(data.protected);

            if(template?.name != undefined && (!templateMask || (templateMask.name ?? templateMaskDefault))) 
                tmpData.name = String(template.name);
            else if(data.name == undefined) tmpData.name = '';
            else tmpData.name = String(data.name);

            if(collection.startsWith('Item') || collection.startsWith('Skill') || collection.startsWith('Cell')){
                if(loose) tmpData.player = parentId;
                else if(collection.endsWith('Category')) tmpData.player = (await mongodb.collection(collection).findOne({_id: parentId}, {projection: {_id:0, player:1}}))?.player;
                else tmpData.player = (await mongodb.collection(collection.slice(0,-6) + 'Category').findOne({_id: parentId}, {projection: {_id:0, player:1}}))?.player;

                if(collection.endsWith('Entity')){
                    tmpData.reference_name = getReferenceName(tmpData.name.decodeHTML());
                    if(await mongodb.collection(collection).findOne({reference_name: tmpData.reference_name, player: tmpData.player}))
                        return socket.emit('err','there is already an entity of this type with an equivalent name within this player entity, '+
                        'which would create ambiguity in dynamic values');
                }
            }

            if(collection == 'PlayerEntity'){
                if(tmpData.name == 'this') return error('\'this\' is an invalid name for this type of entity');
                tmpData.reference_name = getReferenceName(tmpData.name.decodeHTML());
                tmpData.storyline = parentId;
                if(await mongodb.collection(collection).findOne({reference_name: tmpData.reference_name, storyline: tmpData.storyline}))
                    return error('there is already an entity of this type with an equivalent name within this storyline entity, '+
                    'which would create ambiguity in dynamically coded values');
            }

            if(collection.endsWith('Category') || collection == 'StorylineInfoType'){
                if(template?.entities && (!templateMask || (templateMask.entities ?? templateMaskDefault))) 
                    tmpData.entities = []; // children are copied afterwards
                else if(data.entities == undefined) tmpData.entities = [];
                else tmpData.entities = data.entities;
                if(collection.startsWith('Cell')){
                    if(!Array.isArray(tmpData.entities) || tmpData.entities.some(x => x != 'br' && x != 'hr' && !Number.isInteger(x))){
                        return error('entities must be an array of numerical ids, \'br\', and/or \'hr\'');
                    }
                }
                else{
                    if(!Array.isArray(tmpData.entities) || tmpData.entities.some(x => !Number.isInteger(x))){
                        return error('entities must be an array of numerical ids');
                    }
                }
                
                if(template?.categories && (!templateMask || (templateMask.categories ?? templateMaskDefault))) 
                    tmpData.categories = []; // children are copied afterwards
                else if(data.categories == undefined) tmpData.categories = [];
                else tmpData.categories = data.categories;
                if(!Array.isArray(tmpData.categories) || tmpData.categories.some(x => !Number.isInteger(x)))
                    return error('categories must be an array of numerical ids');
            }
            else if(collection.endsWith('Entity')){
                if(template?.description != undefined && (!templateMask || (templateMask.description ?? templateMaskDefault))) 
                    tmpData.description = String(template.description);
                else if(data.description == undefined) tmpData.description = '';
                else tmpData.description = String(data.description);

                if(template?.coordinates && (!templateMask || (templateMask.coordinates ?? templateMaskDefault))) 
                    tmpData.coordinates = template.coordinates;
                else if(data.coordinates == undefined) tmpData.coordinates = [];
                else tmpData.coordinates = data.coordinates;
                if(!Array.isArray(tmpData.coordinates) || 
                    tmpData.coordinates.some(x => (!Array.isArray(x) || x.length != 2 || x.some(y => typeof y != 'number')))){
                        return error('coordinates must be an array of [x,y] objects filled with numbers');
                }

                if(template?.path != undefined && (!templateMask || (templateMask.path ?? templateMaskDefault))) 
                    tmpData.path = Boolean(template.path);
                else tmpData.path = Boolean(data.path);

                if(template?.images && (!templateMask || (templateMask.images ?? templateMaskDefault)))
                    tmpData.images = template.images;
                else if(data.images == undefined) tmpData.images = [];
                else tmpData.images = data.images;
                if(!Array.isArray(tmpData.images) || tmpData.images.some(x => !Number.isInteger(x)))
                    return error('images must be an array of numerical ids');
            }

            switch(collection){
                case 'ItemEntity': 
                    if(template?.amount != undefined && (!templateMask || (templateMask.amount ?? templateMaskDefault)))
                        tmpData.amount = template.amount;
                    else if(data.amount == undefined) tmpData.amount = 0;
                    else tmpData.amount = data.amount;
                    if(!Number.isInteger(tmpData.amount) || tmpData.amount < 0) return error('amount must be a non-negative integer');

                    if(template && templateBuildItemsIdMap) templateItemsIdMap.set(template._id, id);
                    break;
                
                case 'ItemEffectEntity': 
                    if(template?.items != undefined && (!templateMask || (templateMask.items ?? templateMaskDefault))){
                        tmpData.items = [];
                        if(templateItemsIdMap){
                            for(let itemId of template.items) if(templateItemsIdMap.get(itemId) != undefined) tmpData.items.push(templateItemsIdMap.get(itemId) ?? itemId);
                        }
                    }
                    else if(data.items == undefined) tmpData.items = [];
                    else tmpData.items = data.items;
                    if(!Array.isArray(tmpData.items) || tmpData.items.some(x => typeof x != 'object' || typeof x.mult != 'number' || !Number.isInteger(x.item))) 
                        return error('items must be an array of objects of form {mult: Float, item: Int[id]}');
                    break;
                
                case 'SkillEntity': 
                    if(template?.learned != undefined && (!templateMask || (templateMask.learned ?? templateMaskDefault))) 
                        tmpData.learned = Boolean(template.learned);
                    else tmpData.learned = Boolean(data.learned);

                    if(template?.requirements != undefined && (!templateMask || (templateMask.requirements ?? templateMaskDefault))) 
                        tmpData.requirements = String(template.requirements);
                    else if(data.requirements == undefined) tmpData.requirements = '';
                    else tmpData.requirements = String(data.requirements);
                    break;
                
                case 'CellEntity': 
                    if(template?.cellType != undefined && (!templateMask || (templateMask.cellType ?? templateMaskDefault))) 
                        tmpData.cellType = String(template.cellType);
                    else if(data.cellType == undefined) tmpData.cellType = 'static';
                    else tmpData.cellType = String(data.cellType);
                    let validCellTypes = ['dynamic', 'constant', 'static', 'control_number', 'control_button', 'control_text', 
                        'control_checkbox', 'control_dropdown'];
                    if(!validCellTypes.includes(tmpData.cellType)) return error('cellType must be one of the following: '+validCellTypes.join(', '));

                    if(tmpData.cellType != 'constant' && tmpData.cellType != 'static' && tmpData.cellType != 'control_button'){
                        if(template?.savedValue != undefined && (!templateMask || (templateMask.savedValue ?? templateMaskDefault))) 
                            tmpData.savedValue = template.savedValue;
                        else if(data.savedValue == undefined){
                            if(tmpData.cellType == 'dynamic' || tmpData.cellType == 'control_number' || tmpData.cellType == 'control_dropdown') tmpData.savedValue = 0;
                            else if(tmpData.cellType == 'control_text') tmpData.savedValue = '';
                            else if(tmpData.cellType == 'control_checkbox') tmpData.savedValue = false;
                        }
                        else tmpData.savedValue = data.savedValue;

                        if((tmpData.cellType == 'dynamic' || tmpData.cellType == 'control_number' || tmpData.cellType == 'control_dropdown') && typeof tmpData.savedValue != 'number') 
                            return error('value for this cell type must be of type number');
                        else if(tmpData.cellType == 'control_text') tmpData.savedValue = String(tmpData.savedValue);
                        else if(tmpData.cellType == 'control_checkbox') tmpData.savedValue = Boolean(tmpData.savedValue);
                    }

                    if(tmpData.cellType == 'dynamic' || tmpData.cellType == 'constant' || tmpData.cellType == 'control_dropdown'){
                        if(template?.valueFunction != undefined && (!templateMask || (templateMask.valueFunction ?? templateMaskDefault))) 
                            tmpData.valueFunction = String(template.valueFunction);
                        else if(data.valueFunction != undefined) tmpData.valueFunction = String(data.valueFunction);

                        if(!tmpData.valueFunction){
                            if(tmpData.cellType == 'control_dropdown') tmpData.valueFunction = 'Option 0\nOption 1\nOption 2';
                            else tmpData.valueFunction = '0';
                        }
                    }

                    if(tmpData.cellType == 'dynamic'){
                        if(template?.resetFunction != undefined && (!templateMask || (templateMask.resetFunction ?? templateMaskDefault))) 
                            tmpData.resetFunction = String(template.resetFunction);
                        else if(data.resetFunction != undefined) tmpData.resetFunction = String(data.resetFunction);

                        if(!tmpData.resetFunction) tmpData.resetFunction = '0';

                        if(template?.offsetAbsolute != undefined && (!templateMask || (templateMask.offsetAbsolute ?? templateMaskDefault))) 
                            tmpData.offsetAbsolute = Boolean(template.offsetAbsolute);
                        else tmpData.offsetAbsolute = Boolean(data.offsetAbsolute);
                    }
                    break;
                
                case 'PlayerEntity':
                    for(let property of ['items','itemEffects','skills','cells','notes']){
                        tmpData[property] = {};

                        if(template?.[property]?.entities && (!templateMask || (typeof templateMask[property] != 'object' && templateMask[property]) || 
                            (templateMask[property]?.entities ?? templateMaskDefault))) 
                                tmpData[property].entities = []; 
                        else if(data[property]?.entities == undefined) tmpData[property].entities = [];
                        else tmpData[property].entities = data[property].entities;
                        if(!Array.isArray(tmpData[property].entities) || tmpData[property].entities.some(x => x != 'br' && x != 'hr' && !Number.isInteger(x)))
                            return error(property+'.entities must be an array of numerical ids');
                        
                        if(template?.[property]?.categories && (!templateMask || (typeof templateMask[property] != 'object' && templateMask[property]) || 
                            (templateMask[property]?.categories ?? templateMaskDefault))) 
                                tmpData[property].categories = []; 
                        else if(data[property]?.categories == undefined) tmpData[property].categories = [];
                        else tmpData[property].categories = data[property].categories;
                        if(!Array.isArray(tmpData[property].categories) || tmpData[property].categories.some(x => !Number.isInteger(x)))
                            return error(property+'.categories must be an array of numerical ids');
                    }
                    break;
                
                case 'Storyline': return error('Storylines cannot be added client-side. You should not have been able to call this command.');
            }

            data = tmpData;
            
            data._id = id;
            await mongodb.collection(collection).insertOne(data);


            // register with parent
            if(parentId!=undefined){
                let parentCollection, parentProperty, parentSubProperty;
                switch(collection){
                    case 'ItemCategory': 
                        parentCollection = loose ? 'PlayerEntity' : 'ItemCategory';
                        parentProperty = loose ? 'items' : 'categories';
                        parentSubProperty = loose ? 'categories' : undefined;
                        break;
                    case 'ItemEntity': 
                        parentCollection = loose ? 'PlayerEntity' : 'ItemCategory';
                        parentProperty = loose ? 'items' : 'entities';
                        parentSubProperty = loose ? 'entities' : undefined;
                        break;

                    case 'ItemEffectCategory': 
                        parentCollection = loose ? 'PlayerEntity' : 'ItemEffectCategory';
                        parentProperty = loose ? 'itemEffects' : 'categories';
                        parentSubProperty = loose ? 'categories' : undefined;
                        break;
                    case 'ItemEffectEntity': 
                        parentCollection = loose ? 'PlayerEntity' : 'ItemEffectCategory';
                        parentProperty = loose ? 'itemEffects' : 'entities';
                        parentSubProperty = loose ? 'entities' : undefined;
                        break;

                    case 'SkillCategory': 
                        parentCollection = loose ? 'PlayerEntity' : 'SkillCategory';
                        parentProperty = loose ? 'skills' : 'categories';
                        parentSubProperty = loose ? 'categories' : undefined;
                        break;
                    case 'SkillEntity': 
                        parentCollection = loose ? 'PlayerEntity' : 'SkillCategory';
                        parentProperty = loose ? 'skills' : 'entities';
                        parentSubProperty = loose ? 'entities' : undefined;
                        break;
                    
                    case 'NoteCategory': 
                        parentCollection = loose ? 'PlayerEntity' : 'NoteCategory';
                        parentProperty = loose ? 'notes' : 'categories';
                        parentSubProperty = loose ? 'categories' : undefined;
                        break;
                    case 'NoteEntity': 
                        parentCollection = loose ? 'PlayerEntity' : 'NoteCategory';
                        parentProperty = loose ? 'notes' : 'entities';
                        parentSubProperty = loose ? 'entities' : undefined;
                        break;

                    case 'CellCategory': 
                        parentCollection = loose ? 'PlayerEntity' : 'CellCategory';
                        parentProperty = loose ? 'cells' : 'categories';
                        parentSubProperty = loose ? 'categories' : undefined;
                        break;
                    case 'CellEntity': 
                        parentCollection = loose ? 'PlayerEntity' : 'CellCategory';
                        parentProperty = loose ? 'cells' : 'entities';
                        parentSubProperty = loose ? 'entities' : undefined;
                        break;
                    
                    case 'StorylineInfoCategory': 
                        parentCollection = loose ? 'StorylineInfoType' : 'StorylineInfoCategory';
                        parentProperty = loose ? 'categories' : 'categories';
                        break;
                    case 'StorylineInfoType':
                        parentCollection = 'Storyline';
                        parentProperty = 'info';
                        parentSubProperty = 'types';
                        break;
                    case 'StorylineInfoEntity':
                        parentCollection = generalInfo ? 'Storyline' : loose ? 'StorylineInfoType' : 'StorylineInfoCategory';
                        parentProperty = generalInfo ? 'info' : loose ? 'entities' : 'entities';
                        parentSubProperty = generalInfo ? 'general' : undefined;
                        break;
                    
                    case 'PlayerEntity':
                        parentCollection = 'Storyline';
                        parentProperty = 'players';
                        parentSubProperty = 'entities';
                        break;
                    
                    case 'Storyline': return error('Storylines cannot be added client-side. You should not have been able to call this command.');

                    default: return error('Unkown entity type. You should not have been able to call this command.');
                }
                
                // if this is a subcall of a template element creation, wait until all siblings are registered
                if(templateChildKeepOrderPromises) await Promise.all(templateChildKeepOrderPromises);

                let updates = {};
                let projection = {_id:0};
                updates.$push = {};
                let mongoArrayIdentifier = parentSubProperty ? parentProperty + '.' + parentSubProperty : parentProperty;
                if(position!=undefined){
                    updates.$push[mongoArrayIdentifier] = {};
                    updates.$push[mongoArrayIdentifier].$each = [id];
                    updates.$push[mongoArrayIdentifier].$position = position;
                }
                else updates.$push[mongoArrayIdentifier] = id;
                projection[mongoArrayIdentifier] = 1;

                io.emit('updateData_'+parentCollection+'_'+parentId, (await mongodb.collection(parentCollection).findOneAndUpdate(
                    {'_id':parentId},
                    updates,
                    {returnOriginal:false, projection}
                )).value);
            }


            // copy children of template if necessary
            if(template && (collection.endsWith('Category') || collection == 'StorylineInfoType')){
                if(template?.entities && (!templateMask || (templateMask.entities ?? templateMaskDefault))){
                    if(template.entities.length > 0){
                        // to keep order: save all previous promises and wait everytime before registering with parent until all others finished
                        let keepOrderPromises = [];
                        let childCollection = (collection == 'StorylineInfoType') ? 'StorylineInfoEntity' : (collection.slice(0,-8) + 'Entity');
                        for(let templateId of template.entities) {
                            if(templateId == 'br' || templateId == 'hr' ){
                                keepOrderPromises.push(
                                    (async ()=>{
                                        await Promise.all(keepOrderPromises);
                                        await mongodb.collection(collection).findOneAndUpdate(
                                            {'_id':id},
                                            {$push:{entities:templateId}}
                                        );
                                    })()
                                );
                            }
                            else keepOrderPromises.push(addData(childCollection, _, {
                                loose: collection == 'StorylineInfoType',
                                playerId: playerId,
                                parentId: id,
                                template: templateId,
                                templateChildKeepOrderPromises: keepOrderPromises.slice(),
                                templateItemsIdMap,
                                templateBuildItemsIdMap,
                                templateItemPromises
                            }));
                        }

                        if(collection == 'ItemCategory' && templateItemPromises) templateItemPromises.push(...keepOrderPromises);
                    }
                }

                if(template?.categories && (!templateMask || (templateMask.categories ?? templateMaskDefault))){
                    if(template.categories.length > 0){
                        let keepOrderPromises = [];
                        let childCollection = (collection == 'StorylineInfoType') ? 'StorylineInfoCategory' : collection;
                        for(let templateId of template.categories) keepOrderPromises.push(addData(childCollection, _, {
                            loose: collection == 'StorylineInfoType',
                            playerId: playerId,
                            parentId: id,
                            template: templateId,
                            templateChildKeepOrderPromises: keepOrderPromises.slice(),
                            templateItemsIdMap,
                            templateBuildItemsIdMap,
                            templateItemPromises
                        }));

                        if(collection == 'ItemCategory' && templateItemPromises) templateItemPromises.push(...keepOrderPromises);
                    }
                }
            }

            else if(template && collection == 'PlayerEntity'){
                let itemPromises = [];
                templateItemsIdMap = new Map(); 

                for(let property of ['items','skills','cells','itemEffects','notes']){
                    
                    if(property == 'itemEffects'){
                        while(true){
                            let promiseLength = itemPromises.length;
                            await Promise.all(itemPromises);
                            await sleep(100);
                            if(promiseLength == itemPromises.length) break;
                        }
                    }

                    if(template?.[property]?.entities && (!templateMask || (typeof templateMask[property] != 'object' && templateMask[property]) || 
                            (templateMask[property]?.entities ?? templateMaskDefault))) {
                        if(template[property].entities.length > 0){
                            // to keep order: save all previous promises and wait everytime before registering with parent until all others finished
                            let keepOrderPromises = [];
                            let childCollection = property == 'notes' ? 'NoteEntity' : property == 'items' ? 'ItemEntity' : property == 'skills' ? 'SkillEntity' : 
                                property == 'cells' ? 'CellEntity' : 'ItemEffectEntity';
                            for(let templateId of template[property].entities) {
                                if(templateId == 'br' || templateId == 'hr' ){
                                    keepOrderPromises.push(
                                        (async ()=>{
                                            await Promise.all(keepOrderPromises);
                                            let updates = {$push:{}};
                                            updates.$push[property+'.entities'] = templateId;
                                            await mongodb.collection(collection).findOneAndUpdate(
                                                {'_id':id},
                                                updates
                                            );
                                        })()
                                    );
                                }
                                else keepOrderPromises.push(addData(childCollection, _, {
                                    loose: true,
                                    playerId: id,
                                    parentId: id,
                                    template: templateId,
                                    templateChildKeepOrderPromises: keepOrderPromises.slice(),
                                    templateItemsIdMap,
                                    templateBuildItemsIdMap: property == 'items',
                                    templateItemPromises: (property == 'items') ? itemPromises : undefined
                                }));
                            }

                            if(property == 'items' && templateItemPromises) templateItemPromises.push(...keepOrderPromises);
                        }
                    }
                    
                    if(template?.[property]?.categories && (!templateMask || (typeof templateMask[property] != 'object' && templateMask[property]) || 
                            (templateMask[property]?.categories ?? templateMaskDefault))) {
                        if(template[property].categories.length > 0){
                            // to keep order: save all previous promises and wait everytime before registering with parent until all others finished
                            let keepOrderPromises = [];
                            let childCollection = property == 'notes' ? 'NoteCategory' : property == 'items' ? 'ItemCategory' : property == 'skills' ? 'SkillCategory' : 
                                property == 'cells' ? 'CellCategory' : 'ItemEffectCategory';
                            for(let templateId of template[property].categories) keepOrderPromises.push(addData(childCollection, _, {
                                loose: true,
                                playerId: id,
                                parentId: id,
                                template: templateId,
                                templateChildKeepOrderPromises: keepOrderPromises.slice(),
                                templateItemsIdMap,
                                templateBuildItemsIdMap: property == 'items',
                                templateItemPromises: (property == 'items') ? itemPromises : undefined
                            }));

                            if(property == 'items' && templateItemPromises) templateItemPromises.push(...keepOrderPromises);
                        }
                    }
                }
            }

            return id;
        }

        socket.on('addData', addData);

        async function removeFromDB(collection, id, recursive){
            if(recursive ?? true){
                if(collection.endsWith('Category')){
                    let data = await mongodb.collection(collection).findOne({'_id':id});
                    for(let childId of data.categories) removeFromDB(collection, childId);
                    for(let childId of data.entities) removeFromDB(collection.slice(0,-8)+'Entity', childId);
                }
                else if(collection == 'PlayerEntity'){
                    let data = await mongodb.collection(collection).findOne({'_id':id});
        
                    for(let childId of data.items.categories) removeFromDB('ItemCategory', childId);
                    for(let childId of data.items.entities) removeFromDB('ItemEntity', childId);
        
                    for(let childId of data.itemEffects.categories) removeFromDB('ItemEffectCategory', childId);
                    for(let childId of data.itemEffects.entities) removeFromDB('ItemEffectEntity', childId);
        
                    for(let childId of data.skills.categories) removeFromDB('SkillCategory', childId);
                    for(let childId of data.skills.entities) removeFromDB('SkillEntity', childId);
        
                    for(let childId of data.notes.categories) removeFromDB('NoteCategory', childId);
                    for(let childId of data.notes.entities) removeFromDB('NoteEntity', childId);
        
                    for(let childId of data.cells.categories) removeFromDB('CellCategory', childId);
                    for(let childId of data.cells.entities) removeFromDB('CellEntity', childId);
                }
            }

            // if is item delete from all itemEffects
            if(collection == 'ItemEntity'){
                let concernedItemEffects = (await mongodb.collection('ItemEffectEntity').find({'items.item':id}).toArray()).map(x => x._id);

                for(let effectId of concernedItemEffects){
                    io.emit('updateData_ItemEffectEntity_'+effectId, 
                        (await mongodb.collection('ItemEffectEntity').findOneAndUpdate(
                            {'_id':effectId},
                            {$pull: {'items':{'item':id}}},
                            {returnOriginal:false, projection:{_id:0,items:1}}
                        )).value
                    );
                }
            }

            // maybe change later to just marking as deleted to allow easy recovery via undo tool (and after a while flush marked documents)
            await mongodb.collection(collection).deleteOne({'_id':id});
        }

        socket.on('removeData', async function removeData(collection, id, removeChildren){
            function error(msg){
                let inputs = {collection, id, removeChildren};
                socket.emit('err',`removeData(collection:${collection}, id:${id}): ${msg}`,inputs);
            }
            if(!mongodb) return error('database inactive');

            // find parent
            let parentCollection, parentProperty, parentSubProperty, parentEntityProperty, parentEntitySubProperty;
                switch(collection){
                case 'ItemCategory': 
                    parentCollection = ['PlayerEntity', 'ItemCategory'];
                    parentProperty = ['items', 'categories'];
                    parentSubProperty = ['categories', undefined];
                    parentEntityProperty = ['items', 'entities'];
                    parentEntitySubProperty = ['entities', undefined];
                    break;
                case 'ItemEntity': 
                    parentCollection = ['PlayerEntity', 'ItemCategory'];
                    parentProperty = ['items', 'entities'];
                    parentSubProperty = ['entities', undefined];
                    break;

                case 'ItemEffectCategory': 
                    parentCollection = ['PlayerEntity', 'ItemEffectCategory'];
                    parentProperty = ['itemEffects', 'categories'];
                    parentSubProperty = ['categories', undefined];
                    parentEntityProperty = ['items', 'entities'];
                    parentEntitySubProperty = ['entities', undefined];
                    break;
                case 'ItemEffectEntity': 
                    parentCollection = ['PlayerEntity', 'ItemEffectCategory'];
                    parentProperty = ['itemEffects', 'entities'];
                    parentSubProperty = ['entities', undefined];
                    break;

                case 'SkillCategory': 
                    parentCollection = ['PlayerEntity', 'SkillCategory'];
                    parentProperty = ['skills', 'categories'];
                    parentSubProperty = ['categories', undefined];
                    parentEntityProperty = ['items', 'entities'];
                    parentEntitySubProperty = ['entities', undefined];
                    break;
                case 'SkillEntity': 
                    parentCollection = ['PlayerEntity', 'SkillCategory'];
                    parentProperty = ['skills', 'entities'];
                    parentSubProperty = ['entities', undefined];
                    break;
                
                case 'NoteCategory': 
                    parentCollection = ['PlayerEntity', 'NoteCategory'];
                    parentProperty = ['notes', 'categories'];
                    parentSubProperty = ['categories', undefined];
                    parentEntityProperty = ['items', 'entities'];
                    parentEntitySubProperty = ['entities', undefined];
                    break;
                case 'NoteEntity': 
                    parentCollection = ['PlayerEntity', 'NoteCategory'];
                    parentProperty = ['notes', 'entities'];
                    parentSubProperty = ['entities', undefined];
                    break;

                case 'CellCategory': 
                    parentCollection = ['PlayerEntity', 'CellCategory'];
                    parentProperty = ['cells', 'categories'];
                    parentSubProperty = ['categories', undefined];
                    parentEntityProperty = ['items', 'entities'];
                    parentEntitySubProperty = ['entities', undefined];
                    break;
                case 'CellEntity': 
                    parentCollection = ['PlayerEntity', 'CellCategory'];
                    parentProperty = ['cells', 'entities'];
                    parentSubProperty = ['entities', undefined];
                    break;

                case 'StorylineInfoCategory': 
                    parentCollection = ['StorylineInfoType', 'StorylineInfoCategory'];
                    parentProperty = ['categories', 'categories'];
                    parentEntityProperty = ['entities', 'entities'];
                    break;
                case 'StorylineInfoType':
                    parentCollection = 'Storyline';
                    parentProperty = 'info';
                    parentSubProperty = 'types';
                    break;
                case 'StorylineInfoEntity':
                    parentCollection = ['Storyline', 'StorylineInfoType', 'StorylineInfoCategory'];
                    parentProperty = ['info', 'entities', 'entities'];
                    parentSubProperty = ['general', undefined, undefined];
                    break;
                
                case 'PlayerEntity':
                    parentCollection = 'Storyline';
                    parentProperty = 'players';
                    parentSubProperty = 'entities';
                    break;
                
                case 'Storyline': return error('Storylines cannot be removed client-side. You should not have been able to call this command.');
            
                default: return error('Unkown entity type. You should not have been able to call this command.');
            }

            let parent, filter = {};
            if(Array.isArray(parentCollection)){
                for(let i in parentCollection){
                    filter = {};
                    filter[parentSubProperty?.[i] ? parentProperty[i] + '.' + parentSubProperty[i] : parentProperty[i]] = id;
                    parent = await mongodb.collection(parentCollection[i]).findOne(filter);
                    if(parent){
                        parentCollection = parentCollection[i];
                        parentProperty = parentProperty[i];
                        parentSubProperty = parentSubProperty?.[i];
                        parentEntityProperty = parentEntityProperty?.[i];
                        parentEntitySubProperty = parentEntitySubProperty?.[i];
                        break;
                    }
                }
            }
            else{
                filter[parentSubProperty ? parentProperty + '.' + parentSubProperty : parentProperty] = id;
                parent = await mongodb.collection(parentCollection).findOne(filter);
            }

            if(parent){
                let parentId = parent._id;

                // delete from parent's respective child array
                let updates = {};
                let projection = {_id:0};
                let mongoArrayIdentifier = parentSubProperty ? parentProperty + '.' + parentSubProperty : parentProperty;
                let mongoEntityArrayIdentifier = parentEntitySubProperty ? parentEntityProperty + '.' + parentEntitySubProperty : parentEntityProperty;

                // if is category and !removeChildren concat all children to parent
                if(collection.endsWith('Category') && !removeChildren){
                    let deletedElement = await mongodb.collection(collection).findOne({'_id':id});
                    updates.$push = {};
                    updates.$push[mongoArrayIdentifier] = {$each:deletedElement.categories};
                    updates.$push[mongoEntityArrayIdentifier] = {$each:deletedElement.entities};
                    projection[mongoEntityArrayIdentifier] = 1;
                    await mongodb.collection(parentCollection).findOneAndUpdate({'_id':parentId},updates); // mongodb cannot push and pull in one call
                    updates = {};
                }

                updates.$pull = {};
                updates.$pull[mongoArrayIdentifier] = id;
                projection[mongoArrayIdentifier] = 1;

                io.emit('updateData_'+parentCollection+'_'+parentId, (await mongodb.collection(parentCollection).findOneAndUpdate(
                    {'_id':parentId},
                    updates,
                    {returnOriginal:false, projection}
                )).value);
            }
            else error('no parent found');

            removeFromDB(collection, id, Boolean(removeChildren));
        });
    }
    
});