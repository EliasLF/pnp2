"use strict";

const _ = undefined;

const htmlHelper = {
    createNode: function(tag, properties, style){
        var elem = document.createElement(tag);
        for(let attr in properties){
            elem[attr] = properties[attr];
        }
        for(let attr in style){
            elem.style[attr] = style[attr];
        }
        return elem;
    }
}

Array.prototype.equals = function (array) {
    if (!array) return false;

    if (this.length != array.length) return false;

    for (let i = 0; i < this.length; i++) {
        if (Array.isArray(this[i])) {
            if(!Array.isArray(this[i])) return false;
            if (!this[i].equals(array[i])) return false;       
        }
        else if (this[i] != array[i]) return false;
    }
    return true;
}
// Hide method from for-in loops
Object.defineProperty(Array.prototype, "equals", {enumerable: false});

// these methods are not complete!!! they just cover hex entities
String.prototype.encodeHTML = function(){
    return this.replace(/[^ \{\|\}~!#\$%\(\)\*\+,-./\d:;\=\?@ABCDEFGHIJKLMNOPQRSTUVWXYZ\[\]\\\^_]/gi, (match) => '&#x'+match.charCodeAt(0).toString(16)+';');
}
String.prototype.decodeHTML = function(){
    return this.replace(/&#x([\dabcdef]+);/gi, (match, numString) => String.fromCharCode(parseInt(numString, 16)));
}
String.prototype.undefinedIndexOf = function(pattern, offset){
    let res = this.indexOf(pattern, offset);
    return (res < 0) ? undefined : res;
}
String.prototype.startsWithCount = function(str){
	// counts the occurences of the parameter str at the beginning of the String object
	var c=0;
	for(let i=0;;i+=str.length){
		if(this.substring(i,i+str.length) == str) c++;
		else break;
	}
	return c;
};
Object.defineProperty(String.prototype, "encodeHTML", {enumerable: false});
Object.defineProperty(String.prototype, "decodeHTML", {enumerable: false});
Object.defineProperty(String.prototype, "undefinedIndexOf", {enumerable: false});
Object.defineProperty(String.prototype, "startsWithCount", {enumerable: false});

function parseMarkup(string){
    // list:
    let result = '';
    let offset = 0;
    while(offset >= 0 && offset < string.length){
        let begin = string.indexOf('<list>',offset);
        if(begin < 0){
            result += string.slice(offset);
            break;
        }
        result += string.slice(offset, begin);
        begin += 6;
        let end = string.undefinedIndexOf('</list>',begin) ?? string.length;

        // split the section into list element parts
        let section = string.slice(begin,end).split('\n');
        for(let i=0; i<section.length; i++){
            if(!section[i].trim().startsWith('-') && i > 0){
                section[i-1] += '\n' + section[i];
                section.splice(i,1);
                i--;
            }
        }
        // add html ul and li tags to get list elements to the respective level
        let level = 0;
        for(let i in section){
            section[i] = section[i].trim();
            let newLevel = section[i].startsWithCount('-');
            if(!newLevel) continue;

            if(newLevel > 0) section[i] = '<li>' + section[i].slice(newLevel);
            while(level < newLevel){
                section[i] = '<ul>' + section[i];
                level++;
            }
            while(level > newLevel){
                section[i] = '</ul>' + section[i];
                level--;
            }
            
            section[i] += '</li>';
        }
        let l = section.length - 1;
        section[l] += '</ul>';
        level--;
        while(level > 0){
            section[l] += '</li></ul>';
            level--;
        }
        result += section.join('');
        offset = end + 7;
    }
    string = result;

    // tab (table with 2 columns):
    result = '';
    offset = 0;
    while(offset >= 0 && offset < string.length){
        let begin = string.indexOf('<tab>',offset);
        if(begin < 0){
            result += string.slice(offset);
            break;
        }
        result += string.slice(offset, begin) + '<table>';
        begin += 5;
        let end = string.undefinedIndexOf('</tab>',begin) ?? string.length;

        // split the section into table cell element parts
        let section = string.slice(begin,end).split('\n');
        for(let i=0; i<section.length; i++){
            if(!section[i].trim().startsWith('>') && i > 0){
                section[i-1] += '\n' + section[i];
                section.splice(i,1);
                i--;
            }
        }

        let level = 0;
        for(let i in section){
            section[i] = section[i].trimLeft();
            if(!section[i].startsWith('>')) continue;
            let endOfFirst = section[i].undefinedIndexOf('\n') ?? section[i].length;
            section[i] = '<tr><td>' + section[i].slice(1, endOfFirst) + '</td><td>' + section[i].slice(endOfFirst) + '</td></tr>';
        }
        result += section.join('') + '</table>';
        
        offset = end + 6;
    }
    string = result;

    return (string
    .replace(/(?<!>)\n(?!<)/g, '<br>')
    .replace(/<=>/g,'&#8660;')
    .replace(/<=/g,'&#8656;')
    .replace(/=>/g,'&#8658;')
    .replace(/<->/g,'&#8596;')
    .replace(/<-/g,'&#8592;')
    .replace(/->/g,'&#8594;'));
}




var stylesheet;
for(let x of document.styleSheets) if(x.title == 'procedural_stylesheet'){
    stylesheet = x;
    break;
}
var styleRules = {};
function addStyleRule(name, text){
    let i = stylesheet.insertRule(text);
    styleRules[name] = stylesheet.rules[i];
}

addStyleRule('entityContainer','.entity_container{}');
addStyleRule('categoryContainer','.category_container{}');
addStyleRule('categoryBody','.category_body{margin-left: 15px;}'); // TODO: read actual value from localStorage


var loadPromises = {};
for(let property of ['socket', 'body']){
    loadPromises[property] = {};
    loadPromises[property].loaded = new Promise(resolve => {loadPromises[property].resolve = resolve});
}

var socket = io('localhost:8081'); // replace with: https://foramitti.com:8081

socket.on('err',(err, ...args)=>alert('Error: '+err+ (args.length ? '\n\n---------------\n\n'+args.map(x => JSON.stringify(x)).join('\n\n') : '')));

if(socket.connected) loadPromises.socket.resolve();
else socket.on('connect', loadPromises.socket.resolve);

if(document.readyState == 'complete') loadPromises.body.resolve();
else window.onload = loadPromises.body.resolve;

async function websocketRequestData(collection, id){
    return await (new Promise(resolve => {
        socket.on('serveData_'+collection+'_'+id, (data) => {
            resolve(data);
        });
        socket.emit('requestData', collection, id);
    }));
}


var currentlyEditing = null;
var objectSets = {
    Storyline: new Map(),
    StorylineInfoType: new Map(),
    StorylineInfoEntity: new Map(),
    PlayerEntity: new Map(),
    ItemEntity: new Map(),
    ItemEffectEntity: new Map(),
    SkillEntity: new Map(),
    CellEntity: new Map(),
    StorylineInfoCategory: new Map(),
    ItemCategory: new Map(),
    ItemEffectCategory: new Map(),
    SkillCategory: new Map(),
    CellCategory: new Map(),
    BoardEnvironment: new Map(),
    BoardEntity: new Map()
};
var currentStoryline;

var storylineSelectionWrapper = htmlHelper.createNode('div',{className:'content_section'});
storylineSelectionWrapper.appendChild(htmlHelper.createNode('h2',{innerHTML:'Switch storyline: '}));
var storylineSelection = storylineSelectionWrapper.appendChild(htmlHelper.createNode('select',{onchange: async function(){
    if(this.value == currentStoryline.id) return;
    if(!objectSets.Storyline.get(parseInt(this.value))) await (new Storyline(parseInt(this.value))).init();
    currentStoryline = objectSets.Storyline.get(parseInt(this.value));
    document.getElementById('menu_storyline').onclick();
}},{marginTop:'10px'}));
var storylineSelectionOptions = new Map();

socket.on('serveData_storylineNames', names => {
    storylineSelection.innerHTML = '';
    for(let [id, name] of names){
        storylineSelectionOptions.set(id, storylineSelection.appendChild(htmlHelper.createNode('option',{value:id, innerHTML:name})));
    }
});


(async function(){
    await loadPromises.socket.loaded;
    socket.emit('requestData_storylineNames');
})();



function closePopup(){
    document.getElementById('popup').style.display = '';
    document.getElementById('popup_overlay').style.display = '';
    document.getElementById('main').classList.remove('blurred');
}


class Storyline {
    constructor(id){
        this.id = id;
        this.players = {};
        this.info = {};
        this.board = {};
        this.editing = false;

        this.currentOpenTab = 'general'; // general or id of StorylineInfoType
        this.currentOpenPlayer; // id of currently open player entity

        this.gmValidated = false;
        // TODO: check for GM validation in localStorage

        this.dom = {};
        this.dom.generalInfo = htmlHelper.createNode('div');

        this.dom.menuTabs = {};
        this.dom.menuTabs.general = htmlHelper.createNode('div',{className:'secondary_menu_tab',innerHTML:'General',onclick: ()=>this.openTab('general')});
        this.dom.menuTabs.players = htmlHelper.createNode('div');
        this.dom.menuTabs.storlineInfoTypes = htmlHelper.createNode('div');

        this.sortables = {};
        this.sortables.storlineInfoTypes = new Sortable.default([this.dom.menuTabs.storlineInfoTypes], {
            draggable: ".secondary_menu_tab",
            delay: 200,
            mirror: {
              constrainDimensions: true,
              yAxis: false
            }
        });
        this.sortables.players = new Sortable.default([this.dom.menuTabs.players], {
            draggable: ".secondary_menu_tab",
            delay: 200,
            mirror: {
              constrainDimensions: true,
              yAxis: false
            }
        });
        this.sortables.generalInfo = new Sortable.default([this.dom.generalInfo], {
            draggable: ".entity",
            handle: '.drag_handle_entity',
            mirror: {
              constrainDimensions: true
            }
        });

        this.sortables.storlineInfoTypes.on('sortable:start', e => {
            this.setEditing(true);
        });
        this.sortables.storlineInfoTypes.on('sortable:stop', e => {
            if(e.data.newIndex != e.data.oldIndex){
                let children = this.info.types.slice();
                
                let typeId = children.splice(e.data.oldIndex,1)[0];
                children.splice(e.data.newIndex,0,typeId);

                socket.emit('updateData','Storyline',this.id,{info:{types:children}});
            }
            this.setEditing(false);
        });

        this.sortables.players.on('sortable:start', e => {
            this.setEditing(true);
        });
        this.sortables.players.on('sortable:stop', e => {
            if(e.data.newIndex != e.data.oldIndex){
                let children = this.players.entities.slice();
                
                let playerId = children.splice(e.data.oldIndex,1)[0];
                children.splice(e.data.newIndex,0,playerId);

                socket.emit('updateData','Storyline',this.id,{players:{entities:children}});
            }
            this.setEditing(false);
        });

        this.sortables.generalInfo.on('sortable:start', e => {
            this.setEditing(true);
        });
        this.sortables.generalInfo.on('sortable:stop', e => {
            if(e.data.newIndex != e.data.oldIndex){
                let children = this.info.general.slice();
                
                let infoId = children.splice(e.data.oldIndex,1)[0];
                children.splice(e.data.newIndex,0,infoId);

                socket.emit('updateData','Storyline',this.id,{info:{general:children}});
            }
            this.setEditing(false);
        });

        objectSets.Storyline.set(this.id, this);
    }

    async init(){
        // load storyline data via websocket
        socket.on('updateData_Storyline_'+this.id, (data) => this.update(data));
        await this.update(await websocketRequestData('Storyline', this.id));
        return this;
    }

    async update(data){
        if(this.editing){
            function recursiveUpdateDataCash(cash, newData){
                for(let i in newData){
                    if(cash[i] && newData[i] && typeof(newData[i]) == 'object' && !Array.isArray(newData[i])){
                        recursiveUpdateDataCash(cash[i], newData[i]);
                    }
                    else cash[i] = newData[i];
                }
            }

            if(!this.updateDataCash) this.updateDataCash = data;
            else recursiveUpdateDataCash(this.updateDataCash, data);
            return;
        }

        if(!data) data = this.updateDataCash;
        if(!data) return;

        this.updateDataCash = null;

        if(this.gmPassword!=undefined){
            if(data.gmPassword!=undefined) this.gmPassword = data.gmPassword;
        }
        else this.gmPassword = data.gmPassword ? data.gmPassword : '';

        if(data.name!=undefined && this.name != data.name){
            this.name = data.name;
            if(storylineSelectionOptions.get(this.id)) storylineSelectionOptions.get(this.id).innerHTML = this.name;
        }

        let newObjectInits = [];

        // all references implemented as ids -> return actual objects via get...()
        if(data.info?.general && !this.info?.general?.equals(data.info.general)){
            this.info.general = data.info.general;
            for(let id of this.info.general){
                if(!objectSets.StorylineInfoEntity.get(id)) newObjectInits.push((new StorylineInfoEntity(id, this)).init());
            }
            this.dom.generalInfo.innerHTML = '';
            for(let x of this.getGeneralInfo()) this.dom.generalInfo.appendChild(x.dom.root);
        }
        if(data.info?.types && !this.info?.types?.equals(data.info.types)){
            this.info.types = data.info.types;
            for(let id of this.info.types){
                if(!objectSets.StorylineInfoType.get(id)) newObjectInits.push((new StorylineInfoType(id, this)).init());
            }
            this.dom.menuTabs.storlineInfoTypes.innerHTML = '';
            for(let type of this.getStorylineInfoTypes()) this.dom.menuTabs.storlineInfoTypes.appendChild(type.dom.menuTab);
        }
        
        if(data.players?.entities && !this.players?.entities?.equals(data.players.entities)){
            this.players.entities = data.players.entities;
            if(this.currentOpenPlayer == undefined) this.currentOpenPlayer = this.players.entities[0];
            for(let id of this.players.entities){
                if(!objectSets.PlayerEntity.get(id)) newObjectInits.push((new PlayerEntity(id, this)).init());
            }
            this.dom.menuTabs.players.innerHTML = '';
            for(let player of this.getPlayerEntities()) this.dom.menuTabs.players.appendChild(player.dom.menuTab);
        }
        
        if(data.board?.environments && !this.board?.environments?.equals(data.board.environments)){
            this.board.environments = data.board.environments;
            for(let id of this.board.environments){
                if(!objectSets.BoardEnvironment.get(id)) newObjectInits.push((new BoardEnvironment(id, this)).init());
            }
        }
        if(data.board?.activeEnvironment!=undefined && this.board.activeEnvironment != data.board.activeEnvironment){
            this.board.activeEnvironment = data.board.activeEnvironment;
        }
        if(data.board?.entities && !this.board?.entities?.equals(data.board.entities)){
            this.board.entities = data.board.entities;
            for(let id of this.board.entities){
                if(!objectSets.BoardEntity.get(id)) newObjectInits.push((new BoardEntity(id, this)).init());
            }
        }

        await Promise.all(newObjectInits);

        return this;
    }

    setEditing(value){
        this.editing = value;
        if(!value && this.updateDataCash) this.update();
    }

    getGeneralInfo(){
        return this.info.general.map(id => objectSets.StorylineInfoEntity.get(id));
    }

    getPlayerEntities(){
        return this.players.entities.map(id => objectSets.PlayerEntity.get(id));
    }

    getStorylineInfoTypes(){
        return this.info.types.map(id => objectSets.StorylineInfoType.get(id));
    }

    openTab(tab){
        if(tab == undefined){
            let activePrimaries = document.getElementsByClassName('primary_menu_active');
            for(let x of activePrimaries) x.classList?.remove('primary_menu_active');
            document.getElementById('menu_storyline').classList?.add('primary_menu_active');

            document.getElementById('secondary_menu').innerHTML = '';
            document.getElementById('secondary_menu').appendChild(this.dom.menuTabs.general);
            document.getElementById('secondary_menu').appendChild(this.dom.menuTabs.storlineInfoTypes);
            document.getElementById('secondary_menu').style.display = '';

            document.getElementById('tertiary_menu').style.display = 'none';

            return this.openTab(this.currentOpenTab);
        }

        this.currentOpenTab = tab;

        if(tab == 'general'){
            let activeSecondaries = document.getElementsByClassName('secondary_menu_active');
            for(let x of activeSecondaries) x.classList?.remove('secondary_menu_active');
            this.dom.menuTabs.general.classList?.add('secondary_menu_active');

            document.getElementById('main_content').innerHTML = '';
            document.getElementById('main_content').appendChild(storylineSelectionWrapper);
            storylineSelection.value = this.id;
            document.getElementById('main_content').appendChild(this.dom.generalInfo);
        }
        else{
            if(!this.info.types.includes(tab)) return;
            objectSets.StorylineInfoType.get(tab)?.open();
        }
    }

    openPlayer(player){
        if(player == undefined){
            let activePrimaries = document.getElementsByClassName('primary_menu_active');
            for(let x of activePrimaries) x.classList?.remove('primary_menu_active');
            document.getElementById('menu_players').classList?.add('primary_menu_active');

            document.getElementById('secondary_menu').innerHTML = '';
            document.getElementById('secondary_menu').appendChild(this.dom.menuTabs.players);
            document.getElementById('secondary_menu').style.display = '';
            document.getElementById('tertiary_menu').style.display = 'none';

            document.getElementById('main_content').innerHTML = '';
            if(this.currentOpenPlayer == undefined) return;
            return this.openPlayer(this.currentOpenPlayer);
        }

        this.currentOpenPlayer = player;
        if(!this.players.entities.includes(player)) return;
        objectSets.PlayerEntity.get(player)?.openTab();
    }
}

class Entity { // abstract
    constructor(id, parent, storyline){
        this.id = id;
        this.parent = parent;
        this.storyline = storyline;
        this.open = false;
        this.editing = false;
        this.type = this.constructor;
        
        this.deleteMessages = [
            'This will delete this element and remove all references to it in other elements. Are your sure you want to continue?',
            'This action is irreversible. Are you absolutely sure, you know what you are doing?'
        ];

        this.dom = {};
        this.dom.root = htmlHelper.createNode('div', {className: 'content_section entity',id:this.type.name+'_'+this.id});
        this.dom.input = {};
        this.dom.input.cancelEdit = htmlHelper.createNode('button',{className:'cancel_edit_button', innerHTML:'Cancel', onclick:()=>this.cancelEdit()});
        this.dom.input.saveEdit = htmlHelper.createNode('button',{className:'save_edit_button', innerHTML:'Save', onclick:()=>this.saveEdit()});

        this.dom.icons = {};
        this.dom.icons.draggable = this.dom.root.appendChild(htmlHelper.createNode('img', {className: 'icon draggable_icon drag_handle_entity', src:'icons/draggable.svg', onmousedown:()=>{
            this.toggleOpen(false);
        }}));
        this.dom.icons.edit = this.dom.root.appendChild(htmlHelper.createNode('img', {className: 'icon edit_icon', src:'icons/pencil-2.png', onclick: ()=>this.edit()}));
        this.dom.icons.delete = this.dom.root.appendChild(htmlHelper.createNode('img', {className: 'icon delete_icon', src:'icons/bin-2.png', onclick: ()=>this.delete()}, {display:'none'}));

        this.dom.title = this.dom.root.appendChild(htmlHelper.createNode('h3', {onclick: ()=>this.toggleOpen()}));
        this.dom.foldArrow = this.dom.title.appendChild(htmlHelper.createNode('span', {className:'fold_arrow non_selectable', innerHTML: String.fromCharCode(9654)}));
        this.dom.name = this.dom.title.appendChild(htmlHelper.createNode('span'));

        this.dom.main = this.dom.root.appendChild(htmlHelper.createNode('div',_,{display: 'none', marginTop:'20px'}));
        this.dom.pureText = this.dom.main.appendChild(htmlHelper.createNode('div'));
        this.dom.firstImage = this.dom.main.appendChild(htmlHelper.createNode('img',{loading:'lazy', className:'first_content_image'}));

        this.dom.text = this.dom.main.appendChild(htmlHelper.createNode('div',{className:'content_text'}));
        this.dom.grid = this.dom.text.appendChild(htmlHelper.createNode('div',{className:'content_grid'}));
        this.dom.descriptionLabel = this.dom.grid.appendChild(htmlHelper.createNode('div', {innerHTML: 'Description:'}));
        this.dom.description = this.dom.grid.appendChild(htmlHelper.createNode('div', {innerHTML: this.description}));
        this.dom.locationsLabel = this.dom.grid.appendChild(htmlHelper.createNode('div', {innerHTML: 'Locations:'},{display:'none'}));
        this.dom.locations = this.dom.grid.appendChild(htmlHelper.createNode('div',_,{display:'none'}));
        this.dom.locationsIcon = this.dom.locations.appendChild(htmlHelper.createNode('img', {className: 'icon map_icon', src:'icons/maps-pin.png'}));

        this.dom.gallery = this.dom.main.appendChild(htmlHelper.createNode('div',{className:'content_gallery'}));

        this.dom.root.appendChild(this.dom.input.saveEdit);
        this.dom.root.appendChild(this.dom.input.cancelEdit);
    }

    toggleOpen(setValue){
        if(setValue == this.open) return;
        this.open = !this.open;
        this.dom.foldArrow.innerHTML = this.open ? String.fromCharCode(9660) : String.fromCharCode(9654);
        this.dom.main.style.display = this.open ? '' : 'none';
    }

    async update(data){
        if(this.editing){
            function recursiveUpdateDataCash(cash, newData){
                for(let i in newData){
                    if(cash[i] && newData[i] && typeof(newData[i]) == 'object' && !Array.isArray(newData[i])){
                        recursiveUpdateDataCash(cash[i], newData[i]);
                    }
                    else cash[i] = newData[i];
                }
            }

            if(!this.updateDataCash) this.updateDataCash = data;
            else recursiveUpdateDataCash(this.updateDataCash, data);
            return;
        }

        if(!data) data = this.updateDataCash;
        if(!data) return;

        this.updateDataCash = null;

        let changed = false;

        if(data.protected!=undefined && this.protected != data.protected){
            this.protected = data.protected;
            this.dom.root.style.display = (this.protected && !this.storyline.gmValidated) ? 'none' : '';
        }

        if(data.name!=undefined && this.name != data.name){
            this.name = data.name;
            this.referenceName = this.name.decodeHTML().toLowerCase().replace(/ /g, '_');
            this.dom.name.innerHTML = this.name;
        }

        if(data.description!=undefined && this.description != data.description){
            this.description = data.description;
            this.dom.description.innerHTML = parseMarkup(this.description);
            this.dom.pureText.innerHTML = parseMarkup(this.description);
            changed = true;
        }

        if(data.coordinates && (!this.coordinates || !this.coordinates.equals(data.coordinates))){
            this.coordinates = data.coordinates;
            changed = true;
        }

        if(data.path!=undefined && this.path != data.path){
            this.dom.locationsLabel.innerHTML = this.path ? 'Path:' : (this.coordinates.length > 1) ? 'Locations:' : 'Location:';
            changed = true;
        }

        if(data.images && !this.images?.equals(data.images)){
            this.images = data.images;
            changed = true;

            if(this.images?.[0] != undefined){
                this.dom.firstImage.src = 'loadImage.php?id='+this.images[0];
                this.dom.firstImage.onclick = ()=>Entity.openImgPopup(this.images[0]);
                if(this.images.length > 1){
                    this.dom.gallery.innerHTML = '';
                    for(let imgId of this.images.slice(1)){
                        this.dom.gallery.appendChild(htmlHelper.createNode('img',{
                            loading:'lazy', 
                            className:'content_image', 
                            src:'loadImage.php?id='+imgId, 
                            onclick:()=>Entity.openImgPopup(imgId)
                        }));
                    }
                }
            }
        }

        if(changed) this.reloadDOMVisibility();
    }

    reloadDOMVisibility(){
        if(this.type.name != 'PlayerEntity') this.dom.icons.draggable.style.display = '';
        this.dom.icons.edit.style.display = '';
        this.dom.icons.delete.style.display = 'none';

        this.dom.input.saveEdit.style.display = '';
        this.dom.input.cancelEdit.style.display = '';

        this.dom.descriptionLabel.style.display = this.description ? '' : 'none';
        this.dom.description.style.display = this.description ? '' : 'none';

        this.dom.locationsLabel.style.display = (this.coordinates?.length) ? '' : 'none';
        this.dom.locations.style.display = (this.coordinates?.length) ? '' : 'none';

        if(this.images?.[0] != undefined){
            this.dom.firstImage.style.display = '';
            this.dom.gallery.style.display = this.images.length > 1 ? '' : 'none';
        }
        else{
            this.dom.firstImage.style.display = 'none';
            this.dom.gallery.style.display = 'none';
        }

        // if only description and nothing else display pureText instead of grid format
        if(this.dom.firstImage.style.display == 'none' && this.dom.gallery.style.display == 'none' && 
                Array.from(this.dom.grid.children).slice(2).every(x => x.style.display == 'none')){
            this.dom.grid.style.display = 'none';
            this.dom.pureText.style.display = '';
        }
        else{
            this.dom.grid.style.display = '';
            this.dom.pureText.style.display = 'none';
        }
    }

    edit(){
        this.setEditing(true);
        currentlyEditing = this;

        this.dom.firstImage.style.display = 'none';
        this.dom.gallery.style.display = 'none';
        this.dom.pureText.style.display = 'none';
        this.dom.name.innerHTML = '';
        this.dom.input.name = this.dom.name.appendChild(htmlHelper.createNode('input',{value: this.name.decodeHTML(), onclick: e => e.stopPropagation()}));

        this.dom.grid.style.display = '';
        this.dom.descriptionLabel.style.display = '';
        this.dom.description.style.display = '';
        this.dom.description.innerHTML = '';
        this.dom.input.description = this.dom.description.appendChild(htmlHelper.createNode('textarea',{value: this.description}));
        this.dom.locationsLabel.style.display = '';
        this.dom.locations.style.display = '';

        this.dom.icons.draggable.style.display = 'none';
        this.dom.icons.edit.style.display = 'none';
        this.dom.icons.delete.style.display = '';

        this.dom.input.saveEdit.style.display = 'initial';
        this.dom.input.cancelEdit.style.display = 'initial';
    }

    saveEdit(){
        this.cancelEdit();

        let changed = {};

        if(this.dom.input.name.value != this.name.decodeHTML()) changed.name = this.dom.input.name.value.encodeHTML();

        if(this.dom.input.description.value != this.description) changed.description = this.dom.input.description.value;

        // TODO: images, map (coordinates, path)

        if(Object.keys(changed).length) socket.emit('updateData',this.type.name,this.id,changed);
    }

    cancelEdit(){
        this.setEditing(false);
        currentlyEditing = null;

        this.dom.name.innerHTML = this.name;
        this.dom.description.innerHTML = this.description;
        this.reloadDOMVisibility();
    }

    setEditing(value){
        this.editing = value;
        if(!value && this.updateDataCash) this.update();
        this.parent.setEditing(value);
    }

    confirmDelete(iterations){
        if(!iterations) iterations = 2;
        for(let i = 0, j = 0; i < iterations; i++){
            if(!confirm(this.deleteMessages[j])) return false;
            j++;
            if(j >= this.deleteMessages.length) j = 0;
        }
        return true;
    }

    static openImgPopup(imgId){
        document.getElementById('popup_overlay').style.display = 'initial';
        document.getElementById('main').classList.add('blurred');
        document.getElementById('popup').innerHTML = '';
        document.getElementById('popup').appendChild(htmlHelper.createNode('img',{src:'loadImage.php?id='+imgId, onclick:closePopup}));
        document.getElementById('popup').style.display = 'initial';
    }
}

class StorylineInfoEntity extends Entity {
    constructor(id,parent){
        super(id, parent, parent);
        this.toggleOpen();
        objectSets.StorylineInfoEntity.set(this.id, this);
    }

    async init(){
        // load entity data via websocket
        socket.on('updateData_StorylineInfoEntity_'+this.id, (data) => this.update(data));
        const data = await websocketRequestData('StorylineInfoEntity', this.id);
        await this.update(data);
        return this;
    }

    delete(){
        if(!this.confirmDelete(2)) return;
        this.setEditing(false);
        socket.emit('removeData','StorylineInfoEntity',this.id);
    }
}

class PlayerEntity extends Entity {
    constructor(id,parent){
        super(id, parent, parent);
        this.currentOpenTab = 'info';
        objectSets.PlayerEntity.set(this.id, this);
        this.items = {};
        this.itemEffects = {};
        this.skills = {};
        this.cells = {};
        this.deleteMessages.push('With this also all subelements (items, skills, ...) will be deleted. Do you still want to proceed?');

        this.dom.icons.draggable.style.display = 'none';

        this.dom.menuTab = htmlHelper.createNode('div', {className:'secondary_menu_tab',onclick: ()=>this.storyline.openPlayer(this.id)});
        this.dom.menuTabs = {};
        this.dom.menuTabs.info = htmlHelper.createNode('div', {innerHTML:'Info', onclick: ()=>this.openTab('info')});
        this.dom.menuTabs.cells = htmlHelper.createNode('div', {innerHTML:'Values', onclick: ()=>this.openTab('cells')});
        this.dom.menuTabs.items = htmlHelper.createNode('div', {innerHTML:'Items', onclick: ()=>this.openTab('items')});
        this.dom.menuTabs.itemEffects = htmlHelper.createNode('div', {innerHTML:'Effects', onclick: ()=>this.openTab('itemEffects')});
        this.dom.menuTabs.skills = htmlHelper.createNode('div', {innerHTML:'Skills', onclick: ()=>this.openTab('skills')});

        this.dom.items = {};
        this.dom.items.root = htmlHelper.createNode('div');
        this.dom.items.categories = this.dom.items.root.appendChild(htmlHelper.createNode('div',{
            id:'PlayerEntity_'+this.id+'_items_categories', 
            className:'category_container'
        }));
        this.dom.items.entities = this.dom.items.root.appendChild(htmlHelper.createNode('div',{
            id:'PlayerEntity_'+this.id+'_items_entities', 
            className:'entity_container'
        }));

        this.dom.itemEffects = {};
        this.dom.itemEffects.root = htmlHelper.createNode('div');
        this.dom.itemEffects.categories = this.dom.itemEffects.root.appendChild(htmlHelper.createNode('div',{
            id:'PlayerEntity_'+this.id+'_itemEffects_categories', 
            className:'category_container'
        }));
        this.dom.itemEffects.entities = this.dom.itemEffects.root.appendChild(htmlHelper.createNode('div',{
            id:'PlayerEntity_'+this.id+'_itemEffects_entities', 
            className:'entity_container'
        }));

        this.dom.cells = {};
        this.dom.cells.root = htmlHelper.createNode('div');
        this.dom.cells.categories = this.dom.cells.root.appendChild(htmlHelper.createNode('div',{
            id:'PlayerEntity_'+this.id+'_cells_categories', 
            className:'category_container'
        }));
        this.dom.cells.entities = this.dom.cells.root.appendChild(htmlHelper.createNode('div',{
            id:'PlayerEntity_'+this.id+'_cells_entities', 
            className:'entity_container'
        }));

        this.dom.skills = {};
        this.dom.skills.root = htmlHelper.createNode('div');
        this.dom.skills.categories = this.dom.skills.root.appendChild(htmlHelper.createNode('div',{
            id:'PlayerEntity_'+this.id+'_skills_categories', 
            className:'category_container'
        }));
        this.dom.skills.entities = this.dom.skills.root.appendChild(htmlHelper.createNode('div',{
            id:'PlayerEntity_'+this.id+'_skills_entities', 
            className:'entity_container'
        }));

        this.sortables = {};
        this.sortables.entities = new Sortable.default([
            this.dom.items.entities, this.dom.itemEffects.entities, this.dom.cells.entities, this.dom.skills.entities
        ], {
            draggable: ".entity",
            handle: '.drag_handle_entity',
            mirror: {
              constrainDimensions: true
            }
        });
        this.sortables.categories = new Sortable.default([
            this.dom.items.categories, this.dom.itemEffects.categories, this.dom.cells.categories, this.dom.skills.categories
        ], {
            draggable: ".category",
            handle: '.drag_handle_category',
            mirror: {
              constrainDimensions: true
            }
        });


        function saveNewOrder(e){
            let oldContainer = {update:{}};
            let newContainer = {update:{}};
            let entityId = parseInt(e.data.dragEvent.data.source.id.split('_')[1]);

            [oldContainer.type, oldContainer.id, oldContainer.property, oldContainer.subProperty] = e.data.oldContainer.id.split('_');
            [newContainer.type, newContainer.id, newContainer.property, newContainer.subProperty] = e.data.newContainer.id.split('_');
            oldContainer.id = parseInt(oldContainer.id);
            newContainer.id = parseInt(newContainer.id);

            oldContainer.object = objectSets[oldContainer.type]?.get(oldContainer.id);
            if(oldContainer.subProperty) oldContainer.children = oldContainer.object?.[oldContainer.property]?.[oldContainer.subProperty].slice();
            else oldContainer.children = oldContainer.object?.[oldContainer.property]?.slice();
            newContainer.object = objectSets[newContainer.type]?.get(newContainer.id);
            if(newContainer.object == oldContainer.object) newContainer.children = oldContainer.children;
            else if(newContainer.subProperty) newContainer.children = newContainer.object?.[newContainer.property]?.[newContainer.subProperty].slice();
            else newContainer.children = newContainer.object?.[newContainer.property]?.slice();

            if(!oldContainer.children) return console.error('old container not found',oldContainer,e);
            if(!newContainer.children) return console.error('new container not found',newContainer,e);
            
            oldContainer.children.splice(e.data.oldIndex,1);
            newContainer.children.splice(e.data.newIndex,0,entityId);

            if(oldContainer.subProperty){
                oldContainer.update[oldContainer.property] = {};
                oldContainer.update[oldContainer.property][oldContainer.subProperty] = oldContainer.children;
            }
            else oldContainer.update[oldContainer.property] = oldContainer.children;
            socket.emit('updateData',oldContainer.type,oldContainer.id,oldContainer.update);

            if(newContainer.subProperty){
                newContainer.update[newContainer.property] = {};
                newContainer.update[newContainer.property][newContainer.subProperty] = newContainer.children;
            }
            else newContainer.update[newContainer.property] = newContainer.children;
            socket.emit('updateData',newContainer.type,newContainer.id,newContainer.update);
        }

        this.sortables.entities.on('sortable:start', e => {
            this.setEditing(true);
            styleRules.entityContainer.style.minHeight = '20px';
        });
        this.sortables.entities.on('sortable:stop', e => {
            styleRules.entityContainer.style.minHeight = '';
            if(e.data.newContainer != e.data.oldContainer || e.data.newIndex != e.data.oldIndex){
                saveNewOrder(e);
            }
            this.setEditing(false);
        });

        this.sortables.categories.on('sortable:start', e => {
            this.setEditing(true);
            styleRules.categoryContainer.style.minHeight = '20px';
        });
        this.sortables.categories.on('sortable:stop', e => {
            styleRules.categoryContainer.style.minHeight = '';
            if(e.data.newContainer != e.data.oldContainer || e.data.newIndex != e.data.oldIndex){
                saveNewOrder(e);
            }
            this.setEditing(false);
        });
    }

    registerSortableContainers(entity, category){
        if(entity) this.sortables.entities.addContainer(entity);
        if(category) this.sortables.categories.addContainer(category);
    }

    async init(){
        // load entity data via websocket
        socket.on('updateData_PlayerEntity_'+this.id, (data) => this.update(data));
        const data = await websocketRequestData('PlayerEntity', this.id);
        await this.update(data);
        return this;
    }

    async update(data){
        if(this.editing){
            function recursiveUpdateDataCash(cash, newData){
                for(let i in newData){
                    if(cash[i] && newData[i] && typeof(newData[i]) == 'object' && !Array.isArray(newData[i])){
                        recursiveUpdateDataCash(cash[i], newData[i]);
                    }
                    else cash[i] = newData[i];
                }
            }

            if(!this.updateDataCash) this.updateDataCash = data;
            else recursiveUpdateDataCash(this.updateDataCash, data);
            return;
        }

        if(!data) data = this.updateDataCash;
        if(!data) return;

        this.updateDataCash = null;

        let changedName = (data.name!=undefined && this.name != data.name);

        await super.update(data);
        
        if(changedName) this.dom.menuTab.innerHTML = this.name;

        let newObjectInits = [];

        if(data.items?.entities && !this.items?.entities?.equals(data.items.entities)){
            this.items.entities = data.items.entities;
            for(let id of this.items.entities){
                if(!objectSets.ItemEntity.get(id)) newObjectInits.push((new ItemEntity(id, this, this.storyline)).init());
            }
            this.dom.items.entities.innerHTML = '';
            for(let entity of this.getEntities('items')) this.dom.items.entities.appendChild(entity.dom.root);
        }
        if(data.items?.categories && !this.items?.categories?.equals(data.items.categories)){
            this.items.categories = data.items.categories;
            for(let id of this.items.categories){
                if(!objectSets.ItemCategory.get(id)) newObjectInits.push((new ItemCategory(id, this, this.storyline)).init());
            }
            this.dom.items.categories.innerHTML = '';
            for(let categoriey of this.getCategories('items')) this.dom.items.categories.appendChild(categoriey.dom.root);
        }

        if(data.itemEffects?.entities && !this.itemEffects?.entities?.equals(data.itemEffects.entities)){
            this.itemEffects.entities = data.itemEffects.entities;
            for(let id of this.itemEffects.entities){
                if(!objectSets.ItemEffectEntity.get(id)) newObjectInits.push((new ItemEffectEntity(id, this, this.storyline)).init());
            }
            this.dom.itemEffects.entities.innerHTML = '';
            for(let entity of this.getEntities('itemEffects')) this.dom.itemEffects.entities.appendChild(entity.dom.root);
        }
        if(data.itemEffects?.categories && !this.itemEffects?.categories?.equals(data.itemEffects.categories)){
            this.itemEffects.categories = data.itemEffects.categories;
            for(let id of this.itemEffects.categories){
                if(!objectSets.ItemEffectCategory.get(id)) newObjectInits.push((new ItemEffectCategory(id, this, this.storyline)).init());
            }
            this.dom.itemEffects.categories.innerHTML = '';
            for(let categoriey of this.getCategories('itemEffects')) this.dom.itemEffects.categories.appendChild(categoriey.dom.root);
        }

        if(data.skills?.entities && !this.skills?.entities?.equals(data.skills.entities)){
            this.skills.entities = data.skills.entities;
            for(let id of this.skills.entities){
                if(!objectSets.SkillEntity.get(id)) newObjectInits.push((new SkillEntity(id, this, this.storyline)).init());
            }
            this.dom.skills.entities.innerHTML = '';
            for(let entity of this.getEntities('skills')) this.dom.skills.entities.appendChild(entity.dom.root);
        }
        if(data.skills?.categories && !this.skills?.categories?.equals(data.skills.categories)){
            this.skills.categories = data.skills.categories;
            for(let id of this.skills.categories){
                if(!objectSets.SkillCategory.get(id)) newObjectInits.push((new SkillCategory(id, this, this.storyline)).init());
            }
            this.dom.skills.categories.innerHTML = '';
            for(let categoriey of this.getCategories('skills')) this.dom.skills.categories.appendChild(categoriey.dom.root);
        }

        if(data.cells?.entities && !this.cells?.entities?.equals(data.cells.entities)){
            this.cells.entities = data.cells.entities;
            for(let id of this.cells.entities){
                if(!objectSets.CellEntity.get(id)) newObjectInits.push((new CellEntity(id, this, this.storyline)).init());
            }
            this.dom.cells.entities.innerHTML = '';
            for(let entity of this.getEntities('cells')) this.dom.cells.entities.appendChild(entity.dom.root);
        }
        if(data.cells?.categories && !this.cells?.categories?.equals(data.cells.categories)){
            this.cells.categories = data.cells.categories;
            for(let id of this.cells.categories){
                if(!objectSets.CellCategory.get(id)) newObjectInits.push((new CellCategory(id, this, this.storyline)).init());
            }
            this.dom.cells.categories.innerHTML = '';
            for(let categoriey of this.getCategories('cells')) this.dom.cells.categories.appendChild(categoriey.dom.root);
        }

        await Promise.all(newObjectInits);
    }

    openTab(tab){
        if(tab == undefined){
            document.getElementById('tertiary_menu').innerHTML = '';
            document.getElementById('tertiary_menu').appendChild(this.dom.menuTabs.info);
            document.getElementById('tertiary_menu').appendChild(this.dom.menuTabs.cells);
            document.getElementById('tertiary_menu').appendChild(this.dom.menuTabs.items);
            document.getElementById('tertiary_menu').appendChild(this.dom.menuTabs.itemEffects);
            document.getElementById('tertiary_menu').appendChild(this.dom.menuTabs.skills);
            document.getElementById('tertiary_menu').style.display = '';

            let activeSecondaries = document.getElementsByClassName('secondary_menu_active');
            for(let x of activeSecondaries) x.classList?.remove('secondary_menu_active');
            this.dom.menuTab.classList?.add('secondary_menu_active');

            return this.openTab(this.currentOpenTab);
        }

        this.currentOpenTab = tab;

        let activeTertiaries = document.getElementsByClassName('tertiary_menu_active');
        for(let x of activeTertiaries) x.classList?.remove('tertiary_menu_active');
        this.dom.menuTabs[tab]?.classList?.add('tertiary_menu_active');

        document.getElementById('main_content').innerHTML = '';
        
        if(tab == 'info'){
            document.getElementById('main_content').appendChild(this.dom.root);
        }
        else{
            if(!this.dom[tab]) return;
            document.getElementById('main_content').appendChild(this.dom[tab].root);
        }
    }

    getAllDescendantsReferenceNames(property){
        let result = new Map();
        for(let x of this.getEntities(property)) result.set(x.referenceName, x);

        function addSubCategory(category){
            for(let x of category.getEntities()) result.set(x.referenceName, x);
            for(let x of category.getCategories()) addSubCategory(x);
        }

        for(let x of this.getCategories(property)) addSubCategory(x);

        return result;
    }

    getEntities(property){
        switch(property){
            case 'items': return this[property].entities.map(id => objectSets.ItemEntity.get(id));
            case 'itemEffects': return this[property].entities.map(id => objectSets.ItemEffectEntity.get(id));
            case 'skills': return this[property].entities.map(id => objectSets.SkillEntity.get(id));
            case 'cells': return this[property].entities.map(id => objectSets.CellEntity.get(id));
        }
    }

    getCategories(property){
        switch(property){
            case 'items': return this[property].categories.map(id => objectSets.ItemCategory.get(id));
            case 'itemEffects': return this[property].categories.map(id => objectSets.ItemEffectCategory.get(id));
            case 'skills': return this[property].categories.map(id => objectSets.SkillCategory.get(id));
            case 'cells': return this[property].categories.map(id => objectSets.CellCategory.get(id));
        }
    }

    delete(){
        if(!this.confirmDelete(3)) return;
        this.setEditing(false);
        socket.emit('removeData','PlayerEntity',this.id);
    }
}

class ItemEntity extends Entity {
    constructor(id, parent, storyline){
        super(id, parent, storyline);
        objectSets.ItemEntity.set(this.id, this);
    }
    
    async init(){
        // load entity data via websocket
        socket.on('updateData_ItemEntity_'+this.id, (data) => this.update(data));
        const data = await websocketRequestData('ItemEntity', this.id);
        await this.update(data);
        return this;
    }

    async update(data){
        if(this.editing){
            function recursiveUpdateDataCash(cash, newData){
                for(let i in newData){
                    if(cash[i] && newData[i] && typeof(newData[i]) == 'object' && !Array.isArray(newData[i])){
                        recursiveUpdateDataCash(cash[i], newData[i]);
                    }
                    else cash[i] = newData[i];
                }
            }

            if(!this.updateDataCash) this.updateDataCash = data;
            else recursiveUpdateDataCash(this.updateDataCash, data);
            return;
        }

        if(!data) data = this.updateDataCash;
        if(!data) return;

        this.updateDataCash = null;

        await super.update(data);

        if(data.amount != undefined && this.amount != data.amount){
            this.amount = data.amount;
        }
    }

    getItemEffects(){
        const result = [];
        for(let x of objectSets.ItemEffectEntity.values()){
            if(x.items.includes(this.id)) result.push(x);
        }
        return result;
    }

    delete(){
        if(!this.confirmDelete(2)) return;
        this.setEditing(false);
        socket.emit('removeData','ItemEntity',this.id);
    }
}

class ItemEffectEntity extends Entity {
    constructor(id,parent, storyline){
        super(id, parent, storyline);
        objectSets.ItemEffectEntity.set(this.id, this);
    }
    
    async init(){
        // load entity data via websocket
        socket.on('updateData_ItemEffectEntity_'+this.id, (data) => this.update(data));
        const data = await websocketRequestData('ItemEffectEntity', this.id);
        await this.update(data);
        return this;
    }

    async update(data){
        if(this.editing){
            function recursiveUpdateDataCash(cash, newData){
                for(let i in newData){
                    if(cash[i] && newData[i] && typeof(newData[i]) == 'object' && !Array.isArray(newData[i])){
                        recursiveUpdateDataCash(cash[i], newData[i]);
                    }
                    else cash[i] = newData[i];
                }
            }

            if(!this.updateDataCash) this.updateDataCash = data;
            else recursiveUpdateDataCash(this.updateDataCash, data);
            return;
        }

        if(!data) data = this.updateDataCash;
        if(!data) return;

        this.updateDataCash = null;

        await super.update(data);

        let newObjectInits = [];

        if(data.items && !this.items?.equals(data.items)){
            this.items = data.items;
            for(let id of this.items){
                if(!objectSets.ItemEntity.get(id)) newObjectInits.push((new ItemEntity(id, this, this.storyline)).init());
            }
        }

        await Promise.all(newObjectInits);
    }

    getItems(){
        return this.items.map(id => objectSets.ItemEntity.get(id));
    }

    delete(){
        if(!this.confirmDelete(2)) return;
        this.setEditing(false);
        socket.emit('removeData','ItemEffectEntity',this.id);
    }
}

class SkillEntity extends Entity {
    constructor(id,parent, storyline){
        super(id, parent, storyline);
        objectSets.SkillEntity.set(this.id, this);
    }
    
    async init(){
        // load entity data via websocket
        socket.on('updateData_SkillEntity_'+this.id, (data) => this.update(data));
        const data = await websocketRequestData('SkillEntity', this.id);
        await this.update(data);
        return this;
    }

    async update(data){
        if(this.editing){
            function recursiveUpdateDataCash(cash, newData){
                for(let i in newData){
                    if(cash[i] && newData[i] && typeof(newData[i]) == 'object' && !Array.isArray(newData[i])){
                        recursiveUpdateDataCash(cash[i], newData[i]);
                    }
                    else cash[i] = newData[i];
                }
            }

            if(!this.updateDataCash) this.updateDataCash = data;
            else recursiveUpdateDataCash(this.updateDataCash, data);
            return;
        }

        if(!data) data = this.updateDataCash;
        if(!data) return;

        this.updateDataCash = null;

        await super.update(data);

        if(data.learned != undefined && this.learned != data.learned){
            this.learned = data.learned;
        }

        if(data.requirements != undefined && this.requirements != data.requirements){
            this.requirements = data.requirements;
        }
    }

    delete(){
        if(!this.confirmDelete(2)) return;
        this.setEditing(false);
        socket.emit('removeData','SkillEntity',this.id);
    }
}

class CellEntity extends Entity {
    constructor(id,parent, storyline){
        super(id, parent, storyline);
        objectSets.CellEntity.set(this.id, this);
    }
    
    async init(){
        // load entity data via websocket
        socket.on('updateData_CellEntity_'+this.id, (data) => this.update(data));
        const data = await websocketRequestData('CellEntity', this.id);
        await this.update(data);
        return this;
    }

    async update(data){
        if(this.editing){
            function recursiveUpdateDataCash(cash, newData){
                for(let i in newData){
                    if(cash[i] && newData[i] && typeof(newData[i]) == 'object' && !Array.isArray(newData[i])){
                        recursiveUpdateDataCash(cash[i], newData[i]);
                    }
                    else cash[i] = newData[i];
                }
            }

            if(!this.updateDataCash) this.updateDataCash = data;
            else recursiveUpdateDataCash(this.updateDataCash, data);
            return;
        }

        if(!data) data = this.updateDataCash;
        if(!data) return;

        this.updateDataCash = null;

        await super.update(data);

        if(data.cellType != undefined && this.cellType != data.cellType){
            this.cellType = data.cellType;
        }

        if(data.value != undefined && this.value != data.value){
            this.value = data.value;
        }

        // TODO: other properties
    }

    delete(){
        if(!this.confirmDelete(2)) return;
        this.setEditing(false);
        socket.emit('removeData','CellEntity',this.id);
    }
}

class Category {
    constructor(id, parent, storyline){
        this.id = id;
        this.parent = parent;
        this.storyline = storyline;
        this.editing = false;
        this.type = this.constructor;
        this.open = true; // TODO: read from localStorage if open
        
        this.deleteMessages = [
            'This will delete this category. Are your sure you want to continue?',
            'This action is irreversible. Are you absolutely sure, you know what you are doing?'
        ];


        this.dom = {};
        this.dom.root = htmlHelper.createNode('div',{className:'category',id:this.type.name+'_'+this.id});

        this.dom.input = {};
        this.dom.input.cancelEdit = htmlHelper.createNode('button',{className:'cancel_edit_button', innerHTML:'Cancel', onclick:()=>this.cancelEdit()});
        this.dom.input.saveEdit = htmlHelper.createNode('button',{className:'save_edit_button', innerHTML:'Save', onclick:()=>this.saveEdit()});


        this.dom.head = this.dom.root.appendChild(htmlHelper.createNode('div', {className: 'category_head content_section'}));
        this.dom.icons = {};
        this.dom.icons.draggable = this.dom.head.appendChild(htmlHelper.createNode('img', {className: 'icon draggable_icon drag_handle_category', src:'icons/draggable.svg', onmousedown: ()=>{
            this.toggleOpen(false);
        }}));
        this.dom.icons.edit = this.dom.head.appendChild(htmlHelper.createNode('img', {className: 'icon edit_icon', src:'icons/pencil-2.png', onclick: ()=>this.edit()}));
        this.dom.icons.delete = this.dom.head.appendChild(htmlHelper.createNode('img', {className: 'icon delete_icon', src:'icons/bin-2.png', onclick: ()=>this.delete()}, {display:'none'}));

        this.dom.title = this.dom.head.appendChild(htmlHelper.createNode('h3', {onclick: ()=>this.toggleOpen()}));
        this.dom.foldArrow = this.dom.title.appendChild(htmlHelper.createNode('span', {className:'fold_arrow non_selectable', innerHTML: String.fromCharCode(9654)}));
        this.dom.name = this.dom.title.appendChild(htmlHelper.createNode('span'));

        this.dom.body = this.dom.root.appendChild(htmlHelper.createNode('div', {className: 'category_body'}));
        this.dom.categories = this.dom.body.appendChild(htmlHelper.createNode('div',{id:this.type.name+'_'+this.id+'_categories',className:'category_container'}));
        this.dom.entities = this.dom.body.appendChild(htmlHelper.createNode('div',{id:this.type.name+'_'+this.id+'_entities',className:'entity_container'}));

        this.dom.head.appendChild(this.dom.input.saveEdit);
        this.dom.head.appendChild(this.dom.input.cancelEdit);

        this.toggleOpen();

        this.registerSortableContainers(this.dom.entities, this.dom.categories);
    }

    toggleOpen(setValue){
        if(setValue == this.open) return;
        this.open = !this.open;
        this.dom.foldArrow.innerHTML = this.open ? String.fromCharCode(9660) : String.fromCharCode(9654);
        this.dom.body.style.display = this.open ? '' : 'none';
    }

    async init(){
        socket.on('updateData_'+this.type.name+'_'+this.id, (data) => this.update(data));
        const data = await websocketRequestData(this.type.name, this.id);
        this.update(data);
        return this;
    }

    async update(data){
        if(this.editing){
            function recursiveUpdateDataCash(cash, newData){
                for(let i in newData){
                    if(cash[i] && newData[i] && typeof(newData[i]) == 'object' && !Array.isArray(newData[i])){
                        recursiveUpdateDataCash(cash[i], newData[i]);
                    }
                    else cash[i] = newData[i];
                }
            }

            if(!this.updateDataCash) this.updateDataCash = data;
            else recursiveUpdateDataCash(this.updateDataCash, data);
            return;
        }

        if(!data) data = this.updateDataCash;
        if(!data) return;

        this.updateDataCash = null;

        if(data.name!=undefined && this.name != data.name){
            this.name = data.name;
            this.dom.name.innerHTML = this.name;
        }

        let newObjectInits = [];

        if(data.entities!=undefined && !this.entities?.equals(data.entities)){
            this.entities = data.entities;
            for(let id of this.entities){
                if(!objectSets[this.entityType.name].get(id)) newObjectInits.push((new this.entityType(id, this, this.storyline)).init());
            }
            this.dom.entities.innerHTML = '';
            for(let entity of this.getEntities()) this.dom.entities.appendChild(entity.dom.root);
        }

        if(data.categories!=undefined && !this.categories?.equals(data.categories)){
            this.categories = data.categories;
            for(let id of this.categories){
                if(!objectSets[this.type.name].get(id)) newObjectInits.push((new this.type(id, this, this.storyline)).init());
            }
            this.dom.categories.innerHTML = '';
            for(let category of this.getCategories()) this.dom.categories.appendChild(category.dom.root);
        }

        await Promise.all(newObjectInits);
    }

    registerSortableContainers(entity, category){
        this.parent.registerSortableContainers(entity, category);
    }

    setEditing(value){
        this.editing = value;
        if(!value && this.updateDataCash) this.update();
        this.parent.setEditing(value);
    }

    edit(){
        this.setEditing(true);
        currentlyEditing = this;

        this.dom.name.innerHTML = '';
        this.dom.input.name = this.dom.name.appendChild(htmlHelper.createNode('input',{value: this.name.decodeHTML(), onclick: e => e.stopPropagation()}));

        this.dom.icons.draggable.style.display = 'none';
        this.dom.icons.edit.style.display = 'none';
        this.dom.icons.delete.style.display = '';

        this.dom.input.saveEdit.style.display = 'initial';
        this.dom.input.cancelEdit.style.display = 'initial';
    }

    saveEdit(){
        this.cancelEdit();

        let changed = {};

        if(this.dom.input.name.value != this.name.decodeHTML()) changed.name = this.dom.input.name.value.encodeHTML();

        if(Object.keys(changed).length) socket.emit('updateData',this.type.name,this.id,changed);
    }

    cancelEdit(){
        this.setEditing(false);
        currentlyEditing = null;

        this.dom.name.innerHTML = this.name;
        
        this.dom.icons.draggable.style.display = '';
        this.dom.icons.edit.style.display = '';
        this.dom.icons.delete.style.display = 'none';

        this.dom.input.saveEdit.style.display = '';
        this.dom.input.cancelEdit.style.display = '';
    }

    getEntities(){
        return this.entities.map(id => objectSets[this.entityType.name].get(id));
    }

    getCategories(){
        return this.categories.map(id => objectSets[this.type.name].get(id));
    }

    confirmDelete(iterations){
        if(!iterations) iterations = 2;
        for(let i = 0, j = 0; i < iterations; i++){
            if(!confirm(this.deleteMessages[j])) return false;
            j++;
            if(j >= this.deleteMessages.length) j = 0;
        }
        return true;
    }

    delete(){
        if(!this.confirmDelete(2)) return;
        let removeChildren = !confirm('By default all elements and categories inside this category will be preserved and just moved one category up. '+
            'If you also want to delete them, click \'Cancel\'.');
        if(removeChildren && !confirm('Are you absolutely sure you also want to delete all elements and categories inside this category?')) removeChildren = false;
        this.setEditing(false);
        socket.emit('removeData',this.type.name,this.id,removeChildren);
    }
}

class StorylineInfoCategory extends Category {
    constructor(id, parent, storyline){
        super(id, parent, storyline);
        this.entityType = StorylineInfoEntity;
        objectSets.StorylineInfoCategory.set(this.id, this);
    }
}

class ItemCategory extends Category {
    constructor(id, parent, storyline){
        super(id, parent, storyline);
        this.entityType = ItemEntity;
        objectSets.ItemCategory.set(this.id, this);
    }
}

class ItemEffectCategory extends Category {
    constructor(id, parent, storyline){
        super(id, parent, storyline);
        this.entityType = ItemEffectEntity;
        objectSets.ItemEffectCategory.set(this.id, this);
    }
}

class SkillCategory extends Category {
    constructor(id, parent, storyline){
        super(id, parent, storyline);
        this.entityType = SkillEntity;
        objectSets.SkillCategory.set(this.id, this);
    }
}

class CellCategory extends Category {
    constructor(id, parent, storyline){
        super(id, parent, storyline);
        this.entityType = CellEntity;
        objectSets.CellCategory.set(this.id, this);
    }
}

class StorylineInfoType {
    constructor(id, parent){
        this.id = id;
        this.parent = this.storyline = parent;
        this.editing = false;
        
        this.deleteMessages = [
            'This will delete this category. Are your sure you want to continue?',
            'This action is irreversible. Are you absolutely sure, you know what you are doing?'
        ];


        this.dom = {};
        this.dom.root = htmlHelper.createNode('div');

        this.dom.menuTab = htmlHelper.createNode('div', {className:'secondary_menu_tab',onclick: ()=>this.storyline.openTab(this.id)});

        this.dom.categories = this.dom.root.appendChild(htmlHelper.createNode('div',{
            id:'StorylineInfoType_'+this.id+'_categories', 
            className:'category_container'
        }));
        this.dom.entities = this.dom.root.appendChild(htmlHelper.createNode('div',{
            id:'StorylineInfoType_'+this.id+'_entities', 
            className:'entity_container'
        }));

        this.sortables = {};
        this.sortables.entities = new Sortable.default([this.dom.entities], {
            draggable: ".entity",
            handle: '.drag_handle_entity',
            mirror: {
              constrainDimensions: true
            }
        });
        this.sortables.categories = new Sortable.default([this.dom.categories], {
            draggable: ".category",
            handle: '.drag_handle_category',
            mirror: {
              constrainDimensions: true
            }
        });


        function saveNewOrder(e){
            let oldContainer = {update:{}};
            let newContainer = {update:{}};
            let entityId = parseInt(e.data.dragEvent.data.source.id.split('_')[1]);

            [oldContainer.type, oldContainer.id, oldContainer.property, oldContainer.subProperty] = e.data.oldContainer.id.split('_');
            [newContainer.type, newContainer.id, newContainer.property, newContainer.subProperty] = e.data.newContainer.id.split('_');
            oldContainer.id = parseInt(oldContainer.id);
            newContainer.id = parseInt(newContainer.id);

            oldContainer.object = objectSets[oldContainer.type]?.get(oldContainer.id);
            if(oldContainer.subProperty) oldContainer.children = oldContainer.object?.[oldContainer.property]?.[oldContainer.subProperty].slice();
            else oldContainer.children = oldContainer.object?.[oldContainer.property]?.slice();
            newContainer.object = objectSets[newContainer.type]?.get(newContainer.id);
            if(newContainer.object == oldContainer.object) newContainer.children = oldContainer.children;
            else if(newContainer.subProperty) newContainer.children = newContainer.object?.[newContainer.property]?.[newContainer.subProperty].slice();
            else newContainer.children = newContainer.object?.[newContainer.property]?.slice();

            if(!oldContainer.children) return console.error('old container not found',oldContainer,e);
            if(!newContainer.children) return console.error('new container not found',newContainer,e);
            
            oldContainer.children.splice(e.data.oldIndex,1);
            newContainer.children.splice(e.data.newIndex,0,entityId);

            if(oldContainer.subProperty){
                oldContainer.update[oldContainer.property] = {};
                oldContainer.update[oldContainer.property][oldContainer.subProperty] = oldContainer.children;
            }
            else oldContainer.update[oldContainer.property] = oldContainer.children;
            socket.emit('updateData',oldContainer.type,oldContainer.id,oldContainer.update);

            if(newContainer.subProperty){
                newContainer.update[newContainer.property] = {};
                newContainer.update[newContainer.property][newContainer.subProperty] = newContainer.children;
            }
            else newContainer.update[newContainer.property] = newContainer.children;
            socket.emit('updateData',newContainer.type,newContainer.id,newContainer.update);
        }

        this.sortables.entities.on('sortable:start', e => {
            this.setEditing(true);
            styleRules.entityContainer.style.minHeight = '20px';
        });
        this.sortables.entities.on('sortable:stop', e => {
            styleRules.entityContainer.style.minHeight = '';
            if(e.data.newContainer != e.data.oldContainer || e.data.newIndex != e.data.oldIndex){
                saveNewOrder(e);
            }
            this.setEditing(false);
        });

        this.sortables.categories.on('sortable:start', e => {
            this.setEditing(true);
            styleRules.categoryContainer.style.minHeight = '20px';
        });
        this.sortables.categories.on('sortable:stop', e => {
            styleRules.categoryContainer.style.minHeight = '';
            if(e.data.newContainer != e.data.oldContainer || e.data.newIndex != e.data.oldIndex){
                saveNewOrder(e);
            }
            this.setEditing(false);
        });

        objectSets.StorylineInfoType.set(this.id, this);
    }

    async init(){
        socket.on('updateData_StorylineInfoType_'+this.id, (data) => this.update(data));
        const data = await websocketRequestData('StorylineInfoType', this.id);
        await this.update(data);
        return this;
    }

    async update(data){
        if(this.editing){
            function recursiveUpdateDataCash(cash, newData){
                for(let i in newData){
                    if(cash[i] && newData[i] && typeof(newData[i]) == 'object' && !Array.isArray(newData[i])){
                        recursiveUpdateDataCash(cash[i], newData[i]);
                    }
                    else cash[i] = newData[i];
                }
            }

            if(!this.updateDataCash) this.updateDataCash = data;
            else recursiveUpdateDataCash(this.updateDataCash, data);
            return;
        }

        if(!data) data = this.updateDataCash;
        if(!data) return;

        this.updateDataCash = null;

        if(data.name!=undefined && this.name != data.name){
            this.name = data.name;
            this.dom.menuTab.innerHTML = this.name;
        }

        let newObjectInits = [];

        if(data.entities!=undefined && !this.entities?.equals(data.entities)){
            this.entities = data.entities;
            for(let id of this.entities){
                if(!objectSets.StorylineInfoEntity.get(id)) newObjectInits.push((new StorylineInfoEntity(id, this, this.storyline)).init());
            }
            this.dom.entities.innerHTML = '';
            for(let entity of this.getEntities()) this.dom.entities.appendChild(entity.dom.root);
        }

        if(data.categories!=undefined && !this.categories?.equals(data.categories)){
            this.categories = data.categories;
            for(let id of this.categories){
                if(!objectSets.StorylineInfoCategory.get(id)) newObjectInits.push((new StorylineInfoCategory(id, this, this.storyline)).init());
            }
            this.dom.categories.innerHTML = '';
            for(let category of this.getCategories()) this.dom.categories.appendChild(category.dom.root);
        }

        await Promise.all(newObjectInits);
    }

    registerSortableContainers(entity, category){
        if(entity) this.sortables.entities.addContainer(entity);
        if(category) this.sortables.categories.addContainer(category);
    }

    setEditing(value){
        this.editing = value;
        if(!value && this.updateDataCash) this.update();
        this.parent.setEditing(value);
    }

    getEntities(){
        return this.entities.map(id => objectSets.StorylineInfoEntity.get(id));
    }

    getCategories(){
        return this.categories.map(id => objectSets.StorylineInfoCategory.get(id));
    }

    open(){
        let activeSecondaries = document.getElementsByClassName('secondary_menu_active');
        for(let x of activeSecondaries) x.classList?.remove('secondary_menu_active');
        this.dom.menuTab.classList?.add('secondary_menu_active');

        document.getElementById('main_content').innerHTML = '';
        document.getElementById('main_content').appendChild(this.dom.root);
    }
}

class BoardEnvironment {

}

class BoardEntity {

}

(async function(){
    await loadPromises.body.loaded;

    document.body.onclick = e => {
        if(currentlyEditing && e?.target && !currentlyEditing.dom.root.contains(e.target)) currentlyEditing?.saveEdit();
    };

    if(!currentStoryline) currentStoryline = await (new Storyline(0)).init(); // TODO: change default storyline (and check localstorage)
    currentStoryline.openTab();

    document.getElementById('menu_storyline').onclick = () => currentStoryline.openTab();
    document.getElementById('menu_players').onclick = () => currentStoryline.openPlayer();
})();

/* TODO/NOTES:
- edit images (show preview, order, delete, add and/or upload via own gallery menu)
- map system

- id system in MongoDB

- copyright wall (with password one time entered -> saved as cookie (note that password is provided on discord in welcome channel))

- Cancel/Save Button when editing (cancelEdit method), default when clicking outside -> Save , but for safety:
- Undo/Redo (only for own changes (but also sabe also before if it is not equivalent to last step) and only for changed parameters, but always safe last state before going back in protocol 
  to enable complete redo, even if the last step originated in a change from outside)
    - undo/redo via Ctrl+Z/Y or in Settings displaying whole protocol (and control protocol length)

- Settings:
    - separate into sections (General, Storyline, Discord)
        - General: Dark Mode, Category Body Left Offset (in pixel for CSS), 
                Undo Protocol length/Undo/Redo (show protocol in foldable section (display Entity type, name and parameters and parameter values before and after on hover))
        - Storyline: visibility of player entities, DM mode (activates visibility of protected entities)
        - Discord: announcement notifications (see below)

- tree-like music playlist system (just with category system) containing any supported service, enable user to move any sub-folder into playing tracks (no loose songs on root level)
- multiple tracks for music, always only one playing but easy to switch (can be filled with temporary songs or saved songs from playlists)
- search feature for all music services to add new songs (with listen to first 10s feature)
- services: Youtube, Soundcloud, Spotify, Epidimicsound
- noisli-like ambience noise feature in addition to music
- init discord user locally (in LocalStorage) for discord specific settings/features via separate site init/?id=... which then redirects directly to main site with settings
- Anouncement notifications: mailing list, discord PMs, telegram PMs, RSS feed (sign up via Settings)

- Board:
    - grid types: no grid, rectangle, hexagon (save entity positions with float, only snap to grid when moving or via button)
    - enter radius to display it on grid (only when grid is active)
    - save backgrounds and entities -> easy menu to load them
    - menu to draw entities or load images for them and cut them out


Epidimicsound search "API" (not public! prob is going to change in future!):
    Request: 
        https://www.epidemicsound.com/json/search/tracks/? followed by the get parameters for the search
        some parameters can be duplicate (e.g. moods) -> just provide both with same name, e.g.: ...?moods=Eccentric&moods=Quirky
        parameters (name - possible values - additional info):
            page - any integer (from 1 to totalPages)
            sort - date,title,bpm,length - default (if omitted) -> date
            order - desc,asc
            term - any string - search term, optional as all other filters!
            moods - too many to list and subject to change - all possible moods and genres can be loaded via https://www.epidemicsound.com/json/tags/ (both have tree structure)
            genres - ... - just as moods
            tags - ... - no list found yet? (but can be obtained after first search, via aggregations -> could be used to deconstruct list)
            vocals - false - if set to false only instrumental tracks, true is invalid, omit gives all tracks as usual
            length - to integers separated by "-" - first number is to minimum length in seconds, second number the maximum
            bpm - ... - just as length, only for tempo
            probably some parameter for energy/energyLevel, since there is an aggregation for it (but didn't find name yet)
    Response:
        {
            entities: {
                tracks: [a dictionary of found songs with their id as key, source MP3s can be found under stems]
            },
            meta: {
                hits: [an array of all found songs in the right order, 
                    providing in an object their trackId (to find them in tracks above)
                    and the stem to be played (pointing to an mp3 inside the song objct above)],
                totalHits: [number of all hits (on all pages, not only this page), if nothing was found -> 0],
                totalPages: [number of pages, if nothing was found -> 0],
                aggregations: [all possible filters that can be added and still lead to an result, and the number of songs meeting it;
                    bpm and length just contain min and max of search result]
            }
        }
*/