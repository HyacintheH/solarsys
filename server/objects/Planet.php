<?php
class Planet {
    var $name;
    var $radius;
    var $aphelion;
    var $perihelion;
    var $speed;
    var $inclination;
    var $axial_tilt;
    var $period;
    var $way;
    
    function Planet($aName) {
        $this->name = $aName;
    }

    public function show() {
        echo $this->name;
    }

    public function radius($value) {
        $this->radius = $value;
    }

    public function aphelion($value) {
        $this->aphelion = $value;
    }

    public function perihelion($value) {
        $this->perihelion = $value;
    }

    public function speed($value) {
        $this->speed = $value;
    }

    public function inclination($value) {
        $this->inclination = $value;
    }

    public function axial_tilt($value) {
        $this->axial_tilt = $value;
    }

    public function period($value) {
        $this->period = $value;
    }

    public function way($value) {
        $this->way = $value;
    }
}
?>