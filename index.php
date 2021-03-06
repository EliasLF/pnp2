<?php
if(!isset($_COOKIE["pnp_password"]) or $_COOKIE["pnp_password"]!='p&p'){
	echo "<script>
var psswd = prompt('For copyright reasons (since we are using a lot of external images here), this website has to be closed off from the public.\\nPlease enter the password provided in the welcome channel'+
' of the discord server or ask me (Elias Foramitti) personally for it.');
var d = new Date();
d.setTime(d.getTime() + (5*365*24*60*60*1000));
document.cookie = 'pnp_password=' + psswd + ';expires=' + d.toUTCString() + ';path=/elias/pnp';
location.reload(true);
</script>";
die();
}
?>
<!DOCTYPE html>
<html>
	<head>
		<link rel="preconnect" href="https://foramitti.com:8081">
		<meta charset="utf-8">
		<meta http-equiv="X-UA-Compatible" content="IE=edge">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Pen & Paper - ELF</title>
		
		<link rel="manifest" href="manifest.json">
		<link rel="icon" type="image/svg+xml" href="logo/favicon.svg" sizes="any">
		<meta name="application-name" content="Pen & Paper - ELF">
		<meta name="mobile-web-app-capable" content="yes">
		<meta name="apple-mobile-web-app-capable" content="yes">
		<meta name="apple-mobile-web-app-title" content="Pen & Paper - ELF">
		<meta name="msapplication-TileColor" content="#1e1e1e">
		<meta name="theme-color" content="#1e1e1e">
		<meta name="apple-mobile-web-app-status-bar-style" content="#1e1e1e">
		<meta name="msapplication-config" content="logo/browserconfig.xml?v=190925022706">
		<link rel="apple-touch-icon" sizes="57x57" href="logo/apple-touch-icon-57x57.png?v=190925022706">
		<link rel="apple-touch-icon" sizes="60x60" href="logo/apple-touch-icon-60x60.png?v=190925022706">
		<link rel="apple-touch-icon" sizes="72x72" href="logo/apple-touch-icon-72x72.png?v=190925022706">
		<link rel="apple-touch-icon" sizes="76x76" href="logo/apple-touch-icon-76x76.png?v=190925022706">
		<link rel="apple-touch-icon" sizes="114x114" href="logo/apple-touch-icon-114x114.png?v=190925022706">
		<link rel="apple-touch-icon" sizes="120x120" href="logo/apple-touch-icon-120x120.png?v=190925022706">
		<link rel="apple-touch-icon" sizes="144x144" href="logo/apple-touch-icon-144x144.png?v=190925022706">
		<link rel="apple-touch-icon" sizes="152x152" href="logo/apple-touch-icon-152x152.png?v=190925022706">
		<link rel="apple-touch-icon" sizes="180x180" href="logo/apple-touch-icon-180x180.png?v=190925022706">
		<link rel="icon" type="image/png" href="logo/android-chrome-36x36.png?v=190925022706" sizes="36x36">
		<link rel="icon" type="image/png" href="logo/android-chrome-48x48.png?v=190925022706" sizes="48x48">
		<link rel="icon" type="image/png" href="logo/android-chrome-72x72.png?v=190925022706" sizes="72x72">
		<link rel="icon" type="image/png" href="logo/android-chrome-96x96.png?v=190925022706" sizes="96x96">
		<link rel="icon" type="image/png" href="logo/android-chrome-144x144.png?v=190925022706" sizes="144x144">
		<link rel="icon" type="image/png" href="logo/android-chrome-192x192.png?v=190925022706" sizes="192x192">
		<link rel="icon" type="image/png" href="logo/favicon-16x16.png?v=190925022706" sizes="16x16">
		<link rel="icon" type="image/png" href="logo/favicon-32x32.png?v=190925022706" sizes="32x32">
		<link rel="icon" type="image/png" href="logo/favicon-96x96.png?v=190925022706" sizes="96x96">
		<link rel="shortcut icon" type="image/x-icon" href="logo/favicon.ico?v=190925022706">
		<meta name="msapplication-TileImage" content="logo/mstile-150x150.png?v=190925022706">
		<meta name="msapplication-square70x70logo" content="logo/mstile-70x70.png?v=190925022706">
		<meta name="msapplication-square150x150logo" content="logo/mstile-150x150.png?v=190925022706">
		<meta name="msapplication-wide310x150logo" content="logo/mstile-310x150.png?v=190925022706">
		<meta name="msapplication-square310x310logo" content="logo/mstile-310x310.png?v=190925022706">
		<link href="logo/apple-touch-startup-image-320x460.png?v=190925022706" media="(device-width: 320px) and (device-height: 480px) and (-webkit-device-pixel-ratio: 1)" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-640x920.png?v=190925022706" media="(device-width: 320px) and (device-height: 480px) and (-webkit-device-pixel-ratio: 2)" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-640x1096.png?v=190925022706" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-748x1024.png?v=190925022706" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 1) and (orientation: landscape)" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-750x1024.png?v=190925022706" media="" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-750x1294.png?v=190925022706" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-768x1004.png?v=190925022706" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 1) and (orientation: portrait)" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-1182x2208.png?v=190925022706" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-1242x2148.png?v=190925022706" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-1496x2048.png?v=190925022706" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" rel="apple-touch-startup-image">
		<link href="logo/apple-touch-startup-image-1536x2008.png?v=190925022706" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" rel="apple-touch-startup-image">
		
		<link rel="stylesheet" type="text/css" href="fonts/opensans.css"/>
		<link rel="stylesheet" type="text/css" href="main.css">
		<style title="procedural_stylesheet"></style>
		
		<link rel="stylesheet" href="modules/leaflet.css"/>
	</head>
	<body class="dark">
		<div id="widgets"></div>
		<div id="add_menu"></div>
		<div id="popup_overlay"><div id="popup"></div></div>
		<div id="edit_overlay"></div>
		<div id="loading_overlay"><img loading="lazy" id="loading" src="icons/loading.png"></div>
        <div id="main">
            <div id="primary_menu" class="non_selectable">
				<div id="menu_storyline">Storyline</div><!--
				--><div id="menu_players">Players</div><!--
				--><div id="menu_game">Game</div><!--
				--><div id="menu_music">Music</div><!--
				--><div id="menu_settings">Settings</div>
			</div>
            <div id="secondary_menu" class="non_selectable"></div>
			<div id="tertiary_menu" class="non_selectable"></div>
            <div id="main_content"></div>
		</div>
		
		<!-- TODO: load dynamically
		<script src="modules/leaflet.js"></script>
		<script src="modules/dragscroll.min.js"></script> -->
        <script src="modules/socket.io.min.js"></script>
		<script src="modules/sortable.min.js"></script>
		
		<!-- The core Firebase JS SDK is always required and must be listed first -->
		<script src="https://www.gstatic.com/firebasejs/7.17.1/firebase-app.js"></script>

		<script src="https://www.gstatic.com/firebasejs/7.17.1/firebase-messaging.js"></script>

		<script>
		// Your web app's Firebase configuration
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
		</script>

		<script src="main.js"></script>
    </body>
</html>