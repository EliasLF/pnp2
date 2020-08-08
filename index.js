/* TODO: add Soundcloud support (https://github.com/inspiredtolive/music-bot/blob/7a9a7df0b4bf2ec6f8161709b5e3e0383de2f1bc/lib/module.js)
    instead of request node-fetch (with json method)
    loading metadata via soundcloud api: line 14
    loading stream via soundcloud api: line 91
*/

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


const _ = undefined;

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


const ISO8601 = {
    parseDuration: function (iso8601Duration) {
        var matches = iso8601Duration.match(/(-)?P(?:([.,\d]+)Y)?(?:([.,\d]+)M)?(?:([.,\d]+)W)?(?:([.,\d]+)D)?(?:T(?:([.,\d]+)H)?(?:([.,\d]+)M)?(?:([.,\d]+)S)?)?/);
    
        return {
            sign: matches[1] === undefined ? '+' : '-',
            years: matches[2] === undefined ? 0 : parseFloat(matches[2]),
            months: matches[3] === undefined ? 0 : parseFloat(matches[3]),
            weeks: matches[4] === undefined ? 0 : parseFloat(matches[4]),
            days: matches[5] === undefined ? 0 : parseFloat(matches[5]),
            hours: matches[6] === undefined ? 0 : parseFloat(matches[6]),
            minutes: matches[7] === undefined ? 0 : parseFloat(matches[7]),
            seconds: matches[8] === undefined ? 0 : parseFloat(matches[8])
        };
    },

    getSeconds: function(durationObject){
        return ((durationObject.sign == '-')?-1:1)*(
            durationObject.seconds + 
            durationObject.minutes * 60 + 
            durationObject.hours * 3600 +
            durationObject.days * 86400 +
            durationObject.weeks * 604800 +
            durationObject.months * 2592000 +
            durationObject.years * 31536000
        )
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

const youtube = {
    search: async function(searchPhrase, type, pageToken){
        //type: video, playlist or channel
    
        if(searchPhrase === undefined) throw 'search phrase missing';
        let data = 'part=snippet&maxResults=25&key='+config.youtube.token+'&q='+encodeURIComponent(searchPhrase);
        if(type) data += '&type='+encodeURIComponent(type);
        if(pageToken) data += '&pageToken='+encodeURIComponent(pageToken);
        let output = await fetch('https://www.googleapis.com/youtube/v3/search?'+data);
        if(output.status != 200) return false;
        output = await output.json();
        if(output.error) throw `Youtube API Error: Code: ${output.error.code}; Reasons: ${errors.map(x => x.reason).join(', ')}` ;
        else if(output.items[0]) return output;
        return false;
    },

    chachedVideos: new Map(),

    videoInfo: async function(videoId, part='snippet,contentDetails'){
        if(videoId === undefined) throw 'video id missing';
        if(this.chachedVideos.get(videoId)) return this.chachedVideos.get(videoId);
        let data = 'part='+encodeURIComponent(part)+'&key='+config.youtube.token+'&id='+encodeURIComponent(videoId);
        let output = await fetch('https://www.googleapis.com/youtube/v3/videos?'+data);
        if(output.status != 200) return false;
        output = await output.json();
        if(output.error) throw `Youtube API Error: Code: ${output.error.code}; Reasons: ${errors.map(x => x.reason).join(', ')}` ;
        else if(output.items[0]){
            this.chachedVideos.set(videoId, output.items);
            return output.items;
        }
        return false;
    },

    playlistItems: async function(playlistId, extendedInfo, pageToken, i){
        if(playlistId === undefined) throw 'playlist id missing';
        let data = 'part=snippet&maxResults=50&key='+config.youtube.token+'&playlistId='+encodeURIComponent(playlistId);
        if(pageToken) data += '&pageToken='+encodeURIComponent(pageToken);
        let output = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?'+data);
        if(output.status != 200) return false;
        output = await output.json();
        if(output.error) throw `Youtube API Error: Code: ${output.error.code}; Reasons: ${errors.map(x => x.reason).join(', ')}`;
        if(extendedInfo && output.items){
            let ids = output.items.map(x => x.snippet.resourceId.videoId);
            let videos = await this.videoInfo(ids.join(','));
            for(let video of videos){
                let item = output.items[ids.indexOf(video.id)];
                item.videoSnippet = video.snippet;
                item.contentDetails = video.contentDetails;
            }
        }
        if(i === undefined) i = 0;
        if(output.nextPageToken && i<10){
            let tmp = await this.playlistItems(playlistId, extendedInfo, output.nextPageToken, i++);
            if(tmp) output.items = output.items.concat(tmp);
        }
        if(output.items[0]) return output.items;
        return false;
    }
};

var discord = {
    client: new Discord.Client(),
    PREFIX: config.discord.commandPrefix,
    server: {
        playing: false,
        startedPlayingFrom: 0,
        autoplay: true,
        loop: false,
        wrapAround: true,
        autoclean: false,
        shuffle: false,
        currentlyPlaying: null,
        voiceConnection: null,
        dispatcher: null,
        stream: null,
        queueId: 1,
        queues: new Map([[0,{id:0, name:'Default',queue:[]}]]),
        currentQueue: 0,
        lastVoiceChannel: null,

        async init(guild){
            this.id = guild.id;
            this.guild = guild;

            let promises = [];
            for(let memberId of (await guild.members.fetch()).keyArray()){
                promises.push(this.initUser(memberId));
            }
            await Promise.all(promises);

            this.readyResolve();
        },

        initUser(id){
            return mongodb.collection('DiscordUser').updateOne(
                {_id:id},
                {$setOnInsert:{
                    notifications:{
                        discord: false,
                        email: [],
                        web: [],
                        telegram: []
                    }
                }},
                {upsert: true}
            );
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

        async distroyDispatcher(){
            await this.onready;
            (await this.getDispatcher())?.destroy();
            this.dispatcher = null;
        },

        getCurrentQueue(){
            return this.queues.get(this.currentQueue);
        },

        addQueue(name){
            let queue = {id:this.queueId, name, queue:[]};
            this.queues.set(this.queueId, queue);
            this.queueId++;
            // TODO: send change to sockets!
            return queue;
        },

        removeQueue(queueId){
            // TODO
            // check if currentlyPlaying inside queue!
        },

        renameQueue(queueId, newName){
            // TODO
            // send change to sockets!
        },

        getSongIndexById(id, queue){
            if(!queue) queue = this.getCurrentQueue();
            let index = queue.queue.map(x => x.id).indexOf(id);
            return (index >= 0)?index:null;
        },

        getSongIndexAndQueueById(id){
            for(let queue of this.queues.values()){
                let index = this.getSongIndexById(id, queue);
                if(index != null) return {index,queue};
            }
            return null;
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
            else if(!msg.guild.voice || !msg.guild.voice.channel || !this.voiceConnection){
                if(!msg.member.voice || !msg.member.voice.channel){
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
            });
            return true;
        },

        async play(position=0){
            await this.onready;
            // postion in seconds
            if(this.getCurrentQueue().queue.length === 0 || !(await this.getVoiceConnection())) return false;
            if(await this.getDispatcher()) return true;
            if(!this.currentlyPlaying){
                this.currentlyPlaying = this.getCurrentQueue().queue[0];
                io.emit('music_currentlyPlaying',this.currentlyPlaying.id);
            }
            [this.dispatcher, this.stream] = this.currentlyPlaying.play(await this.getVoiceConnection(),position);
            this.playing = true;
            this.startedPlayingFrom = position;
            io.emit('music_playing',true);
            io.emit('music_syncTime',position);

            this.dispatcher.on('finish', ()=>{
                if(!this.autoplay || this.getCurrentQueue().queue.length === 0){
                    this.playing = false;
                    this.currentlyPlaying = null;
                    io.emit('music_currentlyPlaying',null);
                    (await (this.getVoiceConnection())).disconnect();
                    this.dispatcher = null;
                    return;
                }

                if(this.loop) this.play();
                else this.next();
            });

            return true;
        },

        async jumpToPostion(position){
            await this.onready;
            // postion in seconds
            if(!this.currentlyPlaying || ISO8601.getSeconds(this.currentlyPlaying.duration)<position) return false;
            await this.distroyDispatcher();
            this.play(parseFloat(position));
        },

        async getCurrentPostion(){
            await this.onready;
            let dispatcher = await this.getDispatcher();
            if(!dispatcher) return false;
            return this.startedPlayingFrom + (dispatcher.streamTime/1000); // in seconds
        },

        async resume(){
            await this.onready;
            let dispatcher = await this.getDispatcher();
            if(!dispatcher) return false;
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
            await this.distroyDispatcher();
            (await this.getVoiceConnection()).disconnect();
            this.playing = false;
            io.emit('music_playing',false);
            io.emit('music_timeSync',0);
            return true;
        },

        async skipToIndex(index){
            await this.onready;
            if(!this.getCurrentQueue().queue[index]) return false;

            await this.distroyDispatcher();
            this.currentlyPlaying = this.getCurrentQueue().queue[index];
            io.emit('music_currentlyPlaying',this.currentlyPlaying.id);
            this.play();
            return true;
        },

        switchQueue(newQueueId){
            if(!this.queues.get(newQueueId)) return false;
            this.currentQueue = newQueueId;
            return true;
        },

        async skipToSong(id){
            await this.onready;
            // TODO: search in all queues and switch if necessary
            let index = this.getSongIndexById(id);
            if(index == null) return false;
            return await this.skipToIndex(index);
        },

        async next(){
            await this.onready;
            // TODO: repair logic for multiple queues
            let index = this.getCurrentQueue().queue.indexOf(this.currentlyPlaying);
            if(index == -1) return false;
            if(this.autoclean && (!(await this.remove(index, true)) || this.getCurrentQueue().queue.length === 0)){
                this.playing = false;
                this.currentlyPlaying = null;
                io.emit('music_currentlyPlaying',null);
                (await this.getVoiceConnection()).disconnect();
                this.dispatcher = null;
                return true;
            }
            index = index + 1*(!this.autoclean);

            if(this.shuffle){
                return await this.skipToIndex(Math.floor(Math.random()*this.getCurrentQueue().queue.length));
            }
            else if(this.getCurrentQueue().queue[index]){
                return await this.skipToIndex(index);
            }
            else{
                if(this.wrapAround) return await this.skipToIndex(0);
                else{
                    this.playing = false;
                    this.currentlyPlaying = null;
                    io.emit('music_currentlyPlaying',null);
                    (await this.getVoiceConnection()).disconnect();
                    this.dispatcher = null;
                }
            }
            return true;
        },

        async previous(){
            await this.onready;
            let index = this.getCurrentQueue().queue.indexOf(this.currentlyPlaying);
            if(index == -1) return false;

            if(this.shuffle){
                return await this.skipToIndex(Math.floor(Math.random()*this.getCurrentQueue().queue.length));
            }
            else if(this.getCurrentQueue().queue[index - 1]){
                return await this.skipToIndex(index - 1);
            }
            else{
                if(this.wrapAround) return await this.skipToIndex(this.getCurrentQueue().queue.length - 1);
                else return await this.skipToIndex(0);
            }
        },

        addToQueue(songs){
            for(let song of songs) this.getCurrentQueue().queue.push(song);
            io.emit('music_append',songs);
        },

        async clearQueue(){
            await this.onready;
            await this.stop();
            this.getCurrentQueue().queue = [];
            this.currentlyPlaying = null;
            io.emit('music_currentlyPlaying',null);
            (await this.getDispatcher())?.end();
            io.emit('music_clear');
        },

        async remove(index, notCheckIfPlaying){
            await this.onready;
            if(!this.getCurrentQueue().queue[index]) return false;
            let song = this.getCurrentQueue().queue[index];
            if(!notCheckIfPlaying && song == this.currentlyPlaying){
                await this.next();
                if(song != this.getCurrentQueue().queue[index]) return true; // if removed by autoclean
            }
            this.getCurrentQueue().queue.splice(index,1);
            io.emit('music_remove', song.id);
            return true;
        },

        setShuffle(state){
            this.shuffle = !!state;
            io.emit('music_shuffle', this.shuffle);
        },

        setLoop(state){
            this.loop = !!state;
            io.emit('music_loop', this.loop);
        },

        setAutoplay(state){
            this.autoplay = !!state;
            io.emit('music_autoplay', this.autoplay);
        },

        setAutoclean(state){
            this.autoclean = !!state;
            io.emit('music_autoclean', this.autoclean);
        },

        setWrapAround(state){
            this.wrapAround = !!state;
            io.emit('music_wrapAround', this.wrapAround);
        }
    }
};
discord.server.onready = new Promise(resolve => {discord.server.readyResolve = resolve});

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
        this.songs = songs; // contains actual objects

        
    }
}

class Song {
    static nextId = 0;

    constructor(service, contentId, name, author, thumbnail, duration){
        this.id = Song.nextId++;
        if(Song.nextId >= Number.MAX_SAFE_INTEGER) Song.nextId = 0;
        objectSets.Song.set(this.id, this);

        this.service = service;
        this.contentId = contentId;
        this.name = name;
        this.author = author;
        this.thumbnail = thumbnail;
        this.duration = duration;
    }

    play(connection, position=0, stream){
        // position in seconds
        if(!connection) return;
        if(!stream){
            if(this.service === 'YouTube'){
                stream = ytdl('https://www.youtube.com/watch?v='+this.contentId, { filter: 'audioonly' });
            }
            else{
                return null;
            }
        }
        let dispatcher = connection.play(stream, {seek: position});
        return [dispatcher, stream];
    }

    static async getFromURL(url){
        if(url.startsWith('https://')) url = url.substring(8);
        if(url.startsWith('http://')) url = url.substring(7);
        if(url.startsWith('www.')) url = url.substring(4);

        if(this.isCollection(url)) return (await this.getCollection(url));
        return [await this.getSingle(url)];
    }

    static async getSingle(url){
        var service;
        var contentId;
        var name;
        var author;
        var thumbnail;
        var duration;
        var pars = getURLParameters(url);

        if(url.startsWith('youtube.com/watch')){
            service = 'YouTube';
            if(!pars.v) throw 'Not a valid youtube url';
            contentId = pars.v;
            
            let ytData = await youtube.videoInfo(contentId);
            if(!ytData) throw 'Unable to fetch video meta data. Probably not a valid youtube url.';
            ytData = ytData[0];
            name = ytData.snippet.title;
            author = {name: ytData.snippet.channelTitle, id: ytData.snippet.channelId};
            thumbnail = ytData.snippet.thumbnails.default.url; // instead of default other tags (ordered by quality): default < medium < high < standard < maxres
            duration = ISO8601.parseDuration(ytData.contentDetails.duration);
        }

        return new Song(service, contentId, name, author, thumbnail, duration);
    }

    static async getCollection(url){
        var songs = [];
        var pars = getURLParameters(url);

        if(url.startsWith('youtube.com/playlist')){
            if(!pars.list) throw 'Not a valid youtube url';
            let playlistId = pars.list;
            
            let ytData = await youtube.playlistItems(playlistId, true);
            if(!ytData) throw 'Unable to fetch video meta data. Probably not a valid youtube url.';

            for(let i in ytData){
                if(!ytData[i] || !ytData[i].snippet || !ytData[i].videoSnippet || !ytData[i].contentDetails) continue;
                songs.push(new Song(
                    'YouTube', 
                    ytData[i].snippet.resourceId.videoId, 
                    ytData[i].videoSnippet.title, 
                    {name: ytData[i].videoSnippet.channelTitle, id: ytData[i].videoSnippet.channelId}, 
                    ytData[i].videoSnippet.thumbnails.default.url, // instead of default other tags (ordered by quality): default < medium < high < standard < maxres
                    ISO8601.parseDuration(ytData[i].contentDetails.duration)
                ));
            }
        }

        return songs;
    }

    static isCollection(url){
        if(url.startsWith('youtube.com/playlist')) return true;
        if(url.startsWith('youtube.com/watch')) return false;
    }
}

discord.client.on('ready', () => {
    console.log('Bot is online');
});

discord.client.on('guildMemberAdd', member => {
    discord.server.initUser(member.user.id);
});

const notifications = {
    web(user, text, url){
        if(!user.notifications.web.length) return;
        for(let device of user.notifications.web){
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
                        "icon": "https://foramitti.com/elias/logo/favicon.svg"
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
        this.web(user, text, url);
        this.email(user, text, url);
        this.telegram(user, text, url);
        this.discord(user, text, url);
    }
}

discord.client.on('message', async function(msg){
    if(msg.content.startsWith('Ann:') /* msg.mentions.everyone && msg.content.startsWith('@everyone')*/){ // announcement
        let text = msg.content;//.substring(9);
        // read initialized users from MongoDB (only use those with notification settings)
        let users = await mongodb.collection('DiscordUser').find().toArray();
        for(let i=0; i<users.length; i++){
            if(
                !users[i].notifications.discord && 
                !users[i].notifications.email.length &&
                !users[i].notifications.web.length &&
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
            case 'test':
                
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
                await discord.server.joinVoiceChannel(msg);
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
                        discord.server.addToQueue(await Song.getFromURL(args[1]));
                    }
                    catch(e){
                        msg.channel.send('Error: '+e);
                        break;
                    }
                    
                    
                    if(args[0] !== 'play') break;
                }

                //else interpret as resume ->
            case 'resume':
                if(!(await discord.server.joinVoiceChannel(msg))) break;
                if(!(await discord.server.resume())){
                    discord.server.play();
                }
            break;

            case 'pause':
                discord.server.pause();
            break;
            
            case 'stop':
                discord.server.stop();
            break;

            case 'clear':
                msg.channel.confirm('Are you sure you want to clear the music queue?', () => {discord.server.clearQueue();});
            break;

            case 'remove':
                // TODO
            break;

            case 'autoplay':
                discord.server.autoplay = !discord.server.autoplay;
                msg.channel.send('Autoplay **' + (discord.server.autoplay?'on':'off') + '**');
            break;

            case 'loop':
                discord.server.loop = !discord.server.loop;
                msg.channel.send('Loop **' + (discord.server.loop?'on':'off') + '**');
            break;
            
            case 'wraparound': case 'wrap':
                discord.server.wrapAround = !discord.server.wrapAround;
                msg.channel.send('Wrap Around **' + (discord.server.wrapAround?'on':'off') + '**');
            break;

            case 'autoclean':
                discord.server.autoclean = !discord.server.autoclean;
                msg.channel.send('Autoclean **' + (discord.server.autoclean?'on':'off') + '**');
            break;

            case 'shuffle':
                discord.server.shuffle = !discord.server.shuffle;
                msg.channel.send('Shuffle **' + (discord.server.shuffle?'on':'off') + '**');
            break;

            case 'info':
                reply = (
                    'Playing: **' + (discord.server.playing?'yes':'no') + 
                    '**\nAutoplay: **' + (discord.server.autoplay?'on':'off') + 
                    '**\nWrapping around: **' + (discord.server.wrapAround?'on':'off') + 
                    '**\nLoop: **' + (discord.server.loop?'on':'off') + 
                    '**\nShuffle: **' + (discord.server.shuffle?'on':'off') + 
                    '**\nAutoclean: **' + (discord.server.autoclean?'on':'off') + '**\n'
                );
                // no break to also display queue
            
            case 'queue': case 'playlist': case 'list':
                if(!reply) reply = '';
                reply += 'Queue:\n';
                if(discord.server.getCurrentQueue().queue.length === 0) reply += '   *empty*'
                else for(let i in discord.server.getCurrentQueue().queue){
                    reply += `${discord.server.getCurrentQueue().queue[i] == discord.server.currentlyPlaying ? ' ▸':'     '} ${parseInt(i)+1}. ${
                        discord.server.getCurrentQueue().queue[i].name.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\|/g,'\\|').replace(/\*/g,'\\*').replace(/_/g,'\\_')
                        .replace(/~/g,'\\~').replace(/>/g,'\\>').replace(/:/g,'\\:').replace(/#(?! )/g,'# ').replace(/@(?! )/g,'@ ')
                    } (${discord.server.getCurrentQueue().queue[i].service})` + '\n';
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
                let dispatcher = await discord.server.getDispatcher();
                if(discord.server.currentlyPlaying && dispatcher){
                    let progress = dispatcher.streamTime/ISO8601.getSeconds(discord.server.currentlyPlaying.duration)/1000;
                    msg.channel.send(
                        `${
                            discord.server.currentlyPlaying.name.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\|/g,'\\|').replace(/\*/g,'\\*').replace(/_/g,'\\_')
                            .replace(/~/g,'\\~').replace(/>/g,'\\>').replace(/:/g,'\\:').replace(/#(?! )/g,'# ').replace(/@(?! )/g,'@ ')
                        } (${discord.server.currentlyPlaying.service})`+'\n'+
                        '▬'.repeat(Math.round(progress*18))+
                        ':radio_button:'+
                        '▬'.repeat(Math.round((1-progress+0.0001)*18))
                    );
                }
                else msg.channel.send('Nothing playing at the moment');
            break;

            case 'skipto':
                // TODO: if contains ':' jumpToPosition (with 1 ':' mm:ss with 2 ':' hh:mm:ss)
                if(!args[1] || !(await discord.server.skipToIndex(parseInt(args[1])-1))) msg.channel.send('You need to specify the queue position where to skip to as a positive integer');
            break;

            case 'skip': 
                if(args[1]){
                    if(!(await discord.server.skipToIndex(parseInt(args[1])-1))) msg.channel.send('You need to specify the queue position where to skip to as a positive integer');
                    break;
                }
                // else interpret as next ->
            case 'next':
                discord.server.next();
            break;

            case 'prev': case 'previous': case 'last':
                discord.server.previous();
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
                    return msg.channel.send('Error during eval: '+e.message);
                }

                /*let diceNumber;
                let diceFaces;
                if(args.length >= 3){
                    diceNumber = parseInt(args[1]);
                    diceFaces = args[2];
                }
                else{
                    args[1] = args[1].toLowerCase();
                    [diceNumber, diceFaces] = args[1].split('d');
                    diceNumber = parseInt(diceNumber);
                }

                if(!diceNumber || diceNumber < 0){
                    msg.channel.send('You need to specify the number of dice (first number) as a positive integer');
                    break;
                }

                var results = [];

                if(diceFaces === '2^n'){
                    for(let i = 0; i<diceNumber; i++){
                        results.push(2**Math.ceil(Math.random()*6));
                    }
                }
                else{
                    diceFaces = parseInt(diceFaces);
                    if(!diceFaces || diceFaces < 0){
                        msg.channel.send('You need to specify the dice faces (second number/parameter) either as a positive integer or as one of the special dice');
                        break;
                    }
                    for(let i = 0; i<diceNumber; i++){
                        results.push(Math.ceil(Math.random()*diceFaces));
                    }
                }

                if(diceNumber > 20){
                    reply = [''];
                    let sum = Math.sum(...results);
                    for(let i in results){
                        if(i%20 == 0 && i != 0){
                            reply[reply.length-1] += '...\n---\n**Result: '+sum+'**';
                            reply.push('');
                        }
                        reply[reply.length-1] += `Dice ${parseInt(i)+1}: ${results[i]}` + '\n';
                    }
                    reply[reply.length-1] += '---\n**Result: '+sum+'**';

                    msg.channel.sendPages(reply);
                }
                else{
                    reply = '';
                    for(let i in results){
                        reply += `Dice ${parseInt(i)+1}: ${results[i]}` + '\n';
                    }
                    reply += '---\n**Result: '+Math.sum(...results)+'**';
                    msg.channel.send(reply);
                }*/
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
\`${discord.PREFIX}add source_url\` / \`${discord.PREFIX}append source_url\`: adds a new song to the end of the queue (supported source urls: YouTube video, YouTube playlist)
\`${discord.PREFIX}play source_url\`: adds a new song to the end of the queue and starts/resumes playing (supported source urls: YouTube video, YouTube playlist)
\`${discord.PREFIX}play\` / \`${discord.PREFIX}resume\`: starts/resumes playing (joins/switches to the same voice channel as the member, who set off the command, is in)
\`${discord.PREFIX}pause\`: pauses the music stream
\`${discord.PREFIX}stop\`: stops the music stream (will restart at the same song but not the same song position)
\`${discord.PREFIX}clear\`: clears the song queue
\`${discord.PREFIX}queue\` / \`${discord.PREFIX}list\`: displays the song queue
\`${discord.PREFIX}queue\` / \`${discord.PREFIX}list\` / \`${discord.PREFIX}playlist\`: displays the song queue
\`${discord.PREFIX}np\` / \`${discord.PREFIX}nowplaying\` / \`${discord.PREFIX}nowplay\` / \`${discord.PREFIX}cp\` / \`${discord.PREFIX}currentlyplaying\` / \`${discord.PREFIX}currentlyplay\` /  \`${discord.PREFIX}currentplaying\` /  \`${discord.PREFIX}currentplay\`: displays the currently playing song
\`${discord.PREFIX}skip index\` / \`${discord.PREFIX}skipto index\`: jumps to the provided queue index
\`${discord.PREFIX}skip\` / \`${discord.PREFIX}next\`: jumps to the next song
\`${discord.PREFIX}prev\` / \`${discord.PREFIX}previous\` / \`${discord.PREFIX}last\`: jumps to the last song
\`${discord.PREFIX}autoplay\`: toggles if the bot automatically jumps to the next song after finishing the current song
\`${discord.PREFIX}loop\`: toggles if the bot loops the current song
\`${discord.PREFIX}wraparound\`: toggles if the bot jumps back to the first song after finishing the queue
\`${discord.PREFIX}shuffle\`: toggles random song selection
\`${discord.PREFIX}autoclean\`: toggles if the bot deletes finished songs from the queue
\`${discord.PREFIX}info\`: displays current settings and the song queue

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

io.on('connection', async (socket) => {

    await discord.server.onready;
    socket.emit('music_queue', discord.server.getCurrentQueue().queue);
    socket.emit('music_currentlyPlaying', (discord.server.currentlyPlaying)?discord.server.currentlyPlaying.id:null);
    socket.emit('music_playing', discord.server.playing);
    socket.emit('music_shuffle', discord.server.shuffle);
    socket.emit('music_loop', discord.server.loop);
    socket.emit('music_autoplay', discord.server.autoplay);
    socket.emit('music_autoclean', discord.server.autoclean);
    socket.emit('music_wrapAround', discord.server.wrapAround);
    
    // MUSIC CALLS:
    {
        socket.on('music_shifted', ([songId, newIndex]) => {
            socket.broadcast.emit('shifted', [songId, newIndex]);
            let index = discord.server.getSongIndexById(id);
            if(index == null) return;
            let song = discord.server.getCurrentQueue().queue.splice(index,1)[0];
            discord.server.getCurrentQueue().queue.splice(newIndex,0,song);
        });
    
        socket.on('music_currentlyPlaying', (id)=>discord.server.skipToSong(id));
        
        socket.on('music_pause', ()=>discord.server.pause());
    
        socket.on('music_resume', async function(){
            try{
                await discord.server.joinVoiceChannel();
            }
            catch(e){
                socket.emit('err',
                    'An error occured. Probably the bot is not yet in any voice channel and does not remember in which voice channel it was last. To fix this:\n\n'+
                    '1. open Discord and navigate to the respective discord server\n'+
                    '2. join the voice channel, in which you want the bot to play music\n'+
                    '3. while staying the voice channel, open the bot-text-channel and type \'?join\'\n\n'+
                    'The bot should now have joined the voice channel and be controllable from this webinterface. You can now of course leave the voice channel again, if you want to.\n\n'+
                    'Error message: '+e
                );
                return;
            }
            if(!(await discord.server.resume())){
                if(!(await discord.server.play())){
                    socket.emit('err','An error occured while starting to play');
                }
            }
        });
    
        socket.on('music_stop', ()=>discord.server.stop());
        
        socket.on('music_next', ()=>discord.server.next());
        socket.on('music_prev', ()=>discord.server.previous());
    
        socket.on('music_remove', (id)=>{
            let index = discord.server.getSongIndexById(id);
            if(index == null) return;
            discord.server.remove(index);
        });
    
        socket.on('music_shuffle', (state)=>discord.server.setShuffle());
    
        socket.on('music_loop', (state)=>discord.server.setLoop());
        
        socket.on('music_autoplay', (state)=>discord.server.setAutoplay(state));
        
        socket.on('music_autoclean', (state)=>discord.server.setAutoclean(state));
        
        socket.on('music_wrapAround', (state)=>discord.server.setWrapAround(state));
    
        socket.on('music_syncTime', async ()=>{
            let position = await discord.server.getCurrentPostion();
            if(position) socket.emit('music_syncTime',position);
        });
    
        async function autoSync(){
            if(discord.server?.playing && await discord.server.getDispatcher()){
                let position = await discord.server.getCurrentPostion();
                if(position) socket.emit('music_syncTime',position);
            }
            setTimeout(autoSync, 10000);
        }
        autoSync();
    
        socket.on('music_jumpTo', position => discord.server.jumpToPostion(position));
    
        socket.on('music_appendURL', async function(url){
            try{
                discord.server.addToQueue(await Song.getFromURL(url));
            }
            catch(e){
                console.error(e);
                socket.emit('err','An error occured. Probably the given URL is not valid or supported.\n\nError message: '+e);
            }
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
                {'_id':id, 'notifications.web.token': {$ne:token}},
                {$push: {'notifications.web':{token,device}}},
                {returnOriginal:false}
            ))?.value;

            if(user) io.emit('updateDiscordUser_'+user._id,user);
        });

        socket.on('notifications_unsubscribePush', async function(id, token){
            let user = (await mongodb.collection('DiscordUser').findOneAndUpdate(
                {'_id':id, 'notifications.web.token':token},
                {$pull: {'notifications.web':{'token':token}}},
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
                socket.emit('err','requestData_images(): '+e);
            }
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
                    if(!Array.isArray(tmpData.entities) || tmpData.entities.some(x => !Number.isInteger(x))){
                        delete tmpData.entities;
                        error('entities must be an array of numerical ids');
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
                if(!Array.isArray(tmpData.entities) || tmpData.entities.some(x => !Number.isInteger(x)))
                    return error('entities must be an array of numerical ids');
                
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
                        for(let templateId of template.entities) keepOrderPromises.push(addData(childCollection, _, {
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
                            for(let templateId of template[property].entities) keepOrderPromises.push(addData(childCollection, _, {
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