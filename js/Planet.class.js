import * as THREE from 'three';

export class Planet {
    constructor(data, params) {
        this.data = data;
        this.params = params;
        this.mesh = new THREE.Group();

        // Valeurs par défaut si absentes du JSON
        this.rotationSpeed = this.data.rotationSpeed || 0.005;

        // Angle de départ aléatoire sur l'orbite
        this.angle = Math.random() * Math.PI * 2;

        // Liste pour stocker les lunes de cette planète
        this.satellites = [];

        // 1. SURFACE
        this.createSurface();

        // 2. ATMOSPHÈRE (si définie dans le JSON)
        if (this.data.atmosphere) {
            this.createAtmosphere();
        }

        // 3. NUAGES (si définis dans le JSON)
        if (this.data.clouds) {
            this.createClouds();
        }

        // 4. ANNEAUX (si définis dans le JSON)
        if (this.data.rings) {
            this.createRings();
        }

        // 5. SATELLITES (Lunes)
        if (this.data.satellites) {
            this.createSatellites();
        }

        // Inclinaison de la planète (Axial Tilt)
        // Conversion Degrés -> Radians
        if (this.data.axial_tilt) {
            this.mesh.rotation.z = this.data.axial_tilt * (Math.PI / 180);
        }
    }

    createSurface() {
        const loader = new THREE.TextureLoader();

        // Calcul taille visuelle
        this.visualRadius = (this.data.radius * this.params.scale) / 1000;
        const geometry = new THREE.SphereGeometry(this.visualRadius, 64, 64);

        // Récupération des propriétés du matériau depuis le JSON (ou valeurs par défaut)
        const matProps = this.data.material || {};
        const roughness = matProps.roughness !== undefined ? matProps.roughness : 0.8;
        const metalness = matProps.metalness !== undefined ? matProps.metalness : 0.1;

        // --- MATÉRIAU 1 : RÉALISTE (Standard PBR) ---
        this.realisticMaterial = new THREE.MeshStandardMaterial({
            map: loader.load(`img/planisphere/${this.data.name}map.jpg`),
            bumpMap: loader.load(`img/planisphere/${this.data.name}bump.jpg`),
            bumpScale: 0.05,
            roughness: roughness,
            metalness: metalness,
        });

        // --- MATÉRIAU 2 : HIGHLIGHT (Basic sans ombres) ---
        this.highlightMaterial = new THREE.MeshBasicMaterial({
            map: this.realisticMaterial.map,
            color: 0x888888
        });

        this.surfaceMesh = new THREE.Mesh(geometry, this.realisticMaterial);
        this.surfaceMesh.castShadow = true;
        this.surfaceMesh.receiveShadow = true;

        this.mesh.add(this.surfaceMesh);
    }

