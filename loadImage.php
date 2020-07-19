<?php
if(!isset($_GET["id"])){
	die("Error: Failed POST Request");
}
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
	$sql = "LOCK TABLES images READ;";
	if(!$conn->query($sql)) die("Error: " . $sql . "\n" . $conn->error);
	
	$sql = "SELECT type, data FROM images WHERE id = {$_GET["id"]};";
	$result = $conn->query($sql);
	if(!$result) die("Error: " . $sql . "\n" . $conn->error);

	if ($result->num_rows == 1) {
		$file = $result -> fetch_array(MYSQLI_ASSOC);
		$result -> free_result();
		header("Content-Type: {$file['type']}\n");
		header("Content-Disposition: inline\n");
		echo $file['data'];
	} else {
		echo "Error: Image not found";
	}

	$sql = "UNLOCK TABLES;";
	if(!$conn->query($sql)) die("Error: " . $sql . "\n" . $conn->error);
} finally {
	$conn->close();
}