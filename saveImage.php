<?php
if(!isset($_FILES['file']['type']) or !isset($_FILES['file']['tmp_name'])){
	die("Error: Failed POST Request");
}

$allowed_file_types = ['image/png', 'image/gif', 'image/jpg', 'image/jpeg', 'image/svg+xml'];
if(!(in_array($_FILES['file']['type'], $allowed_file_types))) die("Error: Wrong file type ".$_FILES['file']['type']);

$servername = "localhost";
$username = "pnp";
$password = "pnp";
$dbname = "pnp";

// Create connection
$conn = new mysqli($servername, $username, $password, $dbname);
// Check connection
if ($conn->connect_error) {
    die("Error: Connection failed: " . $conn->connect_error);
}

try{
	$sql = "LOCK TABLES images WRITE;";
	if(!$conn->query($sql)) die("Error: " . $sql . "\n" . $conn->error);
	
	$file_data = file_get_contents($_FILES['file']['tmp_name']);
	$sql = "INSERT INTO images (type, data) VALUES ('{$_FILES['file']['type']}','{$conn->real_escape_string($file_data)}')";
	if(!$conn->query($sql)) die("Error: " . $sql . "\n" . $conn->error);

	$sql = "UNLOCK TABLES;";
	if(!$conn->query($sql)) die("Error: " . $sql . "\n" . $conn->error);
	
	echo "Success";
} finally {
	$conn->close();
}
?>