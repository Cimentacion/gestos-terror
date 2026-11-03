# Gestos Terror — prototipo

Habitación oscura en 3D que se controla con gestos de la mano, vistos por la cámara trasera.
HTML/JS (three.js + MediaPipe Hands) empaquetado como APK con Capacitor.

## Sacar el APK
1. Crea un repo nuevo en GitHub y sube **todo** el contenido de esta carpeta (incluida `.github`).
2. Se compila solo en la pestaña **Actions** (unos 5 minutos).
3. El APK aparece en **Releases → Prototipo gestos (último)** → `gestos-terror.apk`.

Cada vez que subas cambios a `main` se vuelve a compilar.

## Gestos
| Objeto | Gesto |
|---|---|
| Cerradura | Pinza o puño + girar la muñeca sin mover la mano |
| Palanca | Puño + bajar la mano |
| Cuerda de la luz | Pinza (pulgar con índice) + bajar la mano |
| Caja | Mano abierta → cerrar en puño y dejarla quieta |
| Ventana | Puño + golpe rápido |

Cada objeto solo responde a su gesto. Los demás dan "✗ no sirve".

## Ajustar la detección
Todos los umbrales están en `www/gestos.js`, en `CFG`. El panel de arriba a la izquierda
muestra la pose detectada y los valores de giro y bajada en directo, para afinarlos.

## Probar en PC
Abre `www/` con un servidor local (después de `npm install && npm run preparar`).
Sin cámara: teclas 1–5 hacen los gestos y las flechas mueven la vista.
