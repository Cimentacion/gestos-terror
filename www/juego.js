import * as THREE from './lib/three/three.module.js';
import { FilesetResolver, HandLandmarker } from './lib/mediapipe/vision_bundle.js';
import { Reconocedor, GESTOS } from './gestos.js';
import { Mano3D } from './mano3d.js';

const $ = id => document.getElementById(id);

// ================================================================ AYUDA
const AYUDA = [
  ['Bajar cuerda', 'Pinza (pulgar con índice) y baja la mano.', 'Cuerda de la luz'],
  ['Tirar palanca', 'Puño cerrado y baja la mano despacio.', 'Palanca'],
  ['Romper', 'Puño y golpe rápido hacia delante o de lado.', 'Cristal'],
  ['Agarrar', 'Mano abierta y ciérrala en puño. Quieta un momento.', 'Objetos'],
  ['Girar llave', 'Pinza o puño y gira la muñeca, sin mover la mano de sitio.', 'Cerradura'],
];
const htmlAyuda = AYUDA.map(([n, d, o]) => `<div><b>${n}</b> → ${o}<br>${d}</div>`).join('');
$('listaGestos1').innerHTML = htmlAyuda;
$('listaGestos2').innerHTML = htmlAyuda;

// ================================================================ RENDER Y ESCENA
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const ESCALA = 0.6; // resolución interna baja: estilo PS1 y más rendimiento
renderer.setPixelRatio(1);
$('juego').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 2.5, 9);

const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 40);
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

// ================================================================ TEXTURAS
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
function texCanvas(c, repetir = false) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function texturaTexto(lineas, w, h, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.fondo || '#d8d0b8';
  g.fillRect(0, 0, w, h);
  if (!opts.fondo) {
    for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(90,70,40,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  }
  g.fillStyle = opts.color || '#2a1810';
  g.font = opts.fuente || 'bold 22px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const alto = h / (lineas.length + 1);
  lineas.forEach((l, i) => g.fillText(l, w / 2, alto * (i + 1)));
  return texCanvas(c);
}

const texPared = texturaRuido([120, 112, 96], 30, 64, true); texPared.repeat.set(3, 1.5);
const texSuelo = texturaRuido([70, 60, 50], 35); texSuelo.repeat.set(4, 4);
const texTecho = texturaRuido([90, 88, 82], 20); texTecho.repeat.set(3, 3);
const texMadera = texturaRuido([90, 58, 34], 30, 32, true);
const texMetal = texturaRuido([95, 95, 100], 25, 32);

const mat = opts => new THREE.MeshLambertMaterial(opts);
const matPared = mat({ map: texPared });
const matMadera = mat({ map: texMadera });
const matMetal = mat({ map: texMetal });
const matOscuro = mat({ color: 0x151515 });

// ================================================================ LUCES
scene.add(new THREE.AmbientLight(0x2a3448, 0.6));
const linterna = new THREE.SpotLight(0xffe2b8, 25, 9, 0.45, 0.65, 2);
camera.add(linterna);
camera.add(linterna.target);
linterna.target.position.set(0, -0.05, -1);
const luzBombilla = new THREE.PointLight(0xffd59a, 0, 12, 2);
luzBombilla.position.set(0, 2.7, 0);
scene.add(luzBombilla);
const luzLuna = new THREE.PointLight(0x6080ff, 3, 6, 2);
luzLuna.position.set(0, 1.7, 3.6);
scene.add(luzLuna);

// Mano virtual
const mano3d = new Mano3D(camera);
let ultimaMano = null, aspectoVideo = 3 / 4;

// ================================================================ UTILIDADES
function caja(w, h, d, material, x, y, z, padre = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z); padre.add(m); return m;
}
function plano(w, h, material, x, y, z, ry = 0, rx = 0, padre = scene) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, 0); padre.add(m); return m;
}
const matHit = new THREE.MeshBasicMaterial({ visible: false });
const zona = (w, h, d, x, y, z) => caja(w, h, d, matHit, x, y, z);

const tweens = [];
function tween(dur, fn, fin) { tweens.push({ dur, t: 0, fn, fin }); }
const suave = k => k * k * (3 - 2 * k);

