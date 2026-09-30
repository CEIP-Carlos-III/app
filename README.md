# Palabra · CEIP Carlos III

La palabra del día del colegio: adivina una palabra de cinco letras en seis intentos. **Sin anuncios, sin registro, sin rastreadores**, para que cargue sin problemas en la red de los centros (Andared).

## Qué incluye
- **Palabra del día**: la misma para todo el colegio, cambia a medianoche (hora de Madrid).
- **Modo libre**: partidas ilimitadas con palabras al azar.
- **Retos de clase**: en *Ajustes → Crea un reto*, el profesorado escribe una palabra y obtiene un enlace (la palabra va cifrada).
- **Modo pizarra** para la pantalla digital, **alto contraste** (daltonismo), **modo difícil**, tema claro/oscuro y sonido opcional.
- Estadísticas, rachas y resultado para compartir. Funciona **sin conexión** (PWA) y se puede instalar en móviles/tablets.
- Accesible: teclado físico, lector de pantalla y respeto a “reducir movimiento”.

## Publicarla
Es una web estática, sin dependencias:
1. En GitHub: *Settings → Pages → Source: GitHub Actions*. Cada cambio en `main` se publica solo (`.github/workflows/pages.yml`).
2. O copia la carpeta a cualquier servidor web. También funciona abriendo `index.html` directamente (sin modo sin conexión).

## Añadir palabras
Edita `js/words.js` y **añade** palabras al final de la lista (no reordenes: cambiaría la palabra de cada día). El diccionario de palabras válidas está en `js/dict.js`.

## Créditos
Tipografías Fraunces e Inter (SIL Open Font License). Diccionario: *an-array-of-spanish-words* (MIT).
