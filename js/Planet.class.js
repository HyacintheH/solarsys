import * as THREE from "three";

export class Planet {
  constructor(data, scalingSystem) {
    this.data = data;
    this.scales = scalingSystem; // On stocke les outils de conversion
    this.mesh = new THREE.Group();

    // --- 1. CALCULS DES PROPRIÉTÉS VISUELLES ---

    // On force l'existence des propriétés critiques avant de calculer quoi que ce soit
    if (!this.data.radius_km || isNaN(this.data.radius_km)) {
      console.error(
        `❌ CRITICAL DATA ERROR: Radius missing for ${this.data.name}.`
      );
      this.data.radius_km = 1188; // Taille de Pluton par défaut
    }

    // On s'assure que distance_from_sun_km existe aussi pour éviter NaN sur la position
    if (isNaN(this.data.distance_from_sun_km)) {
      this.data.distance_from_sun_km = 5900000000;
    }

    // --- MAINTENANT ON CALCULE LES ÉCHELLES ---
    this.visualRadius = this.scales.radius(Number(this.data.radius_km));
    this.semiMajorAxisKm = Number(this.data.distance_from_sun_km);

    // EXTRA SAFETY: If scaling returns NaN (e.g. scale factor is 0/undefined)
    if (isNaN(this.visualRadius)) {
      console.error(
        `❌ SCALING ERROR: Visual radius is NaN for ${this.data.name}.`
      );
      this.visualRadius = 1; // Minimum safe visual size
    }

    // Distance au Soleil (ou au parent si c'est une lune)
    // Note: La position sera calculée dans update()
    this.orbitDistance = this.scales.distance(this.data.distance_from_sun_km);

    // Vitesses
    this.orbitSpeed = this.scales.orbitalSpeed(this.data.orbital_period_days);
    this.rotationSpeed = this.scales.rotationSpeed(
      this.data.rotation_period_hours
    );

    // --- CALCUL DE LA POSITION RÉELLE (AUJOURD'HUI) ---

    // 1. Définition de la date de référence (J2000 : 1er Janvier 2000 à midi)
    const J2000_TIMESTAMP = 946728000000;
    const now = new Date().getTime();

    // 2. Calcul du nombre de jours écoulés depuis J2000
    const daysSinceJ2000 = (now - J2000_TIMESTAMP) / (1000 * 60 * 60 * 24);

    // 3. Récupération de la position de départ (J2000) depuis le JSON
    // Si la donnée manque, on met 0 par défaut
    const startDeg = this.data.mean_anomaly_deg || Math.random() * 360;

    // 4. Calcul de l'angle actuel
    // Formule : Position Départ + (Nombre de tours effectués * 360)
    // Nombre de tours = Jours écoulés / Période orbitale
    const totalDegrees = startDeg + (daysSinceJ2000 / this.data.orbital_period_days) * 360;

    // 5. Conversion en Radians pour Three.js
    // On utilise le modulo (%) pour garder un angle propre, même si c'est pas obligatoire pour Math.cos
    this.angle = (totalDegrees % 360) * (Math.PI / 180);

    // Pour les satellites, on garde l'aléatoire car c'est moins critique visuellement
    // et on n'a pas les données précises dans le JSON
    this.satAngleOffset = Math.random() * Math.PI * 2;

    // Inclinaison (Axial Tilt)
    // Conversion Degrés -> Radians
    this.mesh.rotation.z = this.data.axial_tilt_deg * (Math.PI / 180);

    // On récupère l'excentricité (0 par défaut si non précisé, donc cercle)
    this.eccentricity = this.data.eccentricity || 0;

    // --- 2. CONSTRUCTION ---
    this.createSurface();

    // On vérifie les "Features" dans le JSON
    if (this.data.features) {
      if (this.data.features.atmosphere) this.createAtmosphere();
      if (this.data.features.clouds) this.createClouds();
      if (this.data.features.rings) this.createRings();
      if (this.data.features.emissive) this.makeEmissive(); // Pour le Soleil
    }

    // Satellites
    this.satellites = [];
    if (this.data.satellites) {
      this.createSatellites();
    }

    // --- 3. PRÉPARATION DE L'ORBITE (TRAÎNÉE) ---
    this.orbitPointsCount = 0;
    // On prévoit un buffer large (ex: 5000 points) pour faire un tour complet
    this.maxOrbitPoints = 10000;

    // Création de la géométrie vide
    const geometry = new THREE.BufferGeometry();
    // Tableau stockant les positions (x, y, z) * maxPoints
    const positions = new Float32Array(this.maxOrbitPoints * 3);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setDrawRange(0, 0); // Rien à dessiner au début

    // Matériau de la ligne (Gris discret, un peu transparent)
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.3,
      transparent: true,
    });

    this.orbitLine = new THREE.Line(geometry, material);

    // IMPORTANT : On ne l'ajoute pas à "this.mesh" (qui bouge),
    // mais on le laisse dispo pour l'ajouter à la scène principale.
    // On désactive le frustumCulled pour éviter que la ligne disparaisse sous certains angles
    this.orbitLine.frustumCulled = false;

    this.isTracing = false;
  }

  createSurface() {
    const loader = new THREE.TextureLoader();
    const geometry = new THREE.SphereGeometry(this.visualRadius, 64, 64);

    let material;

    // --- SAFEGUARD: Check if texture data exists ---
    // If this.data.texture is undefined, we use a placeholder "Error Material"
    if (!this.data.texture || !this.data.texture.map) {
      console.warn(
        `⚠️ Texture missing for: ${this.data.name || "Unknown Planet"}`
      );
      material = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        wireframe: true,
      });
    } else {
      // Normal Logic if texture exists
      const texturePath = `img/planisphere/${this.data.texture.map}`;

      if (this.data.type === "star") {
        material = new THREE.MeshBasicMaterial({
          map: loader.load(`img/planisphere/${this.data.texture.map}`),
          color: 0xffffff,
        });

        // --- CORRECTION LUMIÈRE ---
        // Paramètres : Couleur, Intensité, Distance Max, Decay (Atténuation)

        // 1. Intensité : 2 ou 3 (suffisant si le decay est à 0)
        // 2. Distance : 0 = Infini (la lumière porte jusqu'au bout de la scène)
        // 3. Decay : 0 = Pas d'atténuation physique. La lumière ne faiblit pas avec la distance.

        const sunLight = new THREE.PointLight(0xffffff, 2.5, 0, 0);

        sunLight.castShadow = true;

        // Optimisation des ombres (optionnel mais conseillé pour éviter les artefacts)
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.bias = -0.0001;

        this.mesh.add(sunLight);
      } else {
        const isGas =
          this.data.type === "gas_giant" || this.data.type === "ice_giant";

        material = new THREE.MeshLambertMaterial({
          map: loader.load(texturePath),
          // Lambert n'a pas de roughness/metalness, il réagit juste à la lumière
          // C'est souvent mieux pour les planètes si on n'a pas de normal maps complexes
        });

        // Check for bump map specifically
        if (this.data.texture.bump) {
          material.bumpMap = loader.load(
            `img/planisphere/${this.data.texture.bump}`
          );
          material.bumpScale = 0.05;
        }
      }
    }

    // Matériaux pour le Highlight
    this.realisticMaterial = material;
    this.highlightMaterial = new THREE.MeshBasicMaterial({
      // If the map exists use it, otherwise use grey color
      map: material.map || null,
      color: material.map ? 0xbbbbbb : 0x888888,
    });

    this.surfaceMesh = new THREE.Mesh(geometry, material);

    if (this.data.type !== "star") {
      this.surfaceMesh.castShadow = true;
      this.surfaceMesh.receiveShadow = true;
    }

    this.mesh.add(this.surfaceMesh);
  }

  createAtmosphere() {
    const params = this.data.features.atmosphere;
    const geometry = new THREE.SphereGeometry(this.visualRadius * 1.05, 64, 64);
    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(parseInt(params.color, 16)),
      transparent: true,
      opacity: params.opacity,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh.add(new THREE.Mesh(geometry, material));
  }

  createClouds() {
    const params = this.data.features.clouds;
    const loader = new THREE.TextureLoader();
    const geometry = new THREE.SphereGeometry(this.visualRadius * 1.02, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      map: loader.load(`img/planisphere/${params.map}`),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.cloudsMesh = new THREE.Mesh(geometry, material);
    this.mesh.add(this.cloudsMesh);
  }

  createRings() {
    const params = this.data.features.rings;
    const loader = new THREE.TextureLoader();

    // Conversion des rayons réels (km) avec l'échelle de rayon
    const inner = this.scales.radius(params.inner_radius_km);
    const outer = this.scales.radius(params.outer_radius_km);

    const geometry = new THREE.RingGeometry(inner, outer, 128);
    const material = new THREE.MeshStandardMaterial({
      map: loader.load(`img/planisphere/${params.map}`),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });

    if (params.alpha) {
      material.alphaMap = loader.load(`img/planisphere/${params.alpha}`);
      material.alphaTest = 0.1;
    }

    const rings = new THREE.Mesh(geometry, material);
    rings.rotation.x = -Math.PI / 2;
    rings.castShadow = true;
    rings.receiveShadow = true;
    this.mesh.add(rings);
  }

  makeEmissive() {
    // Safety check
    if (!this.surfaceMesh) return;

    const material = this.surfaceMesh.material;

    // Case 1: Standard Material (e.g., a planet with lava, city lights, or just slightly glowing)
    // We set the emissive property so the texture glows in the dark.
    if (material.isMeshStandardMaterial) {
      material.emissiveMap = material.map; // Use the texture as the emission map
      material.emissive = new THREE.Color(0xffffff); // White emission color (full brightness of the texture)
      material.emissiveIntensity = 1; // Strength of the glow
    }
  }

  createSatellites() {
    const loader = new THREE.TextureLoader();

    this.data.satellites.forEach((satData) => {
      // --- SÉCURITÉ 1 : Validation du Rayon ---
      let safeRadiusKm = satData.radius_km;
      if (!safeRadiusKm || isNaN(safeRadiusKm)) {
        console.warn(
          `⚠️ Satellite Radius missing for moon of ${this.data.name}. Defaulting to 200km.`
        );
        safeRadiusKm = 200; // Valeur par défaut
      }

      // --- SÉCURITÉ 2 : Validation de la Texture ---
      let mapTexture;
      if (satData.texture && satData.texture.map) {
        mapTexture = loader.load(`img/planisphere/${satData.texture.map}`);
      } else {
        console.warn(
          `⚠️ Satellite Texture missing for moon of ${this.data.name}. Using grey fallback.`
        );
        // Pas de texture = on laisse null, le matériau sera juste gris/blanc
        mapTexture = null;
      }

      // Pivot pour l'orbite
      const pivot = new THREE.Group();

      // Calculs via le système d'échelle
      let rad = this.scales.radius(safeRadiusKm);
      if (isNaN(rad)) rad = 0.5; // Ultime sécurité si l'échelle renvoie NaN

      const dist = this.scales.satelliteDistance(
        satData.distance_from_parent_km
      );

      const geo = new THREE.SphereGeometry(rad, 32, 32); // C'est ici que ça plantait (32 segments)

      const mat = new THREE.MeshStandardMaterial({
        map: mapTexture,
        color: mapTexture ? 0xffffff : 0x888888, // Gris si pas de texture
        roughness: 0.9,
      });

      // Matériaux Highlight/Realistic pour la lune aussi
      const highMat = new THREE.MeshBasicMaterial({
        map: mapTexture,
        color: mapTexture ? 0xbbbbbb : 0xff0000, // Rouge si pas de texture en mode highlight
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.x = dist;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      pivot.add(mesh);
      this.mesh.add(pivot);

      // Stockage pour update
      this.satellites.push({
        data: satData, // IMPORTANT : On stocke les data pour les Labels !
        pivot: pivot,
        mesh: mesh,
        angle: Math.random() * Math.PI * 2,
        speed: this.scales.orbitalSpeed(satData.orbital_period_days) * 10,
        rotSpeed: this.scales.rotationSpeed(
          satData.rotation_period_hours || 100
        ),
        realisticMaterial: mat,
        highlightMaterial: highMat,
      });
    });
  }

  // Dans Planet.class.js

  update(timeScale = 1) { // <--- Ajout du paramètre (1 par défaut)

    // 1. POSITION ORBITALE
    if (this.semiMajorAxisKm > 0) {
      // ... Calculs existants ...

      // Calcul de la vitesse instantanée (Kepler)
      // C'est ICI qu'on applique le multiplicateur du slider
      let currentSpeed = this.orbitSpeed;

      // Si on a l'effet Kepler (loi des aires)
      const a = this.orbitDistance; // ou semiMajorAxisKm selon ton code précédent
      // Attention : assure-toi d'utiliser les variables que tu as définies dans ton code final
      // Si tu utilises la version simple :
      // this.angle += this.orbitSpeed * timeScale;

      // Si tu utilises la version Kepler (Loi des aires) :
      // On recalcule le rayon actuel pour la physique
      const e = this.eccentricity;
      const r_visual = (this.semiMajorAxisKm * (1 - e * e)) / (1 + e * Math.cos(this.angle));
      // On convertit en visuel pour le calcul de proportion (ou on garde les proportions mathématiques)
      // Simplification : On applique timeScale à la vitesse de base calculée

      const instantSpeed = this.orbitSpeed * ((this.semiMajorAxisKm * this.semiMajorAxisKm) / (r_visual * r_visual)); // Si tu utilises r_visual, attention à l'échelle. 
      // LE PLUS SIMPLE ET SÛR :

      // Appliquer le facteur temps au résultat final de la vitesse
      // Si tu avais : this.angle += instantSpeed;
      // Cela devient :
      this.angle += instantSpeed * timeScale;

      // ... Recalcul de la position X/Z ...
      const finalRadius = (this.orbitDistance * (1 - e * e)) / (1 + e * Math.cos(this.angle)); // Si tu utilises orbitDistance (visuel)

      this.mesh.position.x = Math.cos(this.angle) * finalRadius;
      this.mesh.position.z = Math.sin(this.angle) * finalRadius;

      this.updateOrbit();
    }

    // 2. ROTATION SUR SOI-MÊME
    if (this.surfaceMesh) {
      // On accélère aussi la rotation jour/nuit
      this.surfaceMesh.rotation.y += this.rotationSpeed * timeScale;
    }

    // ... Nuages ...
    if (this.cloudsMesh) {
      this.cloudsMesh.rotation.y += (this.rotationSpeed * 1.2) * timeScale;
    }

    // 3. SATELLITES
    if (this.satellites.length > 0) {
      this.satellites.forEach(sat => {
        // On accélère l'orbite de la lune
        sat.angle += sat.speed * timeScale;
        sat.pivot.rotation.y = sat.angle;
        // On accélère la rotation de la lune
        sat.mesh.rotation.y += sat.rotSpeed * timeScale;
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
      this.satellites.forEach((sat) => {
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

  updateOrbit() {
    if (!this.isTracing) return;

    // Si on a rempli le buffer, on arrête de dessiner (ou on boucle, mais arrêter est plus simple)
    if (this.orbitPointsCount >= this.maxOrbitPoints) return;

    // On récupère la position actuelle dans le tableau
    const positions = this.orbitLine.geometry.attributes.position.array;

    // On ajoute x, y, z à l'index courant
    const index = this.orbitPointsCount * 3;
    positions[index] = this.mesh.position.x;
    positions[index + 1] = this.mesh.position.y;
    positions[index + 2] = this.mesh.position.z;

    this.orbitPointsCount++;

    // On dit à Three.js de dessiner jusqu'à ce point
    this.orbitLine.geometry.setDrawRange(0, this.orbitPointsCount);
    // On signale que les données ont changé
    this.orbitLine.geometry.attributes.position.needsUpdate = true;
  }

  // Méthode pour activer/désactiver le traçage
  toggleOrbit(isActive) {
    this.isTracing = isActive;

    if (isActive) {
      this.orbitLine.visible = true;
      // Optionnel : Si tu veux que ça reparte de zéro à chaque fois :
      // this.orbitPointsCount = 0;
      // this.orbitLine.geometry.setDrawRange(0, 0);

      // Si tu veux que ça reprenne là où c'était, ne fais rien ici.
      // Mais pour l'effet "se dessine au fur et à mesure", le reset est mieux :
      if (this.orbitPointsCount === 0) {
        // Premier démarrage ou reset
      }
    } else {
      this.orbitLine.visible = false;
      // On reset pour la prochaine fois
      this.orbitPointsCount = 0;
      this.orbitLine.geometry.setDrawRange(0, 0);
    }
  }
}
