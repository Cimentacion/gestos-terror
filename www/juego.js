import * as THREE from './lib/three/three.module.js';
import { FilesetResolver, HandLandmarker } from './lib/mediapipe/vision_bundle.js';
import { Reconocedor } from './gestos.js';
import { Mano3D } from './mano3d.js';

const $ = id => document.getElementById(id);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ================================================================ AYUDA
const AYUDA = [
  ['Moverse', 'Joystick: arriba/abajo andas, a los lados giras.'],
  ['Bajar', 'Cierra la mano sobre la palanca o la cuerda y baja la mano. La palanca sigue tu mano.'],
  ['Girar', 'Cierra la mano sobre la llave o la rueda y gira la muñeca. Puedes soltar y volver a coger.'],
  ['Tirar', 'Cierra la mano sobre el cajón y acércala hacia ti (o bájala).'],
  ['Romper', 'Puño y golpe rápido.'],
  ['Coger', 'Cierra la mano sobre el objeto.'],
  ['Usar', 'Lo que llevas se usa solo: deja la mano un momento encima de donde va.'],
];
const htmlAyuda = AYUDA.map(([n, d]) => `<div><b>${n}</b> — ${d}</div>`).join('');
$('listaGestos1').innerHTML = htmlAyuda;
$('listaGestos2').innerHTML = htmlAyuda;

// ================================================================ RENDER Y ESCENA
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const ESCALA = 0.6; // resolución interna baja: estilo PS1 y más rendimiento
renderer.setPixelRatio(1);
$('juego').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 3, 10);

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 40);
scene.add(camera);
const ALTURA_OJOS = 1.6;
const INCLINACION = -0.34; // cámara fija, un poco mirando hacia abajo

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

