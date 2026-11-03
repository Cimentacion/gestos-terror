import * as THREE from './lib/three/three.module.js';
import { FilesetResolver, HandLandmarker } from './lib/mediapipe/vision_bundle.js';
import { Reconocedor, GESTOS } from './gestos.js';

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- textos de ayuda
const AYUDA = [
  ['llave', 'Girar llave', 'Pinza (pulgar con índice) o puño, y gira la muñeca como abriendo una puerta. Sin mover la mano de sitio.', 'Cerradura'],
  ['palanca', 'Tirar palanca', 'Puño cerrado y baja la mano despacio.', 'Palanca'],
  ['cuerda', 'Bajar cuerda', 'Pinza (pulgar con índice) y baja la mano.', 'Cuerda de la luz'],
  ['agarrar', 'Agarrar', 'Mano abierta y ciérrala en puño. Déjala quieta un momento.', 'Caja'],
  ['romper', 'Romper', 'Puño y golpe rápido hacia delante o de lado.', 'Ventana'],
];
const htmlAyuda = AYUDA.map(([, n, d, o]) => `<div><b>${n}</b> → ${o}<br>${d}</div>`).join('');
$('listaGestos1').innerHTML = htmlAyuda;
$('listaGestos2').innerHTML = htmlAyuda;

// ---------------------------------------------------------------- render y escena
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const ESCALA = 0.6; // resolución interna baja, estilo PS1 y más rendimiento
renderer.setPixelRatio(1);
$('juego').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 2.5, 9);

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 40);
camera.position.set(0, 1.6, 0);
camera.rotation.order = 'YXZ';
scene.add(camera);