// ================================================================ SONIDO SINTETIZADO
let audio = null, zumbido = null;
function iniciarAudio() {
  if (audio) return;
  audio = new (window.AudioContext || window.webkitAudioContext)();
  const o = audio.createOscillator(), o2 = audio.createOscillator();
  zumbido = audio.createGain();
  o.type = 'sine'; o.frequency.value = 50;
  o2.type = 'sawtooth'; o2.frequency.value = 100;
  const g2 = audio.createGain(); g2.gain.value = 0.15;
  o.connect(zumbido); o2.connect(g2).connect(zumbido);
  zumbido.gain.value = 0.05;
  zumbido.connect(audio.destination);
  o.start(); o2.start();
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
  const f = audio.createBiquadFilter(); f.type = tipo; f.frequency.value = frec;
  const g = audio.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(audio.destination); s.start(t0);
}
const sonido = {
  error: () => { tono(140, 0.18, 'square', 0.07); tono(110, 0.2, 'square', 0.07, null, 0.1); },
  paso: () => { ruido(0.09, 0.5, 300 + Math.random() * 100, 'lowpass'); },
  llave: () => { tono(1800, 0.04, 'square', 0.1); tono(1200, 0.05, 'square', 0.1, null, 0.12); ruido(0.08, 0.2, 3000, 'highpass', 0.1); },
  puerta: () => { tono(90, 1.4, 'sawtooth', 0.06, 140); tono(220, 1.2, 'sawtooth', 0.025, 180, 0.2); },
  palanca: () => { tono(70, 0.35, 'square', 0.2, 40); ruido(0.2, 0.25, 500); ruido(0.3, 0.3, 4000, 'highpass', 0.15); },
  apagon: () => { tono(100, 0.8, 'sawtooth', 0.08, 30); },
  chispazo: () => { ruido(0.35, 0.6, 3000); tono(60, 0.4, 'sawtooth', 0.15, 50); },
  cuerda: () => { tono(2500, 0.03, 'square', 0.08); ruido(0.04, 0.2, 4000); },
  agarrar: () => { ruido(0.12, 0.2, 800); tono(300, 0.08, 'triangle', 0.1); },
  abrirCaja: () => { tono(400, 0.3, 'sawtooth', 0.04, 250); tono(900, 0.08, 'triangle', 0.08, null, 0.3); },
  romper: () => { ruido(0.6, 0.5, 2500); for (let i = 0; i < 8; i++) tono(2000 + Math.random() * 3000, 0.15, 'sine', 0.05, null, Math.random() * 0.35); },
  susto: () => { ruido(0.9, 0.7, 800, 'bandpass'); tono(880, 0.8, 'sawtooth', 0.12, 220); tono(55, 1.5, 'sawtooth', 0.15, 40); },
  victoria: () => { [392, 494, 587, 784].forEach((f, i) => tono(f, 0.5, 'triangle', 0.08, null, i * 0.15)); },
};
function vibrar(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ================================================================ HABITACIÓN 6 x 3 x 6
const AL = 3;
plano(6, 6, mat({ map: texSuelo }), 0, 0, 0, 0, -Math.PI / 2);
plano(6, 6, mat({ map: texTecho }), 0, AL, 0, 0, Math.PI / 2);
plano(6, AL, matPared, 3, AL / 2, 0, -Math.PI / 2);   // este
plano(6, AL, matPared, -3, AL / 2, 0, Math.PI / 2);   // oeste
// norte con hueco de puerta
caja(2.5, AL, 0.1, matPared, -1.75, AL / 2, -3.05);
caja(2.5, AL, 0.1, matPared, 1.75, AL / 2, -3.05);
caja(1.0, AL - 2.1, 0.1, matPared, 0, 2.1 + (AL - 2.1) / 2, -3.05);
// sur con hueco de ventana
caja(2.3, AL, 0.1, matPared, -1.85, AL / 2, 3.05);
caja(2.3, AL, 0.1, matPared, 1.85, AL / 2, 3.05);
caja(1.4, 1.0, 0.1, matPared, 0, 0.5, 3.05);
caja(1.4, AL - 2.2, 0.1, matPared, 0, 2.2 + (AL - 2.2) / 2, 3.05);

// Ventana con barrotes (ambiente, no se puede salir por ella)
caja(1.5, 0.06, 0.16, matMadera, 0, 1.0, 3.0);
caja(1.5, 0.06, 0.16, matMadera, 0, 2.2, 3.0);
caja(0.06, 1.26, 0.16, matMadera, -0.72, 1.6, 3.0);
caja(0.06, 1.26, 0.16, matMadera, 0.72, 1.6, 3.0);
for (let i = -2; i <= 2; i++) caja(0.03, 1.2, 0.03, matMetal, i * 0.26, 1.6, 2.97);
const cielo = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: 0x0a1028 }));
cielo.position.set(0, 1.6, 4.5); cielo.rotation.y = Math.PI; scene.add(cielo);
const luna = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), new THREE.MeshBasicMaterial({ color: 0xc8d0ff }));
luna.position.set(-0.6, 2.2, 4.45); luna.rotation.y = Math.PI; scene.add(luna);

