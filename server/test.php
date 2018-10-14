<?php
    include_once('Planet.php');
    include_once('PlanetFactory.php');

    $planetFactory = new PlanetFactory();

    $planet = $planetFactory->getInstance("earth");

    $planet->show();
?>