import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Planet } from "./Planet.class.js";

// --- CONFIGURATION ---
const planetsList = [
  "mercury",
  "venus",
  "earth",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

let isPaused = false; // Par défaut, ça tourne
let timeScale = 1.0; // Vitesse par défaut

let renderer, scene, camera, controls, sun;
let planetObjects = [];
let focusedPlanet = null;
// Liste pour stocker les infos de mouvement de chaque astéroïde
let asteroidData = [];
let kuiperBelt;

let labels = []; // Liste des objets { elementHTML, objet3D, offset }
let showLabels = false; // État du toggle

const SETTINGS = {
  globalSpeed: 1.5, // Vitesse globale de l'animation
  planetScale: 1.5, // Taille des planètes
  distanceSpread: 800, // Écartement entre les planètes (Facteur d'échelle log)
  sunRadius: 300, // Taille visuelle du Soleil (pour l'offset)
};

const SCALING_SYSTEM = {
  // 1. ÉCHELLE DE TAILLE (Rayon)
  // On garde une échelle linéaire pour les tailles, avec un boost pour les petites
  radius: (km) => {
    const raw = (km / 1200) * SETTINGS.planetScale;
    // Petit hack visuel : si la planète est très petite (Mercure/Mars), on la grossit un peu
    // pour qu'elle reste visible à côté des géantes.
    return km < 4000 ? raw * 1.5 : raw;
  },

  // 2. ÉCHELLE DE DISTANCE (Logarithmique optimisée)
  distance: (km) => {
    if (km === 0) return 0; // Le Soleil

    // A. Conversion en Unités Astronomiques (1 UA = distance Terre-Soleil)
    // Cela rend les maths plus faciles : Terre = 1, Mercure = 0.39, Neptune = 30
    const au = km / 149600000;

    // B. Formule Logarithmique ajustée
    // Math.log(au + 1) : Le "+1" assure qu'on commence à 0.
    // On multiplie par distanceSpread pour étaler.
    // On ajoute sunRadius * 1.5 pour commencer APRÈS la surface du soleil + marge.

    // Astuce : On utilise la racine carrée du log pour pousser encore plus les planètes proches
    const logDistance = Math.log(au * 10 + 1) * 3;

    return SETTINGS.sunRadius * 1.5 + logDistance * SETTINGS.distanceSpread;
  },

  // 3. ÉCHELLE DE DISTANCE SATELLITES (Linéaire locale)
  satelliteDistance: (km) => {
    // On augmente un peu la distance des lunes pour éviter qu'elles rentrent dans la planète
    return km / 3000 + 5;
  },

  // 4. ÉCHELLE DE TEMPS (Vitesse d'orbite adoucie)
  orbitalSpeed: (days) => {
    // Problème précédent : 1/88 (Mercure) vs 1/60000 (Neptune) = rapport trop violent.
    // Solution : Utiliser la racine carrée (Math.sqrt) ou cubique pour lisser les écarts.
    // Mercure restera plus rapide, mais pas "trop" rapide.
    return ((100 / Math.sqrt(days)) * 0.005 * SETTINGS.globalSpeed) / 100;
  },

  // 5. ÉCHELLE DE ROTATION (Vitesse sur soi-même)
  rotationSpeed: (hours) => {
    // On évite la division par zéro ou les valeurs négatives bizarres (Vénus)
    const h = Math.abs(hours);
    if (h === 0) return 0;
    return (24 / h) * 0.005;
  },
};

// ... Dans loadPlanets, on injecte ce système ...
function loadPlanets() {
  fetch("data/planets.json")
    .then((res) => res.json())
    .then((data) => {
      data.planets.forEach((rawPlanetData) => {
        // On passe les données BRUTES + le système de conversion à la classe
        const planet = new Planet(rawPlanetData, SCALING_SYSTEM);
        planetObjects.push(planet);
        scene.add(planet.mesh);

        scene.add(planet.orbitLine);

        // Si c'est le soleil, on le stocke dans la variable globale 'sun'
        if (rawPlanetData.name === "sun") sun = planet.mesh;
      });
      createLabels();
    });
}

function init() {
  // 1. Récupération du conteneur "world" (la zone de droite)
  const container = document.getElementById("world");

  // 2. Rendu
  renderer = new THREE.WebGLRenderer({ antialias: true });

  // IMPORTANT : On utilise les dimensions du conteneur, pas de la fenêtre
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.appendChild(renderer.domElement);

  // 3. Scène
  scene = new THREE.Scene();

  // 4. Caméra
  // IMPORTANT : L'aspect ratio dépend aussi du conteneur
  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    1,
    500000
  );
  camera.position.set(0, 2000, 6000);

  // 5. Lumières
  // const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Lumière blanche à 60%
  // scene.add(ambientLight);

  // Le Soleil reste tel quel
  const sunLight = new THREE.PointLight(0xffffff, 3, 5000); // Garde ça
  scene.add(sunLight);

  // 6. Monde
  createStarfield();
  createSun();
  loadPlanets();
  createKuiperBelt();

  // 7. Contrôles : On permet d'aller voir Pluton qui est maintenant très loin
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // On augmente la distance max de zoom (de 5000 à 20000)
  controls.maxDistance = 100000;

  // 8. UI & Events
  setupUI();
  window.addEventListener("resize", onWindowResize);

  animate();
}

