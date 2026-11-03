import * as THREE from './lib/three/three.module.js';

// Mano 3D que se superpone donde está la mano real en la imagen de la cámara trasera.
// Va colgada de la cámara del juego: lo que ves en pantalla coincide con donde está tu mano.

const CONEX = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
const PALMA_TRIS = [[0,1,5],[1,2,5],[0,5,9],[0,9,13],[0,13,17]];
const PALMA_IDS = [0, 5, 9, 13, 17];

export const CFG_MANO = {
  largoPalma: 0.09,   // metros de muñeca a nudillo medio (mano real ~9 cm)
  distMin: 0.22,      // distancia mínima a la cámara del juego
  distMax: 1.1,
  suavizado: 0.55,    // 0 = sin suavizar, 1 = no se mueve (cuanto más alto, menos temblor y más retraso)
  escalaZ: 1.0,       // cuánto relieve usa la profundidad que da MediaPipe
};

export class Mano3D {
  constructor(camera) {
    this.camera = camera;
    this.grupo = new THREE.Group();
    this.grupo.renderOrder = 10;
    camera.add(this.grupo);

    this.mat = new THREE.MeshLambertMaterial({ color: 0xd9b49a, emissive: 0x1a0d08 });
    this.matPalma = new THREE.MeshLambertMaterial({ color: 0xcfa68c, emissive: 0x1a0d08, side: THREE.DoubleSide });

    // Articulaciones
    const geoBola = new THREE.SphereGeometry(1, 8, 6);
    this.bolas = [];
    for (let i = 0; i < 21; i++) {
      const b = new THREE.Mesh(geoBola, this.mat);
      this.grupo.add(b);
      this.bolas.push(b);
    }
    // Huesos (cilindro de altura 1 que se estira)
    const geoHueso = new THREE.CylinderGeometry(1, 1, 1, 7);
    this.huesos = CONEX.map(([a, b]) => {
      const m = new THREE.Mesh(geoHueso, this.mat);
      this.grupo.add(m);
      return { m, a, b, r: radioHueso(a, b) };
    });
    // Palma
    this.geoPalma = new THREE.BufferGeometry();
    this.posPalma = new Float32Array(PALMA_TRIS.length * 9);
    this.geoPalma.setAttribute('position', new THREE.BufferAttribute(this.posPalma, 3));
    this.palma = new THREE.Mesh(this.geoPalma, this.matPalma);
    this.grupo.add(this.palma);

    // Luz suave pegada a la cámara: ilumina la mano (las paredes quedan fuera de su alcance)
    this.luz = new THREE.PointLight(0xffe0c0, 0.35, 1.4, 2);
    camera.add(this.luz);

    this.puntos = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.objetivos = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.dist = 0.4;
    this.visibilidad = 0;
    this.hayDatos = false;
    this.palmaLocal = new THREE.Vector3(0, -0.15, -0.4);
    this.grupo.visible = false;
  }