// ================================================================ TEXTURAS
function texCanvas(c, repetir = false, suave = false) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = suave ? THREE.LinearFilter : THREE.NearestFilter;
  t.minFilter = suave ? THREE.LinearFilter : THREE.NearestFilter;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
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
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(20,15,10,${0.1 + Math.random() * 0.2})`;
    g.beginPath(); g.arc(Math.random() * tam, Math.random() * tam, 3 + Math.random() * 10, 0, 7); g.fill();
  }
  return texCanvas(c, true);
}
function texturaTexto(lineas, w, h, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.fondo || '#d8d0b8';
  g.fillRect(0, 0, w, h);
  if (!opts.fondo) for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  g.fillStyle = opts.color || '#2a1810';
  g.font = opts.fuente || 'bold 22px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const alto = h / (lineas.length + 1);
  lineas.forEach((l, i) => g.fillText(l, w / 2, alto * (i + 1)));
  return texCanvas(c);
}
function texturaPersiana() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) {
    const v = 85 + (y % 8 < 2 ? -35 : 0) + Math.random() * 15;
    g.fillStyle = `rgb(${v},${v},${v + 4})`;
    g.fillRect(0, y, 32, 1);
  }
  const t = texCanvas(c, true); t.repeat.set(2, 4); return t;
}
function texturaCirculo(anillo) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (anillo) {
    g.strokeStyle = '#fff'; g.lineWidth = 6;
    g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 5, 0, 7); g.fill();
  } else {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  return texCanvas(c, false, true);
}

const texPared = texturaRuido([120, 112, 96], 30, 64, true); texPared.repeat.set(3, 1.5);
const texPared2 = texturaRuido([92, 74, 64], 34, 64, true); texPared2.repeat.set(3, 1.5);
const texSuelo = texturaRuido([70, 60, 50], 35); texSuelo.repeat.set(4, 4);
const texSuelo2 = texturaRuido([58, 58, 56], 30); texSuelo2.repeat.set(5, 5);
const texTecho = texturaRuido([90, 88, 82], 20); texTecho.repeat.set(3, 3);
const texMadera = texturaRuido([90, 58, 34], 30, 32, true);
const texMetal = texturaRuido([95, 95, 100], 25, 32);
const texOxido = texturaRuido([110, 62, 38], 40, 32);

const mat = opts => new THREE.MeshLambertMaterial(opts);
const matPared = mat({ map: texPared });
const matPared2 = mat({ map: texPared2 });
const matMadera = mat({ map: texMadera });
const matMetal = mat({ map: texMetal });
const matOxido = mat({ map: texOxido });
const matOscuro = mat({ color: 0x151515 });
const matDorado = mat({ color: 0xc0962a, emissive: 0x2a1a00, flatShading: true });
const matHit = new THREE.MeshBasicMaterial({ visible: false });

// ================================================================ LUCES
scene.add(new THREE.AmbientLight(0x2a3448, 0.65));
const linterna = new THREE.SpotLight(0xffe2b8, 25, 9, 0.5, 0.65, 2);
camera.add(linterna);
camera.add(linterna.target);
linterna.target.position.set(0, -0.05, -1);
const luzBombilla = new THREE.PointLight(0xffd59a, 0, 12, 2);
luzBombilla.position.set(0, 2.7, 0.6);
scene.add(luzBombilla);
const luzLuna = new THREE.PointLight(0x6080ff, 3, 6, 2);
luzLuna.position.set(0, 1.7, 3.6);
scene.add(luzLuna);
const luzSala = new THREE.PointLight(0xff6a30, 0, 9, 2);
luzSala.position.set(0, 2.6, -4.8);
scene.add(luzSala);
const luzSala2 = new THREE.PointLight(0xff6a30, 0, 8, 2);
luzSala2.position.set(0, 2.6, -7.8);
scene.add(luzSala2);

// Mano virtual
const mano3d = new Mano3D(camera);
let ultimaMano = null, aspectoVideo = 3 / 4;

// ================================================================ UTILIDADES
// Todo lo que se crea con caja() o plano() es sólido para la mano. Las paredes además tapan objetivos.
const solidos = [];
const muros = [];
function caja(w, h, d, material, x, y, z, padre = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); padre.add(m);
  if (material !== matHit) solidos.push(m);
  return m;
}
function plano(w, h, material, x, y, z, ry = 0, rx = 0, padre = scene) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0); padre.add(m);
  solidos.push(m);
  return m;
}
function pared(...a) { const m = caja(...a); muros.push(m); return m; }
function paredPlano(...a) { const m = plano(...a); muros.push(m); return m; }
function tubo(r, largo, material, x, y, z, rx = 0, rz = 0, padre = scene) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, largo, 6), material);
  m.position.set(x, y, z); m.rotation.set(rx, 0, rz); padre.add(m);
  solidos.push(m);
  return m;
}

const tweens = [];
function tween(dur, fn, fin) { tweens.push({ dur, t: 0, fn, fin }); }
const suave = k => k * k * (3 - 2 * k);

// ================================================================ SONIDO SINTETIZADO
let audio = null, zumbido = null, vaporGain = null;
function bufferRuido(seg) {
  const buf = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * seg)), audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function iniciarAudio() {
  if (audio) return;
  audio = new (window.AudioContext || window.webkitAudioContext)();
  const o = audio.createOscillator(), o2 = audio.createOscillator();
  zumbido = audio.createGain();
  o.type = 'sine'; o.frequency.value = 50;
  o2.type = 'sawtooth'; o2.frequency.value = 100;
  const g2 = audio.createGain(); g2.gain.value = 0.15;
  o.connect(zumbido); o2.connect(g2).connect(zumbido);
  zumbido.gain.value = 0.04;
  zumbido.connect(audio.destination);
  o.start(); o2.start();
  // silbido del vapor en bucle
  const s = audio.createBufferSource(); s.buffer = bufferRuido(2); s.loop = true;
  const f = audio.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 0.6;
  vaporGain = audio.createGain(); vaporGain.gain.value = 0;
  s.connect(f).connect(vaporGain).connect(audio.destination); s.start();
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
function ruido(dur, vol = 0.3, frec = 2000, tipo = 'highpass', retraso = 0) {
  if (!audio) return;
  const t0 = audio.currentTime + retraso;
  const buf = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * dur)), audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = audio.createBufferSource(); s.buffer = buf;
  const fl = audio.createBiquadFilter(); fl.type = tipo; fl.frequency.value = frec;
  const g = audio.createGain(); g.gain.value = vol;
  s.connect(fl).connect(g).connect(audio.destination); s.start(t0);
}
const sonido = {
  error: () => { tono(140, 0.18, 'square', 0.07); tono(110, 0.2, 'square', 0.07, null, 0.1); },
  paso: () => ruido(0.09, 0.5, 300 + Math.random() * 100, 'lowpass'),
  tick: () => tono(900 + Math.random() * 200, 0.02, 'square', 0.04),
  agarrar: () => { ruido(0.08, 0.2, 700, 'lowpass'); tono(260, 0.06, 'triangle', 0.08); },
  item: () => { tono(660, 0.08, 'triangle', 0.08); tono(990, 0.12, 'triangle', 0.08, null, 0.08); },
  llave: () => { tono(1800, 0.04, 'square', 0.1); tono(1200, 0.05, 'square', 0.1, null, 0.12); ruido(0.08, 0.2, 3000, 'highpass', 0.1); },
  clic: () => { tono(2200, 0.03, 'square', 0.12); ruido(0.05, 0.3, 3000); },
  cuerda: () => { tono(2500, 0.03, 'square', 0.08); ruido(0.04, 0.2, 4000); },
  palanca: () => { tono(70, 0.35, 'square', 0.2, 40); ruido(0.2, 0.25, 500); },
  persiana: () => { for (let i = 0; i < 14; i++) ruido(0.06, 0.25, 600, 'bandpass', i * 0.12); tono(60, 1.8, 'sawtooth', 0.05, 80); },
  cajon: () => ruido(0.35, 0.3, 500, 'lowpass'),
  valvula: () => tono(300 + Math.random() * 200, 0.08, 'sawtooth', 0.03),
  metal: () => { tono(1300, 0.4, 'triangle', 0.1, 900); ruido(0.15, 0.4, 2000); },
  madera: () => { ruido(0.25, 0.6, 400, 'lowpass'); tono(120, 0.15, 'square', 0.1, 60); },
  romper: () => { ruido(0.6, 0.5, 2500); for (let i = 0; i < 8; i++) tono(2000 + Math.random() * 3000, 0.15, 'sine', 0.05, null, Math.random() * 0.35); },
  quema: () => { ruido(0.4, 0.5, 3000); tono(200, 0.3, 'sawtooth', 0.08, 120); },
  puerta: () => { tono(90, 1.4, 'sawtooth', 0.06, 140); tono(220, 1.2, 'sawtooth', 0.025, 180, 0.2); },
  susto: () => { ruido(0.9, 0.7, 800, 'bandpass'); tono(880, 0.8, 'sawtooth', 0.12, 220); tono(55, 1.5, 'sawtooth', 0.15, 40); },
  victoria: () => { [392, 494, 587, 784].forEach((f, i) => tono(f, 0.5, 'triangle', 0.08, null, i * 0.15)); },
};
function vibrar(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ================================================================ ESTADO
const ITEMS = { llavePeq: 'Llave pequeña', fusible: 'Fusible', llaveGrande: 'Llave grande' };
const estado = {};
function estadoInicial() {
  Object.assign(estado, {
    luz: false, fusible: false, corriente: false, persianaAbierta: false,
    vapor: 1, cajaEnMano: false, puertaAbierta: false, susto: false, escapado: false,
    inventario: new Set(),
  });
}
estadoInicial();
const tiene = k => estado.inventario.has(k);
function pintarInventario() {
  $('inventario').innerHTML = [...estado.inventario].map(k => `<span class="item">${ITEMS[k]}</span>`).join('');
}
function dar(k) { estado.inventario.add(k); pintarInventario(); sonido.item(); vibrar(30); }
function quitar(k) { estado.inventario.delete(k); pintarInventario(); }

const interactivos = [];
const texMarca = texturaCirculo(true);
function obj(o) {
  o._p = new THREE.Vector3(); o._v = new THREE.Vector3();
  o.hecho = false; o.progreso = 0;
  o.marca = new THREE.Sprite(new THREE.SpriteMaterial({ map: texMarca, transparent: true, fog: false, depthWrite: false }));
  o.marca.renderOrder = 20;
  scene.add(o.marca);
  interactivos.push(o);
  return o;
}
const CONTINUOS = ['bajar', 'girar', 'tirar'];

// ================================================================ HABITACIÓN 1: DORMITORIO (x -3..3, z -3..3)
const AL = 3;
plano(6, 6, mat({ map: texSuelo }), 0, 0, 0, 0, -Math.PI / 2);
plano(6, 6, mat({ map: texTecho }), 0, AL, 0, 0, Math.PI / 2);
paredPlano(6, AL, matPared, 3, AL / 2, 0, -Math.PI / 2);
paredPlano(6, AL, matPared, -3, AL / 2, 0, Math.PI / 2);
// Pared norte con hueco de 1,4 m (persiana)
pared(2.3, AL, 0.1, matPared, -1.85, AL / 2, -3.05);
pared(2.3, AL, 0.1, matPared, 1.85, AL / 2, -3.05);
pared(1.4, AL - 2.2, 0.1, matPared, 0, 2.2 + (AL - 2.2) / 2, -3.05);
caja(0.08, 2.2, 0.16, matMetal, -0.74, 1.1, -3.05);
caja(0.08, 2.2, 0.16, matMetal, 0.74, 1.1, -3.05);
// Pared sur con ventana enrejada
pared(2.3, AL, 0.1, matPared, -1.85, AL / 2, 3.05);
pared(2.3, AL, 0.1, matPared, 1.85, AL / 2, 3.05);
pared(1.4, 1.0, 0.1, matPared, 0, 0.5, 3.05);
pared(1.4, AL - 2.2, 0.1, matPared, 0, 2.2 + (AL - 2.2) / 2, 3.05);
caja(1.5, 0.06, 0.16, matMadera, 0, 1.0, 3.0);
caja(1.5, 0.06, 0.16, matMadera, 0, 2.2, 3.0);
caja(0.06, 1.26, 0.16, matMadera, -0.72, 1.6, 3.0);
caja(0.06, 1.26, 0.16, matMadera, 0.72, 1.6, 3.0);
for (let i = -2; i <= 2; i++) caja(0.03, 1.2, 0.03, matMetal, i * 0.26, 1.6, 2.97);
const cielo = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: 0x0a1028 }));
cielo.position.set(0, 1.6, 4.5); cielo.rotation.y = Math.PI; scene.add(cielo);
const luna = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), new THREE.MeshBasicMaterial({ color: 0xc8d0ff }));
luna.position.set(-0.6, 2.2, 4.45); luna.rotation.y = Math.PI; scene.add(luna);

// Cama (decorado)
caja(1.3, 0.4, 2.0, matMadera, -2.3, 0.2, 2.0);
caja(1.25, 0.15, 1.95, mat({ color: 0x5a5a6a, flatShading: true }), -2.3, 0.47, 2.0);
caja(0.9, 0.12, 0.35, mat({ color: 0x8a8a90 }), -2.3, 0.6, 2.75);

// Notas (pistas)
plano(0.5, 0.36, mat({ map: texturaTexto(['LA LLAVE', 'ESTÁ EN', 'LA VITRINA'], 256, 184) }), -2.99, 1.75, -0.4, Math.PI / 2);
plano(0.56, 0.36, mat({ map: texturaTexto(['SIN FUSIBLE', 'NO HAY', 'CORRIENTE'], 256, 168) }), 2.99, 2.15, -1.6, -Math.PI / 2);
plano(0.56, 0.36, mat({ map: texturaTexto(['GUARDÉ EL', 'FUSIBLE EN', 'EL ESCRITORIO'], 256, 168) }), 1.9, 1.6, 2.99, Math.PI);

// ---------------------------------------------------------------- 1. Cuerda de la luz
const CUERDA = V(0, 0, 0.6);
caja(0.1, 0.1, 0.1, matOscuro, CUERDA.x, 2.95, CUERDA.z);
const bombillaMat = new THREE.MeshBasicMaterial({ color: 0x302820 });
const bombilla = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bombillaMat);
bombilla.position.set(CUERDA.x, 2.83, CUERDA.z); scene.add(bombilla);
const cuerda = new THREE.Group();
cuerda.position.set(CUERDA.x + 0.08, 3.0, CUERDA.z); scene.add(cuerda);
const hilo = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.45, 4), mat({ color: 0xc8c0a8 }));
hilo.position.y = -0.725; cuerda.add(hilo);
const tirador = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6), mat({ color: 0xd8d0b8 }));
tirador.position.y = -1.49; cuerda.add(tirador);
function alternarLuz() {
  estado.luz = !estado.luz;
  sonido.cuerda();
  luzBombilla.intensity = estado.luz ? 26 : 0;
  bombillaMat.color.setHex(estado.luz ? 0xfff0c0 : 0x302820);
  mensaje(estado.luz ? '✓ Luz encendida' : 'Luz apagada', estado.luz ? 'ok' : '');
}
const oCuerda = obj({
  nombre: 'Cuerda de la luz', tipo: 'bajar', recorrido: 0.11, muelle: true, repetible: true, armado: true,
  get pos() { return tirador.getWorldPosition(this._p); },
  agarre() { return tirador.getWorldPosition(this._v); },
  pista: 'Cierra la mano en la cuerda y tira hacia abajo',
  alCambiar(p) {
    cuerda.position.y = 3.0 - p * 0.16;
    if (p > 0.8 && this.armado) { this.armado = false; alternarLuz(); vibrar(40); }
    if (p < 0.3) this.armado = true;
  },
  reset() { this.armado = true; cuerda.position.y = 3.0; },
});

// ---------------------------------------------------------------- 2 y 3. Mesa con vitrina y caja con la llave pequeña
const MESA = V(-2.4, 0, -0.4);
caja(0.9, 0.06, 0.6, matMadera, MESA.x, 0.8, MESA.z);
for (const [dx, dz] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) caja(0.05, 0.8, 0.05, matMadera, MESA.x + dx, 0.4, MESA.z + dz);
const vitrina = new THREE.Group();
vitrina.position.set(MESA.x, 0.83, MESA.z); scene.add(vitrina);
const VW = 0.55, VH = 0.42, VD = 0.42;
for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) caja(0.025, VH, 0.025, matMadera, x * VW / 2, VH / 2, z * VD / 2, vitrina);
caja(VW + 0.03, 0.025, VD + 0.03, matMadera, 0, VH, 0, vitrina);
const cristalMat = new THREE.MeshLambertMaterial({ color: 0xa0c0d8, transparent: true, opacity: 0.28, emissive: 0x0a1420, side: THREE.DoubleSide });
const cristales = new THREE.Group(); vitrina.add(cristales);
plano(VW, VH, cristalMat, 0, VH / 2, VD / 2, 0, 0, cristales);
plano(VW, VH, cristalMat, 0, VH / 2, -VD / 2, 0, 0, cristales);
plano(VD, VH, cristalMat, VW / 2, VH / 2, 0, Math.PI / 2, 0, cristales);
plano(VD, VH, cristalMat, -VW / 2, VH / 2, 0, Math.PI / 2, 0, cristales);
plano(VW, VD, cristalMat, 0, VH - 0.005, 0, 0, Math.PI / 2, cristales);

const cofre = new THREE.Group();
caja(0.24, 0.14, 0.18, mat({ color: 0x5a3a20, flatShading: true }), 0, 0.07, 0, cofre);
const tapaCofre = new THREE.Group(); tapaCofre.position.set(0, 0.14, -0.09); cofre.add(tapaCofre);
caja(0.25, 0.035, 0.19, matMetal, 0, 0.0175, 0.095, tapaCofre);
caja(0.03, 0.04, 0.015, mat({ color: 0xb08a3a }), 0, 0.09, 0.095, cofre);
const COFRE_MESA = V(MESA.x, 0.83, MESA.z);
scene.add(cofre);

function crearLlave(esc = 1) {
  const g = new THREE.Group();
  const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 4, 8), matDorado);
  g.add(anillo);
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.075, 0.008), matDorado); cuerpo.position.y = -0.06; g.add(cuerpo);
  const d1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.008), matDorado); d1.position.set(0.01, -0.085, 0); g.add(d1);
  const d2 = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.01, 0.008), matDorado); d2.position.set(0.008, -0.07, 0); g.add(d2);
  g.scale.setScalar(esc);
  return g;
}

const trozos = [];
const trozoGeo = new THREE.BufferGeometry();
trozoGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.07, 0, 0, 0.02, 0.09, 0], 3));
trozoGeo.computeVertexNormals();
const trozoMat = new THREE.MeshLambertMaterial({ color: 0xb0c8e0, transparent: true, opacity: 0.6, side: THREE.DoubleSide });

const oVitrina = obj({
  nombre: 'Vitrina', tipo: 'romper', pos: V(MESA.x, 1.05, MESA.z),
  pista: 'Puño y golpe rápido para romper el cristal',
  romper() {
    this.hecho = true;
    sonido.romper(); vibrar(120);
    cristales.visible = false;
    for (let i = 0; i < 30; i++) {
      const t = new THREE.Mesh(trozoGeo, trozoMat);
      t.scale.setScalar(0.5 + Math.random());
      t.position.set(MESA.x + (Math.random() - 0.5) * VW, 0.85 + Math.random() * VH, MESA.z + (Math.random() - 0.5) * VD);
      t.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      t.userData.v = V((Math.random() - 0.2) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6);
      t.userData.w = V(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      scene.add(t); trozos.push(t);
    }
    return 'Cristal roto';
  },
  reset() { cristales.visible = true; for (const t of trozos) scene.remove(t); trozos.length = 0; },
});

const oCaja = obj({
  nombre: 'Caja', tipo: 'coger', pos: V(MESA.x, 0.95, MESA.z),
  oculto: () => !oVitrina.hecho,
  coger() {
    this.hecho = true;
    estado.cajaEnMano = true;
    camera.attach(cofre);
    setTimeout(() => {
      if (!estado.cajaEnMano) return;
      sonido.abrir && sonido.abrir();
      tono(400, 0.3, 'sawtooth', 0.04, 250);
      tween(0.4, k => { tapaCofre.rotation.x = -suave(k) * 1.9; }, () => {
        setTimeout(() => {
          if (!estado.cajaEnMano) return;
          estado.cajaEnMano = false;
          cofre.visible = false;
          dar('llavePeq');
          mensaje('✓ Dentro había una llave pequeña', 'ok');
        }, 500);
      });
    }, 800);
    return 'Has cogido la caja';
  },
  reset() {
    scene.attach(cofre);
    cofre.position.copy(COFRE_MESA); cofre.rotation.set(0, 0, 0); cofre.scale.setScalar(1);
    cofre.visible = true; tapaCofre.rotation.x = 0;
  },
});

// ---------------------------------------------------------------- 4, 5 y 6. Escritorio: cerradura, cajón y fusible
// Escritorio contra la pared este, el cajón mira hacia el centro (-x)
const ESC = V(2.45, 0, 1.6);
caja(0.6, 0.05, 1.1, matMadera, ESC.x, 0.88, ESC.z);
caja(0.6, 0.86, 0.04, matMadera, ESC.x, 0.43, ESC.z - 0.53);
caja(0.6, 0.86, 0.04, matMadera, ESC.x, 0.43, ESC.z + 0.53);
caja(0.04, 0.86, 1.1, matMadera, ESC.x + 0.28, 0.43, ESC.z);
caja(0.56, 0.03, 1.02, matMadera, ESC.x, 0.63, ESC.z);
caja(0.03, 0.62, 1.02, matOscuro, ESC.x - 0.26, 0.31, ESC.z);
const CAJON_X = ESC.x;
const cajon = new THREE.Group();
cajon.position.set(CAJON_X, 0.72, ESC.z); scene.add(cajon);
caja(0.52, 0.02, 0.42, matMadera, 0, -0.06, 0, cajon);
caja(0.52, 0.12, 0.02, matMadera, 0, 0, 0.21, cajon);
caja(0.52, 0.12, 0.02, matMadera, 0, 0, -0.21, cajon);
caja(0.02, 0.12, 0.42, matMadera, 0.26, 0, 0, cajon);
caja(0.03, 0.15, 0.48, mat({ map: texMadera, color: 0xb08060 }), -0.275, 0, 0, cajon);
const tiradorCajon = caja(0.03, 0.025, 0.12, matMetal, -0.3, -0.035, 0, cajon);
caja(0.012, 0.05, 0.05, matMetal, -0.293, 0.035, 0, cajon); // placa de la cerradura
const llaveCajonG = new THREE.Group(); llaveCajonG.position.set(-0.3, 0.035, 0); cajon.add(llaveCajonG);
const llaveCajon = crearLlave(); llaveCajon.rotation.z = Math.PI / 2; llaveCajon.position.x = -0.06; llaveCajonG.add(llaveCajon);
llaveCajonG.visible = false;
const fusibleCajon = new THREE.Group(); fusibleCajon.position.set(-0.06, -0.025, 0.02); cajon.add(fusibleCajon);
function crearFusible(padre) {
  caja(0.09, 0.035, 0.035, mat({ color: 0xd8d0c0, flatShading: true }), 0, 0, 0, padre);
  caja(0.02, 0.04, 0.04, matMetal, -0.05, 0, 0, padre);
  caja(0.02, 0.04, 0.04, matMetal, 0.05, 0, 0, padre);
}
crearFusible(fusibleCajon);

const oCerrCajon = obj({
  nombre: 'Cerradura del cajón', requiere: 'llavePeq', total: 1.3, llaveDentro: false,
  get tipo() { return this.llaveDentro ? 'girar' : 'colocar'; },
  get pos() { return llaveCajonG.getWorldPosition(this._p); },
  get pista() {
    if (this.llaveDentro) return 'Cierra la mano en la llave y gira la muñeca';
    return tiene('llavePeq') ? 'Deja la mano encima: usarás la llave pequeña' : 'Está cerrado con llave';
  },
  agarre() { return llaveCajonG.getWorldPosition(this._v); },
  colocar() { this.llaveDentro = true; quitar('llavePeq'); llaveCajonG.visible = true; sonido.llave(); return 'Llave metida. Ahora gírala'; },
  alCambiar(p) { llaveCajonG.rotation.x = p * Math.PI / 2; },
  alCompletar() { this.hecho = true; sonido.clic(); return 'Cajón desbloqueado'; },
  reset() { this.llaveDentro = false; llaveCajonG.visible = false; llaveCajonG.rotation.x = 0; },
});

const oCajon = obj({
  nombre: 'Cajón', tipo: 'tirar', recorrido: 0.3,
  oculto: () => !oCerrCajon.hecho,
  get pos() { return tiradorCajon.getWorldPosition(this._p); },
  agarre() { return tiradorCajon.getWorldPosition(this._v); },
  pista: 'Cierra la mano en el cajón y tira hacia ti',
  alCambiar(p) { cajon.position.x = CAJON_X - 0.36 * p; },
  alCompletar() { this.hecho = true; sonido.cajon(); return 'Cajón abierto: hay un fusible'; },
  reset() { cajon.position.x = CAJON_X; },
});

const oFusible = obj({
  nombre: 'Fusible', tipo: 'coger',
  oculto: () => !oCajon.hecho,
  get pos() { return fusibleCajon.getWorldPosition(this._p); },
  coger() { this.hecho = true; fusibleCajon.visible = false; dar('fusible'); return 'Tienes el fusible'; },
  reset() { fusibleCajon.visible = true; },
});

// ---------------------------------------------------------------- 7 y 8. Cuadro eléctrico: hueco del fusible y palanca
const CUADRO = V(2.95, 1.3, -1.6);
caja(0.1, 0.9, 0.7, mat({ color: 0x3a3c3a, map: texMetal }), CUADRO.x, CUADRO.y, CUADRO.z);
plano(0.5, 0.12, mat({ map: texturaTexto(['CORRIENTE'], 256, 60, { fondo: '#c8a020', color: '#111', fuente: 'bold 34px sans-serif' }) }), 2.895, 1.85, CUADRO.z, -Math.PI / 2);
caja(0.02, 0.1, 0.16, matOscuro, 2.89, 1.5, -1.8); // hueco
const fusibleCuadro = new THREE.Group(); fusibleCuadro.position.set(2.87, 1.5, -1.8); fusibleCuadro.rotation.y = Math.PI / 2; scene.add(fusibleCuadro);
crearFusible(fusibleCuadro);
fusibleCuadro.visible = false;
const pilotoCuadroMat = new THREE.MeshBasicMaterial({ color: 0x401010 });
caja(0.02, 0.05, 0.05, pilotoCuadroMat, 2.89, 1.62, -1.45);

const palancaPivote = new THREE.Group();
palancaPivote.position.set(2.87, 1.05, -1.4);
scene.add(palancaPivote);
caja(0.06, 0.12, 0.1, matMetal, 2.9, 1.05, -1.4);
const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 6), matMetal);
brazo.position.y = 0.16; palancaPivote.add(brazo);
const pomo = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mat({ color: 0x8a1010, flatShading: true }));
pomo.position.y = 0.32; palancaPivote.add(pomo);
const ANG_ARRIBA = 0.4, ANG_ABAJO = 2.7; // gira hacia el jugador
palancaPivote.rotation.z = ANG_ARRIBA;

const oHueco = obj({
  nombre: 'Hueco del fusible', tipo: 'colocar', requiere: 'fusible', pos: V(2.88, 1.5, -1.8),
  get pista() { return tiene('fusible') ? 'Deja la mano encima: pondrás el fusible' : 'Aquí falta un fusible'; },
  colocar() {
    this.hecho = true; quitar('fusible'); fusibleCuadro.visible = true; estado.fusible = true;
    pilotoCuadroMat.color.setHex(0xffa020); sonido.clic();
    return 'Fusible puesto';
  },
  reset() { fusibleCuadro.visible = false; pilotoCuadroMat.color.setHex(0x401010); },
});

const oPalanca = obj({
  nombre: 'Palanca', tipo: 'bajar', recorrido: 0.2,
  get pos() { return pomo.getWorldPosition(this._p); },
  agarre() { return pomo.getWorldPosition(this._v); },
  pista: 'Cierra la mano en la palanca y bájala',
  alCambiar(p) { palancaPivote.rotation.z = ANG_ARRIBA + (ANG_ABAJO - ANG_ARRIBA) * p; },
  alCompletar() {
    sonido.palanca();
    if (!estado.fusible) {
      sonido.error();
      const p0 = this.progreso;
      setTimeout(() => tween(0.5, k => { this.progreso = p0 * (1 - suave(k)); this.alCambiar(this.progreso); }), 250);
      return { error: 'La palanca baja, pero no pasa nada. Falta un fusible' };
    }
    this.hecho = true;
    encenderCorriente();
    return 'Corriente encendida';
  },
  reset() { palancaPivote.rotation.z = ANG_ARRIBA; },
});

// ================================================================ HABITACIÓN 2: SALA DE CALDERAS (z -3.1..-9)
plano(6, 6, mat({ map: texSuelo2 }), 0, 0, -6.05, 0, -Math.PI / 2);
plano(6, 6, mat({ map: texTecho }), 0, AL, -6.05, 0, Math.PI / 2);
paredPlano(6, AL, matPared2, 3, AL / 2, -6.05, -Math.PI / 2);
paredPlano(6, AL, matPared2, -3, AL / 2, -6.05, Math.PI / 2);
// Persiana metálica entre las dos salas
const persiana = pared(1.4, 2.2, 0.06, mat({ map: texturaPersiana() }), 0, 1.1, -3.05);
// Muro intermedio con un paso de 1,2 m
pared(2.4, AL, 0.1, matPared2, -1.8, AL / 2, -6.5);
pared(2.4, AL, 0.1, matPared2, 1.8, AL / 2, -6.5);
pared(1.2, AL - 2.3, 0.1, matPared2, 0, 2.3 + (AL - 2.3) / 2, -6.5);
// Pared norte con la puerta final
pared(2.4, AL, 0.1, matPared2, -1.8, AL / 2, -9.05);
pared(2.4, AL, 0.1, matPared2, 1.8, AL / 2, -9.05);
pared(1.2, AL - 2.2, 0.1, matPared2, 0, 2.2 + (AL - 2.2) / 2, -9.05);
// Tuberías y caldera (decorado)
tubo(0.05, 6, matOxido, 2.9, 2.6, -6.05, Math.PI / 2);
tubo(0.04, 6, matOxido, -2.9, 2.5, -6.05, Math.PI / 2);
const caldera = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 2.2, 8), matOxido);
caldera.position.set(2.1, 1.1, -4.6); scene.add(caldera); solidos.push(caldera);
caja(0.3, 0.3, 0.05, matOscuro, 2.1, 0.7, -4.0);
plano(0.6, 0.36, mat({ map: texturaTexto(['CIERRA EL', 'VAPOR'], 256, 154) }), -1.7, 1.75, -6.44);
plano(0.9, 0.3, mat({ map: texturaTexto(['NO TE GIRES'], 256, 86, { fondo: '#000', color: '#7a0a0a', fuente: 'bold 30px serif' }), transparent: true, opacity: 0.85 }), -1.7, 2.2, -8.99);

// ---------------------------------------------------------------- 9. Válvula del vapor (pared oeste)
const VALV = V(-2.86, 1.3, -4.8);
tubo(0.035, 1.3, matOxido, -2.95, 0.65, VALV.z);
tubo(0.035, 2.4, matOxido, -1.8, 1.2, -6.42, 0, Math.PI / 2); // tubería rota que cruza hasta el paso
tubo(0.035, 1.6, matOxido, -2.95, 1.2, -5.62, Math.PI / 2);
const valvula = new THREE.Group(); valvula.position.copy(VALV); valvula.rotation.y = Math.PI / 2; scene.add(valvula);
tubo(0.03, 0.12, matMetal, 0, 0, -0.06, Math.PI / 2, 0, valvula);
const rueda = new THREE.Group(); valvula.add(rueda);
const aro = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 4, 10), mat({ color: 0x8a1a10, flatShading: true }));
rueda.add(aro); solidos.push(aro);
for (let i = 0; i < 3; i++) { const r = caja(0.34, 0.025, 0.02, mat({ color: 0x6a1a10 }), 0, 0, 0, rueda); r.rotation.z = i * Math.PI / 3; }
const puntoRueda = new THREE.Object3D(); puntoRueda.position.set(0, 0.17, 0); rueda.add(puntoRueda);

// Chorro de vapor en el paso
const vaporMat = new THREE.SpriteMaterial({ map: texturaCirculo(false), color: 0xc8c8c8, transparent: true, depthWrite: false, fog: false, opacity: 0.5 });
const particulas = [];
for (let i = 0; i < 60; i++) {
  const s = new THREE.Sprite(vaporMat.clone()); s.visible = false; scene.add(s);
  particulas.push({ s, vida: 0, v: V(0, 0, 0) });
}
let acumVapor = 0;
const BOCA = V(-0.6, 1.2, -6.42);

const oValvula = obj({
  nombre: 'Válvula del vapor', tipo: 'girar', total: Math.PI, pos: VALV.clone().add(V(0.05, 0, 0)),
  pista: 'Cierra la mano en la rueda y gira la muñeca (suelta y repite)',
  agarre() { return puntoRueda.getWorldPosition(this._v); },
  alCambiar(p) {
    const antes = rueda.rotation.z;
    rueda.rotation.z = p * Math.PI * 3;
    if (Math.abs(rueda.rotation.z - antes) > 0.15) sonido.valvula();
    estado.vapor = Math.max(0, 1 - p);
  },
  alCompletar() { this.hecho = true; estado.vapor = 0; tono(200, 0.5, 'sawtooth', 0.05, 90); return 'Vapor cerrado'; },
  reset() { rueda.rotation.z = 0; },
});

// ---------------------------------------------------------------- 10 y 11. Baúl con candado y llave grande
const BAUL = V(2.5, 0, -7.8);
caja(0.7, 0.3, 1.0, matMadera, BAUL.x, 0.15, BAUL.z);
caja(0.6, 0.42, 0.9, mat({ color: 0x4a3018, flatShading: true }), BAUL.x, 0.51, BAUL.z);
caja(0.61, 0.04, 0.91, matMetal, BAUL.x, 0.45, BAUL.z);
const tapaBaul = new THREE.Group(); tapaBaul.position.set(BAUL.x + 0.3, 0.72, BAUL.z); scene.add(tapaBaul);
caja(0.62, 0.06, 0.92, mat({ color: 0x5a3a1c, flatShading: true }), -0.31, 0.03, 0, tapaBaul);
caja(0.63, 0.065, 0.06, matMetal, -0.31, 0.03, 0.3, tapaBaul);
caja(0.63, 0.065, 0.06, matMetal, -0.31, 0.03, -0.3, tapaBaul);
const candado = new THREE.Group(); candado.position.set(BAUL.x - 0.33, 0.62, BAUL.z); scene.add(candado);
caja(0.035, 0.09, 0.08, mat({ color: 0x777777, flatShading: true }), 0, 0, 0, candado);
const asa = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 8, Math.PI), matMetal);
asa.rotation.y = Math.PI / 2; asa.position.y = 0.045; candado.add(asa);
const llaveGrande = crearLlave(2.2); llaveGrande.position.set(BAUL.x, 0.735, BAUL.z); llaveGrande.rotation.set(-Math.PI / 2, 0, 0.5);
scene.add(llaveGrande);

const oCandado = obj({
  nombre: 'Candado del baúl', tipo: 'romper', pos: V(BAUL.x - 0.36, 0.62, BAUL.z),
  pista: 'Puño y golpe rápido para reventar el candado',
  romper() {
    this.hecho = true;
    sonido.metal(); vibrar(120);
    const y0 = candado.position.y;
    tween(0.5, k => { candado.position.y = y0 - (y0 - 0.03) * k * k; candado.rotation.z = k * 1.4; candado.position.x = BAUL.x - 0.33 - k * 0.15; });
    setTimeout(() => { tono(300, 0.6, 'sawtooth', 0.03, 200); tween(0.7, k => { tapaBaul.rotation.z = -suave(k) * 1.7; }); }, 350);
    return 'Candado roto';
  },
  reset() { candado.position.set(BAUL.x - 0.33, 0.62, BAUL.z); candado.rotation.set(0, 0, 0); tapaBaul.rotation.z = 0; },
});
const oLlaveGrande = obj({
  nombre: 'Llave grande', tipo: 'coger', pos: V(BAUL.x, 0.78, BAUL.z),
  oculto: () => !oCandado.hecho,
  coger() { this.hecho = true; llaveGrande.visible = false; dar('llaveGrande'); return 'Tienes la llave grande'; },
  reset() { llaveGrande.visible = true; },
});

// ---------------------------------------------------------------- 12 y 13. Puerta final: tablas clavadas y cerradura
const puertaPivote = new THREE.Group();
puertaPivote.position.set(-0.6, 0, -9.0);
scene.add(puertaPivote);
muros.push(caja(1.2, 2.2, 0.07, matMadera, 0.6, 1.1, 0, puertaPivote));
caja(0.1, 0.18, 0.02, matMetal, 1.0, 1.05, 0.045, puertaPivote);
caja(0.012, 0.035, 0.03, matOscuro, 1.0, 1.04, 0.05, puertaPivote);
const pomoPuerta = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mat({ color: 0x8a7040, flatShading: true }));
pomoPuerta.position.set(1.0, 1.17, 0.07); puertaPivote.add(pomoPuerta);
const llavePuertaG = new THREE.Group(); llavePuertaG.position.set(1.0, 1.04, 0.07); puertaPivote.add(llavePuertaG);
const llavePuerta = crearLlave(2.2); llavePuerta.rotation.x = Math.PI / 2; llavePuerta.position.z = 0.13; llavePuertaG.add(llavePuerta);
llavePuertaG.visible = false;
caja(0.08, 2.25, 0.14, matMadera, -0.64, 1.1, -9.0);
caja(0.08, 2.25, 0.14, matMadera, 0.64, 1.1, -9.0);

const tablas = [];
const matTabla = mat({ map: texMadera, color: 0xc0a080 });
for (const [y, rz] of [[0.6, 0.08], [1.2, -0.06], [1.8, 0.1]]) {
  const t = caja(1.55, 0.14, 0.04, matTabla, 0, y, -8.92);
  t.rotation.z = rz; t.userData.y0 = y; t.userData.rz = rz;
  tablas.push(t);
}
const oTablas = obj({
  nombre: 'Tablas clavadas', tipo: 'romper', pos: V(0, 1.2, -8.9), quedan: 3,
  get pista() { return `Puño y golpe para arrancarlas (quedan ${this.quedan})`; },
  romper() {
    const t = tablas[3 - this.quedan];
    this.quedan--;
    sonido.madera(); vibrar(100);
    const y0 = t.position.y, r0 = t.rotation.z;
    const caer = Math.random() < 0.5 ? 1 : -1;
    tween(0.6, k => { t.position.y = y0 - (y0 - 0.05) * k * k; t.position.z = -8.92 + k * 0.5; t.rotation.z = r0 + caer * k * 1.2; });
    if (this.quedan === 0) { this.hecho = true; return 'Ya no quedan tablas'; }
    return `Tabla fuera. Quedan ${this.quedan}`;
  },
  reset() { this.quedan = 3; for (const t of tablas) { t.position.set(0, t.userData.y0, -8.92); t.rotation.set(0, 0, t.userData.rz); } },
});

const oCerrPuerta = obj({
  nombre: 'Cerradura de la puerta', requiere: 'llaveGrande', total: 1.3, llaveDentro: false,
  oculto: () => !oTablas.hecho,
  get tipo() { return this.llaveDentro ? 'girar' : 'colocar'; },
  get pos() { return llavePuertaG.getWorldPosition(this._p); },
  get pista() {
    if (this.llaveDentro) return 'Cierra la mano en la llave y gira la muñeca';
    return tiene('llaveGrande') ? 'Deja la mano encima: usarás la llave grande' : 'Necesitas una llave grande';
  },
  agarre() { return llavePuertaG.getWorldPosition(this._v); },
  colocar() { this.llaveDentro = true; quitar('llaveGrande'); llavePuertaG.visible = true; sonido.llave(); return 'Llave metida. Ahora gírala'; },
  alCambiar(p) { llavePuertaG.rotation.z = p * Math.PI / 2; },
  alCompletar() { this.hecho = true; abrirPuertaFinal(); return 'La puerta se abre…'; },
  reset() { this.llaveDentro = false; llavePuertaG.visible = false; llavePuertaG.rotation.z = 0; },
});

// Pasillo final
const PASILLO_FIN = -13;
caja(1.2, 0.05, 4, matOscuro, 0, 0, -11.05);
caja(0.05, 2.3, 4, mat({ map: texPared, color: 0x885555 }), -0.62, 1.15, -11.05);
caja(0.05, 2.3, 4, mat({ map: texPared, color: 0x885555 }), 0.62, 1.15, -11.05);
caja(1.2, 0.05, 4, matOscuro, 0, 2.3, -11.05);
caja(1.2, 2.3, 0.05, matOscuro, 0, 1.15, PASILLO_FIN);
caja(0.8, 1.9, 0.04, mat({ color: 0x1a2a1a }), 0, 0.95, PASILLO_FIN + 0.05);
plano(0.4, 0.12, new THREE.MeshBasicMaterial({ map: texturaTexto(['SALIDA'], 128, 40, { fondo: '#0a5a1a', color: '#bfffc8', fuente: 'bold 26px sans-serif' }) }), 0, 2.05, PASILLO_FIN + 0.08);
const luzSalida = new THREE.PointLight(0x30ff60, 0, 3, 2);
luzSalida.position.set(0, 2.0, PASILLO_FIN + 0.4); scene.add(luzSalida);
const luzPasillo = new THREE.PointLight(0xff3020, 0, 5, 2);
luzPasillo.position.set(0, 2.0, -10.5); scene.add(luzPasillo);
const figura = new THREE.Group();
figura.position.set(0.1, 0, -11.4); scene.add(figura);
const matFigura = mat({ color: 0x050505, flatShading: true });
caja(0.4, 1.3, 0.22, matFigura, 0, 0.95, 0, figura);
const cabeza = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), matFigura);
cabeza.position.set(0, 1.8, 0); cabeza.scale.set(1, 1.3, 1); figura.add(cabeza);
const ojoMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
caja(0.025, 0.012, 0.01, ojoMat, -0.05, 1.82, 0.13, figura);
caja(0.025, 0.012, 0.01, ojoMat, 0.05, 1.82, 0.13, figura);
figura.visible = false;

// ================================================================ EVENTOS DEL MAPA
function encenderCorriente() {
  estado.corriente = true;
  pilotoCuadroMat.color.setHex(0x20ff40);
  if (zumbido) zumbido.gain.setTargetAtTime(0.07, audio.currentTime, 0.3);
  parpadeo(0.3);
  setTimeout(() => {
    sonido.persiana();
    mensaje('La persiana se está abriendo…', 'ok');
    tween(2.2, k => { persiana.position.y = 1.1 + suave(k) * 2.1; }, () => { estado.persianaAbierta = true; });
    luzSala.intensity = 5; luzSala2.intensity = 4;
  }, 600);
}
function abrirPuertaFinal() {
  sonido.puerta();
  figura.visible = true;
  luzPasillo.intensity = 4;
  luzSalida.intensity = 3;
  tween(1.6, k => { puertaPivote.rotation.y = suave(k) * 1.75; }, () => { estado.puertaAbierta = true; });
}
function resetMapa() {
  persiana.position.y = 1.1;
  luzSala.intensity = 0; luzSala2.intensity = 0;
  luzBombilla.intensity = 0; bombillaMat.color.setHex(0x302820);
  puertaPivote.rotation.y = 0; figura.visible = false; figura.position.set(0.1, 0, -11.4);
  luzPasillo.intensity = 0; luzSalida.intensity = 0;
  if (zumbido) zumbido.gain.value = 0.04;
  for (const p of particulas) { p.vida = 0; p.s.visible = false; }
}

// ================================================================ JUGADOR: joystick (andar y girar) con cámara a altura fija
const jugador = { x: 0.5, z: 2.0, yaw: 0, bob: 0, distPaso: 0 };
const RADIO = 0.22;
const BLOQUES = [
  [-3, -1.65, 1.0, 3],          // cama
  [-2.85, -1.95, -0.7, -0.1],   // mesa
  [2.15, 2.75, 1.05, 2.15],     // escritorio
  [2.15, 2.85, -8.3, -7.3],     // baúl
];
const dentro = (x, z, x0, x1, z0, z1) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
function libre(x, z) {
  const R = RADIO;
  const zonas = [
    [-3 + R, 3 - R, -3 + R, 3 - R],
    [-3 + R, 3 - R, -6.45 + R, -3.1 - R],
    [-3 + R, 3 - R, -9 + R, -6.55 - R],
  ];
  if (estado.persianaAbierta) zonas.push([-0.7 + R, 0.7 - R, -3.1 - R - 0.03, -3 + R + 0.03]);
  if (estado.vapor < 0.05) zonas.push([-0.6 + R, 0.6 - R, -6.55 - R - 0.03, -6.45 + R + 0.03]);
  if (estado.puertaAbierta) {
    zonas.push([-0.6 + R, 0.6 - R, -9.1 - R - 0.03, -9 + R + 0.03]);
    zonas.push([-0.6 + R, 0.6 - R, PASILLO_FIN + R, -9.05]);
  }
  if (!zonas.some(zz => dentro(x, z, ...zz))) return false;
  for (const b of BLOQUES) if (dentro(x, z, b[0] - R, b[1] + R, b[2] - R, b[3] + R)) return false;
  if (Math.hypot(x - 2.1, z + 4.6) < 0.6 + R) return false;
  return true;
}
// Pasos estrechos: si vas hacia uno abierto, te centra un poco
const PASOS = [
  { z: -3.05, medio: 0.7, abierto: () => estado.persianaAbierta },
  { z: -6.5, medio: 0.6, abierto: () => estado.vapor < 0.05 },
  { z: -9.05, medio: 0.6, abierto: () => estado.puertaAbierta },
];

// --- Joystick: arriba/abajo = andar, izquierda/derecha = girar
const joy = { x: 0, y: 0, id: null };
const teclas = {};
const joyBase = $('joyBase'), joyBola = $('joyBola');
const RADIO_JOY = 48;
function moverJoy(e) {
  const r = joyBase.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy);
  if (d > RADIO_JOY) { dx *= RADIO_JOY / d; dy *= RADIO_JOY / d; }
  joyBola.style.transform = `translate(${dx}px, ${dy}px)`;
  joy.x = dx / RADIO_JOY; joy.y = dy / RADIO_JOY;
}
joyBase.addEventListener('pointerdown', e => {
  e.stopPropagation(); iniciarAudio();
  joy.id = e.pointerId; joyBase.setPointerCapture(e.pointerId);
  joyBase.classList.add('pulsado'); moverJoy(e);
});
joyBase.addEventListener('pointermove', e => { if (e.pointerId === joy.id) moverJoy(e); });
const pararAndar = () => { joy.id = null; joy.x = joy.y = 0; joyBola.style.transform = ''; joyBase.classList.remove('pulsado'); };
joyBase.addEventListener('pointerup', pararAndar);
joyBase.addEventListener('pointercancel', pararAndar);
joyBase.addEventListener('lostpointercapture', pararAndar);

// Arrastrar en la pantalla también gira (por si juegas con las dos manos)
let arrastre = null;
renderer.domElement.addEventListener('pointerdown', e => { arrastre = { id: e.pointerId, x: e.clientX }; iniciarAudio(); });
addEventListener('pointermove', e => {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  jugador.yaw -= (e.clientX - arrastre.x) * 0.006;
  arrastre.x = e.clientX;
});
const soltarArrastre = e => { if (arrastre && e.pointerId === arrastre.id) arrastre = null; };
addEventListener('pointerup', soltarArrastre);
addEventListener('pointercancel', soltarArrastre);

const curva = (v, zona = 0.15) => { const a = Math.abs(v); if (a < zona) return 0; return Math.sign(v) * ((a - zona) / (1 - zona)) ** 1.5; };
const vel = { avance: 0, giro: 0 };
let tAvisoVapor = 0;
function moverJugador(dt) {
  let avance = -curva(joy.y), giro = -curva(joy.x, 0.2);
  if (teclas.w) avance = 1; if (teclas.s) avance = -0.6;
  if (teclas.a) giro = 1; if (teclas.d) giro = -1;
  if (!jugando) { avance = 0; giro = 0; }
  vel.avance += (avance * 1.5 - vel.avance) * (1 - Math.pow(0.002, dt));
  vel.giro += (giro * 1.9 - vel.giro) * (1 - Math.pow(0.0005, dt));
  jugador.yaw += vel.giro * dt;
  const fx = -Math.sin(jugador.yaw), fz = -Math.cos(jugador.yaw);
  let nx = jugador.x + fx * vel.avance * dt, nz = jugador.z + fz * vel.avance * dt;
  if (Math.abs(vel.avance) > 0.05) {
    for (const p of PASOS) if (p.abierto() && Math.abs(nz - p.z) < 0.8 && Math.abs(nx) < p.medio + 0.5) nx += (0 - nx) * Math.min(1, dt * 3);
  }
  const antesX = jugador.x, antesZ = jugador.z;
  if (libre(nx, nz)) { jugador.x = nx; jugador.z = nz; }
  else if (libre(nx, jugador.z)) jugador.x = nx;
  else if (libre(jugador.x, nz)) jugador.z = nz;
  const movido = Math.hypot(jugador.x - antesX, jugador.z - antesZ);
  // ¿te ha parado el vapor?
  if (Math.abs(vel.avance) > 0.3 && movido < Math.abs(vel.avance) * dt * 0.3 && estado.vapor > 0.05 &&
      Math.abs(jugador.x) < 0.9 && Math.abs(jugador.z + 6.5) < 0.7 && performance.now() - tAvisoVapor > 1500) {
    tAvisoVapor = performance.now();
    sonido.quema(); vibrar(200); parpadeo(0.2, true);
    mensaje('✗ ¡El vapor quema! Ciérralo antes de pasar', 'mal');
  }
  if (movido > 0.001) {
    jugador.bob += dt * (5 + Math.abs(vel.avance) * 3.5);
    jugador.distPaso += movido;
    if (jugador.distPaso > 0.65) { jugador.distPaso = 0; sonido.paso(); }
  } else {
    jugador.bob += (Math.round(jugador.bob / Math.PI) * Math.PI - jugador.bob) * 0.1;
  }
  camera.position.set(jugador.x, ALTURA_OJOS + Math.abs(Math.sin(jugador.bob)) * 0.025 - 0.012, jugador.z);
  camera.rotation.set(INCLINACION, jugador.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
}

// ================================================================ ELEGIR OBJETIVO (permisivo)
// Vale cualquier objeto a menos de ALCANCE que esté cerca de tu mano en pantalla.
const ALCANCE = 2.1;
const RADIO_SEL = 0.9;   // en alturas de pantalla: muy generoso
const vTmp = new THREE.Vector3(), vTmp2 = new THREE.Vector3();
const rayOcl = new THREE.Raycaster();
const puntero = new THREE.Vector2();
const disponible = o => !o.hecho && !(o.oculto && o.oculto());
function ocluido(o, d) {
  rayOcl.set(camera.position, vTmp2.copy(o.pos).sub(camera.position).normalize());
  rayOcl.far = d;
  const h = rayOcl.intersectObjects(muros, false);
  return h.length > 0 && h[0].distance < d - 0.12;
}
function elegirObjetivo() {
  let mejor = null, mejorPuntos = Infinity;
  for (const o of interactivos) {
    if (!disponible(o)) continue;
    const p = o.pos;
    const dist = Math.hypot(p.x - jugador.x, p.z - jugador.z);
    if (dist > ALCANCE) continue;
    vTmp.copy(p).project(camera);
    if (vTmp.z > 1 || Math.abs(vTmp.x) > 1.2 || Math.abs(vTmp.y) > 1.2) continue;
    const d = Math.hypot((vTmp.x - puntero.x) * camera.aspect, vTmp.y - puntero.y) / 2 * 2;
    if (d > RADIO_SEL) continue;
    if (ocluido(o, camera.position.distanceTo(p))) continue;
    let puntos = d + dist * 0.08;
    if (tipoDe(o) === 'colocar' && tiene(o.requiere)) puntos -= 0.35; // lo que puedes usar ahora, primero
    if (puntos < mejorPuntos) { mejorPuntos = puntos; mejor = o; }
  }
  return mejor;
}

// ================================================================ INTERACCIÓN
let rUlt = { pose: 'ninguna', cerrada: false, mano: null, gesto: null, debug: '' };
const inter = {
  obj: null, agarrado: null, base: 0, ref: null, tAbierta: 0,
  cerradaAntes: false, hoverObj: null, tHover: 0, intentado: null,
  ultimoObj: null, tUltimoObj: -1e9, pistaObj: null, tPista: 0,
};
const tipoDe = o => o.tipo;
const esContinuo = o => CONTINUOS.includes(tipoDe(o));
function pistaDe(o) {
  if (o.pista) return o.pista;
  return { bajar: 'Cierra la mano y bájala', girar: 'Cierra la mano y gira la muñeca', tirar: 'Cierra la mano y tira hacia ti',
    romper: 'Puño y golpe rápido', coger: 'Cierra la mano para cogerlo', colocar: 'Deja la mano encima' }[tipoDe(o)];
}
function resultado(r) {
  if (!r) return;
  if (typeof r === 'object' && r.error) { mensaje('✗ ' + r.error, 'mal'); sonido.error(); vibrar(90); return; }
  mensaje('✓ ' + r, 'ok'); vibrar(40);
}
function agarrar(o) {
  inter.agarrado = o;
  inter.base = o.progreso;
  inter.ref = rUlt.mano ? { ...rUlt.mano } : null;
  inter.tAbierta = 0;
  sonido.agarrar(); vibrar(20);
}
function soltar() {
  const o = inter.agarrado;
  inter.agarrado = null;
  if (!o) return;
  if (o.muelle) {
    const p0 = o.progreso;
    tween(0.25, k => { o.progreso = p0 * (1 - k); o.alCambiar(o.progreso); });
  }
}
function aplicarControl(o, m) {
  const ref = inter.ref;
  if (!ref || !m) return;
  let delta = 0;
  const t = tipoDe(o);
  if (t === 'bajar') delta = (m.cy - ref.cy) / (o.recorrido || 0.18);
  else if (t === 'girar') delta = Math.abs(m.ang - ref.ang) / (o.total || 1.3);
  else if (t === 'tirar') delta = Math.max(Math.log(m.size / ref.size) / 0.3, (m.cy - ref.cy) / (o.recorrido || 0.25));
  const p = THREE.MathUtils.clamp(inter.base + delta, 0, 1);
  if (Math.floor(p * 8) !== Math.floor(o.progreso * 8)) { sonido.tick(); vibrar(6); }
  o.progreso = p;
  o.alCambiar(p);
  if (!o.repetible && p >= 0.96) {
    const r = o.alCompletar();
    soltar();
    resultado(r);
  }
}
function intentar(o) {
  inter.intentado = o;
  const t = tipoDe(o);
  if (CONTINUOS.includes(t)) agarrar(o);
  else if (t === 'coger') resultado(o.coger());
  else if (t === 'romper') { inter.pistaObj = o; inter.tPista = performance.now() + 800; }
  else if (t === 'colocar') {
    if (tiene(o.requiere)) resultado(o.colocar());
    else { mensaje('✗ ' + pistaDe(o), 'mal'); sonido.error(); }
  }
}
function alRomper() {
  if (inter.agarrado) return;
  const o = inter.obj || (performance.now() - inter.tUltimoObj < 700 ? inter.ultimoObj : null);
  if (!o || !disponible(o)) { mensaje('Golpe al aire'); return; }
  inter.pistaObj = null;
  if (tipoDe(o) === 'romper') resultado(o.romper());
  else { mensaje(`✗ ${o.nombre}: eso no se rompe`, 'mal'); sonido.error(); vibrar(90); }
}
// Tecla E en el modo de prueba: hace la acción del objeto seleccionado
function accionRapida(o) {
  if (!o) { mensaje('No hay nada cerca'); return; }
  const t = tipoDe(o);
  if (t === 'colocar') { if (tiene(o.requiere)) resultado(o.colocar()); else mensaje('✗ ' + pistaDe(o), 'mal'); }
  else if (t === 'coger') resultado(o.coger());
  else if (t === 'romper') resultado(o.romper());
  else if (o.repetible) { o.alCambiar(1); o.alCambiar(0); }
  else { o.progreso = 1; o.alCambiar(1); resultado(o.alCompletar()); }
}

function pasoInteraccion(t, dt) {
  const manoVis = mano3d.visible;
  if (manoVis) { vTmp.copy(mano3d.palmaLocal).applyMatrix4(camera.matrixWorld).project(camera); puntero.set(vTmp.x, vTmp.y); }
  else puntero.set(0, -0.2);
  const cerr = !!(rUlt.mano && rUlt.cerrada);

  if (inter.agarrado) {
    const o = inter.agarrado;
    inter.obj = o;
    if (!disponible(o)) soltar();
    else if (cerr) { inter.tAbierta = 0; aplicarControl(o, rUlt.mano); }
    else { inter.tAbierta += dt; if (inter.tAbierta > 0.18) soltar(); }
  } else {
    const o = elegirObjetivo();
    inter.obj = o;
    if (o) { inter.ultimoObj = o; inter.tUltimoObj = t; }
    if (o !== inter.hoverObj) { inter.hoverObj = o; inter.tHover = 0; inter.intentado = null; }
    else inter.tHover += dt;
    if (o) {
      const tipo = tipoDe(o);
      // cerrar la mano encima = intentar
      if (cerr && !inter.cerradaAntes) intentar(o);
      // llegar ya con la mano cerrada a algo que se agarra también vale
      else if (cerr && esContinuo(o) && inter.tHover > 0.25 && inter.intentado !== o) intentar(o);
      // usar un objeto del inventario: basta con dejar la mano encima
      if (tipo === 'colocar' && tiene(o.requiere) && (manoVis || !detector) && inter.tHover > 0.45 && inter.intentado !== o) intentar(o);
    }
  }
  if (inter.pistaObj && t > inter.tPista) {
    if (inter.pistaObj === inter.obj && disponible(inter.pistaObj)) mensaje('Esto no se coge: dale un golpe');
    inter.pistaObj = null;
  }
  inter.cerradaAntes = cerr;
}

// ================================================================ MARCAS Y HUD DEL OBJETIVO
function pintarMarcas(t) {
  for (const o of interactivos) {
    const m = o.marca;
    if (!disponible(o) || !jugando) { m.visible = false; continue; }
    const p = o.pos;
    const dist = camera.position.distanceTo(p);
    if (dist > 6) { m.visible = false; continue; }
    m.visible = true;
    m.position.copy(p).add(vTmp2.copy(camera.position).sub(p).normalize().multiplyScalar(0.08));
    const mt = m.material;
    if (o === inter.agarrado) { mt.color.setHex(0x7fd67f); mt.opacity = 0.9; m.scale.setScalar(0.07); }
    else if (o === inter.obj) { mt.color.setHex(0xffffff); mt.opacity = 0.95; m.scale.setScalar(0.09 + Math.sin(t / 150) * 0.012); }
    else { mt.color.setHex(0xffe0a0); mt.opacity = 0.3; m.scale.setScalar(0.045); }
  }
  const o = inter.obj;
  const caja = $('objetivo');
  if (!o || !jugando) { caja.classList.add('oculto'); return; }
  caja.classList.remove('oculto');
  if ($('objNombre').textContent !== o.nombre) $('objNombre').textContent = o.nombre;
  const pista = inter.agarrado ? 'Sujetando… ' + pistaDe(o).replace(/^Cierra la mano[^y]*y /, '') : pistaDe(o);
  if ($('objPista').textContent !== pista) $('objPista').textContent = pista;
  let barra = -1;
  if (esContinuo(o) && (o.progreso > 0 || inter.agarrado === o)) barra = o.progreso;
  else if (tipoDe(o) === 'colocar' && tiene(o.requiere)) barra = Math.min(1, inter.tHover / 0.45);
  $('barra').style.display = barra >= 0 ? '' : 'none';
  if (barra >= 0) $('barraRelleno').style.width = (barra * 100).toFixed(0) + '%';
}

// ================================================================ TACTO
const rayMano = new THREE.Raycaster();
rayMano.far = 1.3;
function esSolidoActivo(o) {
  for (let p = o; p; p = p.parent) {
    if (!p.visible) return false;
    if (p === camera) return false;
  }
  return true;
}
let tocandoAntes = false, tRoce = 0;
const palmaAntes = new THREE.Vector2(), palmaAhora = new THREE.Vector2();
function sensacionTacto(t, dt) {
  const toca = mano3d.visible && mano3d.tocando;
  vTmp.copy(mano3d.palmaLocal).applyMatrix4(camera.matrixWorld).project(camera);
  palmaAhora.set(vTmp.x, vTmp.y);
  if (toca && !tocandoAntes) { vibrar(22); ruido(0.05, 0.35, 900, 'lowpass'); }
  else if (toca) {
    const v = palmaAhora.distanceTo(palmaAntes) / Math.max(dt, 1e-3);
    if (v > 0.6 && t - tRoce > 110) { tRoce = t; vibrar(8); ruido(0.07, Math.min(0.25, v * 0.08), 1800, 'bandpass'); }
  }
  tocandoAntes = toca;
  palmaAntes.copy(palmaAhora);
}

// ================================================================ MENSAJES
let tMsg = null;
function mensaje(txt, clase = '') {
  const m = $('mensajeTxt');
  m.textContent = txt; m.className = clase; m.style.opacity = 1;
  clearTimeout(tMsg);
  tMsg = setTimeout(() => { m.style.opacity = 0; }, 2400);
}
function parpadeo(dur, rojo = false) {
  const f = $('fundido');
  f.classList.toggle('rojo', rojo);
  f.style.opacity = rojo ? 0.6 : 1;
  setTimeout(() => { f.style.opacity = 0; }, dur * 1000);
}

// ================================================================ DEBUG (esqueleto 2D)
const CONEX = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const lienzo = $('lienzoMano'), ctx = lienzo.getContext('2d');
const NOMBRES_POSE = { ninguna: 'Sin mano', abierta: 'Mano abierta', puno: 'Puño', pinza: 'Pinza', otra: 'Mano' };
let debugVisible = false;
function dibujarMano(lm, r) {
  if (!debugVisible) return;
  ctx.fillStyle = '#050506';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  if (lm) {
    const W = lienzo.width, H = lienzo.height;
    ctx.strokeStyle = r.cerrada ? '#ff9a5a' : '#9aff8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of CONEX) { ctx.moveTo(lm[a].x * W, lm[a].y * H); ctx.lineTo(lm[b].x * W, lm[b].y * H); }
    ctx.stroke();
  }
  $('poseTxt').textContent = `${NOMBRES_POSE[r.pose] || r.pose}${inter.agarrado ? ' · sujetando' : ''}`;
  $('debugTxt').textContent = r.debug || '';
}

// ================================================================ CÁMARA REAL + DETECTOR
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
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: base }); // para probar en PC
  }
  video.srcObject = stream;
  await video.play();
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities ? track.getCapabilities() : {};
  flashPosible = !!caps.torch;
  if (flashPosible) await ponerFlash(true);
  actualizarBotonFlash();
}
async function ponerFlash(on) {
  if (!stream || !flashPosible) return;
  try { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: on }] }); flashOn = on; }
  catch (e) { flashPosible = false; }
}
function actualizarBotonFlash() {
  $('btnFlash').textContent = flashPosible && flashOn ? 'Flash: sí' : 'Flash: no';
  $('btnFlash').disabled = !flashPosible;
}
async function iniciarDetector() {
  const fileset = await FilesetResolver.forVisionTasks('./lib/mediapipe/wasm');
  const opciones = delegate => ({
    baseOptions: { modelAssetPath: './models/hand_landmarker.task', delegate },
    runningMode: 'VIDEO', numHands: 1,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { detector = await HandLandmarker.createFromOptions(fileset, opciones('GPU')); }
  catch (e) { console.warn('GPU no disponible, uso CPU', e); detector = await HandLandmarker.createFromOptions(fileset, opciones('CPU')); }
}

// ================================================================ PARTIDA
let jugando = false, tInicio = 0;
function reiniciarPartida() {
  inter.agarrado = null; inter.obj = null; inter.hoverObj = null;
  for (const o of interactivos) { o.hecho = false; o.progreso = 0; o.reset && o.reset(); }
  estadoInicial();
  resetMapa();
  pintarInventario();
  Object.assign(jugador, { x: 0.5, z: 2.0, yaw: 0 });
  vel.avance = 0; vel.giro = 0;
  reco.reiniciar();
  tInicio = performance.now();
}
reiniciarPartida();

async function empezar() {
  iniciarAudio();
  $('btnEmpezar').disabled = true;
  $('cargaTxt').textContent = 'Pidiendo la cámara…';
  try { await iniciarCamara(); }
  catch (e) { mostrarError(e.message || String(e)); $('btnEmpezar').disabled = false; $('cargaTxt').textContent = ''; return; }
  $('cargaTxt').textContent = 'Cargando el detector de manos…';
  try { await iniciarDetector(); }
  catch (e) { mostrarError('No se pudo cargar el detector de manos: ' + (e.message || e)); $('btnEmpezar').disabled = false; return; }
  try { await navigator.wakeLock?.request('screen'); } catch (e) {}
  $('pantallaInicio').classList.add('oculto');
  $('pantallaError').classList.add('oculto');
  reiniciarPartida();
  jugando = true;
  mensaje('Encuentra la forma de salir');
}
function mostrarError(txt) { $('errorTxt').textContent = txt; $('pantallaError').classList.remove('oculto'); }

$('btnEmpezar').onclick = empezar;
$('btnReintentar').onclick = () => { $('pantallaError').classList.add('oculto'); empezar(); };
$('btnSinCamara').onclick = () => {
  iniciarAudio();
  $('pantallaError').classList.add('oculto'); $('pantallaInicio').classList.add('oculto');
  reiniciarPartida(); jugando = true; mensaje('Modo prueba: W/S andar, A/D girar, E usar');
};
$('btnAyuda').onclick = () => $('pantallaAyuda').classList.remove('oculto');
$('btnCerrarAyuda').onclick = () => $('pantallaAyuda').classList.add('oculto');
$('btnDebug').onclick = () => { debugVisible = !debugVisible; $('panelMano').classList.toggle('oculto', !debugVisible); };
$('btnReset').onclick = () => { reiniciarPartida(); mensaje('Partida reiniciada'); };
$('btnFlash').onclick = async () => { await ponerFlash(!flashOn); actualizarBotonFlash(); };
$('btnOtraVez').onclick = () => { $('pantallaFin').classList.add('oculto'); reiniciarPartida(); jugando = true; };

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') teclas.w = true;
  if (k === 's' || k === 'arrowdown') teclas.s = true;
  if (k === 'a' || k === 'arrowleft') teclas.a = true;
  if (k === 'd' || k === 'arrowright') teclas.d = true;
  if (k === 'e' && jugando) accionRapida(inter.obj);
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup') teclas.w = false;
  if (k === 's' || k === 'arrowdown') teclas.s = false;
  if (k === 'a' || k === 'arrowleft') teclas.a = false;
  if (k === 'd' || k === 'arrowright') teclas.d = false;
});

function escapar() {
  estado.escapado = true;
  jugando = false;
  pararAndar();
  sonido.victoria();
  const s = Math.floor((performance.now() - tInicio) / 1000);
  $('finTxt').textContent = `Tiempo: ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  $('pantallaFin').classList.remove('oculto');
}