function createSun() {
  const loader = new THREE.TextureLoader();
  const texture = loader.load("img/planisphere/sunmap.jpg");

  // 1. LE SOLEIL GÉANT
  // Rayon passé de 80 à 300
  const geometry = new THREE.SphereGeometry(300, 64, 64);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
  });
  sun = new THREE.Mesh(geometry, material);
  scene.add(sun);

  // 2. LA LUMIÈRE (Doit aller plus loin)
  // On augmente l'intensité car les planètes sont plus loin
  const sunLight = new THREE.PointLight(0xffffff, 3000000, 0);

  // Configuration des ombres pour le soleil géant
  sunLight.castShadow = true;
  sunLight.shadow.bias = -0.0001;
  sun.add(sunLight);

  // 3. LE HALO (Doit être proportionnel au soleil)
  const textureGlow = loader.load(
    "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/glow.png"
  );
  const spriteMaterial = new THREE.SpriteMaterial({
    map: textureGlow,
    color: 0xffaa00,
    transparent: true,
    opacity: 0.5, // Un peu plus subtil car très grand
    blending: THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(spriteMaterial);

  // Le sprite doit être plus grand que le soleil (300 * 3 ou 4)
  sprite.scale.set(1000, 1000, 1);
  sun.add(sprite);
}

function createStarfield() {
  const loader = new THREE.TextureLoader();
  const geometry = new THREE.SphereGeometry(200000, 64, 64);
  const material = new THREE.MeshBasicMaterial({
    map: loader.load("img/galaxy_starfield.png"),
    side: THREE.BackSide,
  });
  const starfield = new THREE.Mesh(geometry, material);
  scene.add(starfield);
}

function createKuiperBelt() {
  const count = 15000;

  // --- CORRECTION ECHELLE ---
  // La ceinture de Kuiper commence après Neptune (~4.5 milliards km)
  // et s'étend jusqu'à environ 50 UA (~7.5 milliards km)
  const startKm = 5000000000;
  // On réduit l'écart pour avoir une bande étroite.
  const endKm = 6000000000;

  const innerRadius = SCALING_SYSTEM.distance(startKm);
  const outerRadius = SCALING_SYSTEM.distance(endKm);

  // On garde une géométrie simple
  const geometry = new THREE.DodecahedronGeometry(2, 0);

  const loader = new THREE.TextureLoader();
  const rockTexture = loader.load("img/asteroid.jpg");

  // --- LE SECRET DE LA TEXTURE VISIBLE ---
  const material = new THREE.MeshStandardMaterial({
    map: rockTexture, // La texture de base

    // ASTUCE : On utilise la texture COMME source de lumière.
    // Ainsi, les détails de la roche "brillent" faiblement.
    emissiveMap: rockTexture,
    emissive: 0xffffff, // Couleur de l'émission (blanc = couleur d'origine de la texture)
    emissiveIntensity: 0.8, // Faible, juste pour déboucher les ombres

    roughness: 0.8,
    metalness: 0.2,
    color: 0xaaaaaa, // Couleur de base légèrement grisée
  });

  kuiperBelt = new THREE.InstancedMesh(geometry, material, count);
  kuiperBelt.castShadow = true;
  kuiperBelt.receiveShadow = true;

  asteroidData = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random();
    const radius = innerRadius + r * (outerRadius - innerRadius);
    const y = (Math.random() - 0.5) * (radius * 0.02);

    dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);

    dummy.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    const scale = 0.5 + Math.random() * 2.5;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();

    kuiperBelt.setMatrixAt(i, dummy.matrix);

    // --- VARIATION DE COULEUR ---
    // Pour casser l'aspect "uniforme", on teinte chaque caillou légèrement différemment.
    // On varie du gris foncé au gris clair/brunâtre.
    const grayLevel = 0.5 + Math.random() * 0.5; // Entre 0.5 et 1.0
    color.setRGB(grayLevel, grayLevel * 0.9, grayLevel * 0.8); // Légère teinte brune/terreuse
    kuiperBelt.setColorAt(i, color);

    asteroidData.push({
      id: i,
      dummy: dummy.clone(),
      rotationSpeed: {
        x: (Math.random() - 0.5) * 0.02, // Un peu plus rapide pour voir le mouvement
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.02,
      },
    });
  }

  kuiperBelt.instanceMatrix.needsUpdate = true;
  // IMPORTANT : Il faut dire à Three.js que les couleurs ont changé
  kuiperBelt.instanceColor.needsUpdate = true;

  scene.add(kuiperBelt);
}

