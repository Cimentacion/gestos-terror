// Reconocedor de gestos a partir de los 21 puntos de la mano de MediaPipe.
// Todas las distancias van en "alturas de imagen" (0..1), corrigiendo el aspecto.
// Si un gesto salta mucho o casi nunca, se ajustan estos números.

export const GESTOS = {
  llave: 'Girar llave',
  palanca: 'Tirar palanca',
  cuerda: 'Bajar cuerda',
  romper: 'Romper',
  agarrar: 'Agarrar',
};

export const CFG = {
  dedoDoblado: 1.35,     // punta-muñeca / nudillo-muñeca por debajo de esto = dedo doblado
  dedoEstirado: 1.6,     // por encima = dedo estirado
  pinzaDist: 0.42,       // pulgar-índice / palma por debajo = pinza
  pinzaIndiceAbierto: 0.45, // índice-nudillo / palma por encima (distingue pinza de puño)

  llaveGiro: 55,         // grados de giro de muñeca
  llaveMaxMov: 0.12,     // la mano casi no se desplaza

  bajarDist: 0.15,       // cuánto baja la mano (palanca y cuerda)
  bajarMaxGiro: 40,      // si gira más que esto, no cuenta como bajar
  bajarMaxEscala: 0.3,   // si se acerca/aleja mucho, no cuenta como bajar

  romperVentana: 230,    // ms en los que se mide el golpe
  romperDist: 0.17,      // desplazamiento rápido
  romperEscala: 0.3,     // o acercar/alejar rápido (puñetazo hacia delante)

  agarrarQuieto: 350,    // ms con el puño quieto
  agarrarMov: 0.05,      // movimiento máximo mientras está quieto
  agarrarAbiertaAntes: 900, // la mano tenía que estar abierta justo antes

  perdidaMano: 350,      // ms sin mano antes de olvidar el historial
  pausaEntreGestos: 400, // ms tras un gesto en los que no se detecta otro
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function analizarPose(lmOrig, aspecto) {
  const lm = lmOrig.map(p => ({ x: p.x * aspecto, y: p.y }));
  const palma = dist(lm[0], lm[9]) || 1e-3;
  const ratio = (punta, nudillo) => dist(lm[punta], lm[0]) / (dist(lm[nudillo], lm[0]) || 1e-3);
  const dedos = [[8, 5], [12, 9], [16, 13], [20, 17]].map(([p, n]) => ratio(p, n));
  const doblados = dedos.filter(r => r < CFG.dedoDoblado).length;
  const estirados = dedos.filter(r => r > CFG.dedoEstirado).length;

  const pinzaCerca = dist(lm[4], lm[8]) / palma < CFG.pinzaDist;
  const indiceAbierto = dist(lm[8], lm[5]) / palma > CFG.pinzaIndiceAbierto && dedos[0] > 1.2;

  let pose = 'otra';
  if (pinzaCerca && indiceAbierto) pose = 'pinza';
  else if (doblados >= 4 || (doblados >= 3 && estirados === 0)) pose = 'puno';
  else if (estirados >= 3) pose = 'abierta';

  const ids = [0, 5, 9, 13, 17];
  const cx = ids.reduce((s, i) => s + lm[i].x, 0) / ids.length;
  const cy = ids.reduce((s, i) => s + lm[i].y, 0) / ids.length;
  const angRaw = Math.atan2(lm[17].y - lm[5].y, lm[17].x - lm[5].x);
  return { pose, cx, cy, size: palma, angRaw };
}

export class Reconocedor {
  constructor() { this.reiniciar(); }

  reiniciar() {
    this.hist = [];
    this.ultimoVisto = -1e9;
    this.prevRaw = null;
    this.angAcum = 0;
    this.posesCrudas = [];
    this.pose = 'ninguna';
    this.clase = 'ninguna';
    this.inicioPose = 0;
    this.inicioClase = 0;
    this.ultimaAbierta = -1e9;
    this.ultimoGesto = -1e9;
  }

  // lm: 21 puntos o null. Devuelve { pose, gesto, debug }
  actualizar(lm, t, aspecto = 1) {
    if (!lm) {
      if (t - this.ultimoVisto > CFG.perdidaMano) {
        this.hist = [];
        this.prevRaw = null;
        this.posesCrudas = [];
        this.pose = 'ninguna';
        this.clase = 'ninguna';
      }
      return { pose: this.pose, gesto: null, debug: '' };
    }
    this.ultimoVisto = t;
    const f = analizarPose(lm, aspecto);

    // Ángulo acumulado (sin saltos de -180 a 180)
    if (this.prevRaw !== null) {
      let da = f.angRaw - this.prevRaw;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      this.angAcum += da;
    }
    this.prevRaw = f.angRaw;
    f.ang = this.angAcum;
    f.t = t;

    // Suavizado: la pose cambia solo si se repite en 2 de los últimos 3 fotogramas
    this.posesCrudas.push(f.pose);
    if (this.posesCrudas.length > 3) this.posesCrudas.shift();
    const cuenta = this.posesCrudas.filter(p => p === f.pose).length;
    let p = this.pose;
    if (cuenta >= 2 || this.pose === 'ninguna') p = f.pose;
    f.p = p;

    if (p !== this.pose) { this.pose = p; this.inicioPose = t; }
    const clase = (p === 'pinza' || p === 'puno') ? 'cerrada' : p;
    if (clase !== this.clase) { this.clase = clase; this.inicioClase = t; }
    if (p === 'abierta') this.ultimaAbierta = t;

    this.hist.push(f);
    while (this.hist.length && this.hist[0].t < t - 2000) this.hist.shift();

    const runP = this.hist.filter(h => h.t >= this.inicioPose);
    const runC = this.hist.filter(h => h.t >= this.inicioClase);
    const a0 = runP[0] || f;
    const c0 = runC[0] || f;
    const giroC = Math.abs(f.ang - c0.ang) * 180 / Math.PI;
    const giroP = Math.abs(f.ang - a0.ang) * 180 / Math.PI;
    const minY = runP.length ? Math.min(...runP.map(h => h.cy)) : f.cy;
    const bajada = f.cy - minY;
    const escalaP = Math.abs(Math.log(f.size / a0.size));
    const debug = `giro ${giroC.toFixed(0)}° · baja ${bajada.toFixed(2)}`;

    let g = null;
    if (t - this.ultimoGesto > CFG.pausaEntreGestos && (p === 'puno' || p === 'pinza')) {
      // ROMPER: puño con golpe rápido
      if (p === 'puno') {
        const ventana = runP.filter(h => h.t >= t - CFG.romperVentana);
        if (ventana.length >= 2) {
          const a = ventana[0];
          const mov = Math.hypot(f.cx - a.cx, f.cy - a.cy);
          const esc = Math.abs(Math.log(f.size / a.size));
          if (mov > CFG.romperDist || esc > CFG.romperEscala) g = 'romper';
        }
      }
      // LLAVE: pinza o puño girando la muñeca sin desplazar la mano
      if (!g && runC.length >= 3) {
        const mov = Math.hypot(f.cx - c0.cx, f.cy - c0.cy);
        if (giroC > CFG.llaveGiro && mov < CFG.llaveMaxMov) g = 'llave';
      }
      // PALANCA (puño) / CUERDA (pinza): bajar la mano
      if (!g && runP.length >= 3) {
        if (bajada > CFG.bajarDist && giroP < CFG.bajarMaxGiro && escalaP < CFG.bajarMaxEscala) {
          g = p === 'puno' ? 'palanca' : 'cuerda';
        }
      }
      // AGARRAR: mano abierta que se cierra en puño y se queda quieta
      if (!g && p === 'puno' && t - this.inicioPose >= CFG.agarrarQuieto &&
          this.inicioPose - this.ultimaAbierta < CFG.agarrarAbiertaAntes) {
        const mov = Math.max(...runP.map(h => Math.hypot(h.cx - a0.cx, h.cy - a0.cy)));
        if (mov < CFG.agarrarMov) g = 'agarrar';
      }
    }

    if (g) {
      // Tras un gesto se empieza a medir de cero, para que no salte otro con el mismo movimiento
      this.ultimoGesto = t;
      this.inicioPose = t;
      this.inicioClase = t;
      this.ultimaAbierta = -1e9;
    }
    return { pose: p, gesto: g, debug };
  }
}
