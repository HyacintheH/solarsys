import * as THREE from 'three';

export class Planet {
    constructor(data, params) {
        this.data = data;
        this.params = params;
        this.mesh = new THREE.Group();

        // Angle de départ aléatoire
        this.angle = Math.random() * Math.PI * 2;

        // Création de la sphère principale
        this.createSurface();

        // Ajout d'une atmosphère (Halo) pour le style
        this.createAtmosphere();

        // Bonus : Des nuages pour la Terre
        if (this.data.name === 'earth') {
            this.createClouds();
        }

        if (this.data.rings) {
            this.createRings();
        }
    }

    createSurface() {
        const loader = new THREE.TextureLoader();
        this.visualRadius = (this.data.radius * this.params.scale) / 1000;
        const geometry = new THREE.SphereGeometry(this.visualRadius, 64, 64);

        // --- MATÉRIAU 1 : RÉALISTE (Standard PBR) ---
        // On stocke ce matériau dans 'this.realisticMaterial'
        this.realisticMaterial = new THREE.MeshStandardMaterial({
            map: loader.load(`img/planisphere/${this.data.name}map.jpg`),
            bumpMap: loader.load(`img/planisphere/${this.data.name}bump.jpg`),
            bumpScale: 0.05,
            roughness: this.isGasGiant(this.data.name) ? 0.4 : 0.8,
            metalness: 0.1,
        });

        // --- MATÉRIAU 2 : HIGHLIGHT (Basic sans ombres) ---
        // On le prépare maintenant. On réutilise la texture déjà chargée juste au-dessus.
        // MeshBasicMaterial n'est PAS affecté par la lumière.
        this.highlightMaterial = new THREE.MeshBasicMaterial({
            map: this.realisticMaterial.map // Astuce : on reprend la même texture
        });


        // Au départ, on applique le matériau réaliste
        this.surfaceMesh = new THREE.Mesh(geometry, this.realisticMaterial);

        this.surfaceMesh.castShadow = true;
        this.surfaceMesh.receiveShadow = true;

        this.mesh.add(this.surfaceMesh);
    }

    createAtmosphere() {
        // Création d'un "Glow" autour de la planète
        // On crée une sphère légèrement plus grande
        const geometry = new THREE.SphereGeometry(this.visualRadius + 0.2, 64, 64);

        // Couleur de l'atmosphère basée sur la planète (approximatif)
        const color = this.getAtmosphereColor(this.data.name);

        const material = new THREE.MeshPhongMaterial({
            color: color,
            transparent: true,
            opacity: 0.3,         // Transparence subtile
            side: THREE.BackSide, // Astuce : on rend l'intérieur visible pour faire un halo
            blending: THREE.AdditiveBlending, // Fusionne la lumière pour l'effet brillant
            depthWrite: false
        });

        const atmosphere = new THREE.Mesh(geometry, material);
        this.mesh.add(atmosphere);
    }

    createClouds() {
        const loader = new THREE.TextureLoader();
        // Sphère un tout petit peu plus grande que la surface
        const geometry = new THREE.SphereGeometry(this.visualRadius + 0.05, 64, 64);

        const material = new THREE.MeshStandardMaterial({
            map: loader.load('img/planisphere/earthcloudmap.jpg'), // Assure-toi d'avoir cette image
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });

        this.cloudsMesh = new THREE.Mesh(geometry, material);
        this.mesh.add(this.cloudsMesh);
    }

    createRings() {
        const ringData = this.data.rings;
        const loader = new THREE.TextureLoader();

        const scaleFactor = this.visualRadius / this.data.radius;
        const innerRadius = ringData.innerRadius * scaleFactor;
        const outerRadius = ringData.outerRadius * scaleFactor;

        const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128); // Plus de segments pour être lisse

        const material = new THREE.MeshStandardMaterial({ // Standard ici aussi pour réagir à la lumière
            map: loader.load(`img/planisphere/${ringData.texture}`),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
            roughness: 0.5,
            metalness: 0.1
        });