function createLabels() {
  const container = document.getElementById("world");

  // --- Fonction Helper Interne ---
  // Ajout du paramètre 'isSatellite' pour le style CSS
  function addLabel(name, object3D, radiusOffset = 0, isSatellite = false) {
    // Sécurité : si l'objet 3D n'existe pas, on annule
    if (!object3D) return;

    const div = document.createElement("div");

    // On garde la classe de base, et on ajoute la classe spécifique si c'est une lune
    div.className = "planet-label";
    if (isSatellite) {
      div.classList.add("satellite-label");
    }

    // Capitalisation du nom (ex: "lune" -> "Lune")
    div.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    container.appendChild(div);

    // On stocke le label pour la boucle d'animation
    labels.push({
      element: div,
      mesh: object3D,
      offsetY: radiusOffset,
    });
  }

  // --- Labels Planètes ET Satellites ---
  planetObjects.forEach((p) => {
    // Sécurité : on vérifie que la planète et ses données existent
    if (!p || !p.data || !p.mesh) return;

    // A. Label de la planète
    // radiusOffset = rayon visuel + marge (ex: 50km)
    addLabel(p.data.name, p.mesh, p.visualRadius + 50);

    // B. Labels des Satellites
    if (p.satellites && p.satellites.length > 0) {
      p.satellites.forEach((sat) => {
        // SÉCURITÉ CRITIQUE : on vérifie que sat.data existe grâce à l'Étape 1
        if (sat && sat.data && sat.mesh) {
          // On passe 'true' en 4ème argument pour activer le style satellite
          // Offset réduit (30) pour les lunes
          addLabel(sat.data.name, sat.mesh, 30, true);
        }
      });
    }
  });

  // --- Label Ceinture de Kuiper ---
  if (typeof kuiperBelt !== "undefined" && kuiperBelt) {
    const dummyLabelPoint = new THREE.Object3D();

    // On calcule la position visuelle idéale (au milieu de la ceinture)
    // 6 milliards de km = milieu approximatif
    const labelDistance = SCALING_SYSTEM.distance(5500000000);

    dummyLabelPoint.position.set(labelDistance, 0, 0);
    kuiperBelt.add(dummyLabelPoint);

    addLabel("Kuiper Belt", dummyLabelPoint, 500); // 500 = petite marge au dessus
  }
}

function updateLabelsPosition() {
  // Si désactivé, on ne calcule rien pour économiser le CPU
  if (!showLabels) return;

  // Pour projeter les coordonnées
  const tempV = new THREE.Vector3();
  const container = document.getElementById("world");
  const width = container.clientWidth;
  const height = container.clientHeight;

  labels.forEach((item) => {
    // 1. Récupérer la position globale de l'objet 3D
    // (Nécessaire car les planètes sont dans des groupes ou tournent)
    item.mesh.updateWorldMatrix(true, false);
    item.mesh.getWorldPosition(tempV);

    // 2. Ajouter l'offset (pour que le texte flotte au-dessus, pas dedans)
    tempV.y += item.offsetY;

    // 3. Projection 3D -> 2D (Coordonnées normalisées entre -1 et 1)
    tempV.project(camera);

    // 4. Vérifier si l'objet est devant la caméra
    // (z < 1 signifie qu'il est devant le plan de clipping arrière)
    if (Math.abs(tempV.z) < 1) {
      // Conversion en pixels CSS
      const x = (tempV.x * 0.5 + 0.5) * width;
      const y = (tempV.y * -0.5 + 0.5) * height;

      // Application au DOM
      item.element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      item.element.style.display = "block";
    } else {
      // Si c'est derrière la caméra, on cache
      item.element.style.display = "none";
    }
  });
}

