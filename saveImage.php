<?php
if(!isset($_POST['tags']) or !isset($_FILES['file']['type']) or !isset($_FILES['file']['tmp_name'])){
	die("Error: Failed POST Request");
}


if(substr($_FILES['file']['type'], 0, 6) !== "image/") die("Error: Wrong file type ".$_FILES['file']['type']);

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
	$file_data = file_get_contents($_FILES['file']['tmp_name']);
	$sql = "INSERT INTO images (type, data, tags) VALUES ('{$_FILES['file']['type']}','{$conn->real_escape_string($file_data)}','{$_POST['tags']}')";
	if(!$conn->query($sql)) die("Error: " . $sql . "\n" . $conn->error);

	echo "Success:" . $conn->insert_id;
} finally {
	$conn->close();
}