// Notas en las paredes (pistas)
plano(0.5, 0.36, mat({ map: texturaTexto(['LA CORRIENTE', 'MANTIENE LA', 'PUERTA CERRADA'], 256, 184) }), 1.7, 1.55, 2.99, Math.PI);
plano(0.46, 0.34, mat({ map: texturaTexto(['LA LLAVE', 'ESTÁ EN', 'LA VITRINA'], 256, 190) }), -2.99, 1.6, -1.2, Math.PI / 2);
plano(0.8, 0.3, mat({ map: texturaTexto(['NO TE GIRES'], 256, 96, { fondo: '#000', color: '#7a0a0a', fuente: 'bold 30px serif' }), transparent: true, opacity: 0.85 }), -1.4, 2.3, -2.99);

// ================================================================ ESTADO DEL ESCAPE ROOM
const estado = { luz: false, corriente: true, vitrinaRota: false, enMano: null, puertaAbierta: false, susto: false, escapado: false };
const objetos = [];

// ---------------------------------------------------------------- 1. Cuerda y bombilla (centro del techo)
caja(0.1, 0.1, 0.1, matOscuro, 0, 2.95, 0);
const bombillaMat = new THREE.MeshBasicMaterial({ color: 0x302820 });
const bombilla = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bombillaMat);
bombilla.position.set(0, 2.83, 0); scene.add(bombilla);
const cuerda = new THREE.Group();
cuerda.position.set(0.08, 2.9, 0); scene.add(cuerda);
const hilo = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.05, 4), mat({ color: 0xc8c0a8 }));
hilo.position.y = -0.525; cuerda.add(hilo);
const tirador = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.07, 6), mat({ color: 0xd8d0b8 }));
tirador.position.y = -1.08; cuerda.add(tirador);

objetos.push({
  nombre: 'Cuerda de la luz', gesto: 'cuerda', repetible: true,
  hit: zona(0.4, 0.9, 0.4, 0.08, 2.25, 0),
  intentar() {
    sonido.cuerda();
    tween(0.35, k => { cuerda.position.y = 2.9 - Math.sin(k * Math.PI) * 0.12; });
    estado.luz = !estado.luz;
    luzBombilla.intensity = estado.luz ? 26 : 0;
    bombillaMat.color.setHex(estado.luz ? 0xfff0c0 : 0x302820);
    return estado.luz ? 'Luz encendida' : 'Luz apagada';
  },
  reset() { cuerda.position.y = 2.9; },
});

// ---------------------------------------------------------------- 2. Cuadro eléctrico con palanca (pared este)
caja(0.1, 0.8, 0.6, mat({ color: 0x3a3c3a, map: texMetal }), 2.95, 1.35, -1.0);
plano(0.5, 0.12, mat({ map: texturaTexto(['CORRIENTE'], 256, 60, { fondo: '#c8a020', color: '#111', fuente: 'bold 34px sans-serif' }) }), 2.895, 1.85, -1.0, -Math.PI / 2);
const palancaPivote = new THREE.Group();
palancaPivote.position.set(2.88, 1.3, -1.0);
scene.add(palancaPivote);
const brazo = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), matMetal);
brazo.position.y = 0.2; palancaPivote.add(brazo);
const pomo = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mat({ color: 0x8a1010, flatShading: true }));
pomo.position.y = 0.4; palancaPivote.add(pomo);
const ANG_ARRIBA = -0.5, ANG_ABAJO = -2.6;
palancaPivote.rotation.x = ANG_ARRIBA;
// Piloto del cierre eléctrico sobre la puerta
const pilotoMat = new THREE.MeshBasicMaterial({ color: 0xff2010 });
caja(0.12, 0.08, 0.05, pilotoMat, 0, 2.3, -2.98);
const luzPiloto = new THREE.PointLight(0xff2010, 1.5, 2.5, 2);
luzPiloto.position.set(0, 2.25, -2.8); scene.add(luzPiloto);

objetos.push({
  nombre: 'Palanca', gesto: 'palanca',
  hit: zona(0.45, 0.9, 0.75, 2.8, 1.4, -1.0),
  intentar() {
    this.hecho = true;
    sonido.palanca();
    tween(0.5, k => { palancaPivote.rotation.x = ANG_ARRIBA + (ANG_ABAJO - ANG_ARRIBA) * suave(k); }, () => {
      estado.corriente = false;
      sonido.apagon();
      if (zumbido) zumbido.gain.setTargetAtTime(0, audio.currentTime, 0.3);
      pilotoMat.color.setHex(0x20ff40);
      luzPiloto.color.setHex(0x20ff40);
      // parpadeo de todo
      parpadeo(0.6);
    });
    return 'Has cortado la corriente';
  },
  reset() { this.hecho = false; palancaPivote.rotation.x = ANG_ARRIBA; pilotoMat.color.setHex(0xff2010); luzPiloto.color.setHex(0xff2010); if (zumbido) zumbido.gain.value = 0.05; },
});

