import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Planet } from './Planet.class.js';

// --- CONFIGURATION ---
const planetsList = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

const SETTINGS = {
    speed: 5,
    scale: 1.5,   // (Avant c'était 0.5)
    distanceFactor: 4.5  // (Avant c'était 1.5)
};

let renderer, scene, camera, controls, sun;
let planetObjects = [];
let focusedPlanet = null;

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
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 100000);
    camera.position.set(0, 600, 2000);

    // 5. Lumières
    // const ambientLight = new THREE.AmbientLight(0x404040, 1);
    // scene.add(ambientLight);
    const sunLight = new THREE.PointLight(0xffffff, 3, 5000);
    scene.add(sunLight);

    // 6. Monde
    createStarfield();
    createSun();
    loadPlanets();

    // 7. Contrôles : On permet d'aller voir Pluton qui est maintenant très loin
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // On augmente la distance max de zoom (de 5000 à 20000)
    controls.maxDistance = 20000;

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
    const sunLight = new THREE.PointLight(0xffffff, 500000, 0);

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
    const geometry = new THREE.SphereGeometry(10000, 64, 64);
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
        })
        .catch(err => console.error("Erreur chargement JSON:", err));
}

function focusOnPlanet(planet) {
    // Si on avait déjà une planète active différente, on l'éteint d'abord
    if (focusedPlanet && focusedPlanet !== planet) {
        focusedPlanet.toggleHighlight(false);
    }

    focusedPlanet = planet; // On stocke la nouvelle

    // 1. On allume la lumière "magique" sur la planète cible
    planet.toggleHighlight(true);

    // 3. Zoom automatique si besoin
    if (camera.position.distanceTo(planet.mesh.position) > 300) {
        // ...
    }
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
    camera.position.set(0, 600, 2000);
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
    });
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
    planetObjects.forEach(p => p.update());

    // Si une planète est sélectionnée, on centre la caméra dessus
    if (focusedPlanet) {
        controls.target.copy(focusedPlanet.mesh.position);
    }
    // Sinon (si focusedPlanet est null), OrbitControls fonctionne normalement autour du dernier target (0,0,0 après le reset)

    controls.update();
    renderer.render(scene, camera);
}

init();