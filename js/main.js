import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Planet } from './Planet.class.js';

// --- CONFIGURATION ---
const planetsList = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

const SETTINGS = {
    speed: 5,
    scale: 1.5,   // (Avant c'était 0.5)
    distanceFactor: 12  // (Avant c'était 1.5)
};

let renderer, scene, camera, controls, sun;
let planetObjects = [];
let focusedPlanet = null;
// Liste pour stocker les infos de mouvement de chaque astéroïde
let asteroidData = [];
let kuiperBelt;

let labels = []; // Liste des objets { elementHTML, objet3D, offset }
let showLabels = false; // État du toggle

function init() {
    // 1. Récupération du conteneur "world" (la zone de droite)
    const container = document.getElementById('world');

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
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 500000);
    camera.position.set(0, 2000, 6000);

    // 5. Lumières
    // const ambientLight = new THREE.AmbientLight(0x404040, 1);
    // scene.add(ambientLight);
    const sunLight = new THREE.PointLight(0xffffff, 3, 5000);
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
    window.addEventListener('resize', onWindowResize);

    animate();
}

function createSun() {
    const loader = new THREE.TextureLoader();
    const texture = loader.load('img/planisphere/sunmap.jpg');

    // 1. LE SOLEIL GÉANT
    // Rayon passé de 80 à 300
    const geometry = new THREE.SphereGeometry(300, 64, 64);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff
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
    const textureGlow = loader.load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/glow.png');
    const spriteMaterial = new THREE.SpriteMaterial({
        map: textureGlow,
        color: 0xffaa00,
        transparent: true,
        opacity: 0.5, // Un peu plus subtil car très grand
        blending: THREE.AdditiveBlending
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
        map: loader.load('img/galaxy_starfield.png'),
        side: THREE.BackSide
    });
    const starfield = new THREE.Mesh(geometry, material);
    scene.add(starfield);
}

function loadPlanets() {
    fetch('data/planets.json')
        .then(response => response.json())
        .then(data => {
            data.planets.forEach(planetData => {
                const planet = new Planet(planetData, SETTINGS);
                planetObjects.push(planet);
                scene.add(planet.mesh);
            });

            // --- AJOUT IMPORTANT ICI ---
            // On attend que les planètes soient chargées pour créer les étiquettes
            createLabels();
        })
        .catch(err => console.error("Erreur chargement JSON:", err));
}

function createKuiperBelt() {
    const count = 4000;
    // On garde les distances lointaines définies juste avant
    const innerRadius = 60000;
    const outerRadius = 90000;

    // 1. GÉOMÉTRIE PLUS GROSSE
    const geometry = new THREE.DodecahedronGeometry(20, 0);

    const loader = new THREE.TextureLoader();

    // 2. MATÉRIAU "AUTO-ÉCLAIRÉ"
    const material = new THREE.MeshStandardMaterial({
        map: loader.load('img/asteroid.jpg'),
        roughness: 0.8,
        metalness: 0.2,

        // ASTUCE VISIBILITÉ :
        // Emissive permet à l'objet d'émettre sa propre lumière faible.
        // 0x222222 = Gris très foncé (juste assez pour détacher du fond noir)
        // Si c'est encore trop sombre, essaie 0x444444
        emissive: 0x444444,
        emissiveIntensity: 2,

        // On force la couleur de base en blanc pour bien voir la texture
        color: 0xffffff
    });

    kuiperBelt = new THREE.InstancedMesh(geometry, material, count);
    kuiperBelt.castShadow = true;
    kuiperBelt.receiveShadow = true;

    asteroidData = [];
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
        // Position
        const angle = Math.random() * Math.PI * 2;
        const radius = innerRadius + Math.random() * (outerRadius - innerRadius);

        // On augmente aussi la dispersion en hauteur (Y) car l'anneau est plus grand
        const y = (Math.random() - 0.5) * 400;

        dummy.position.set(
            Math.cos(angle) * radius,
            y,
            Math.sin(angle) * radius
        );

        // Rotation
        dummy.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
        );

        // Échelle
        // On varie entre 0.8 et 2.5 fois la taille de base (qui est maintenant de 40)
        const scale = 0.8 + Math.random() * 1.7;
        dummy.scale.set(scale, scale, scale);

        dummy.updateMatrix();
        kuiperBelt.setMatrixAt(i, dummy.matrix);

        // Data pour l'animation
        asteroidData.push({
            id: i,
            dummy: dummy.clone(),
            rotationSpeed: {
                x: (Math.random() - 0.5) * 0.01,
                y: (Math.random() - 0.5) * 0.01,
                z: (Math.random() - 0.5) * 0.01
            }
        });
    }

    kuiperBelt.instanceMatrix.needsUpdate = true;
    scene.add(kuiperBelt);
}

function createLabels() {
    const container = document.getElementById('world');

    // Fonction utilitaire interne pour générer un label
    function addLabel(name, object3D, radiusOffset = 0) {
        const div = document.createElement('div');
        div.className = 'planet-label';
        div.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        container.appendChild(div);

        labels.push({
            element: div,
            mesh: object3D,
            // On décale le texte un peu au-dessus de l'objet (rayon + une marge fixe)
            offsetY: radiusOffset
        });
    }

    // 1. Label Soleil
    if (sun) addLabel("Soleil", sun, 400); // 300 (rayon) + 100 marge

    // 2. Labels Planètes
    planetObjects.forEach(p => {
        // p.mesh est le groupe, p.visualRadius est stocké dans l'objet Planet
        // On ajoute une marge proportionnelle à la taille
        addLabel(p.data.name, p.mesh, p.visualRadius + 50);
    });

    // 3. Label Ceinture de Kuiper
    // Astuce : La ceinture est un anneau entier. On va créer un objet invisible
    // qui tourne avec elle pour accrocher le texte dessus.
    if (kuiperBelt) {
        const dummyLabelPoint = new THREE.Object3D();
        // On le place sur le bord extérieur de la ceinture
        dummyLabelPoint.position.set(90000, 0, 0);
        kuiperBelt.add(dummyLabelPoint); // Il tournera avec la ceinture

        addLabel("Ceinture de Kuiper", dummyLabelPoint, 2000);
    }
}