// ---------------------------------------------------------------- 3 y 4. Mesa con vitrina y caja (pared oeste)
const MESA = new THREE.Vector3(-2.4, 0, 0.8);
caja(0.9, 0.06, 0.6, matMadera, MESA.x, 0.8, MESA.z);
for (const [dx, dz] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) caja(0.05, 0.8, 0.05, matMadera, MESA.x + dx, 0.4, MESA.z + dz);
// vitrina: marco + cristales
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

// caja con tapa
const cofre = new THREE.Group();
caja(0.24, 0.14, 0.18, mat({ color: 0x5a3a20, flatShading: true }), 0, 0.07, 0, cofre);
const tapa = new THREE.Group(); tapa.position.set(0, 0.14, -0.09); cofre.add(tapa);
caja(0.25, 0.035, 0.19, matMetal, 0, 0.0175, 0.095, tapa);
caja(0.03, 0.04, 0.015, mat({ color: 0xb08a3a }), 0, 0.09, 0.095, cofre);
const COFRE_MESA = new THREE.Vector3(MESA.x, 0.83, MESA.z);
cofre.position.copy(COFRE_MESA);
scene.add(cofre);

// llave (la que acaba en la mano)
function crearLlave() {
  const g = new THREE.Group();
  const mDorado = mat({ color: 0xc0962a, emissive: 0x2a1a00, flatShading: true });
  const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 4, 8), mDorado);
  g.add(anillo);
  caja(0.008, 0.075, 0.008, mDorado, 0, -0.06, 0, g);
  caja(0.02, 0.01, 0.008, mDorado, 0.01, -0.085, 0, g);
  caja(0.016, 0.01, 0.008, mDorado, 0.008, -0.07, 0, g);
  return g;
}
const llaveMano = crearLlave();
llaveMano.visible = false;
camera.add(llaveMano);

// trozos de cristal
const trozos = [];
const trozoGeo = new THREE.BufferGeometry();
trozoGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.07, 0, 0, 0.02, 0.09, 0], 3));
trozoGeo.computeVertexNormals();
const trozoMat = new THREE.MeshLambertMaterial({ color: 0xb0c8e0, transparent: true, opacity: 0.6, side: THREE.DoubleSide });

objetos.push({
  nombre: 'Vitrina', gesto: 'romper',
  hit: zona(0.7, 0.55, 0.6, MESA.x, 1.05, MESA.z),
  get hechoVisible() { return estado.vitrinaRota; },
  intentar() {
    this.hecho = true;
    estado.vitrinaRota = true;
    sonido.romper();
    vibrar(120);
    cristales.visible = false;
    this.hit.layers.set(1); // deja de tapar a la caja
    for (let i = 0; i < 30; i++) {
      const t = new THREE.Mesh(trozoGeo, trozoMat);
      const s = 0.5 + Math.random();
      t.scale.setScalar(s);
      t.position.set(MESA.x + (Math.random() - 0.5) * VW, 0.85 + Math.random() * VH, MESA.z + (Math.random() - 0.5) * VD);
      t.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      t.userData.v = new THREE.Vector3((Math.random() - 0.2) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6);
      t.userData.w = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      scene.add(t); trozos.push(t);
    }
    return 'Cristal roto';
  },
  reset() {
    this.hecho = false; cristales.visible = true; this.hit.layers.set(0);
    for (const t of trozos) scene.remove(t);
    trozos.length = 0;
  },
});

objetos.push({
  nombre: 'Caja', gesto: 'agarrar',
  hit: zona(0.32, 0.3, 0.3, MESA.x, 0.95, MESA.z),
  intentar() {
    if (!estado.vitrinaRota) return { error: 'La vitrina está cerrada. Rómpela.' };
    this.hecho = true;
    estado.enMano = 'caja';
    sonido.agarrar();
    camera.attach(cofre); // conserva su posición actual y pasa a ir con la cámara
    // a los 0,9 s se abre sola y aparece la llave
    setTimeout(() => {
      if (estado.enMano !== 'caja') return;
      sonido.abrirCaja();
      tween(0.4, k => { tapa.rotation.x = -suave(k) * 1.9; }, () => {
        setTimeout(() => {
          if (estado.enMano !== 'caja') return;
          cofre.visible = false;
          estado.enMano = 'llave';
          llaveMano.visible = true;
          llaveMano.position.copy(cofre.position);
          sonido.llave();
          mensaje('Tienes la llave', 'ok');
        }, 450);
      });
    }, 900);
    return 'Has cogido la caja';
  },
  reset() {
    this.hecho = false;
    scene.attach(cofre);
    cofre.position.copy(COFRE_MESA); cofre.rotation.set(0, 0, 0); cofre.scale.setScalar(1);
    cofre.visible = true; tapa.rotation.x = 0;
  },
});

