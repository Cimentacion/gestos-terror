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
- Cámara a altura fija (1,6 m) con una inclinación fija hacia abajo (`INCLINACION`). **Sin giroscopio.**
- Joystick tipo tanque abajo a la izquierda: arriba/abajo para andar, a los lados para girar (se juega con un pulgar). Arrastrar en pantalla también gira.
- En los pasos estrechos abiertos el jugador se centra solo.
- Objetivo permisivo (`elegirObjetivo`): cualquier objeto a menos de `ALCANCE` (2,1 m) cerca de la palma en pantalla (`RADIO_SEL` 0,9), que no esté tapado por `muros`. Si tienes el objeto que hace falta, tiene prioridad lo que puedes usar.
- Cada objeto lleva una marca (sprite): tenue si está disponible y brillante si está seleccionado. Abajo se muestran el nombre, qué hacer y una barra de progreso.
- Tacto: la mano no atraviesa `solidos`; vibra al tocar y suena roce al arrastrar.

## Interacción (gestos.js + pasoInteraccion en juego.js)
`gestos.js` solo dice si la mano está **cerrada** (puño, pinza o dos dedos doblados), su posición, giro y tamaño, y detecta el golpe **romper**.
El juego decide qué pasa según el tipo del objeto seleccionado:
| tipo | qué hacer |
|---|---|
| bajar | cerrar la mano y bajarla. El objeto sigue la mano en continuo (palanca, cuerda con muelle) |
| girar | cerrar la mano y girar la muñeca. Se acumula si sueltas y vuelves a coger (llaves, válvula) |
| tirar | cerrar la mano y acercarla (la mano crece) o bajarla (cajón) |
| coger | cerrar la mano encima |
| romper | golpe rápido con la mano cerrada |
| colocar | usa un objeto del inventario solo con dejar la mano encima 0,45 s |
Mientras sujetas algo, la mano 3D se pega al asa (`ancla` en mano3d.js). Romper sobre algo que no se rompe da "✗ eso no se rompe".

## Escape room (orden)
Dormitorio: cuerda (luz) → romper vitrina → coger caja (da la llave pequeña) → meter y girar la llave del cajón → tirar del cajón → coger el fusible → ponerlo en el cuadro → bajar la palanca (sin fusible no pasa nada) → se abre la persiana.
Sala de calderas: girar la válvula (el vapor bloquea el paso y quema) → romper el candado del baúl → coger la llave grande → romper 3 tablas de la puerta → meter y girar la llave grande → pasillo con susto → SALIDA y tiempo.

## Probar sin móvil
Servir `www/` (después de `npm install && npm run preparar`) y pulsar "Probar sin cámara".
W/S = andar, A/D = girar, E = hacer la acción del objeto seleccionado.
`window.__debug.setMano(landmarks)` inyecta una mano falsa para pruebas.

## Pendiente / ideas
- Afinar con pruebas en móvil real `CFG` (gestos), `CFG_MANO`, `RADIO_SEL`, `ALCANCE`, `INCLINACION` y el `recorrido`/`total` de cada objeto.
- Confirmar cómo se nota la vibración del tacto.
- Más habitaciones y puzzles, enemigos, sonido ambiente.

## Preferencias de trabajo
- Respuestas directas y en español.
- Al cambiar código, dar o escribir los archivos completos, no trozos para pegar a mano.
- Después de cada cambio: push a `main` y comprobar que el APK compila.
