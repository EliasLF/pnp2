importScripts('https://www.gstatic.com/firebasejs/7.17.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/7.17.1/firebase-messaging.js');

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



var firebaseConfig = {
    apiKey: "AIzaSyB7zsR1o_tLn69qn5HWJBiOamGcKPoeATY",
    authDomain: "pnp-music.firebaseapp.com",
    databaseURL: "https://pnp-music.firebaseio.com",
    projectId: "pnp-music",
    storageBucket: "pnp-music.appspot.com",
    messagingSenderId: "40005924720",
    appId: "1:40005924720:web:9bd47fe43486d3aa5a81b5",
    measurementId: "G-953BQ9T2PN"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

var toBeCached = [ // different levels of versions staticness
    [   // can change with every version (e.g. 2.0.5 -> 2.0.6)
        /*'./',
        './main.js',
        './main.css'*/
    ],
    [   // can change only with every second level version (e.g. 2.0.5 -> 2.1.0)
        './fonts/opensans.css', 
        './fonts/mem8YaGs126MiZpBA-UFUZ0bbck.woff2', 
        './fonts/mem8YaGs126MiZpBA-UFVp0bbck.woff2', 
        './fonts/mem8YaGs126MiZpBA-UFVZ0b.woff2', 
        './fonts/mem8YaGs126MiZpBA-UFWJ0bbck.woff2', 
        './fonts/mem8YaGs126MiZpBA-UFWp0bbck.woff2',
        './fonts/mem8YaGs126MiZpBA-UFWZ0bbck.woff2',

        './modules/leaflet.js',
        './modules/plotly.min.js',
        './modules/dragscroll.min.js',

        './icons/autoclean.png',
        './icons/autoplay.png',
        './icons/bin.png',
        './icons/clear.png',
        './icons/cross.png',
        './icons/cursor-select-move.png',
        './icons/dice_distr.png',
        './icons/draggable.svg',
        './icons/draw.png',
        './icons/edit.png',
        './icons/erase.png',
        './icons/gift.png',
        './icons/hand.png',
        './icons/keyboard-return_on.png',
        './icons/keyboard-return_off.png',
        './icons/loading.png',
        './icons/map_pin.png',
        './icons/map_with_pin.png',
        './icons/next2.png',
        './icons/noreplay.png',
        './icons/pause2.png',
        './icons/play2.png',
        './icons/previous2.png',
        './icons/replay.png',
        './icons/roll_dice.png',
        './icons/shuffle.png',
        './icons/stop2.png',
        './icons/view-on.png',
        './icons/view-off.png',
        './icons/widgetize.png',
        './icons/wraparound2.png',
        './icons/youtube.png',
        
        './logo/favicon.ico',
        './logo/favicon.svg'
    ],
    [   // ...
    ]
];

var version = {
    current: [0,0,0],
    delayUntilRecheck: 60000, // in milliseconds
    lastChecked: 0,
    async recheck(force, updateCache){
        if(!force && (new Date).getTime() - this.lastChecked < this.delayUntilRecheck) return false;
        let oldVersion = this.current;
        this.current = (await (await fetch('./version.txt'))?.text())?.split('.').map(x => parseInt(x));
        this.lastChecked = (new Date).getTime();
        let changed = false;
        for(let i = 0; i<this.current.length; i++){
            if(this.current[this.current.length-i-1] != oldVersion[oldVersion.length-i-1]){
                changed = true;
                if(updateCache && toBeCached[i]) caches.open('pnp-v1').then(cache => {
                    cache.addAll(toBeCached[i]);
                })
            }
        }
        return changed;
    }
};

self.addEventListener('install', async e=> {
    console.log('installed new service worker version');
    await caches.delete('pnp-v1');
    await caches.open('pnp-v1').then(cache => {
        version.recheck(true, false);
        cache.addAll(toBeCached.flat());
    });
});


self.addEventListener('fetch', e=> {
    e.respondWith(
        caches.match(e.request).then(async response => {
            let oldVersion = version.current;
            if(response && await version.recheck(false, true)){
                console.log('new version: ',oldVersion,version.current);
                return await fetch(e.request);
            }
            return await (response || fetch(e.request));
        })
    );
});