// ---------------------------------------------------------------- 5. Puerta con cerradura (pared norte)
const puertaPivote = new THREE.Group();
puertaPivote.position.set(-0.5, 0, -3.0);
scene.add(puertaPivote);
caja(1.0, 2.1, 0.07, matMadera, 0.5, 1.05, 0, puertaPivote);
caja(0.1, 0.18, 0.02, matMetal, 0.85, 1.0, 0.045, puertaPivote);
caja(0.012, 0.035, 0.03, matOscuro, 0.85, 0.99, 0.05, puertaPivote);
const pomoPuerta = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mat({ color: 0x8a7040, flatShading: true }));
pomoPuerta.position.set(0.85, 1.12, 0.07); puertaPivote.add(pomoPuerta);
const llaveCerradura = crearLlave();
llaveCerradura.position.set(0.85, 1.0, 0.09);
llaveCerradura.rotation.x = Math.PI / 2;
llaveCerradura.visible = false;
puertaPivote.add(llaveCerradura);
caja(0.08, 2.15, 0.14, matMadera, -0.54, 1.07, -3.0);
caja(0.08, 2.15, 0.14, matMadera, 0.54, 1.07, -3.0);
caja(1.16, 0.08, 0.14, matMadera, 0, 2.14, -3.0);

// Pasillo detrás de la puerta, con salida al fondo
const PASILLO_FIN = -7;
caja(1.2, 0.05, 4, matOscuro, 0, 0, -5);
caja(0.05, 2.3, 4, mat({ map: texPared, color: 0x885555 }), -0.6, 1.15, -5);
caja(0.05, 2.3, 4, mat({ map: texPared, color: 0x885555 }), 0.6, 1.15, -5);
caja(1.2, 0.05, 4, matOscuro, 0, 2.3, -5);
caja(1.2, 2.3, 0.05, matOscuro, 0, 1.15, PASILLO_FIN);
caja(0.8, 1.9, 0.04, mat({ color: 0x1a2a1a }), 0, 0.95, PASILLO_FIN + 0.05);
plano(0.4, 0.12, new THREE.MeshBasicMaterial({ map: texturaTexto(['SALIDA'], 128, 40, { fondo: '#0a5a1a', color: '#bfffc8', fuente: 'bold 26px sans-serif' }) }), 0, 2.05, PASILLO_FIN + 0.08);
const luzSalida = new THREE.PointLight(0x30ff60, 0, 3, 2);
luzSalida.position.set(0, 2.0, PASILLO_FIN + 0.4); scene.add(luzSalida);
const luzPasillo = new THREE.PointLight(0xff3020, 0, 5, 2);
luzPasillo.position.set(0, 2.0, -4.5); scene.add(luzPasillo);
// La figura
const figura = new THREE.Group();
figura.position.set(0.1, 0, -5.4); scene.add(figura);
const matFigura = mat({ color: 0x050505, flatShading: true });
caja(0.4, 1.3, 0.22, matFigura, 0, 0.95, 0, figura);
const cabeza = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), matFigura);
cabeza.position.set(0, 1.8, 0); cabeza.scale.set(1, 1.3, 1); figura.add(cabeza);
const ojoMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
caja(0.025, 0.012, 0.01, ojoMat, -0.05, 1.82, 0.13, figura);
caja(0.025, 0.012, 0.01, ojoMat, 0.05, 1.82, 0.13, figura);
figura.visible = false;

objetos.push({
  nombre: 'Cerradura', gesto: 'llave',
  hit: zona(0.45, 0.55, 0.35, 0.35, 1.05, -2.9),
  intentar() {
    if (estado.enMano !== 'llave') return { error: 'No tienes la llave' };
    if (estado.corriente) {
      sonido.chispazo(); vibrar(400); parpadeo(0.25);
      return { error: '¡Calambre! La cerradura tiene corriente' };
    }
    this.hecho = true;
    estado.enMano = null;
    llaveMano.visible = false;
    llaveCerradura.visible = true;
    sonido.llave();
    tween(0.45, k => { llaveCerradura.rotation.y = suave(k) * Math.PI / 2; }, () => {
      sonido.puerta();
      figura.visible = true;
      luzPasillo.intensity = 4;
      luzSalida.intensity = 3;
      tween(1.6, k => { puertaPivote.rotation.y = suave(k) * 1.75; }, () => { estado.puertaAbierta = true; });
    });
    return 'La puerta se abre…';
  },
  reset() {
    this.hecho = false; llaveCerradura.visible = false; llaveCerradura.rotation.y = 0;
    puertaPivote.rotation.y = 0; figura.visible = false; luzPasillo.intensity = 0; luzSalida.intensity = 0;
  },
});