    createAtmosphere() {
        const atmoData = this.data.atmosphere;

        // Géométrie un peu plus grande
        const geometry = new THREE.SphereGeometry(this.visualRadius + 0.2, 64, 64);

        // Conversion couleur string hex -> Three Color
        const color = new THREE.Color(parseInt(atmoData.color, 16));

        const material = new THREE.MeshPhongMaterial({
            color: color,
            transparent: true,
            opacity: atmoData.opacity || 0.3,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const atmosphere = new THREE.Mesh(geometry, material);
        this.mesh.add(atmosphere);
    }

    createClouds() {
        const cloudData = this.data.clouds;
        const loader = new THREE.TextureLoader();

        const geometry = new THREE.SphereGeometry(this.visualRadius + 0.05, 64, 64);

        const material = new THREE.MeshStandardMaterial({
            map: loader.load(`img/planisphere/${cloudData.map}`),
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

        const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128);

        const material = new THREE.MeshStandardMaterial({
            map: loader.load(`img/planisphere/${ringData.texture}`),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8,
            roughness: 0.5,
            metalness: 0.1
        });

        if (ringData.alphaMap) {
            material.alphaMap = loader.load(`img/planisphere/${ringData.alphaMap}`);
            material.alphaTest = 0.1;
        }

        const rings = new THREE.Mesh(geometry, material);
        // Les anneaux sont "à plat" par défaut, on les tourne pour correspondre au plan équatorial
        rings.rotation.x = -Math.PI / 2;
        rings.receiveShadow = true;
        rings.castShadow = true;

        this.mesh.add(rings);
    }

    createSatellites() {
        const loader = new THREE.TextureLoader();

        this.data.satellites.forEach(satData => {
            const pivot = new THREE.Group();

            const satRadius = (satData.radius * this.params.scale) / 1000;
            const geometry = new THREE.SphereGeometry(satRadius, 32, 32);

            // A. MATÉRIAU RÉALISTE (Standard)
            const realisticMaterial = new THREE.MeshStandardMaterial({
                map: loader.load(`img/planisphere/${satData.texture}`),
                bumpMap: satData.bumpMap ? loader.load(`img/planisphere/${satData.bumpMap}`) : null,
                bumpScale: 0.02,
                roughness: 0.9,
                metalness: 0.0
            });

            // B. MATÉRIAU HIGHLIGHT (Basic - sans ombres)
            // On le prépare tout de suite
            const highlightMaterial = new THREE.MeshBasicMaterial({
                map: realisticMaterial.map, // On reprend la même texture
                color: 0xbbbbbb // On tinte un peu en gris pour pas que ça flash trop
            });

            // On démarre avec le matériau réaliste
            const moonMesh = new THREE.Mesh(geometry, realisticMaterial);
            moonMesh.castShadow = true;
            moonMesh.receiveShadow = true;

            moonMesh.position.x = satData.distanceFromParent;

            pivot.add(moonMesh);
            pivot.rotation.z = 5 * (Math.PI / 180);

            this.mesh.add(pivot);

            // C. STOCKAGE
            // On stocke les deux matériaux dans l'objet satellite pour pouvoir changer plus tard
            this.satellites.push({
                pivot: pivot,
                mesh: moonMesh,
                data: satData,
                angle: Math.random() * Math.PI * 2,

                // On sauvegarde les références aux matériaux
                realisticMaterial: realisticMaterial,
                highlightMaterial: highlightMaterial
            });
        });
    }

    update() {
        // 1. POSITION (ORBITE)
        this.angle += this.data.speed * this.params.speed * 0.00001;
        const distanceVisual = (this.data.aphelion / 1000000) * this.params.distanceFactor;

        this.mesh.position.x = Math.cos(this.angle) * distanceVisual;
        this.mesh.position.z = Math.sin(this.angle) * distanceVisual;

        // 2. ROTATION PLANÈTE
        if (this.surfaceMesh) {
            this.surfaceMesh.rotation.y += this.rotationSpeed;
        }

        // 3. ROTATION NUAGES (Si existent)
        if (this.cloudsMesh && this.data.clouds) {
            // Vitesse spécifique définie dans le JSON, ou un peu plus vite par défaut
            const cloudSpeed = this.data.clouds.speed || (this.rotationSpeed * 1.2);
            this.cloudsMesh.rotation.y += cloudSpeed;
        }

        // 4. ANIMATION DES SATELLITES
        if (this.satellites.length > 0) {
            this.satellites.forEach(sat => {
                // A. Orbite autour de la planète (on fait tourner le pivot Y)
                sat.angle += sat.data.speed;
                sat.pivot.rotation.y = sat.angle;

                // B. Rotation de la lune sur elle-même
                // (Note: En vrai la Lune est "verrouillée" et montre toujours la même face,
                // mais pour l'effet visuel 3D, une lente rotation est sympa).
                sat.mesh.rotation.y += sat.data.rotationSpeed || 0.005;
            });
        }
    }

    toggleHighlight(isActive) {
        // 1. GESTION DE LA PLANÈTE PRINCIPALE
        if (this.surfaceMesh) {
            if (isActive) {
                this.surfaceMesh.material = this.highlightMaterial;
            } else {
                this.surfaceMesh.material = this.realisticMaterial;
            }
            this.surfaceMesh.material.needsUpdate = true;
        }

        // 2. GESTION DES SATELLITES (Lunes)
        if (this.satellites.length > 0) {
            this.satellites.forEach(sat => {
                if (isActive) {
                    // On passe la lune en mode "Lumière magique"
                    sat.mesh.material = sat.highlightMaterial;
                } else {
                    // On repasse en mode "Physique" (Ombres)
                    sat.mesh.material = sat.realisticMaterial;
                }
                sat.mesh.material.needsUpdate = true;
            });
        }
    }
}