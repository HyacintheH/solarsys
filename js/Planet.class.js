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
    }

    toggleHighlight(isActive) {
        if (!this.surfaceMesh) return;

        if (isActive) {
            this.surfaceMesh.material = this.highlightMaterial;
        } else {
            this.surfaceMesh.material = this.realisticMaterial;
        }
        this.surfaceMesh.material.needsUpdate = true;
    }
}