// ================================================================ JUGADOR
const jugador = { x: 0, z: 1.6, altura: 1.6, bob: 0, distPaso: 0 };
const RADIO = 0.3;
function libre(x, z) {
  if (x > -3 + RADIO && x < 3 - RADIO && z > -3 + RADIO && z < 3 - RADIO) {
    if (x < MESA.x + 0.45 + RADIO && Math.abs(z - MESA.z) < 0.3 + RADIO) return false; // mesa
    return true;
  }
  if (estado.puertaAbierta && Math.abs(x) < 0.6 - RADIO && z <= -3 + RADIO + 0.001 && z > PASILLO_FIN + RADIO) return true;
  return false;
}

// --- Mirar: giroscopio (como Riviera Cop) + arrastrar para girar
let orientacion = null, yawExtra = 0, pitchManual = 0, yawManual = 0, calibrado = false;
addEventListener('deviceorientation', e => { if (e.alpha !== null && e.beta !== null) orientacion = e; });
const EJE_Z = new THREE.Vector3(0, 0, 1), EJE_Y = new THREE.Vector3(0, 1, 0);
const qAjuste = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // de "mirando al cielo" a "mirando de frente"
const qTmp = new THREE.Quaternion(), qDisp = new THREE.Quaternion(), qYaw = new THREE.Quaternion(), eulerTmp = new THREE.Euler();
function quaternionDispositivo(o, q) {
  const gr = THREE.MathUtils.degToRad;
  const orient = gr((screen.orientation && screen.orientation.angle) || window.orientation || 0);
  eulerTmp.set(gr(o.beta), gr(o.alpha), -gr(o.gamma), 'YXZ');
  q.setFromEuler(eulerTmp);
  q.multiply(qAjuste);
  q.multiply(qTmp.setFromAxisAngle(EJE_Z, -orient));
  return q;
}
function orientarCamara() {
  if (orientacion) {
    quaternionDispositivo(orientacion, qDisp);
    if (!calibrado) {
      // al empezar, lo que tienes delante es "hacia la puerta"
      const yawDisp = new THREE.Euler().setFromQuaternion(qDisp, 'YXZ').y;
      yawExtra = -yawDisp;
      calibrado = true;
    }
    qYaw.setFromAxisAngle(EJE_Y, yawExtra);
    camera.quaternion.copy(qYaw).multiply(qDisp);
  } else {
    camera.rotation.set(pitchManual, yawManual, 0, 'YXZ');
  }
}

let arrastre = null;
renderer.domElement.addEventListener('pointerdown', e => { arrastre = { id: e.pointerId, x: e.clientX, y: e.clientY }; iniciarAudio(); });
addEventListener('pointermove', e => {
  if (!arrastre || e.pointerId !== arrastre.id) return;
  const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
  if (orientacion) yawExtra -= dx * 0.006;
  else { yawManual -= dx * 0.006; pitchManual = THREE.MathUtils.clamp(pitchManual - dy * 0.006, -1.25, 1.25); }
  arrastre.x = e.clientX; arrastre.y = e.clientY;
});
const soltar = e => { if (arrastre && e.pointerId === arrastre.id) arrastre = null; };
addEventListener('pointerup', soltar);
addEventListener('pointercancel', soltar);

// --- Andar: mantener pulsado el botón de la izquierda
let andando = false, teclaAndar = false;
const btnAndar = $('btnAndar');
btnAndar.addEventListener('pointerdown', e => { e.stopPropagation(); andando = true; btnAndar.classList.add('pulsado'); btnAndar.setPointerCapture(e.pointerId); iniciarAudio(); });
const pararAndar = () => { andando = false; btnAndar.classList.remove('pulsado'); };
btnAndar.addEventListener('pointerup', pararAndar);
btnAndar.addEventListener('pointercancel', pararAndar);
btnAndar.addEventListener('lostpointercapture', pararAndar);

// ================================================================ APUNTAR CON LA MANO
const ray = new THREE.Raycaster();
ray.far = 2.0;
const ndc = new THREE.Vector2();
const vTmp = new THREE.Vector3();
let objetivo = null, ultimoObjetivo = null, tUltimoObjetivo = -1e9;
function actualizarObjetivo(t) {
  const conMano = mano3d.visible;
  if (conMano) {
    vTmp.copy(mano3d.palmaLocal).applyMatrix4(camera.matrixWorld).project(camera);
    ndc.set(vTmp.x, vTmp.y);
  } else ndc.set(0, 0);
  $('mira').classList.toggle('oculta', conMano);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(objetos.map(o => o.hit), false);
  objetivo = hits.length ? objetos.find(o => o.hit === hits[0].object) : null;
  if (objetivo) { ultimoObjetivo = objetivo; tUltimoObjetivo = t; }
  mano3d.resaltar(!!objetivo && !(objetivo.hecho && !objetivo.repetible));
  let txt = '';
  if (objetivo) txt = objetivo.hecho && !objetivo.repetible ? `${objetivo.nombre} ✓` : objetivo.nombre;
  if ($('objetivoTxt').textContent !== txt) $('objetivoTxt').textContent = txt;
}

