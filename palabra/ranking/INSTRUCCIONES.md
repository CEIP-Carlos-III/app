# Activar el ranking por clases (10 minutos, una sola vez)

El ranking guarda los resultados en una **hoja de cálculo de Google de la cuenta del centro**. No se guardan nombres ni datos personales: solo la clase, la fecha, los intentos y un código aleatorio del dispositivo (para que cada dispositivo cuente una vez al día).

## 1. Crear la hoja y el script
1. Con la cuenta del centro (`@g.educaand.es`), crea una hoja nueva en [sheets.new](https://sheets.new) y llámala, por ejemplo, **Palabra · Ranking**.
2. Menú **Extensiones → Apps Script**.
3. Borra lo que haya y pega el contenido de [`Codigo.gs`](Codigo.gs). Guarda (icono del disquete).
4. Arriba, en el desplegable de funciones, elige **configurar** y pulsa **Ejecutar**. Acepta los permisos que pide (es tu propia hoja).
   Se crean dos pestañas: **Resultados** y **Clases**.

## 2. Publicarlo como aplicación web
1. **Implementar → Nueva implementación** → tipo **Aplicación web**.
2. *Ejecutar como*: **Yo**. *Quién tiene acceso*: **Cualquier usuario** (necesario para que el alumnado juegue sin iniciar sesión).
3. Pulsa **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).

## 3. Conectar el juego
Edita [`../js/config.js`](../js/config.js) y pega la URL:

```js
window.PALABRA_CONFIG = {
  rankingUrl: "https://script.google.com/macros/s/XXXXXXXX/exec"
};
```

Al publicarse el cambio aparecerán el botón del trofeo 🏆 y la opción **Tu clase** en Ajustes.

## Uso diario
- **Clases**: edita la pestaña *Clases* (una por fila). Los cambios se ven al momento.
- **Puntos**: cada palabra del día acertada suma 6 puntos a la primera, 5 a la segunda… 1 en el sexto intento. Fallar no suma.
- **Periodos**: semana (de lunes a hoy), mes y curso (desde el 1 de septiembre).
- **Nuevo curso**: borra las filas de *Resultados* (deja la cabecera) o crea una hoja nueva.
- Si cambias el código del script, usa **Implementar → Gestionar implementaciones → Editar → Nueva versión** para mantener la misma URL.

> Es un juego de aula: un alumno con conocimientos técnicos podría enviar resultados falsos. Si veis algo raro, se puede borrar la fila en la hoja.

## Actualizar el script (cuando cambie `Codigo.gs`)
1. En la hoja: **Extensiones → Apps Script**, borra el código y pega el nuevo [`Codigo.gs`](Codigo.gs). Guarda.
2. **Implementar → Gestionar implementaciones** → lápiz ✏️ → *Versión*: **Nueva versión** → **Implementar**.
   Así la URL no cambia y no hay que tocar `config.js`.