function animateAsteroids() {
  if (!kuiperBelt || asteroidData.length === 0) return;

  // On parcourt chaque astéroïde
  asteroidData.forEach((data) => {
    // 1. On applique la petite rotation individuelle
    data.dummy.rotation.x += data.rotationSpeed.x * timeScale;
    data.dummy.rotation.y += data.rotationSpeed.y * timeScale;
    data.dummy.rotation.z += data.rotationSpeed.z * timeScale;

    // 2. On met à jour sa matrice mathématique
    data.dummy.updateMatrix();

    // 3. On injecte la nouvelle matrice dans l'InstancedMesh global
    kuiperBelt.setMatrixAt(data.id, data.dummy.matrix);
  });

  // IMPORTANT : Dire à Three.js que les positions ont changé
  kuiperBelt.instanceMatrix.needsUpdate = true;

  // Rotation globale de la ceinture (l'orbite autour du soleil)
  kuiperBelt.rotation.y += 0.0001;
}

function focusOnPlanet(planet) {
  // 1. Gestion du highlight (comme avant)
  if (focusedPlanet && focusedPlanet !== planet) {
    focusedPlanet.toggleHighlight(false);
  }
  focusedPlanet = planet;
  planet.toggleHighlight(true);

  // 2. CALCUL DU ZOOM IDÉAL
  // On veut se placer à une distance proportionnelle au rayon visuel de la planète.
  // Facteur 4 = La planète prend une belle place à l'écran.
  // Facteur 5 ou 6 pour Saturne à cause des anneaux larges.
  let zoomFactor = 20.0;

  // On récupère le rayon visuel stocké dans l'objet Planet
  // (Si tu ne l'as pas accessible, tu peux le recalculer : (planet.data.radius * SETTINGS.scale) / 1000)
  const targetDistance = planet.visualRadius * zoomFactor;

  // 3. DÉPLACEMENT DE LA CAMÉRA
  // On veut garder l'angle actuel de la caméra par rapport à la planète pour ne pas désorienter l'utilisateur.
  // On calcule le vecteur : Direction = (PositionCaméra - PositionPlanète)
  const offset = new THREE.Vector3()
    .subVectors(camera.position, planet.mesh.position)
    .normalize() // On le réduit à une longueur de 1
    .multiplyScalar(targetDistance); // On l'étire à la distance voulue

  // La nouvelle position est : CentrePlanète + Offset calculé
  const newPosition = new THREE.Vector3()
    .copy(planet.mesh.position)
    .add(offset);

  // On applique la nouvelle position (Téléportation)
  camera.position.copy(newPosition);

  // 4. MISE A JOUR DES CONTRÔLES
  // On dit aux contrôles que le centre de rotation est maintenant la planète
  controls.target.copy(planet.mesh.position);
  controls.update();
}

function resetView() {
  // 1. IMPORTANT : On éteint la lumière de la planète qu'on quitte
  if (focusedPlanet) {
    focusedPlanet.toggleHighlight(false);
  }

  focusedPlanet = null;

  // 2. UI Reset
  document
    .querySelectorAll(".planet-btn")
    .forEach((btn) => btn.classList.remove("active"));

  // 3. Caméra Reset
  camera.position.set(0, 2000, 6000);
  controls.target.set(0, 0, 0);
  controls.update();
}