// ================================================================ MENSAJES Y GESTOS
let tMsg = null;
function mensaje(txt, clase = '') {
  const m = $('mensajeTxt');
  m.textContent = txt; m.className = clase; m.style.opacity = 1;
  clearTimeout(tMsg);
  tMsg = setTimeout(() => { m.style.opacity = 0; }, 2200);
}
function parpadeo(dur) {
  const f = $('fundido');
  f.style.opacity = 1;
  setTimeout(() => { f.style.opacity = 0; }, dur * 1000);
}

let tGesto = null;
function alGesto(g) {
  $('gestoTxt').textContent = '» ' + GESTOS[g];
  clearTimeout(tGesto);
  tGesto = setTimeout(() => { $('gestoTxt').textContent = ''; }, 1500);

  // Durante el gesto la mano se mueve: vale el objeto que tenías debajo hace un momento
  const obj = objetivo || (performance.now() - tUltimoObjetivo < 900 ? ultimoObjetivo : null);
  if (!obj) { mensaje(`${GESTOS[g]} — acércate y pon la mano encima de algo`); return; }
  if (obj.hecho && !obj.repetible) { mensaje(`${obj.nombre}: ya está`); return; }
  if (obj.gesto !== g) {
    mensaje(`✗ "${GESTOS[g]}" no sirve con ${obj.nombre}`, 'mal');
    sonido.error(); vibrar(90);
    return;
  }
  const r = obj.intentar();
  if (r && r.error) { mensaje('✗ ' + r.error, 'mal'); sonido.error(); vibrar(90); return; }
  vibrar(35);
  mensaje('✓ ' + (r || obj.nombre), 'ok');
}

// ================================================================ DIBUJO DE DEBUG (esqueleto 2D)
const CONEX = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const lienzo = $('lienzoMano'), ctx = lienzo.getContext('2d');
const NOMBRES_POSE = { ninguna: 'Sin mano', abierta: 'Mano abierta', puno: 'Puño', pinza: 'Pinza', otra: 'Mano (sin pose)' };
let debugVisible = false;
function dibujarMano(lm, pose, debug) {
  if (!debugVisible) return;
  ctx.fillStyle = '#050506';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  if (lm) {
    const W = lienzo.width, H = lienzo.height;
    ctx.strokeStyle = pose === 'puno' ? '#ff9a5a' : pose === 'pinza' ? '#6ad0ff' : pose === 'abierta' ? '#9aff8a' : '#aaa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of CONEX) { ctx.moveTo(lm[a].x * W, lm[a].y * H); ctx.lineTo(lm[b].x * W, lm[b].y * H); }
    ctx.stroke();
  }
  $('poseTxt').textContent = NOMBRES_POSE[pose] || pose;
  $('debugTxt').textContent = debug || '';
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
  for (const o of objetos) o.reset();
  Object.assign(estado, { luz: false, corriente: true, vitrinaRota: false, enMano: null, puertaAbierta: false, susto: false, escapado: false });
  luzBombilla.intensity = 0; bombillaMat.color.setHex(0x302820);
  llaveMano.visible = false;
  jugador.x = 0; jugador.z = 1.6;
  calibrado = false; yawManual = 0; pitchManual = 0;
  reco.reiniciar();
  tInicio = performance.now();
}
reiniciarPartida();

async function empezar() {
  iniciarAudio();
  // iOS pide permiso para el giroscopio; en Android no hace falta
  try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch (e) {}
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
  reiniciarPartida(); jugando = true; mensaje('Modo prueba: 1–5 gestos, W andar');
};
$('btnAyuda').onclick = () => $('pantallaAyuda').classList.remove('oculto');
$('btnCerrarAyuda').onclick = () => $('pantallaAyuda').classList.add('oculto');
$('btnDebug').onclick = () => { debugVisible = !debugVisible; $('panelMano').classList.toggle('oculto', !debugVisible); };
$('btnReset').onclick = () => { reiniciarPartida(); mensaje('Habitación reiniciada'); };
$('btnFlash').onclick = async () => { await ponerFlash(!flashOn); actualizarBotonFlash(); };
$('btnOtraVez').onclick = () => { $('pantallaFin').classList.add('oculto'); reiniciarPartida(); jugando = true; };

