<?php
class PlanetFactory {
    public function getInstance($name)
    {
        $ini_array = parse_ini_file('../data/'.$name.'.ini', true);
        $planet = new Planet($ini_array['properties']['name']);
        $planet->radius($ini_array['properties']['radius']);
        $planet->aphelion($ini_array['properties']['aphelion']);
        $planet->perihelion($ini_array['properties']['perihelion']);
        $planet->speed($ini_array['properties']['speed']);
        $planet->inclination($ini_array['properties']['inclination']);
        $planet->axial_tilt($ini_array['properties']['axial_tilt']);
        $planet->period($ini_array['properties']['period']);
        $planet->way($ini_array['properties']['way']);
        return $planet;
    }
}
?>