// --- CONFIGURATION DE L'INTERFACE (UI) ---
function setupUI() {
  const menuContainer = document.getElementById("planet-menu");
  menuContainer.innerHTML = ""; // On nettoie

  planetsList.forEach((name) => {
    const img = document.createElement("img");
    img.src = `img/btn/${name}.jpg`;
    img.className = "planet-btn";
    img.alt = name;
    img.title = name.charAt(0).toUpperCase() + name.slice(1);

    img.addEventListener("click", (e) => {
      // VÉRIFICATION : Est-ce qu'on clique sur la planète déjà sélectionnée ?
      // On vérifie si une planète est focus ET si son nom correspond au bouton cliqué
      const isAlreadyActive = focusedPlanet && focusedPlanet.data.name === name;

      if (isAlreadyActive) {
        // CAS 1 : C'est déjà la planète active -> On DÉSACTIVE tout (Reset)
        resetView();
      } else {
        // CAS 2 : C'est une nouvelle planète -> On ACTIVE celle-ci

        // 1. On nettoie les anciens boutons actifs
        document
          .querySelectorAll(".planet-btn")
          .forEach((btn) => btn.classList.remove("active"));

        // 2. On active visuellement le bouton cliqué
        e.target.classList.add("active");

        // 3. On cherche l'objet 3D et on focus dessus
        const foundPlanet = planetObjects.find((p) => p.data.name === name);
        if (foundPlanet) {
          focusOnPlanet(foundPlanet);
        }
      }
    });

    menuContainer.appendChild(img);
  });

  // --- SÉPARATEUR ET BOUTON LÉGENDE ---

  // 1. Le séparateur horizontal
  const hr = document.createElement("hr");
  hr.className = "menu-separator";
  menuContainer.appendChild(hr);

  // 2. Le bouton Toggle Légende
  const btnLegend = document.createElement("img");
  btnLegend.src = "img/btn/btn-legend.png"; // Ton image
  btnLegend.id = "btn-toggle-legend";
  btnLegend.title = "Afficher/Masquer les noms";

  btnLegend.addEventListener("click", () => {
    showLabels = !showLabels; // On inverse l'état
    btnLegend.classList.toggle("active"); // Style visuel du bouton

    // On met à jour la visibilité CSS immédiate
    const allLabels = document.querySelectorAll(".planet-label");
    allLabels.forEach((lbl) => {
      if (showLabels) lbl.classList.add("visible");
      else lbl.classList.remove("visible");
    });

    planetObjects.forEach((p) => {
      // On active/désactive le traçage pour chaque planète
      p.toggleOrbit(showLabels);
    });
  });

  menuContainer.appendChild(btnLegend);

  // --- GESTION DES CRÉDITS ---
  const btnCredits = document.getElementById("btn-credits");
  const modal = document.getElementById("credits-modal");
  const btnClose = document.getElementById("close-credits");

  // Ouvrir
  if (btnCredits) {
    btnCredits.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });
  }

  // Fermer avec le bouton
  if (btnClose) {
    btnClose.addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  }

  // Fermer en cliquant en dehors de la boîte (sur le fond gris)
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.add("hidden");
      }
    });
  }

  // --- BOUTON PAUSE ---
  const btnPause = document.getElementById('btn-pause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      isPaused = !isPaused; // On inverse l'état

      // Mise à jour visuelle du bouton
      if (isPaused) {
        btnPause.textContent = "PLAY ▶";
        btnPause.style.color = "#ffaa00"; // Orange quand en pause
        btnPause.style.borderColor = "#ffaa00";
      } else {
        btnPause.textContent = "PAUSE ⏸";
        btnPause.style.color = "#00d2ff"; // Bleu quand ça tourne
        btnPause.style.borderColor = "rgba(0, 210, 255, 0.3)";
      }
    });
  }

  // --- SLIDER VITESSE ---
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');

  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      timeScale = parseFloat(e.target.value);
      // Mise à jour de l'affichage du texte
      speedValue.textContent = timeScale.toFixed(1);
    });
  }
}

function onWindowResize() {
  // IMPORTANT : On recalcule par rapport au conteneur #world
  const container = document.getElementById("world");

  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);

  // --- ZONE DE MOUVEMENT (Si le jeu tourne) ---
  if (!isPaused) {
    if (sun) sun.rotation.y += 0.001;

    animateAsteroids(timeScale);

    // 1. MEMORISER LA POSITION AVANT MOUVEMENT
    let oldFocusPos = new THREE.Vector3();
    if (focusedPlanet) {
      oldFocusPos.copy(focusedPlanet.mesh.position);
    }

    // 2. DÉPLACER LES PLANÈTES
    planetObjects.forEach((p) => p.update(timeScale));

    // 3. APPLIQUER LE DÉPLACEMENT À LA CAMÉRA (TOWING)
    if (focusedPlanet) {
      const newFocusPos = focusedPlanet.mesh.position;
      const delta = new THREE.Vector3().subVectors(newFocusPos, oldFocusPos);

      // On déplace la caméra exactement de la même distance que la planète
      camera.position.add(delta);
    }
  }

  // --- ZONE DE RENDU (Toujours active) ---

  updateLabelsPosition();

  // On s'assure que les contrôles orbitent toujours autour de la cible
  // (Important de le faire aussi en pause pour pouvoir tourner autour de la planète figée)
  if (focusedPlanet) {
    controls.target.copy(focusedPlanet.mesh.position);
  }

  controls.update();
  renderer.render(scene, camera);
}

init();
