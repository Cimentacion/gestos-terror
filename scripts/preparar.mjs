// Copia three.js y MediaPipe dentro de www/lib y descarga el modelo de manos.
// Así el APK funciona sin internet.
import { cpSync, mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs';

const lib = 'www/lib';

// three.js
mkdirSync(`${lib}/three`, { recursive: true });
for (const f of readdirSync('node_modules/three/build')) {
  if (f === 'three.module.js' || f === 'three.core.js') cpSync(`node_modules/three/build/${f}`, `${lib}/three/${f}`);
}

// MediaPipe (se renombra .mjs a .js para que el WebView lo sirva como JavaScript)
mkdirSync(`${lib}/mediapipe`, { recursive: true });
cpSync('node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', `${lib}/mediapipe/vision_bundle.js`);
cpSync('node_modules/@mediapipe/tasks-vision/wasm', `${lib}/mediapipe/wasm`, { recursive: true });

// Modelo de detección de manos
const modelo = 'www/models/hand_landmarker.task';
if (!existsSync(modelo)) {
  mkdirSync('www/models', { recursive: true });
  const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo descargar el modelo: ${r.status}`);
  writeFileSync(modelo, Buffer.from(await r.arrayBuffer()));
}
console.log('Listo: librerías y modelo en www/');
