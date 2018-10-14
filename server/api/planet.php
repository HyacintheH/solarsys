<?php
require_once '../objects/Planet.php';
require_once '../objects/PlanetFactory.php';
if (!empty($_POST)) { 
    if (!empty($_POST['name'])) {
        $planetFactory = new PlanetFactory();
        $planet = $planetFactory->getInstance($_POST['name']);
        echo json_encode($planet, JSON_NUMERIC_CHECK);
    }
}
else
{
    echo "SERVER FAILED";
}

?>