        // Si une alphaMap existe (pour la transparence des anneaux de Saturne)
        if (ringData.alphaMap) {
            material.alphaMap = loader.load(`img/planisphere/${ringData.alphaMap}`);
            material.alphaTest = 0.1; // Coupe les pixels trop transparents (évite les bugs visuels)
        }

        const rings = new THREE.Mesh(geometry, material);
        rings.rotation.x = -Math.PI / 2;
        rings.receiveShadow = true; // Les anneaux reçoivent l'ombre de la planète !
        rings.castShadow = true;    // Les anneaux projettent une ombre sur la planète !

        this.mesh.add(rings);
    }

    update() {
        // 1. ORBITE AUTOUR DU SOLEIL (Position)
        this.angle += this.data.speed * this.params.speed * 0.00001;
        const distanceVisual = (this.data.aphelion / 1000000) * this.params.distanceFactor;

        this.mesh.position.x = Math.cos(this.angle) * distanceVisual;
        this.mesh.position.z = Math.sin(this.angle) * distanceVisual;

        // 2. ROTATION SUR ELLE-MÊME (Jour/Nuit)
        // On définit une vitesse de base visible. 
        // Tu peux multiplier par une valeur dans data.rotationSpeed si tu as ça dans ton JSON.
        const rotationSpeed = 0.005;

        if (this.surfaceMesh) {
            this.surfaceMesh.rotation.y += rotationSpeed;
        }

        // 3. ROTATION DES NUAGES (Terre)
        // Les nuages tournent légèrement plus vite que la terre pour créer un effet de parallaxe
        if (this.cloudsMesh) {
            this.cloudsMesh.rotation.y += rotationSpeed * 1.2;
        }

        // 4. ROTATION DE L'ATMOSPHÈRE (Glow)
        // Elle doit suivre la planète
        // (Note : comme c'est une boule transparente unie, ça ne se voit pas trop, mais c'est techniquement correct)
        // Pour accéder à l'atmosphère si tu ne l'as pas stockée dans une variable :
        // On suppose que c'est un enfant du groupe. Mais visuellement, pas critique.

        // PETIT BONUS : INCLINAISON (AXIAL TILT)
        // Les planètes ne tournent pas droites comme des piquets. La Terre est penchée de 23°.
        // On l'applique une seule fois au mesh global, pas à chaque frame, 
        // mais on peut le forcer ici pour être sûr.
        // (Idéalement à mettre dans le constructor, mais ici ça marche aussi)
        this.mesh.rotation.z = 0.1; // Une légère inclinaison de tout le système (anneaux compris)
    }

    // --- Helpers pour le style ---

    isGasGiant(name) {
        return ['jupiter', 'saturn', 'uranus', 'neptune'].includes(name.toLowerCase());
    }

    getAtmosphereColor(name) {
        const colors = {
            'mercury': 0xaaaaaa, // Gris
            'venus': 0xffcc00,   // Jaune toxique
            'earth': 0x00aaff,   // Bleu atmosphère
            'mars': 0xff5500,    // Rouge poussière
            'jupiter': 0xffaa88, // Saumon
            'saturn': 0xffeeaa,  // Doré
            'uranus': 0x88ffff,  // Cyan
            'neptune': 0x4444ff, // Bleu profond
            'pluto': 0xaaaaaa
        };
        return colors[name.toLowerCase()] || 0xffffff;
    }

    toggleHighlight(isActive) {
        if (!this.surfaceMesh) return;

        if (isActive) {
            // MODE SÉLECTIONNÉ : On met le costume "Basic"
            // La planète montrera sa texture brute, sans ombres.
            this.surfaceMesh.material = this.highlightMaterial;
        } else {
            // MODE NORMAL : On remet le costume "Réaliste"
            // Les ombres du soleil reviennent.
            this.surfaceMesh.material = this.realisticMaterial;
        }

        // Parfois nécessaire pour dire à Three.js que ça a changé
        this.surfaceMesh.material.needsUpdate = true;
    }
}