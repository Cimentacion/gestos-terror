import * as THREE from './lib/three/three.module.js';

// Mano low poly que se superpone donde está la mano real en la imagen de la cámara trasera.
// Va colgada de la cámara del juego, con manga, palma con grosor y dedos facetados.

const DEDOS = [[0,1],[1,2],[2,3],[3,4],[5,6],[6,7],[7,8],[9,10],[10,11],[11,12],[13,14],[14,15],[15,16],[17,18],[18,19],[19,20]];
const CONTORNO_PALMA = [0, 1, 2, 5, 9, 13, 17];
const PALMA_IDS = [0, 5, 9, 13, 17];

export const CFG_MANO = {
  largoPalma: 0.09,   // metros de muñeca a nudillo medio
  distMin: 0.24,
  distMax: 0.9,
  suavizado: 0.5,     // 0 = sin suavizar, cuanto más alto menos temblor y más retraso
  ganancia: 1.15,     // >1 hace que la mano recorra más pantalla
  escalaZ: 0.8,       // relieve de profundidad de los dedos
  grosor: 1.25,       // grosor general de los dedos (estética low poly)
};

export class Mano3D {
  constructor(camera) {
    this.camera = camera;
    this.grupo = new THREE.Group();
    camera.add(this.grupo);

    this.matPiel = new THREE.MeshLambertMaterial({ color: 0xc8957a, emissive: 0x2a140a, flatShading: true });
    this.matUna = new THREE.MeshLambertMaterial({ color: 0xe8c8b8, emissive: 0x2a1a14, flatShading: true });
    this.matManga = new THREE.MeshLambertMaterial({ color: 0x33363e, emissive: 0x08090c, flatShading: true });
    this.emisivoBase = this.matPiel.emissive.getHex();

    const geoNudo = new THREE.IcosahedronGeometry(1, 0);
    const geoSeg = new THREE.CylinderGeometry(1, 1, 1, 5, 1);
    this.nudos = [];
    for (let i = 0; i < 21; i++) {
      const m = new THREE.Mesh(geoNudo, [4, 8, 12, 16, 20].includes(i) ? this.matUna : this.matPiel);
      this.grupo.add(m); this.nudos.push(m);
    }
    this.segs = DEDOS.map(([a, b]) => {
      const m = new THREE.Mesh(geoSeg, this.matPiel);
      this.grupo.add(m);
      return { m, a, b, r: radioSeg(a, b) };
    });

    // Palma con grosor (geometría que se rehace cada fotograma)
    const n = CONTORNO_PALMA.length;
    this.trisPalma = n * 2 + n * 2; // tapa de arriba + tapa de abajo + laterales
    this.posPalma = new Float32Array(this.trisPalma * 9);
    this.geoPalma = new THREE.BufferGeometry();
    this.geoPalma.setAttribute('position', new THREE.BufferAttribute(this.posPalma, 3));
    this.palma = new THREE.Mesh(this.geoPalma, this.matPiel);
    this.grupo.add(this.palma);

    // Manga y antebrazo
    this.antebrazo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.25, 1, 6, 1), this.matManga);
    this.grupo.add(this.antebrazo);
    this.puno = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1), this.matManga);
    this.grupo.add(this.puno);

    // Luz que ilumina la mano (alcance corto, no llega a las paredes)
    this.luz = new THREE.PointLight(0xffe0c0, 0.9, 1.3, 2);
    camera.add(this.luz);

    this.puntos = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.objetivos = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.dist = 0.45;
    this.visibilidad = 0;
    this.hayDatos = false;
    this.palmaLocal = new THREE.Vector3(0, -0.15, -0.4);
    this.normalPalma = new THREE.Vector3(0, 0, 1);
    this.grupo.visible = false;
    this.tocando = false;
    this.ancla = new THREE.Vector3();
    this.pesoAncla = 0;
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  resaltar(si) {
    this.matPiel.emissive.setHex(si ? 0x5a3418 : this.emisivoBase);
  }

  // lm: 21 puntos de MediaPipe o null. aspectoVideo = ancho/alto del vídeo.
  // limite: distancia desde la cámara a la primera superficie en la dirección de la palma
  // ancla: punto (en coordenadas de la cámara) al que se pega la palma mientras sujetas algo, o null
  actualizar(lm, aspectoVideo, dt, limite = Infinity, ancla = null) {
    const cam = this.camera;
    this.pesoAncla += ((ancla ? 1 : 0) - this.pesoAncla) * Math.min(1, dt * 10);
    if (ancla) this.ancla.copy(ancla);
    if (lm && aspectoVideo > 0) {
      const aP = cam.aspect;
      const tanY = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const tanX = tanY * aP;
      // Toda la imagen de la cámara cabe en pantalla: si la cámara ve la mano, la ves en el juego
      let gx = 1, gy = 1;
      if (aspectoVideo > aP) gy = aP / aspectoVideo; else gx = aspectoVideo / aP;
      gx *= CFG_MANO.ganancia; gy *= CFG_MANO.ganancia;

      const dx = (lm[9].x - lm[0].x) * aspectoVideo, dy = lm[9].y - lm[0].y;
      const palmaPantalla = Math.hypot(dx, dy) * gy;
      let d = CFG_MANO.largoPalma / Math.max(1e-3, palmaPantalla * 2 * tanY);
      d = THREE.MathUtils.clamp(d, CFG_MANO.distMin, CFG_MANO.distMax);
      this.dist += (d - this.dist) * 0.3;

      const altoVisible = 2 * tanY * this.dist;
      for (let i = 0; i < 21; i++) {
        const p = lm[i];
        const xn = (p.x - 0.5) * 2 * gx;
        const yn = -(p.y - 0.5) * 2 * gy;
        const di = Math.max(0.12, this.dist + (p.z || 0) * aspectoVideo * gy * altoVisible * CFG_MANO.escalaZ);
        this.objetivos[i].set(xn * tanX * di, yn * tanY * di, -di);
      }
      // Si hay una superficie delante, la mano se queda apoyada en ella (no la atraviesa).
      // Se acerca toda la mano hacia la cámara: en pantalla sigue en el mismo sitio.
      const c = this._v[2].set(0, 0, 0);
      for (const id of PALMA_IDS) c.add(this.objetivos[id]);
      c.divideScalar(PALMA_IDS.length);
      // Sujetando algo: la palma se va al asa del objeto y se mueve con él
      if (this.pesoAncla > 0.01) {
        const off = this._v[3].subVectors(this.ancla, c).multiplyScalar(this.pesoAncla);
        for (let i = 0; i < 21; i++) this.objetivos[i].add(off);
        c.add(off);
      }
      const dPalma = c.length();
      const margen = 0.035;
      this.tocando = this.pesoAncla < 0.5 && limite < dPalma + margen;
      if (this.tocando) {
        const f = Math.max(0.3, (limite - margen) / dPalma);
        for (let i = 0; i < 21; i++) this.objetivos[i].multiplyScalar(f);
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

    const k = 1 - Math.pow(CFG_MANO.suavizado, dt * 60);
    for (let i = 0; i < 21; i++) this.puntos[i].lerp(this.objetivos[i], k);
    const P = this.puntos;
    const esc = (P[0].distanceTo(P[9]) / CFG_MANO.largoPalma || 1);
    const g = esc * CFG_MANO.grosor;

    // Nudillos y dedos
    for (let i = 0; i < 21; i++) {
      this.nudos[i].position.copy(P[i]);
      this.nudos[i].scale.setScalar(radioNudo(i) * g);
      this.nudos[i].rotation.set(i, i * 2, 0);
    }
    for (const s of this.segs) colocarCilindro(s.m, P[s.a], P[s.b], s.r * g, s.r * g, this._v);

    // Palma con grosor
    const [v1, v2, c] = this._v;
    v1.subVectors(P[5], P[0]); v2.subVectors(P[17], P[0]);
    this.normalPalma.crossVectors(v1, v2).normalize();
    const nrm = this.normalPalma;
    const t = 0.012 * g;
    c.set(0, 0, 0);
    for (const id of CONTORNO_PALMA) c.add(P[id]);
    c.divideScalar(CONTORNO_PALMA.length);
    let j = 0;
    const pon = (x, y, z) => { this.posPalma[j++] = x; this.posPalma[j++] = y; this.posPalma[j++] = z; };
    const arr = (p, s) => [p.x + nrm.x * t * s, p.y + nrm.y * t * s, p.z + nrm.z * t * s];
    const n = CONTORNO_PALMA.length;
    for (let i = 0; i < n; i++) {
      const a = P[CONTORNO_PALMA[i]], b = P[CONTORNO_PALMA[(i + 1) % n]];
      // tapa de arriba y de abajo (abanico desde el centro)
      pon(...arr(c, 1)); pon(...arr(a, 1)); pon(...arr(b, 1));
      pon(...arr(c, -1)); pon(...arr(b, -1)); pon(...arr(a, -1));
      // lateral
      pon(...arr(a, 1)); pon(...arr(a, -1)); pon(...arr(b, -1));
      pon(...arr(a, 1)); pon(...arr(b, -1)); pon(...arr(b, 1));
    }
    this.geoPalma.attributes.position.needsUpdate = true;
    this.geoPalma.computeVertexNormals();
    this.geoPalma.computeBoundingSphere();
    this.palma.material.side = THREE.DoubleSide;

    // Antebrazo: sale de la muñeca en dirección contraria a los dedos
    const dirBrazo = this._v[3].subVectors(P[0], P[9]).normalize();
    const finMuneca = P[0].clone().addScaledVector(dirBrazo, 0.025 * esc);
    const finBrazo = finMuneca.clone().addScaledVector(dirBrazo, 0.45 * esc);
    colocarCilindro(this.antebrazo, finMuneca, finBrazo, 0.027 * g, 0.033 * g, this._v);
    const inicioPuno = P[0].clone().addScaledVector(dirBrazo, 0.012 * esc);
    colocarCilindro(this.puno, inicioPuno, finMuneca.clone().addScaledVector(dirBrazo, 0.03 * esc), 0.03 * g, 0.03 * g, this._v);

    this.palmaLocal.set(0, 0, 0);
    for (const id of PALMA_IDS) this.palmaLocal.add(P[id]);
    this.palmaLocal.divideScalar(PALMA_IDS.length);

    const op = this.visibilidad;
    for (const m of [this.matPiel, this.matUna, this.matManga]) { m.transparent = op < 1; m.opacity = op; }
  }

  get visible() { return this.grupo.visible && this.visibilidad > 0.5; }
  get escalaMano() { return this.puntos[0].distanceTo(this.puntos[9]) / CFG_MANO.largoPalma || 1; }
}

const ARRIBA = new THREE.Vector3(0, 1, 0);
// Coloca un cilindro de altura 1 entre dos puntos. rArriba = radio en b, rAbajo = radio en a
function colocarCilindro(m, a, b, rAbajo, rArriba, tmp) {
  const dir = tmp[0].subVectors(b, a);
  const largo = dir.length();
  m.position.addVectors(a, b).multiplyScalar(0.5);
  if (largo > 1e-5) m.quaternion.setFromUnitVectors(ARRIBA, dir.divideScalar(largo));
  const r = (rAbajo + rArriba) / 2;
  m.scale.set(r, largo, r);
}
function radioNudo(i) {
  if (i === 0) return 0.02;
  if ([1, 2].includes(i)) return 0.013;
  if ([5, 9, 13, 17].includes(i)) return 0.011;
  if ([4, 8, 12, 16, 20].includes(i)) return 0.0085;
  return 0.0095;
}
function radioSeg(a, b) {
  if (a <= 4 && b <= 4) return 0.011;
  if ([3, 7, 11, 15, 19].includes(a)) return 0.008;
  if (a === 17 || a === 18 || a === 19) return 0.0082;
  return 0.0092;
}