function ajustarTamano() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(Math.round(w * ESCALA), Math.round(h * ESCALA), false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', ajustarTamano);
ajustarTamano();

// Texturas sucias generadas por código
function texturaRuido(base, variacion, tam = 64, rayas = false) {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  const g = c.getContext('2d');
  const img = g.createImageData(tam, tam);
  const [r, gg, b] = base;
  for (let i = 0; i < tam * tam; i++) {
    let v = (Math.random() - 0.5) * variacion;
    if (rayas && (i % tam) % 16 === 0) v -= 25;
    img.data[i * 4] = r + v; img.data[i * 4 + 1] = gg + v; img.data[i * 4 + 2] = b + v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // manchas
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(20,15,10,${0.1 + Math.random() * 0.2})`;
    g.beginPath(); g.arc(Math.random() * tam, Math.random() * tam, 3 + Math.random() * 10, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const texPared = texturaRuido([120, 112, 96], 30, 64, true); texPared.repeat.set(3, 1.5);
const texSuelo = texturaRuido([70, 60, 50], 35); texSuelo.repeat.set(4, 4);
const texTecho = texturaRuido([90, 88, 82], 20); texTecho.repeat.set(3, 3);
const texMadera = texturaRuido([90, 58, 34], 30, 32, true);
const texMetal = texturaRuido([95, 95, 100], 25, 32);

const mat = (opts) => new THREE.MeshLambertMaterial(opts);
const matPared = mat({ map: texPared });
const matMadera = mat({ map: texMadera });
const matMetal = mat({ map: texMetal });
const matOscuro = mat({ color: 0x151515 });

// Luces
const ambiente = new THREE.AmbientLight(0x2a3448, 0.6);
scene.add(ambiente);
const linterna = new THREE.SpotLight(0xffe2b8, 25, 9, 0.45, 0.65, 2);
camera.add(linterna);
camera.add(linterna.target);
linterna.target.position.set(0, -0.05, -1);
const luzBombilla = new THREE.PointLight(0xffd59a, 0, 12, 2);
luzBombilla.position.set(0.7, 2.62, -1.0);
scene.add(luzBombilla);
const luzAlarma = new THREE.PointLight(0xff1a10, 0, 9, 2);
luzAlarma.position.set(2.7, 2.6, 0.8);
scene.add(luzAlarma);
const luzLuna = new THREE.PointLight(0x6080ff, 3, 6, 2);
luzLuna.position.set(0, 1.7, 3.6);
scene.add(luzLuna);

// Habitación 6 x 3 x 6
const AN = 6, AL = 3;
function plano(w, h, material, pos, rot) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.copy(pos); m.rotation.set(...rot);
  scene.add(m); return m;
}
plano(AN, AN, mat({ map: texSuelo }), new THREE.Vector3(0, 0, 0), [-Math.PI / 2, 0, 0]);
plano(AN, AN, mat({ map: texTecho }), new THREE.Vector3(0, AL, 0), [Math.PI / 2, 0, 0]);
plano(AN, AL, matPared, new THREE.Vector3(3, AL / 2, 0), [0, -Math.PI / 2, 0]);   // este
plano(AN, AL, matPared, new THREE.Vector3(-3, AL / 2, 0), [0, Math.PI / 2, 0]);   // oeste

// Pared norte con hueco de puerta (x -0.5..0.5, y 0..2.1)
function caja(w, h, d, material, x, y, z, padre = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); padre.add(m); return m;
}
caja(2.5, AL, 0.1, matPared, -1.75, AL / 2, -3.05);
caja(2.5, AL, 0.1, matPared, 1.75, AL / 2, -3.05);
caja(1.0, AL - 2.1, 0.1, matPared, 0, 2.1 + (AL - 2.1) / 2, -3.05);
// Pared sur con hueco de ventana (x -0.7..0.7, y 1.0..2.2)
caja(2.3, AL, 0.1, matPared, -1.85, AL / 2, 3.05);
caja(2.3, AL, 0.1, matPared, 1.85, AL / 2, 3.05);
caja(1.4, 1.0, 0.1, matPared, 0, 0.5, 3.05);
caja(1.4, AL - 2.2, 0.1, matPared, 0, 2.2 + (AL - 2.2) / 2, 3.05);

// Material invisible para las zonas de apuntado
const matHit = new THREE.MeshBasicMaterial({ visible: false });
const objetos = [];
function zona(w, h, d, x, y, z) { const m = caja(w, h, d, matHit, x, y, z); return m; }

// ---------------------------------------------------------------- animaciones simples
const tweens = [];
function tween(dur, fn, fin) { tweens.push({ dur, t: 0, fn, fin }); }
const suave = k => k * k * (3 - 2 * k);

// ---------------------------------------------------------------- sonido sintetizado
let audio = null;
function iniciarAudio() {
  if (audio) return;
  audio = new (window.AudioContext || window.webkitAudioContext)();
  // zumbido de fondo
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'sine'; o.frequency.value = 48; g.gain.value = 0.05;
  o.connect(g).connect(audio.destination); o.start();
}
function tono(f, dur, tipo = 'square', vol = 0.15, fFin = null, retraso = 0) {
  if (!audio) return;
  const t0 = audio.currentTime + retraso;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = tipo; o.frequency.setValueAtTime(f, t0);
  if (fFin) o.frequency.exponentialRampToValueAtTime(fFin, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
function ruido(dur, vol = 0.3, frecFiltro = 2000, retraso = 0) {
  if (!audio) return;
  const t0 = audio.currentTime + retraso;
  const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * dur), audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = audio.createBufferSource(); s.buffer = buf;
  const f = audio.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = frecFiltro;
  const g = audio.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(audio.destination); s.start(t0);
}
const sonido = {
  error: () => { tono(140, 0.18, 'square', 0.08); tono(110, 0.2, 'square', 0.08, null, 0.1); },
  llave: () => { tono(1800, 0.04, 'square', 0.1); tono(1200, 0.05, 'square', 0.1, null, 0.12); ruido(0.08, 0.2, 3000, 0.1); },
  puerta: () => { tono(90, 1.4, 'sawtooth', 0.06, 140); tono(220, 1.2, 'sawtooth', 0.025, 180, 0.2); },
  palanca: () => { tono(70, 0.35, 'square', 0.2, 40); ruido(0.2, 0.25, 500); },
  alarma: () => { for (let i = 0; i < 4; i++) tono(660, 0.25, 'square', 0.06, 440, i * 0.5); },
  cuerda: () => { tono(2500, 0.03, 'square', 0.08); ruido(0.04, 0.2, 4000); },
  agarrar: () => { ruido(0.12, 0.2, 800); tono(300, 0.08, 'triangle', 0.1); },
  romper: () => { ruido(0.6, 0.5, 2500); for (let i = 0; i < 8; i++) tono(2000 + Math.random() * 3000, 0.15, 'sine', 0.05, null, Math.random() * 0.35); },
  susto: () => { tono(55, 2.0, 'sawtooth', 0.12, 45); tono(58, 2.0, 'sawtooth', 0.1, 47); },
};
function vibrar(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ---------------------------------------------------------------- OBJETO 1: puerta con cerradura (llave)
const puertaPivote = new THREE.Group();
puertaPivote.position.set(-0.5, 0, -3.0);
scene.add(puertaPivote);
caja(1.0, 2.1, 0.07, matMadera, 0.5, 1.05, 0, puertaPivote);
const placa = caja(0.08, 0.16, 0.02, matMetal, 0.85, 1.0, 0.045, puertaPivote);
const llave = new THREE.Group();
llave.position.set(0.85, 1.0, 0.06);
puertaPivote.add(llave);
caja(0.015, 0.015, 0.06, matMetal, 0, 0, 0.03, llave);
const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), mat({ color: 0xb08a3a }));
anillo.position.set(0, 0, 0.07); llave.add(anillo);
// marco
caja(0.08, 2.15, 0.14, matMadera, -0.54, 1.07, -3.0);
caja(0.08, 2.15, 0.14, matMadera, 0.54, 1.07, -3.0);
caja(1.16, 0.08, 0.14, matMadera, 0, 2.14, -3.0);
// detrás de la puerta: pasillo con luz roja y una figura
caja(1.2, 0.05, 3, matOscuro, 0, 0, -4.6);
caja(0.05, 2.2, 3, matOscuro, -0.6, 1.1, -4.6);
caja(0.05, 2.2, 3, matOscuro, 0.6, 1.1, -4.6);
const luzPasillo = new THREE.PointLight(0xff3020, 0, 5, 2);
luzPasillo.position.set(0, 2.0, -5.0); scene.add(luzPasillo);
const figura = new THREE.Group();
figura.position.set(0.1, 0, -5.2); scene.add(figura);
const matFigura = mat({ color: 0x050505 });
caja(0.4, 1.3, 0.22, matFigura, 0, 0.95, 0, figura);
const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), matFigura);
cabeza.position.set(0, 1.78, 0); cabeza.scale.set(1, 1.25, 1); figura.add(cabeza);
const ojoMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
caja(0.025, 0.012, 0.01, ojoMat, -0.05, 1.8, 0.13, figura);
caja(0.025, 0.012, 0.01, ojoMat, 0.05, 1.8, 0.13, figura);
figura.visible = false;

objetos.push({
  nombre: 'Cerradura', gesto: 'llave', hit: zona(1.1, 2.1, 0.4, 0, 1.05, -2.9),
  hecho: false,
  activar() {
    this.hecho = true;
    sonido.llave();
    tween(0.4, k => { llave.rotation.z = -suave(k) * Math.PI / 2; }, () => {
      sonido.puerta();
      figura.visible = true;
      luzPasillo.intensity = 4;
      tween(1.6, k => { puertaPivote.rotation.y = suave(k) * 1.75; }, () => {
        setTimeout(() => sonido.susto(), 300);
      });
    });
  },
  reset() { this.hecho = false; llave.rotation.z = 0; puertaPivote.rotation.y = 0; figura.visible = false; luzPasillo.intensity = 0; },
});

// ---------------------------------------------------------------- OBJETO 2: palanca (pared este)
caja(0.06, 0.5, 0.3, matMetal, 2.96, 1.3, 0.8);
const palancaPivote = new THREE.Group();
palancaPivote.position.set(2.9, 1.3, 0.8);
scene.add(palancaPivote);
const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), matMetal);
brazo.position.y = 0.225; palancaPivote.add(brazo);
const pomo = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat({ color: 0x8a1010 }));
pomo.position.y = 0.45; palancaPivote.add(pomo);
const ANG_ARRIBA = -0.5, ANG_ABAJO = -2.6;
palancaPivote.rotation.x = ANG_ARRIBA;
// piloto de alarma en la pared
const piloto = caja(0.1, 0.18, 0.18, mat({ color: 0x401010, emissive: 0x000000 }), 2.95, 2.6, 0.8);
let alarmaActiva = false;

objetos.push({
  nombre: 'Palanca', gesto: 'palanca', hit: zona(0.5, 1.0, 0.7, 2.8, 1.35, 0.8),
  hecho: false,
  activar() {
    this.hecho = true;
    sonido.palanca();
    tween(0.5, k => { palancaPivote.rotation.x = ANG_ARRIBA + (ANG_ABAJO - ANG_ARRIBA) * suave(k); }, () => {
      alarmaActiva = true; sonido.alarma();
    });
  },
  reset() { this.hecho = false; palancaPivote.rotation.x = ANG_ARRIBA; alarmaActiva = false; luzAlarma.intensity = 0; piloto.material.emissive.setHex(0); },
});

// ---------------------------------------------------------------- OBJETO 3: cuerda de la bombilla
const casquillo = caja(0.1, 0.12, 0.1, matOscuro, 0.7, 2.94, -1.0);
const bombillaMat = new THREE.MeshBasicMaterial({ color: 0x302820 });
const bombilla = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), bombillaMat);
bombilla.position.set(0.7, 2.82, -1.0); scene.add(bombilla);
const cuerda = new THREE.Group();
cuerda.position.set(0.78, 2.9, -1.0); scene.add(cuerda);
const hilo = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.0, 4), mat({ color: 0xc8c0a8 }));
hilo.position.y = -0.5; cuerda.add(hilo);
const tirador = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.06, 6), mat({ color: 0xd8d0b8 }));
tirador.position.y = -1.03; cuerda.add(tirador);
let luzEncendida = false;

objetos.push({
  nombre: 'Cuerda de la luz', gesto: 'cuerda', repetible: true, hit: zona(0.35, 1.2, 0.35, 0.78, 2.2, -1.0),
  hecho: false,
  activar() {
    sonido.cuerda();
    tween(0.35, k => { cuerda.position.y = 2.9 - Math.sin(k * Math.PI) * 0.12; });
    luzEncendida = !luzEncendida;
    luzBombilla.intensity = luzEncendida ? 40 : 0;
    bombillaMat.color.setHex(luzEncendida ? 0xfff0c0 : 0x302820);
  },
  reset() { luzEncendida = false; luzBombilla.intensity = 0; bombillaMat.color.setHex(0x302820); cuerda.position.y = 2.9; },
});

// ---------------------------------------------------------------- OBJETO 4: caja sobre una mesa (agarrar)
caja(0.9, 0.06, 0.6, matMadera, -2.5, 0.8, -0.5);
for (const [dx, dz] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) caja(0.05, 0.8, 0.05, matMadera, -2.5 + dx, 0.4, -0.5 + dz);
const cofre = new THREE.Group();
scene.add(cofre);
caja(0.3, 0.2, 0.22, mat({ color: 0x5a3a20 }), 0, 0, 0, cofre);
caja(0.31, 0.03, 0.23, matMetal, 0, 0.06, 0, cofre);
caja(0.04, 0.05, 0.02, mat({ color: 0xb08a3a }), 0, 0, 0.12, cofre);
const COFRE_MESA = new THREE.Vector3(-2.5, 0.93, -0.5);
cofre.position.copy(COFRE_MESA);

objetos.push({
  nombre: 'Caja', gesto: 'agarrar', hit: zona(0.6, 0.6, 0.6, -2.5, 1.0, -0.5),
  hecho: false,
  activar() {
    this.hecho = true;
    sonido.agarrar();
    const desde = cofre.getWorldPosition(new THREE.Vector3());
    const rotDesde = cofre.quaternion.clone();
    tween(0.5, k => {
      const destino = new THREE.Vector3(0.22, -0.28, -0.55).applyMatrix4(camera.matrixWorld);
      cofre.position.lerpVectors(desde, destino, suave(k));
      cofre.quaternion.slerpQuaternions(rotDesde, camera.quaternion, suave(k));
    }, () => {
      camera.add(cofre);
      cofre.position.set(0.22, -0.28, -0.55);
      cofre.rotation.set(0.2, -0.3, 0);
    });
  },
  reset() { this.hecho = false; scene.add(cofre); cofre.position.copy(COFRE_MESA); cofre.rotation.set(0, 0, 0); },
});

// ---------------------------------------------------------------- OBJETO 5: ventana (romper)
caja(1.5, 0.06, 0.16, matMadera, 0, 1.0, 3.0);
caja(1.5, 0.06, 0.16, matMadera, 0, 2.2, 3.0);
caja(0.06, 1.26, 0.16, matMadera, -0.72, 1.6, 3.0);
caja(0.06, 1.26, 0.16, matMadera, 0.72, 1.6, 3.0);
const cielo = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: 0x0a1028 }));
cielo.position.set(0, 1.6, 4.5); cielo.rotation.y = Math.PI; scene.add(cielo);
const luna = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), new THREE.MeshBasicMaterial({ color: 0xc8d0ff }));
luna.position.set(-0.6, 2.2, 4.45); luna.rotation.y = Math.PI; scene.add(luna);
const cristalMat = new THREE.MeshLambertMaterial({ color: 0x9fb8d0, transparent: true, opacity: 0.35, emissive: 0x0a1020 });
const cristal = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 1.14), cristalMat);
cristal.position.set(0, 1.6, 3.0); cristal.rotation.y = Math.PI; scene.add(cristal);

const trozos = [];
const trozoGeo = new THREE.BufferGeometry();
trozoGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.12, 0, 0, 0.03, 0.15, 0], 3));
trozoGeo.computeVertexNormals();
const trozoMat = new THREE.MeshLambertMaterial({ color: 0xb0c8e0, transparent: true, opacity: 0.6, side: THREE.DoubleSide });

objetos.push({
  nombre: 'Ventana', gesto: 'romper', hit: zona(1.5, 1.3, 0.4, 0, 1.6, 2.9),
  hecho: false,
  activar() {
    this.hecho = true;
    sonido.romper();
    cristal.visible = false;
    luzLuna.intensity = 8;
    for (let i = 0; i < 40; i++) {
      const t = new THREE.Mesh(trozoGeo, trozoMat);
      const s = 0.4 + Math.random();
      t.scale.set(s, s, s);
      t.position.set((Math.random() - 0.5) * 1.3, 1.05 + Math.random() * 1.1, 2.98);
      t.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      t.userData.v = new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, -(0.5 + Math.random() * 2.2));
      t.userData.w = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      scene.add(t); trozos.push(t);
    }
  },
  reset() {
    this.hecho = false; cristal.visible = true; luzLuna.intensity = 3;
    for (const t of trozos) scene.remove(t);
    trozos.length = 0;
  },
});

// ---------------------------------------------------------------- mirar arrastrando el dedo
let yaw = 0, pitch = 0, arrastre = null;
const el = renderer.domElement;
el.addEventListener('pointerdown', e => { arrastre = { x: e.clientX, y: e.clientY }; iniciarAudio(); });
addEventListener('pointermove', e => {
  if (!arrastre) return;
  yaw -= (e.clientX - arrastre.x) * 0.006;
  pitch -= (e.clientY - arrastre.y) * 0.006;
  pitch = Math.max(-1.25, Math.min(1.25, pitch));
  arrastre = { x: e.clientX, y: e.clientY };
});
addEventListener('pointerup', () => arrastre = null);
addEventListener('pointercancel', () => arrastre = null);

// ---------------------------------------------------------------- apuntar
const ray = new THREE.Raycaster();
ray.far = 6;
const centro = new THREE.Vector2(0, 0);
let objetivo = null;
function actualizarObjetivo() {
  ray.setFromCamera(centro, camera);
  const hits = ray.intersectObjects(objetos.map(o => o.hit), false);
  objetivo = hits.length ? objetos.find(o => o.hit === hits[0].object) : null;
  $('mira').classList.toggle('activa', !!objetivo);
  let txt = '';
  if (objetivo) {
    txt = objetivo.hecho && !objetivo.repetible ? `${objetivo.nombre} (hecho)` : `${objetivo.nombre} — gesto: ${GESTOS[objetivo.gesto]}`;
  }
  if ($('objetivoTxt').textContent !== txt) $('objetivoTxt').textContent = txt;
}

// ---------------------------------------------------------------- mensajes
let temporizadorMsg = null;
function mensaje(txt, clase = '') {
  const m = $('mensajeTxt');
  m.textContent = txt; m.className = clase; m.style.opacity = 1;
  clearTimeout(temporizadorMsg);
  temporizadorMsg = setTimeout(() => { m.style.opacity = 0; }, 1800);
}

let temporizadorGesto = null;
function alGesto(g) {
  $('gestoTxt').textContent = '» ' + GESTOS[g];
  clearTimeout(temporizadorGesto);
  temporizadorGesto = setTimeout(() => { $('gestoTxt').textContent = ''; }, 1500);

  const obj = objetivo;
  if (!obj) { mensaje(`${GESTOS[g]} — no apuntas a nada`); return; }
  if (obj.hecho && !obj.repetible) { mensaje(`${obj.nombre}: ya está hecho`); return; }
  if (obj.gesto !== g) {
    mensaje(`✗ "${GESTOS[g]}" no sirve con ${obj.nombre}`, 'mal');
    sonido.error(); vibrar(90);
    return;
  }
  obj.activar();
  vibrar(35);
  mensaje(`✓ ${obj.nombre}`, 'ok');
}

// ---------------------------------------------------------------- dibujo de la mano (sin imagen de cámara)
const CONEX = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const lienzo = $('lienzoMano'), ctx = lienzo.getContext('2d');
const NOMBRES_POSE = { ninguna: 'Sin mano', abierta: 'Mano abierta', puno: 'Puño', pinza: 'Pinza', otra: 'Mano (sin pose)' };
function dibujarMano(lm, pose, debug) {
  ctx.fillStyle = '#050506';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  if (lm) {
    const W = lienzo.width, H = lienzo.height;
    ctx.strokeStyle = pose === 'puno' ? '#ff9a5a' : pose === 'pinza' ? '#6ad0ff' : pose === 'abierta' ? '#9aff8a' : '#aaa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of CONEX) { ctx.moveTo(lm[a].x * W, lm[a].y * H); ctx.lineTo(lm[b].x * W, lm[b].y * H); }
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (const p of lm) ctx.fillRect(p.x * W - 1.5, p.y * H - 1.5, 3, 3);
  }
  const txt = NOMBRES_POSE[pose] || pose;
  if ($('poseTxt').textContent !== txt) $('poseTxt').textContent = txt;
  $('debugTxt').textContent = debug || '';
}

// ---------------------------------------------------------------- cámara + detector de manos
const video = $('video');
let stream = null, detector = null, flashOn = false, flashPosible = false;
const reco = new Reconocedor();

async function iniciarCamara() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Este dispositivo no permite usar la cámara.');
  const base = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...base, facingMode: { exact: 'environment' } } });
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw new Error('Has denegado el permiso de cámara.');
    // Para probar en PC: cualquier cámara
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: base });
    mensaje('Aviso: no se encontró cámara trasera, usando otra', 'mal');
  }
  video.srcObject = stream;
  await video.play();
  // Flash encendido por defecto: en una habitación a oscuras sin él no se ve la mano
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  flashPosible = !!caps.torch;
  if (flashPosible) await ponerFlash(true);
  actualizarBotonFlash();
}

async function ponerFlash(on) {
  if (!stream || !flashPosible) return;
  try {
    await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: on }] });
    flashOn = on;
  } catch (e) { flashPosible = false; }
}
function actualizarBotonFlash() {
  $('btnFlash').textContent = !flashPosible ? 'Flash: no' : flashOn ? 'Flash: sí' : 'Flash: no';
  $('btnFlash').disabled = !flashPosible;
}

async function iniciarDetector() {
  const fileset = await FilesetResolver.forVisionTasks('./lib/mediapipe/wasm');
  const opciones = delegate => ({
    baseOptions: { modelAssetPath: './models/hand_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try { detector = await HandLandmarker.createFromOptions(fileset, opciones('GPU')); }
  catch (e) { console.warn('GPU no disponible, uso CPU', e); detector = await HandLandmarker.createFromOptions(fileset, opciones('CPU')); }
}

// ---------------------------------------------------------------- arranque
let jugando = false;
async function empezar() {
  iniciarAudio();
  $('btnEmpezar').disabled = true;
  $('cargaTxt').textContent = 'Pidiendo la cámara…';
  try {
    await iniciarCamara();
  } catch (e) {
    mostrarError(e.message || String(e));
    $('btnEmpezar').disabled = false;
    $('cargaTxt').textContent = '';
    return;
  }
  $('cargaTxt').textContent = 'Cargando el detector de manos…';
  try {
    await iniciarDetector();
  } catch (e) {
    mostrarError('No se pudo cargar el detector de manos: ' + (e.message || e));
    $('btnEmpezar').disabled = false;
    return;
  }
  try { await navigator.wakeLock?.request('screen'); } catch (e) {}
  $('pantallaInicio').classList.add('oculto');
  $('pantallaError').classList.add('oculto');
  jugando = true;
  mensaje('Apunta a algo y haz su gesto');
}
function mostrarError(txt) {
  $('errorTxt').textContent = txt;
  $('pantallaError').classList.remove('oculto');
}

$('btnEmpezar').onclick = empezar;
$('btnReintentar').onclick = () => { $('pantallaError').classList.add('oculto'); empezar(); };
$('btnSinCamara').onclick = () => {
  iniciarAudio();
  $('pantallaError').classList.add('oculto'); $('pantallaInicio').classList.add('oculto');
  jugando = true; mensaje('Modo prueba: teclas 1–5 = gestos');
};
$('btnAyuda').onclick = () => $('pantallaAyuda').classList.remove('oculto');
$('btnCerrarAyuda').onclick = () => $('pantallaAyuda').classList.add('oculto');
$('btnReset').onclick = () => { for (const o of objetos) o.reset(); reco.reiniciar(); mensaje('Habitación reiniciada'); };
$('btnFlash').onclick = async () => { await ponerFlash(!flashOn); actualizarBotonFlash(); };

// Teclas para probar en PC
const TECLAS = { '1': 'llave', '2': 'palanca', '3': 'cuerda', '4': 'agarrar', '5': 'romper' };
addEventListener('keydown', e => {
  if (TECLAS[e.key]) alGesto(TECLAS[e.key]);
  if (e.key === 'ArrowLeft') yaw += 0.15;
  if (e.key === 'ArrowRight') yaw -= 0.15;
  if (e.key === 'ArrowUp') pitch = Math.min(1.25, pitch + 0.1);
  if (e.key === 'ArrowDown') pitch = Math.max(-1.25, pitch - 0.1);
});

// ---------------------------------------------------------------- bucle principal
let tPrev = performance.now();
let ultimoFrameVideo = -1;
function bucle() {
  requestAnimationFrame(bucle);
  const t = performance.now();
  const dt = Math.min(0.05, (t - tPrev) / 1000);
  tPrev = t;

  camera.rotation.set(pitch, yaw, 0);
  camera.updateMatrixWorld();

  if (jugando && detector && video.readyState >= 2 && video.currentTime !== ultimoFrameVideo) {
    ultimoFrameVideo = video.currentTime;
    const res = detector.detectForVideo(video, t);
    const lm = (res.landmarks && res.landmarks[0]) || null;
    const aspecto = video.videoWidth / (video.videoHeight || 1);
    if (lienzo.width / lienzo.height !== aspecto && aspecto > 0) {
      lienzo.height = Math.round(lienzo.width / aspecto);
      lienzo.style.height = lienzo.height + 'px';
    }
    const r = reco.actualizar(lm, t, aspecto);
    dibujarMano(lm, r.pose, r.debug);
    if (r.gesto) alGesto(r.gesto);
  }

  // animaciones
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.fin && tw.fin(); }
  }
  // parpadeo de la bombilla
  if (luzEncendida) luzBombilla.intensity = Math.random() < 0.03 ? 6 : 40;
  // alarma giratoria
  if (alarmaActiva) {
    const on = Math.sin(t / 180) > 0;
    luzAlarma.intensity = on ? 14 : 1;
    piloto.material.emissive.setHex(on ? 0xff2010 : 0x200000);
  }
  // cristales cayendo
  for (const tr of trozos) {
    if (tr.position.y <= 0.01) continue;
    tr.userData.v.y -= 9.8 * dt;
    tr.position.addScaledVector(tr.userData.v, dt);
    tr.rotation.x += tr.userData.w.x * dt; tr.rotation.y += tr.userData.w.y * dt;
    if (tr.position.y <= 0.01) { tr.position.y = 0.01; tr.rotation.set(-Math.PI / 2, 0, Math.random() * 6); }
  }
  // la figura respira
  if (figura.visible) figura.position.y = Math.sin(t / 700) * 0.01;
  // linterna con un poco de temblor
  linterna.intensity = 25 + Math.sin(t / 90) * 1.5;

  actualizarObjetivo();
  renderer.render(scene, camera);
}
bucle();
