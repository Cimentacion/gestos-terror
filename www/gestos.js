// Lectura de la mano a partir de los 21 puntos de MediaPipe.
// Ya no se reconocen gestos sueltos para cada cosa: el juego sabe qué objeto tienes delante
// y solo necesita saber si la mano está CERRADA (agarrando) y cómo se mueve.
// El único gesto suelto es ROMPER (golpe rápido).
// Distancias en "alturas de imagen" (0..1), corrigiendo el aspecto.

export const CFG = {
  dedoDoblado: 1.35,        // punta-muñeca / nudillo-muñeca por debajo = dedo doblado
  dedoEstirado: 1.6,        // por encima = dedo estirado
  pinzaDist: 0.45,          // pulgar-índice / palma por debajo = pinza
  cerradaMinDoblados: 2,    // con 2 dedos doblados ya cuenta como mano cerrada (permisivo)

  romperVentana: 220,       // ms en los que se mide el golpe
  romperDist: 0.13,         // desplazamiento rápido
  romperEscala: 0.25,       // o acercar/alejar rápido
  pausaRomper: 450,         // ms mínimos entre dos golpes

  suavizado: 0.5,           // suavizado de posición/giro/tamaño (0 = nada)
  perdidaMano: 400,         // ms sin mano antes de olvidarla
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function analizarPose(lmOrig, aspecto) {
  const lm = lmOrig.map(p => ({ x: p.x * aspecto, y: p.y }));
  const palma = dist(lm[0], lm[9]) || 1e-3;
  const ratio = (punta, nudillo) => dist(lm[punta], lm[0]) / (dist(lm[nudillo], lm[0]) || 1e-3);
  const dedos = [[8, 5], [12, 9], [16, 13], [20, 17]].map(([p, n]) => ratio(p, n));
  const doblados = dedos.filter(r => r < CFG.dedoDoblado).length;
  const estirados = dedos.filter(r => r > CFG.dedoEstirado).length;
  const pinza = dist(lm[4], lm[8]) / palma < CFG.pinzaDist;

  let pose = 'otra';
  if (doblados >= 4 || (doblados >= 3 && estirados === 0)) pose = 'puno';
  else if (pinza) pose = 'pinza';
  else if (estirados >= 3) pose = 'abierta';
  const cerrada = pose === 'puno' || pose === 'pinza' || (pose === 'otra' && doblados >= CFG.cerradaMinDoblados);

  const ids = [0, 5, 9, 13, 17];
  const cx = ids.reduce((s, i) => s + lm[i].x, 0) / ids.length;
  const cy = ids.reduce((s, i) => s + lm[i].y, 0) / ids.length;
  const angRaw = Math.atan2(lm[17].y - lm[5].y, lm[17].x - lm[5].x);
  return { pose, cerrada, doblados, cx, cy, size: palma, angRaw };
}

export class Reconocedor {
  constructor() { this.reiniciar(); }

  reiniciar() {
    this.hist = [];
    this.crudas = [];
    this.ultimoVisto = -1e9;
    this.prevRaw = null;
    this.angAcum = 0;
    this.mano = null;       // { cx, cy, ang, size } suavizado
    this.pose = 'ninguna';
    this.cerrada = false;
    this.ultimoRomper = -1e9;
  }

  // Devuelve { pose, cerrada, mano, gesto ('romper' o null), debug }
  actualizar(lm, t, aspecto = 1) {
    if (!lm) {
      if (t - this.ultimoVisto > CFG.perdidaMano) {
        this.hist = []; this.crudas = []; this.prevRaw = null;
        this.mano = null; this.pose = 'ninguna'; this.cerrada = false;
      }
      return { pose: this.pose, cerrada: this.cerrada, mano: this.mano, gesto: null, debug: '' };
    }
    this.ultimoVisto = t;
    const f = analizarPose(lm, aspecto);

    // giro de muñeca acumulado (sin saltos de -180 a 180)
    if (this.prevRaw !== null) {
      let da = f.angRaw - this.prevRaw;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      this.angAcum += da;
    }
    this.prevRaw = f.angRaw;

    // pose y cerrada: vale lo que se repite en 2 de los últimos 3 fotogramas
    this.crudas.push(f);
    if (this.crudas.length > 3) this.crudas.shift();
    const votos = this.crudas.filter(c => c.cerrada).length;
    this.cerrada = this.crudas.length < 2 ? f.cerrada : votos >= 2;
    const mismaPose = this.crudas.filter(c => c.pose === f.pose).length;
    if (mismaPose >= 2 || this.pose === 'ninguna') this.pose = f.pose;

    // posición suavizada
    const a = this.mano ? CFG.suavizado : 0;
    const m = this.mano || { cx: f.cx, cy: f.cy, ang: this.angAcum, size: f.size };
    m.cx = m.cx * a + f.cx * (1 - a);
    m.cy = m.cy * a + f.cy * (1 - a);
    m.ang = m.ang * a + this.angAcum * (1 - a);
    m.size = m.size * a + f.size * (1 - a);
    this.mano = m;

    this.hist.push({ t, cx: f.cx, cy: f.cy, size: f.size, cerrada: this.cerrada });
    while (this.hist.length && this.hist[0].t < t - 1000) this.hist.shift();

    // ROMPER: mano cerrada con un golpe rápido
    let gesto = null;
    if (this.cerrada && t - this.ultimoRomper > CFG.pausaRomper) {
      const ventana = this.hist.filter(h => h.t >= t - CFG.romperVentana && h.cerrada);
      if (ventana.length >= 2) {
        const h0 = ventana[0];
        const mov = Math.hypot(f.cx - h0.cx, f.cy - h0.cy);
        const esc = Math.abs(Math.log(f.size / h0.size));
        if (mov > CFG.romperDist || esc > CFG.romperEscala) {
          gesto = 'romper';
          this.ultimoRomper = t;
        }
      }
    }
    const debug = `${this.cerrada ? 'CERRADA' : 'abierta'} · y ${m.cy.toFixed(2)} · giro ${(m.ang * 180 / Math.PI).toFixed(0)}°`;
    return { pose: this.pose, cerrada: this.cerrada, mano: this.mano, gesto, debug };
  }
}
