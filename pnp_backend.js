/* TODO: add Soundcloud support (https://github.com/inspiredtolive/music-bot/blob/7a9a7df0b4bf2ec6f8161709b5e3e0383de2f1bc/lib/module.js)
    instead of request node-fetch (with json method)
    loading metadata via soundcloud api: line 14
    loading stream via soundcloud api: line 91
*/

var config = require('./config.json');

var fs = require( 'fs' );
/*var app = require('express')();
var https = require('https');
var httpsServer = https.createServer({ 
    key: fs.readFileSync('privkey.pem'),
    cert: fs.readFileSync('fullchain.pem') 
 },app);
httpsServer.listen(8081);

var io = require('socket.io').listen(httpsServer);*/ // TODO: use this, instead of:
const io = require('socket.io')(8081);

const Discord = require('discord.js');
const ytdl = require('ytdl-core');
const fetch = require('node-fetch');
const { Cipher } = require('crypto');
const mailTransport = require('nodemailer').createTransport({
    host: 'mail.foramitti.com', // TODO: change to localhost (check if still works)
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

mysql.connection = mysql.createConnection(config.mysql);
mysql.connection.connect(function(err){
    if(err) console.error('Error while connecting to MySQL: ',err);
    else{
        mysql.connectionReady = true;
        for(let resolve of mysql.connectResolves) resolve();
    }
});

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


const bot = new Discord.Client();
const PREFIX = '?';

class DiscordServer {
    constructor(guild){
        this.id = guild.id;
        this.guild = guild;
        this.playing = false;
        this.startedPlayingFrom = 0;
        this.autoplay = true;
        this.loop = false;
        this.wrapAround = true;
        this.autoclean = false;
        this.shuffle = false;
        this.currentlyPlaying = null;
        this.voiceConnection = null;
        this.dispatcher = null;
        this.stream = null;
        this.queue = [];
        this.sockets = [];
        this.lastVoiceChannel = null;
    }

    getVoiceConnection(){
        if(!this.guild.voice || !this.guild.voice.channel) this.voiceConnection = null;
        return this.voiceConnection;
    }

    getDispatcher(){
        if(!this.getVoiceConnection()) this.dispatcher = null;
        return this.dispatcher;
    }

    distroyDispatcher(){
        this.getDispatcher()?.destroy();
        this.dispatcher = null;
    }

    getSongIndexById(id){
        let index = this.queue.map(x => x.id).indexOf(id);
        return (index >= 0)?index:null;
    }

    async joinVoiceChannel(msg){
        // if no message given, join the last voice channel
        if(!msg){
            if(this.getVoiceConnection()) return true;
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
    }

    play(position=0){
        // postion in seconds
        if(this.queue.length === 0 || !this.getVoiceConnection()) return false;
        if(this.getDispatcher()) return true;
        if(!this.currentlyPlaying){
            this.currentlyPlaying = this.queue[0];
            for(let socket of this.sockets) socket.emit('currentlyPlaying',this.currentlyPlaying.id);
        }
        [this.dispatcher, this.stream] = this.currentlyPlaying.play(this.getVoiceConnection(),position);
        this.playing = true;
        this.startedPlayingFrom = position;
        for(let socket of this.sockets) socket.emit('playing',true);
        for(let socket of this.sockets) socket.emit('syncTime',position);

        this.dispatcher.on('finish', ()=>{
            if(!this.autoplay || this.queue.length === 0){
                this.playing = false;
                this.currentlyPlaying = null;
                for(let socket of this.sockets) socket.emit('currentlyPlaying',null);
                this.getVoiceConnection().disconnect();
                this.dispatcher = null;
                return;
            }

            if(this.loop) this.play();
            else this.next();
        });

        return true;
    }

    jumpToPostion(position){
        // postion in seconds
        if(!this.currentlyPlaying || ISO8601.getSeconds(this.currentlyPlaying.duration)<position) return false;
        this.distroyDispatcher();
        this.play(parseFloat(position));
    }

    getCurrentPostion(){
        let dispatcher = this.getDispatcher();
        if(!dispatcher) return false;
        return this.startedPlayingFrom + (dispatcher.streamTime/1000); // in seconds
    }

    resume(){
        let dispatcher = this.getDispatcher();
        if(!dispatcher) return false;
        dispatcher.resume();
        this.playing = true;
        for(let socket of this.sockets) socket.emit('playing',true);
        return true;
    }

    pause(){
        let dispatcher = this.getDispatcher();
        if(!dispatcher) return false;
        dispatcher.pause();
        this.playing = false;
        for(let socket of this.sockets) socket.emit('playing',false);
        return true;
    }

    stop(){
        let dispatcher = this.getDispatcher();
        if(!dispatcher) return false;
        this.distroyDispatcher();
        this.getVoiceConnection().disconnect();
        this.playing = false;
        for(let socket of this.sockets) socket.emit('playing',false);
        for(let socket of this.sockets) socket.emit('timeSync',0);
        return true;
    }

    skipToIndex(index){
        if(!this.queue[index]) return false;

        this.distroyDispatcher();
        this.currentlyPlaying = this.queue[index];
        for(let socket of this.sockets) socket.emit('currentlyPlaying',this.currentlyPlaying.id);
        this.play();
        return true;
    }

    skipToSong(id){
        let index = this.getSongIndexById(id);
        if(index == null) return false;
        return this.skipToIndex(index);
    }

    next(){
        let index = this.queue.indexOf(this.currentlyPlaying);
        if(index == -1) return false;
        if(this.autoclean && (!this.remove(index, true) || this.queue.length === 0)){
            this.playing = false;
            this.currentlyPlaying = null;
            for(let socket of this.sockets) socket.emit('currentlyPlaying',null);
            this.getVoiceConnection().disconnect();
            this.dispatcher = null;
            return true;
        }
        index = index + 1*(!this.autoclean);

        if(this.shuffle){
            return this.skipToIndex(Math.floor(Math.random()*this.queue.length));
        }
        else if(this.queue[index]){
            return this.skipToIndex(index);
        }
        else{
            if(this.wrapAround) return this.skipToIndex(0);
            else{
                this.playing = false;
                this.currentlyPlaying = null;
                for(let socket of this.sockets) socket.emit('currentlyPlaying',null);
                this.getVoiceConnection().disconnect();
                this.dispatcher = null;
            }
        }
        return true;
    }

    previous(){
        let index = this.queue.indexOf(this.currentlyPlaying);
        if(index == -1) return false;

        if(this.shuffle){
            return this.skipToIndex(Math.floor(Math.random()*this.queue.length));
        }
        else if(this.queue[index - 1]){
            return this.skipToIndex(index - 1);
        }
        else{
            if(this.wrapAround) return this.skipToIndex(this.queue.length - 1);
            else return this.skipToIndex(0);
        }
    }

    addToQueue(songs){
        for(let song of songs) this.queue.push(song);
        for(let socket of this.sockets) socket.emit('append',songs);
    }

    clearQueue(){
        this.stop();
        this.queue = [];
        this.currentlyPlaying = null;
        for(let socket of this.sockets) socket.emit('currentlyPlaying',null);
        this.getDispatcher()?.end();
        for(let socket of this.sockets) socket.emit('clear');
    }

    remove(index, notCheckIfPlaying){
        if(!this.queue[index]) return false;
        let song = this.queue[index];
        if(!notCheckIfPlaying && song == this.currentlyPlaying){
            this.next();
            if(song != this.queue[index]) return true; // if removed by autoclean
        }
        this.queue.splice(index,1);
        for(let socket of this.sockets) socket.emit('remove', song.id);
        return true;
    }

    setShuffle(state){
        this.shuffle = !!state;
        for(let socket of this.sockets) socket.emit('shuffle', this.shuffle);
    }

    setLoop(state){
        this.loop = !!state;
        for(let socket of this.sockets) socket.emit('loop', this.loop);
    }

    setAutoplay(state){
        this.autoplay = !!state;
        for(let socket of this.sockets) socket.emit('autoplay', this.autoplay);
    }

    setAutoclean(state){
        this.autoclean = !!state;
        for(let socket of this.sockets) socket.emit('autoclean', this.autoclean);
    }

    setWrapAround(state){
        this.wrapAround = !!state;
        for(let socket of this.sockets) socket.emit('wrapAround', this.wrapAround);
    }
}

var nextSongId = 1;
class Song {
    constructor(service, contentId, name, author, thumbnail, duration){
        this.service = service;
        this.contentId = contentId;
        this.name = name;
        this.author = author;
        this.thumbnail = thumbnail;
        this.duration = duration;

        this.id = nextSongId++;
        if(nextSongId >= Number.MAX_SAFE_INTEGER) nextSongId = 1;
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

bot.on('ready', () => {
    console.log('Bot is online');
});

bot.on('message', async function(msg){
    if(msg.channel.name == 'bot' && msg.content.startsWith(PREFIX)){
        
        let args = msg.content.substring(PREFIX.length).replace(/ +/g,' ').split(" ");
        args[0] = args[0].toLowerCase();
        let reply;

        switch(args[0]){
            case 'join':
                await discordServer.joinVoiceChannel(msg);
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
                        discordServer.addToQueue(await Song.getFromURL(args[1]));
                    }
                    catch(e){
                        msg.channel.send('Error: '+e);
                        break;
                    }
                    
                    
                    if(args[0] !== 'play') break;
                }

                //else interpret as resume ->
            case 'resume':
                if(!(await discordServer.joinVoiceChannel(msg))) break;
                if(!discordServer.resume()){
                    discordServer.play();
                }
            break;

            case 'pause':
                discordServer.pause();
            break;
            
            case 'stop':
                discordServer.stop();
            break;

            case 'clear':
                confirm(msg.channel, 'Are you sure you want to clear the music queue?', () => {discordServer.clearQueue();});
            break;

            case 'remove':
                // TODO
            break;

            case 'autoplay':
                discordServer.autoplay = !discordServer.autoplay;
                msg.channel.send('Autoplay **' + (discordServer.autoplay?'on':'off') + '**');
            break;

            case 'loop':
                discordServer.loop = !discordServer.loop;
                msg.channel.send('Loop **' + (discordServer.loop?'on':'off') + '**');
            break;
            
            case 'wraparound': case 'wrap':
                discordServer.wrapAround = !discordServer.wrapAround;
                msg.channel.send('Wrap Around **' + (discordServer.wrapAround?'on':'off') + '**');
            break;

            case 'autoclean':
                discordServer.autoclean = !discordServer.autoclean;
                msg.channel.send('Autoclean **' + (discordServer.autoclean?'on':'off') + '**');
            break;

            case 'shuffle':
                discordServer.shuffle = !discordServer.shuffle;
                msg.channel.send('Shuffle **' + (discordServer.shuffle?'on':'off') + '**');
            break;

            case 'info':
                reply = (
                    'Playing: **' + (discordServer.playing?'yes':'no') + 
                    '**\nAutoplay: **' + (discordServer.autoplay?'on':'off') + 
                    '**\nWrapping around: **' + (discordServer.wrapAround?'on':'off') + 
                    '**\nLoop: **' + (discordServer.loop?'on':'off') + 
                    '**\nShuffle: **' + (discordServer.shuffle?'on':'off') + 
                    '**\nAutoclean: **' + (discordServer.autoclean?'on':'off') + '**\n'
                );
                // no break to also display queue
            
            case 'queue': case 'playlist': case 'list':
                if(!reply) reply = '';
                reply += 'Queue:\n';
                if(discordServer.queue.length === 0) reply += '   *empty*'
                else for(let i in discordServer.queue){
                    reply += `${discordServer.queue[i] == discordServer.currentlyPlaying ? ' ▸':'     '} ${parseInt(i)+1}. ${
                        discordServer.queue[i].name.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\|/g,'\\|').replace(/\*/g,'\\*').replace(/_/g,'\\_')
                        .replace(/~/g,'\\~').replace(/>/g,'\\>').replace(/:/g,'\\:').replace(/#(?! )/g,'# ').replace(/@(?! )/g,'@ ')
                    } (${discordServer.queue[i].service})` + '\n';
                }
                if(reply.length > 1800){
                    reply = reply.split('\n');
                    reply.shift;
                    let pages = ['Queue:'];
                    for(let line of reply){
                        if(pages[pages.length-1].length + line.length < 1800) pages[pages.length-1] += '\n'+line;
                        else pages.push(line);
                    }
                    displayPages(msg.channel, pages);
                }
                else msg.channel.send(reply);
            break;

            case 'np': case 'nowplaying': case 'nowplay': case 'cp': case 'currentlyplaying': 
            case 'currentlyplay': case 'currentplaying': case 'currentplay':
                let dispatcher = discordServer.getDispatcher();
                if(discordServer.currentlyPlaying && dispatcher){
                    let progress = dispatcher.streamTime/ISO8601.getSeconds(discordServer.currentlyPlaying.duration)/1000;
                    msg.channel.send(
                        `${
                            discordServer.currentlyPlaying.name.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\|/g,'\\|').replace(/\*/g,'\\*').replace(/_/g,'\\_')
                            .replace(/~/g,'\\~').replace(/>/g,'\\>').replace(/:/g,'\\:').replace(/#(?! )/g,'# ').replace(/@(?! )/g,'@ ')
                        } (${discordServer.currentlyPlaying.service})`+'\n'+
                        '▬'.repeat(Math.round(progress*18))+
                        ':radio_button:'+
                        '▬'.repeat(Math.round((1-progress+0.0001)*18))
                    );
                }
                else msg.channel.send('Nothing playing at the moment');
            break;

            case 'skipto':
                // TODO: if contains ':' jumpToPosition (with 1 ':' mm:ss with 2 ':' hh:mm:ss)
                if(!args[1] || !discordServer.skipToIndex(parseInt(args[1])-1)) msg.channel.send('You need to specify the queue position where to skip to as a positive integer');
            break;

            case 'skip': 
                if(args[1]){
                    if(!discordServer.skipToIndex(parseInt(args[1])-1)) msg.channel.send('You need to specify the queue position where to skip to as a positive integer');
                    break;
                }
                // else interpret as next ->
            case 'next':
                discordServer.next();
            break;

            case 'prev': case 'previous': case 'last':
                discordServer.previous();
            break;

            case 'dice': case 'd':
                if(!args[1]){
                    msg.channel.send('You need to specify a dice with eg. `!dice 2d6` or `!dice 2D6` or `!dice 2 6` with the first number being the number of dice and the second the number of faces.\nSpecial dices:\n- d2^n');
                    break;
                }
                let diceNumber;
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

                    displayPages(msg.channel, reply);
                }
                else{
                    reply = '';
                    for(let i in results){
                        reply += `Dice ${parseInt(i)+1}: ${results[i]}` + '\n';
                    }
                    reply += '---\n**Result: '+Math.sum(...results)+'**';
                    msg.channel.send(reply);
                }
            break;

            case 'web':
                msg.channel.send('https://foramitti.com/elias/pnp/dcbot/?guild='+msg.guild.id);
            break;

            case 'help': case 'commands':
                msg.channel.send(
`List of available commands:
**GENERAL:**
\`${PREFIX}web\`: sends the url to the web interface

**MUSIC:**
\`${PREFIX}join\`: joins/switches to the same voice channel as the member, who set off the command, is in
\`${PREFIX}add source_url\` / \`${PREFIX}append source_url\`: adds a new song to the end of the queue (supported source urls: YouTube video, YouTube playlist)
\`${PREFIX}play source_url\`: adds a new song to the end of the queue and starts/resumes playing (supported source urls: YouTube video, YouTube playlist)
\`${PREFIX}play\` / \`${PREFIX}resume\`: starts/resumes playing (joins/switches to the same voice channel as the member, who set off the command, is in)
\`${PREFIX}pause\`: pauses the music stream
\`${PREFIX}stop\`: stops the music stream (will restart at the same song but not the same song position)
\`${PREFIX}clear\`: clears the song queue
\`${PREFIX}queue\` / \`${PREFIX}list\`: displays the song queue
\`${PREFIX}queue\` / \`${PREFIX}list\` / \`${PREFIX}playlist\`: displays the song queue
\`${PREFIX}np\` / \`${PREFIX}nowplaying\` / \`${PREFIX}nowplay\` / \`${PREFIX}cp\` / \`${PREFIX}currentlyplaying\` / \`${PREFIX}currentlyplay\` /  \`${PREFIX}currentplaying\` /  \`${PREFIX}currentplay\`: displays the currently playing song
\`${PREFIX}skip index\` / \`${PREFIX}skipto index\`: jumps to the provided queue index
\`${PREFIX}skip\` / \`${PREFIX}next\`: jumps to the next song
\`${PREFIX}prev\` / \`${PREFIX}previous\` / \`${PREFIX}last\`: jumps to the last song
\`${PREFIX}autoplay\`: toggles if the bot automatically jumps to the next song after finishing the current song
\`${PREFIX}loop\`: toggles if the bot loops the current song
\`${PREFIX}wraparound\`: toggles if the bot jumps back to the first song after finishing the queue
\`${PREFIX}shuffle\`: toggles random song selection
\`${PREFIX}autoclean\`: toggles if the bot deletes finished songs from the queue
\`${PREFIX}info\`: displays current settings and the song queue

**P&P:**
\`${PREFIX}d dice_specifier\` / \`${PREFIX}dice dice_specifier\`: rolls the dice specified by dice_specifier (dice_specifier of the format eg. \`2d6\` or \`2D6\` or \`2 6\` with the first number determining the number of dice and the second one determining the number of faces or a special dice (eg. 2d2^n , available special dices: 2^n))
`);
            break;


            case 'subscribe':
                if(!args[1]){
                    msg.channel.send('You need to specify a service on which you want to subscribe for anouncements as the 1st argument, e.g. '+PREFIX+'subscribe *email* test@example.com');
                    break;
                }

                switch(args[1]){
                    case 'discord':

                        break;
                    
                    case 'email':
                        if(!args[2]?.includes('@') || args[2].split('@').reduce((res, curr) => res || curr.length == 0, false)){
                            msg.channel.send('You need to provide an email address as 2nd argument, e.g. '); // TODO: add example
                            break;
                        }
                        // TODO
                        break;
                    
                    case 'telegram':
                        if(!args[2]){
                            msg.channel.send('You need to provide a telegram user id as 2nd argument, e.g. '); // TODO: add example
                            break;
                        }
                        // TODO
                        break;
                    
                    default:
                        if(!args[1]){
                            msg.channel.send('The provided service (1st argument) is not supported. Supported services: discord, email, telegram');
                            break;
                        }
                }
                break;

            case 'unsubscribe':

                break;
            
            case 'subscriptions':

                break;
            
            default:
                msg.channel.send('Unknown command. Type `'+PREFIX+'help` or `'+PREFIX+'commands` for a list of commands');
        }
    }
})

async function confirm(channel, msgTxt, func, ...args){
    let reply = await channel.send(msgTxt);
    let toggle = true;
    reply.awaitReactions(
        (reaction, user) => {
            if(toggle && reaction.emoji.name === '✅' && user !== bot.user){
                toggle = false;
                func(...args);
            }
        }, 
        { time: 120000 }
    );
    reply.react('✅');
}

function displayPages(channel, pages){
    async function displayPage(i){
        let reply = await channel.send(pages[i] + '\n\n[page '+(i+1)+'/'+pages.length+']');
        let toggle = true;
        reply.awaitReactions(
            (reaction, user) => {
                if(!toggle || user === bot.user) return;
                if(i < pages.length-1 && reaction.emoji.name === '➡️'){
                    toggle = false;
                    displayPage(i+1);
                }
                else if(i > 0 && reaction.emoji.name === '⬅️'){
                    toggle = false;
                    displayPage(i-1);
                }
            }, 
            { time: 180000 }
        );
        if(i > 0) reply.react('⬅️');
        if(i < pages.length-1) reply.react('➡️');
    }
    displayPage(0);
}

var discordServer;
bot.login(config.discord.botToken).then(() => {
    discordServer = new DiscordServer(new Discord.Guild(bot, {id: config.discord.guildId}));
}).catch(err => console.log('Error when connecting to Discord: '+err));

function onServerUp(func){
    if(discordServer) func();
    else setTimeout(()=>onServerUp(func), 500);
}

io.on('connection', (socket) => {
    socket.on('ping',()=>{
        socket.emit('pong');
    });

    onServerUp(()=>{
            discordServer.sockets.push(socket);
            socket.emit('queue', discordServer.queue);
            socket.emit('currentlyPlaying', (discordServer.currentlyPlaying)?discordServer.currentlyPlaying.id:null);
            socket.emit('playing', discordServer.playing);
            socket.emit('shuffle', discordServer.shuffle);
            socket.emit('loop', discordServer.loop);
            socket.emit('autoplay', discordServer.autoplay);
            socket.emit('autoclean', discordServer.autoclean);
            socket.emit('wrapAround', discordServer.wrapAround);
    });
    
    

    socket.on('shifted', ([songId, newIndex]) => {
        socket.broadcast.emit('shifted', [songId, newIndex]);
        let index = discordServer.getSongIndexById(id);
        if(index == null) return;
        let song = discordServer.queue.splice(index,1)[0];
        discordServer.queue.splice(newIndex,0,song);
    });

    socket.on('currentlyPlaying', (id)=>discordServer.skipToSong(id));
    
    socket.on('pause', ()=>discordServer.pause());

    socket.on('resume', async function(){
        try{
            await discordServer.joinVoiceChannel();
        }
        catch(e){
            socket.emit('err',
                'An error occured. Probably the bot is not yet in any voice channel and does not remember in which voice channel it was last. To fix this:\n\n'+
                '1. open Discord and navigate to the respective discordServer\n'+
                '2. join the voice channel, in which you want the bot to play music\n'+
                '3. while staying the voice channel, open the bot-text-channel and type \'?join\'\n\n'+
                'The bot should now have joined the voice channel and be controllable from this webinterface. You can now of course leave the voice channel again, if you want to.\n\n'+
                'Error message: '+e
            );
            return;
        }
        if(!discordServer.resume()){
            if(!discordServer.play()){
                socket.emit('err','An error occured while starting to play');
            }
        }
    });

    socket.on('stop', ()=>discordServer.stop());
    
    socket.on('next', ()=>discordServer.next());
    socket.on('prev', ()=>discordServer.previous());

    socket.on('remove', (id)=>{
        let index = discordServer.getSongIndexById(id);
        if(index == null) return;
        discordServer.remove(index);
    });

    socket.on('shuffle', (state)=>discordServer.setShuffle());

    socket.on('loop', (state)=>discordServer.setLoop());
    
    socket.on('autoplay', (state)=>discordServer.setAutoplay(state));
    
    socket.on('autoclean', (state)=>discordServer.setAutoclean(state));
    
    socket.on('wrapAround', (state)=>discordServer.setWrapAround(state));

    socket.on('syncTime', ()=>{
        let position = discordServer.getCurrentPostion();
        if(position) socket.emit('syncTime',position);
    });

    function autoSync(){
        if(discordServer?.playing && discordServer.getDispatcher()){
            let position = discordServer.getCurrentPostion();
            if(position) socket.emit('syncTime',position);
        }
        setTimeout(autoSync, 10000);
    }
    autoSync();

    socket.on('jumpTo', position => discordServer.jumpToPostion(position));

    socket.on('appendURL', async function(url){
        try{
            discordServer.addToQueue(await Song.getFromURL(url));
        }
        catch(e){
            console.error(e);
            socket.emit('err','An error occured. Probably the given URL is not valid or supported.\n\nError message: '+e);
        }
    });

    var callbacksAfterHalts = {};

    socket.on('requestData', async function(collection, id){
        if(!mongodb) return socket.emit('err',`requestData(collection:${collection}, id:${id}): database inactive`);
        if(callbacksAfterHalts[collection]?.[id]){
            await (new Promise(resolve => {
                callbacksAfterHalts[collection][id].push(resolve);
            }));
        } 
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

        if(data.name != undefined){
            tmpData.name = data.name;
            if(typeof tmpData.name != 'string') return error('name must be a string');
        }

        if(collection.endsWith('Category') || collection == 'StorylineInfoType'){
            if(data.entities != undefined){
                tmpData.entities = data.entities;
                if(!Array.isArray(tmpData.entities) || tmpData.entities.some(x => typeof x != 'number'))
                    return error('entities must be an array of numerical ids');
            }
            
            if(data.categories != undefined){
                tmpData.categories = data.categories;
                if(!Array.isArray(tmpData.categories) || tmpData.categories.some(x => typeof x != 'number'))
                    return error('categories must be an array of numerical ids');
            }
        }
        else if(collection.endsWith('Entity')){
            if(data.description != undefined){
                tmpData.description = data.description;
                if(typeof tmpData.description != 'string') return error('description must be a string');
            }

            if(data.coordinates != undefined){
                tmpData.coordinates = data.coordinates;
                if(!Array.isArray(tmpData.coordinates) || 
                    tmpData.coordinates.some(x => (!Array.isArray(x) || x.length != 2 || x.some(y => typeof y != 'number')))){
                        return error('coordinates must be an array of [x,y] objects filled with numbers');
                }
            }

            if(data.path != undefined) tmpData.path = Boolean(data.path);

            if(data.images != undefined){
                tmpData.images = data.images;
                if(!Array.isArray(tmpData.images) || tmpData.images.some(x => typeof x != 'number'))
                    return error('images must be an array of numerical ids');
            }
        }

        switch(collection){
            case 'ItemEntity': 
                if(data.amount != undefined){
                    tmpData.amount = data.amount;
                    if(Number.isInteger(tmpData.amount) || tmpData.amount < 0) return error('amount must be a positive integer');
                }
                break;
            
            case 'ItemEffectEntity': 
                if(data.items != undefined){
                    tmpData.items = data.items;
                    if(!Array.isArray(tmpData.items) || tmpData.items.some(x => typeof x != 'number')) 
                        return error('items must be an array of numerical ids');
                }
                break;
            
            case 'SkillEntity': 
                if(data.learned != undefined) tmpData.learned = Boolean(data.learned);
                break;
            
            case 'CellEntity': 
                // TODO
                break;
            
            case 'PlayerEntity':
                for(let property of ['items','itemEffects','skills','cells']){
                    if(data[property]?.entities != undefined){
                        if(!tmpData[property]) tmpData[property] = {};
                        tmpData[property].entities = data[property].entities;
                        if(!Array.isArray(tmpData[property].entities) || tmpData[property].entities.some(x => typeof x != 'number'))
                            return error(property+'.entities must be an array of numerical ids');
                    }
                    
                    if(data[property]?.categories != undefined){
                        if(!tmpData[property]) tmpData[property] = {};
                        tmpData[property].categories = data[property].categories;
                        if(!Array.isArray(tmpData[property].categories) || tmpData[property].categories.some(x => typeof x != 'number'))
                            return error(property+'.categories must be an array of numerical ids');
                    }
                }
                break;
            
            case 'Storyline':
                if(data.info?.types != undefined){
                    if(!tmpData.info) tmpData.info = {};
                    tmpData.info.types = data.info.types;
                    if(!Array.isArray(tmpData.info.types) || tmpData.info.types.some(x => typeof x != 'number')) 
                        return error('info.types must be an array of numerical ids');
                }
                if(data.info?.general != undefined){
                    if(!tmpData.info) tmpData.info = {};
                    tmpData.info.general = data.info.general;
                    if(!Array.isArray(tmpData.info.general) || tmpData.info.general.some(x => typeof x != 'number')) 
                        return error('info.general must be an array of numerical ids');
                }

                if(data.players?.entities != undefined){
                    if(!tmpData.players) tmpData.players = {};
                    tmpData.players.entities = data.players.entities;
                    if(!Array.isArray(tmpData.players.entities) || tmpData.players.entities.some(x => typeof x != 'number')) 
                        return error('players.entities must be an array of numerical ids');
                }

                if(data.board?.entities != undefined){
                    if(!tmpData.board) tmpData.board = {};
                    tmpData.board.entities = data.board.entities;
                    if(!Array.isArray(tmpData.board.entities) || tmpData.board.entities.some(x => typeof x != 'number')) 
                        return error('board.entities must be an array of numerical ids');
                }
                if(data.board?.environments != undefined){
                    if(!tmpData.board) tmpData.board = {};
                    tmpData.board.environments = data.board.environments;
                    if(!Array.isArray(tmpData.board.environments) || tmpData.board.environments.some(x => typeof x != 'number')) 
                        return error('board.environments must be an array of numerical ids');
                }
                if(data.board?.activeEnvironment != undefined){
                    if(!tmpData.board) tmpData.board = {};
                    tmpData.board.activeEnvironment = data.board.activeEnvironment;
                    if(typeof tmpData.board.activeEnvironment != 'number') 
                        return error('board.activeEnvironment must be a numerical id');
                }
                break;
        }

        if(tmpData.name != undefined){
            if(['ItemEntity','ItemEffectEntity','SkillEntity','CellEntity'].includes(collection)){
                tmpData.reference_name = data.name.decodeHTML().toLowerCase().replace(/ /g,'_');
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
                tmpData.reference_name = data.name.decodeHTML().toLowerCase().replace(/ /g,'_');
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

        if(callbacksAfterHalts[collection]?.[id]){
            await (new Promise(resolve => {
                callbacksAfterHalts[collection][id].push(resolve);
            }));
        }
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
            tmpData.name = template.name;
        else if(data.name == undefined) tmpData.name = '';
        else tmpData.name = data.name;
        if(typeof tmpData.name != 'string') return error('name must be a string');

        if(collection.startsWith('Item') || collection.startsWith('Skill') || collection.startsWith('Cell')){
            if(loose) tmpData.player = parentId;
            else if(collection.endsWith('Category')) tmpData.player = (await mongodb.collection(collection).findOne({_id: parentId}, {projection: {_id:0, player:1}}))?.player;
            else tmpData.player = (await mongodb.collection(collection.slice(0,-6) + 'Category').findOne({_id: parentId}, {projection: {_id:0, player:1}}))?.player;

            if(collection.endsWith('Entity')){
                tmpData.reference_name = tmpData.name.decodeHTML().toLowerCase().replace(/ /g,'_');
                if(await mongodb.collection(collection).findOne({reference_name: tmpData.reference_name, player: tmpData.player}))
                    return socket.emit('err','there is already an entity of this type with an equivalent name within this player entity, '+
                    'which would create ambiguity in dynamic values');
            }
        }

        if(collection == 'PlayerEntity'){
            tmpData.reference_name = tmpData.name.decodeHTML().toLowerCase().replace(/ /g,'_');
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
            if(!Array.isArray(tmpData.entities) || tmpData.entities.some(x => typeof x != 'number'))
                return error('entities must be an array of numerical ids');
            
            if(template?.categories && (!templateMask || (templateMask.categories ?? templateMaskDefault))) 
                tmpData.categories = []; // children are copied afterwards
            else if(data.categories == undefined) tmpData.categories = [];
            else tmpData.categories = data.categories;
            if(!Array.isArray(tmpData.categories) || tmpData.categories.some(x => typeof x != 'number'))
                return error('categories must be an array of numerical ids');
        }
        else if(collection.endsWith('Entity')){
            if(template?.description != undefined && (!templateMask || (templateMask.description ?? templateMaskDefault))) 
                tmpData.description = template.description;
            else if(data.description == undefined) tmpData.description = '';
            else tmpData.description = data.description;
            if(typeof tmpData.description != 'string') return error('description must be a string');

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
            if(!Array.isArray(tmpData.images) || tmpData.images.some(x => typeof x != 'number'))
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
                        for(let itemId of template.items) if(templateItemsIdMap.get(itemId) != undefined) tmpData.items.push(templateItemsIdMap.get(itemId));
                    }
                }
                else if(data.items == undefined) tmpData.items = [];
                else tmpData.items = data.items;
                if(!Array.isArray(tmpData.items) || tmpData.items.some(x => typeof x != 'number')) 
                    return error('items must be an array of numerical ids');
                break;
            
            case 'SkillEntity': 
                if(template?.learned != undefined && (!templateMask || (templateMask.learned ?? templateMaskDefault))) 
                    tmpData.learned = Boolean(template.learned);
                else tmpData.learned = Boolean(data.learned);
                break;
            
            case 'CellEntity': 
                // TODO: cell data sanitation and template handling
                break;
            
            case 'PlayerEntity':
                for(let property of ['items','itemEffects','skills','cells']){
                    tmpData[property] = {};

                    if(template?.[property]?.entities && (!templateMask || (templateMask[property]?.entities ?? templateMaskDefault))) 
                        tmpData[property].entities = []; 
                    else if(data[property]?.entities == undefined) tmpData[property].entities = [];
                    else tmpData[property].entities = data[property].entities;
                    if(!Array.isArray(tmpData[property].entities) || tmpData[property].entities.some(x => typeof x != 'number'))
                        return error(property+'.entities must be an array of numerical ids');
                    
                    if(template?.[property]?.categories && (!templateMask || (templateMask[property]?.categories ?? templateMaskDefault))) 
                        tmpData[property].categories = []; 
                    else if(data[property]?.categories == undefined) tmpData[property].categories = [];
                    else tmpData[property].categories = data[property].categories;
                    if(!Array.isArray(tmpData[property].categories) || tmpData[property].categories.some(x => typeof x != 'number'))
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

            if(callbacksAfterHalts[parentCollection]?.[parentId]){
                await (new Promise(resolve => {
                    callbacksAfterHalts[parentCollection][parentId].push(resolve);
                }));
            }

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

            for(let property of ['items','skills','cells','itemEffects']){
                
                if(property == 'itemEffects'){
                    while(true){
                        let promiseLength = itemPromises.length;
                        await Promise.all(itemPromises);
                        await sleep(100);
                        if(promiseLength == itemPromises.length) break;
                    }
                }

                if(template?.[property]?.entities && (!templateMask || (templateMask[property]?.entities ?? templateMaskDefault))){
                    if(template[property].entities.length > 0){
                        // to keep order: save all previous promises and wait everytime before registering with parent until all others finished
                        let keepOrderPromises = [];
                        let childCollection = (property == 'items') ? 'ItemEntity' : (property == 'skills') ? 'SkillEntity' : 
                            (property == 'cells') ? 'CellEntity' : 'ItemEffectEntity';
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
                
                if(template?.[property]?.categories && (!templateMask || (templateMask[property]?.categories ?? templateMaskDefault))){
                    if(template[property].categories.length > 0){
                        // to keep order: save all previous promises and wait everytime before registering with parent until all others finished
                        let keepOrderPromises = [];
                        let childCollection = (property == 'items') ? 'ItemCategory' : (property == 'skills') ? 'SkillCategory' : 
                            (property == 'cells') ? 'CellCategory' : 'ItemEffectCategory';
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
    
                for(let childId of data.cells.categories) removeFromDB('CellCategory', childId);
                for(let childId of data.cells.entities) removeFromDB('CellEntity', childId);
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

            if(callbacksAfterHalts[parentCollection]?.[parentId]){
                await (new Promise(resolve => {
                    callbacksAfterHalts[parentCollection][parentId].push(resolve);
                }));
            }

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

        // if is item delete from all itemEffects
        if(collection == 'ItemEntity'){
            let concernedItemEffects = (await mongodb.collection('ItemEffectEntity').find({'items':id}).toArray()).map(x => x._id);

            if(!callbacksAfterHalts.ItemEffectEntity) callbacksAfterHalts.ItemEffectEntity = {};
            for(let effectId of concernedItemEffects){
                if(callbacksAfterHalts.ItemEffectEntity[effectId]){
                    await (new Promise(resolve => {
                        callbacksAfterHalts.ItemEffectEntity[effectId].push(resolve);
                    }));
                }

                io.emit('updateData_ItemEffectEntity_'+effectId, 
                    (await mongodb.collection('ItemEffectEntity').findOneAndUpdate(
                        {'_id':effectId},
                        {$pull: {'items':id}},
                        {returnOriginal:false, projection:{_id:0,items:1}}
                    )).value
                );
            }
        }

        removeFromDB(collection, id, Boolean(removeChildren));
    });
    
});