// ================================================================ BUCLE PRINCIPAL
let tPrev = performance.now(), ultimoFrameVideo = -1;
const qId = new THREE.Quaternion();
function bucle() {
  requestAnimationFrame(bucle);
  const t = performance.now();
  const dt = Math.min(0.05, (t - tPrev) / 1000);
  tPrev = t;

  moverJugador(dt);

  // --- Detección de la mano
  if (jugando && detector && video.readyState >= 2 && video.currentTime !== ultimoFrameVideo) {
    ultimoFrameVideo = video.currentTime;
    const res = detector.detectForVideo(video, t);
    const lm = (res.landmarks && res.landmarks[0]) || null;
    const aspecto = video.videoWidth / (video.videoHeight || 1);
    ultimaMano = lm; aspectoVideo = aspecto;
    if (lienzo.width / lienzo.height !== aspecto && aspecto > 0) {
      lienzo.height = Math.round(lienzo.width / aspecto);
      lienzo.style.height = lienzo.height + 'px';
    }
    rUlt = reco.actualizar(lm, t, aspecto);
    dibujarMano(lm, rUlt);
    if (rUlt.gesto === 'romper') alRomper();
  }

  // --- Mano virtual: pegada al asa si sujetas algo; si no, apoyada en lo que toque
  let ancla = null;
  if (inter.agarrado && inter.agarrado.agarre) ancla = camera.worldToLocal(inter.agarrado.agarre().clone());
  let limite = Infinity;
  if (mano3d.hayDatos && !ancla) {
    camera.getWorldPosition(rayMano.ray.origin);
    rayMano.ray.direction.copy(mano3d.palmaLocal).normalize().transformDirection(camera.matrixWorld);
    for (const h of rayMano.intersectObjects(solidos, false)) {
      if (esSolidoActivo(h.object)) { limite = h.distance; break; }
    }
  }
  mano3d.actualizar(jugando ? ultimaMano : null, aspectoVideo, dt, limite, ancla);
  sensacionTacto(t, dt);
  if (jugando) pasoInteraccion(t, dt);
  mano3d.resaltar(!!inter.obj);

  // --- La caja en la mano
  if (estado.cajaEnMano && cofre.parent === camera) {
    const k = 1 - Math.pow(0.6, dt * 60);
    const esc = mano3d.visible ? mano3d.escalaMano : 1;
    if (mano3d.visible) vTmp.copy(mano3d.palmaLocal).addScaledVector(mano3d.normalPalma, 0.05 * esc);
    else vTmp.set(0.15, -0.25, -0.5);
    cofre.position.lerp(vTmp, k);
    cofre.quaternion.slerp(qId, k * 0.5);
    cofre.scale.setScalar(cofre.scale.x + (0.55 * esc - cofre.scale.x) * 0.2);
  }

  // --- Animaciones
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.fin && tw.fin(); }
  }
  if (estado.luz) luzBombilla.intensity = Math.random() < 0.03 ? 5 : 26;
  if (estado.corriente) { const f = Math.random() < 0.02 ? 0.3 : 1; luzSala.intensity = 5 * f; luzSala2.intensity = 4 * f; }
  for (const tr of trozos) {
    if (tr.position.y <= 0.01) continue;
    tr.userData.v.y -= 9.8 * dt;
    tr.position.addScaledVector(tr.userData.v, dt);
    tr.rotation.x += tr.userData.w.x * dt; tr.rotation.y += tr.userData.w.y * dt;
    if (tr.position.y <= 0.01) { tr.position.y = 0.01; tr.rotation.set(-Math.PI / 2, 0, Math.random() * 6); }
  }
  // vapor
  acumVapor += dt * 70 * estado.vapor;
  while (acumVapor >= 1) {
    acumVapor -= 1;
    const p = particulas.find(q => q.vida <= 0);
    if (!p) break;
    p.vida = 0.6 + Math.random() * 0.3; p.max = p.vida;
    p.s.position.copy(BOCA).add(V(0, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05));
    p.v.set(2.2 + Math.random(), 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4);
    p.s.visible = true;
  }
  for (const p of particulas) {
    if (p.vida <= 0) continue;
    p.vida -= dt;
    if (p.vida <= 0) { p.s.visible = false; continue; }
    const k = 1 - p.vida / p.max;
    p.s.position.addScaledVector(p.v, dt);
    p.v.multiplyScalar(1 - dt * 1.5);
    p.s.scale.setScalar(0.06 + k * 0.45);
    p.s.material.opacity = 0.45 * (1 - k);
  }
  if (vaporGain) vaporGain.gain.value = estado.vapor * 0.22 * Math.max(0, 1 - camera.position.distanceTo(BOCA) / 7);

  if (figura.visible) {
    figura.position.y = Math.sin(t / 700) * 0.01;
    figura.lookAt(jugador.x, 0, jugador.z);
  }
  linterna.intensity = 25 + Math.sin(t / 90) * 1.5;

  // --- Susto y salida
  if (jugando && estado.puertaAbierta && !estado.susto && jugador.z < -9.9) {
    estado.susto = true;
    sonido.susto(); vibrar(600); parpadeo(0.5);
    figura.position.set(0, 0, jugador.z - 0.8);
    setTimeout(() => { figura.visible = false; luzPasillo.intensity = 1.2; }, 450);
  }
  if (jugando && jugador.z < PASILLO_FIN + 0.7) escapar();

  if (jugando) {
    const s = Math.floor((t - tInicio) / 1000);
    $('tiempo').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  pintarMarcas(t);
  renderer.render(scene, camera);
}

// Gancho para pruebas sin cámara
window.__debug = {
  setMano: (lm, a = 3 / 4) => { ultimaMano = lm; aspectoVideo = a; rUlt = reco.actualizar(lm, performance.now(), a); if (rUlt.gesto === 'romper') alRomper(); },
  mano3d, jugador, estado, inter, interactivos, teclear: k => accionRapida(inter.obj),
};
bucle();
