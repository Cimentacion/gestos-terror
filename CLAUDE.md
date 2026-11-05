# Gestos Terror — contexto para Claude

Juego de terror / escape room para Android que se controla con gestos de la mano.
El jugador sujeta el móvil con una mano y pone la otra **detrás del móvil**, delante de la cámara trasera.
La pantalla muestra solo el juego (nunca la imagen de la cámara). Una mano 3D low poly aparece
en el juego donde está la mano real.

Idea original del dueño de este repo. Objetivo: "que dé la impresión de estar dentro del juego,
lo más parecido a un escape room".

## Tecnología
- HTML + JavaScript (módulos ES), sin framework ni bundler. **No es Godot.**
- three.js para el 3D, estética PS1/PS2: resolución interna al 60 %, texturas con NearestFilter, flatShading, niebla negra.
- MediaPipe Tasks Vision (HandLandmarker), 21 puntos de la mano, en local dentro del APK, sin internet.
- Capacitor 7 para empaquetar el APK.
- Sonido sintetizado con WebAudio (no hay archivos de audio).

## Archivos
- `www/index.html`: interfaz (pantallas de inicio, ayuda, error y fin; joystick; botones; panel de debug).
- `www/juego.js`: escena, objetos, puzzles, movimiento, tacto y bucle principal.
- `www/gestos.js`: reconocedor de gestos. Los umbrales están en `CFG`.
- `www/mano3d.js`: mano low poly superpuesta y colisión con superficies. Los ajustes están en `CFG_MANO`.
- `scripts/preparar.mjs`: copia three.js y MediaPipe a `www/lib` y descarga el modelo a `www/models` (los dos están en .gitignore).
- `.github/workflows/apk.yml`: compila el APK en cada push a `main` y lo publica en la release `prototipo-gestos`.

## Cómo se compila
Haciendo push a `main`. GitHub Actions hace `npm install`, `npm run preparar`, `cap add android` y
añade al manifest `CAMERA`, `VIBRATE`, `uses-feature android.hardware.camera required=true` y la orientación vertical.
Después hace `assembleDebug` y publica el APK en Releases. Tarda unos 2 minutos.
No se usa `android-actions/setup-android`, porque el runner ya trae el SDK y ese paso fallaba.

## Controles actuales
- Mirar: giroscopio (`deviceorientation`), suavizado con slerp. Arrastrar el dedo añade giro horizontal.
- Moverse: joystick analógico abajo a la izquierda, con zona muerta del 15 %, inercia y deslizamiento por las paredes.
- Interactuar: la palma de la mano 3D se proyecta a pantalla y se lanza un raycast (alcance de 2 m) contra las zonas de los objetos. Si en ese momento no hay objetivo, el gesto vale para el objeto que había debajo en los últimos 900 ms.
- Tacto: un rayo desde la cámara hacia la palma contra `solidos` (todo lo creado con `caja()`/`plano()`). Si hay superficie, la mano se acerca a la cámara y queda apoyada. Al contactar hay vibración y golpe, y al arrastrar, roce.

## Gestos (gestos.js)
| Gesto | Cómo se detecta |
|---|---|
| cuerda | pinza (pulgar con índice) + bajar la mano |
| palanca | puño + bajar la mano |
| romper | puño + desplazamiento o cambio de escala rápido en 230 ms |
| agarrar | mano abierta → puño y quieto 350 ms |
| llave | pinza o puño + giro de muñeca >55° sin desplazar la mano |

Cada objeto solo acepta su gesto. Con el gesto equivocado sale "✗ no sirve con…", con sonido de error y vibración.

## Escape room (orden)
1. Cuerda → luz (se leen las notas de las paredes).
2. Vitrina (mesa, pared oeste) → romper.
3. Caja dentro de la vitrina → agarrar. Se abre en la mano y da la llave.
4. Cerradura con la corriente puesta → calambre, error.
5. Palanca del cuadro eléctrico (pared este) → corta la corriente y el piloto pasa a verde.
6. Cerradura con la llave → la puerta se abre. Susto en el pasillo, y la SALIDA da el tiempo final.

## Probar sin móvil
Servir `www/` (después de `npm install && npm run preparar`) y pulsar "Probar sin cámara".
Teclas 1–5 = gestos, W = andar, flechas = mirar.
`window.__debug.setMano(landmarks)` inyecta una mano falsa para pruebas.

## Pendiente / ideas
- Afinar umbrales de gestos y de la mano (`CFG`, `CFG_MANO`) con pruebas en móvil real.
- Confirmar cómo se nota la vibración del tacto.
- Más habitaciones y puzzles, enemigos, sonido ambiente.

## Preferencias de trabajo
- Respuestas directas y en español.
- Al cambiar código, dar o escribir los archivos completos, no trozos para pegar a mano.
- Después de cada cambio: push a `main` y comprobar que el APK compila.