function updateLabelsPosition() {
    // Si désactivé, on ne calcule rien pour économiser le CPU
    if (!showLabels) return;

    // Pour projeter les coordonnées
    const tempV = new THREE.Vector3();
    const container = document.getElementById('world');
    const width = container.clientWidth;
    const height = container.clientHeight;

    labels.forEach(item => {
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
            const x = (tempV.x * .5 + .5) * width;
            const y = (tempV.y * -.5 + .5) * height;

            // Application au DOM
            item.element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
            item.element.style.display = 'block';
        } else {
            // Si c'est derrière la caméra, on cache
            item.element.style.display = 'none';
        }
    });
}

function animateAsteroids() {
    if (!kuiperBelt || asteroidData.length === 0) return;

    // On parcourt chaque astéroïde
    asteroidData.forEach(data => {
        // 1. On applique la petite rotation individuelle
        data.dummy.rotation.x += data.rotationSpeed.x;
        data.dummy.rotation.y += data.rotationSpeed.y;
        data.dummy.rotation.z += data.rotationSpeed.z;

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
    let zoomFactor = 4.0;
    if (planet.data.name === 'saturn') zoomFactor = 6.0;

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
    const newPosition = new THREE.Vector3().copy(planet.mesh.position).add(offset);

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
    document.querySelectorAll('.planet-btn').forEach(btn => btn.classList.remove('active'));

    // 3. Caméra Reset
    camera.position.set(0, 2000, 6000);
    controls.target.set(0, 0, 0);
    controls.update();
}

// --- CONFIGURATION DE L'INTERFACE (UI) ---
function setupUI() {
    const menuContainer = document.getElementById('planet-menu');
    menuContainer.innerHTML = ''; // On nettoie

    planetsList.forEach(name => {
        const img = document.createElement('img');
        img.src = `img/btn/${name}.jpg`;
        img.className = 'planet-btn';
        img.alt = name;
        img.title = name.charAt(0).toUpperCase() + name.slice(1);

        img.addEventListener('click', (e) => {
            // VÉRIFICATION : Est-ce qu'on clique sur la planète déjà sélectionnée ?
            // On vérifie si une planète est focus ET si son nom correspond au bouton cliqué
            const isAlreadyActive = (focusedPlanet && focusedPlanet.data.name === name);

            if (isAlreadyActive) {
                // CAS 1 : C'est déjà la planète active -> On DÉSACTIVE tout (Reset)
                resetView();
            } else {
                // CAS 2 : C'est une nouvelle planète -> On ACTIVE celle-ci

                // 1. On nettoie les anciens boutons actifs
                document.querySelectorAll('.planet-btn').forEach(btn => btn.classList.remove('active'));

                // 2. On active visuellement le bouton cliqué
                e.target.classList.add('active');

                // 3. On cherche l'objet 3D et on focus dessus
                const foundPlanet = planetObjects.find(p => p.data.name === name);
                if (foundPlanet) {
                    focusOnPlanet(foundPlanet);
                }
            }
        });

        menuContainer.appendChild(img);
    });

    // --- AJOUT : SÉPARATEUR ET BOUTON LÉGENDE ---

    // 1. Le séparateur horizontal
    const hr = document.createElement('hr');
    hr.className = 'menu-separator';
    menuContainer.appendChild(hr);

    // 2. Le bouton Toggle Légende
    const btnLegend = document.createElement('img');
    btnLegend.src = 'img/btn/btn-legend.png'; // Ton image
    btnLegend.id = 'btn-toggle-legend';
    btnLegend.title = "Afficher/Masquer les noms";

    btnLegend.addEventListener('click', () => {
        showLabels = !showLabels; // On inverse l'état
        btnLegend.classList.toggle('active'); // Style visuel du bouton

        // On met à jour la visibilité CSS immédiate
        const allLabels = document.querySelectorAll('.planet-label');
        allLabels.forEach(lbl => {
            if (showLabels) lbl.classList.add('visible');
            else lbl.classList.remove('visible');
        });
    });

    menuContainer.appendChild(btnLegend);

    // --- GESTION DES CRÉDITS ---
    const btnCredits = document.getElementById('btn-credits');
    const modal = document.getElementById('credits-modal');
    const btnClose = document.getElementById('close-credits');

    // Ouvrir
    if (btnCredits) {
        btnCredits.addEventListener('click', () => {
            modal.classList.remove('hidden');
        });
    }

    // Fermer avec le bouton
    if (btnClose) {
        btnClose.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    // Fermer en cliquant en dehors de la boîte (sur le fond gris)
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }

}

function onWindowResize() {
    // IMPORTANT : On recalcule par rapport au conteneur #world
    const container = document.getElementById('world');

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);

    if (sun) sun.rotation.y += 0.001;

    animateAsteroids();

    planetObjects.forEach(p => p.update());

    updateLabelsPosition();

    // Si une planète est sélectionnée, on centre la caméra dessus
    if (focusedPlanet) {
        controls.target.copy(focusedPlanet.mesh.position);
    }
    // Sinon (si focusedPlanet est null), OrbitControls fonctionne normalement autour du dernier target (0,0,0 après le reset)

    controls.update();
    renderer.render(scene, camera);
}

init();