  // lm: 21 puntos de MediaPipe (o null si no hay mano). aspectoVideo = ancho/alto del vídeo.
  actualizar(lm, aspectoVideo, dt) {
    const cam = this.camera;
    if (lm && aspectoVideo > 0) {
      const aspectoPantalla = cam.aspect;
      const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const tanX = tanY * aspectoPantalla;
      // El vídeo se imagina "cubriendo" la pantalla, igual que si lo vieras de fondo
      let fx = 1, fy = 1;
      if (aspectoVideo > aspectoPantalla) fx = aspectoVideo / aspectoPantalla;
      else fy = aspectoPantalla / aspectoVideo;

      // Tamaño aparente de la palma en pantalla → distancia
      const dx = (lm[9].x - lm[0].x) * aspectoVideo, dy = lm[9].y - lm[0].y;
      const palmaAlturas = Math.hypot(dx, dy) * fy; // fracción de la altura de pantalla
      let d = CFG_MANO.largoPalma / Math.max(1e-3, palmaAlturas * 2 * tanY);
      d = THREE.MathUtils.clamp(d, CFG_MANO.distMin, CFG_MANO.distMax);
      this.dist += (d - this.dist) * 0.3;

      const altoVisible = 2 * tanY * this.dist; // metros que ocupa la altura de pantalla a esa distancia
      for (let i = 0; i < 21; i++) {
        const p = lm[i];
        const xn = (p.x - 0.5) * 2 * fx;
        const yn = -(p.y - 0.5) * 2 * fy;
        const di = Math.max(0.12, this.dist + (p.z || 0) * aspectoVideo * fy * altoVisible * CFG_MANO.escalaZ);
        this.objetivos[i].set(xn * tanX * di, yn * tanY * di, -di);
      }
      if (!this.hayDatos) {
        for (let i = 0; i < 21; i++) this.puntos[i].copy(this.objetivos[i]);
        this.hayDatos = true;
      }
      this.visibilidad = Math.min(1, this.visibilidad + dt * 6);
    } else {
      this.visibilidad = Math.max(0, this.visibilidad - dt * 3);
      if (this.visibilidad === 0) this.hayDatos = false;
    }

    this.grupo.visible = this.hayDatos && this.visibilidad > 0.02;
    if (!this.grupo.visible) return;

    // Suavizado independiente del framerate
    const k = 1 - Math.pow(CFG_MANO.suavizado, dt * 60);
    for (let i = 0; i < 21; i++) this.puntos[i].lerp(this.objetivos[i], k);

    // Grosor proporcional al tamaño de la mano
    const escala = this.puntos[0].distanceTo(this.puntos[9]) / CFG_MANO.largoPalma || 1;
    for (let i = 0; i < 21; i++) {
      const b = this.bolas[i];
      b.position.copy(this.puntos[i]);
      b.scale.setScalar(radioBola(i) * escala);
    }
    const arriba = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    for (const h of this.huesos) {
      const pa = this.puntos[h.a], pb = this.puntos[h.b];
      dir.subVectors(pb, pa);
      const largo = dir.length();
      h.m.position.addVectors(pa, pb).multiplyScalar(0.5);
      if (largo > 1e-5) h.m.quaternion.setFromUnitVectors(arriba, dir.divideScalar(largo));
      h.m.scale.set(h.r * escala, largo, h.r * escala);
    }
    let j = 0;
    for (const tri of PALMA_TRIS) for (const id of tri) {
      const p = this.puntos[id];
      this.posPalma[j++] = p.x; this.posPalma[j++] = p.y; this.posPalma[j++] = p.z;
    }
    this.geoPalma.attributes.position.needsUpdate = true;
    this.geoPalma.computeVertexNormals();
    this.geoPalma.computeBoundingSphere();

    // Centro de la palma (en coordenadas de la cámara) para sujetar cosas
    this.palmaLocal.set(0, 0, 0);
    for (const id of PALMA_IDS) this.palmaLocal.add(this.puntos[id]);
    this.palmaLocal.divideScalar(PALMA_IDS.length);

    // Aparece y desaparece con un fundido
    const op = this.visibilidad;
    this.mat.transparent = this.matPalma.transparent = op < 1;
    this.mat.opacity = this.matPalma.opacity = op;
  }

  get visible() { return this.grupo.visible && this.visibilidad > 0.5; }
  get escalaMano() { return this.puntos[0].distanceTo(this.puntos[9]) / CFG_MANO.largoPalma || 1; }
}

function radioBola(i) {
  if (i === 0) return 0.018;
  if ([1, 5, 9, 13, 17].includes(i)) return 0.012;
  if ([4, 8, 12, 16, 20].includes(i)) return 0.0085;
  return 0.0095;
}
function radioHueso(a, b) {
  if (a === 0 || (a === 5 && b === 9) || (a === 9 && b === 13) || (a === 13 && b === 17)) return 0.011;
  if (a <= 4 && b <= 4) return 0.011; // pulgar
  if ([3, 7, 11, 15, 19].includes(a)) return 0.0078; // falange final
  return 0.009;
}