const TECLAS = { '1': 'cuerda', '2': 'palanca', '3': 'romper', '4': 'agarrar', '5': 'llave' };
addEventListener('keydown', e => {
  if (TECLAS[e.key]) alGesto(TECLAS[e.key]);
  if (e.key === 'w' || e.key === 'W') teclaAndar = true;
  if (e.key === 'ArrowLeft') yawManual += 0.15;
  if (e.key === 'ArrowRight') yawManual -= 0.15;
  if (e.key === 'ArrowUp') pitchManual = Math.min(1.25, pitchManual + 0.1);
  if (e.key === 'ArrowDown') pitchManual = Math.max(-1.25, pitchManual - 0.1);
});
addEventListener('keyup', e => { if (e.key === 'w' || e.key === 'W') teclaAndar = false; });

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
const adelante = new THREE.Vector3();
function bucle() {
  requestAnimationFrame(bucle);
  const t = performance.now();
  const dt = Math.min(0.05, (t - tPrev) / 1000);
  tPrev = t;

  // --- Mirar y andar
  orientarCamara();
  if (jugando && (andando || teclaAndar)) {
    camera.getWorldDirection(adelante);
    adelante.y = 0;
    if (adelante.lengthSq() > 1e-4) {
      adelante.normalize();
      const v = 1.3 * dt;
      const nx = jugador.x + adelante.x * v, nz = jugador.z + adelante.z * v;
      if (libre(nx, nz)) { jugador.x = nx; jugador.z = nz; }
      else if (libre(nx, jugador.z)) jugador.x = nx;
      else if (libre(jugador.x, nz)) jugador.z = nz;
      jugador.bob += dt * 9;
      jugador.distPaso += v;
      if (jugador.distPaso > 0.6) { jugador.distPaso = 0; sonido.paso(); }
    }
  } else {
    jugador.bob += (Math.round(jugador.bob / Math.PI) * Math.PI - jugador.bob) * 0.1;
  }
  camera.position.set(jugador.x, jugador.altura + Math.abs(Math.sin(jugador.bob)) * 0.035 - 0.015, jugador.z);
  camera.updateMatrixWorld();

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
    const r = reco.actualizar(lm, t, aspecto);
    dibujarMano(lm, r.pose, r.debug);
    if (r.gesto) alGesto(r.gesto);
  }
  mano3d.actualizar(jugando ? ultimaMano : null, aspectoVideo, dt);

  // --- Lo que llevas en la mano
  const kMano = 1 - Math.pow(0.6, dt * 60);
  const destinoMano = mano3d.visible ? mano3d.palmaLocal : new THREE.Vector3(0.2, -0.3, -0.55);
  const escMano = mano3d.visible ? mano3d.escalaMano : 1;
  if (estado.enMano === 'caja' && cofre.parent === camera) {
    vTmp.copy(destinoMano).addScaledVector(mano3d.normalPalma, mano3d.visible ? 0.05 * escMano : 0);
    cofre.position.lerp(vTmp, kMano);
    cofre.quaternion.slerp(qTmp.set(0, 0, 0, 1), kMano * 0.5);
    cofre.scale.setScalar(cofre.scale.x + (0.55 * escMano - cofre.scale.x) * 0.2);
  }
  if (estado.enMano === 'llave') {
    llaveMano.position.lerp(destinoMano, kMano);
    llaveMano.scale.setScalar(escMano);
    llaveMano.rotation.set(0.3, 0, -0.6);
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
  if (estado.corriente) luzPiloto.intensity = Math.sin(t / 250) > 0 ? 1.5 : 0.4;
  else luzPiloto.intensity = 1.2;
  for (const tr of trozos) {
    if (tr.position.y <= 0.01) continue;
    tr.userData.v.y -= 9.8 * dt;
    tr.position.addScaledVector(tr.userData.v, dt);
    tr.rotation.x += tr.userData.w.x * dt; tr.rotation.y += tr.userData.w.y * dt;
    if (tr.position.y <= 0.01) { tr.position.y = 0.01; tr.rotation.set(-Math.PI / 2, 0, Math.random() * 6); }
  }
  if (figura.visible) {
    figura.position.y = Math.sin(t / 700) * 0.01;
    figura.lookAt(jugador.x, 0, jugador.z);
  }
  linterna.intensity = 25 + Math.sin(t / 90) * 1.5;

  // --- Susto y salida
  if (jugando && estado.puertaAbierta && !estado.susto && jugador.z < -3.6) {
    estado.susto = true;
    sonido.susto(); vibrar(600); parpadeo(0.5);
    figura.position.z = jugador.z - 0.8;
    figura.position.x = 0;
    setTimeout(() => { figura.visible = false; luzPasillo.intensity = 1.2; }, 450);
  }
  if (jugando && jugador.z < PASILLO_FIN + 0.7) escapar();

  // --- Tiempo
  if (jugando) {
    const s = Math.floor((t - tInicio) / 1000);
    $('tiempo').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  actualizarObjetivo(t);
  renderer.render(scene, camera);
}
bucle();
