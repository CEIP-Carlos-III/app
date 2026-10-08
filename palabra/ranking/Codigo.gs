/**
 * Palabra · CEIP Carlos III — Ranking por clases.
 *
 * Servidor gratuito en Google Apps Script, ligado a una hoja de cálculo
 * de la cuenta del centro. No guarda datos personales: solo la clase,
 * la fecha, el nº de intentos y un identificador aleatorio del dispositivo.
 *
 * Instrucciones de instalación: ver INSTRUCCIONES.md en esta carpeta.
 */

var TZ = "Europe/Madrid";
var HOJA_RESULTADOS = "Resultados";
var HOJA_CLASES = "Clases";
var CLASES_INICIALES = [
  "Infantil 3 años", "Infantil 4 años", "Infantil 5 años",
  "1º A", "1º B", "2º A", "2º B", "3º A", "3º B",
  "4º A", "4º B", "5º A", "5º B", "6º A", "6º B"
];
var CABECERA = ["Fecha", "Nº palabra", "Clase", "Intentos", "Acierto", "Puntos", "Modo difícil", "Dispositivo", "Recibido"];

/** Ejecútala UNA vez desde el editor para preparar la hoja. */
function configurar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var res = ss.getSheetByName(HOJA_RESULTADOS) || ss.insertSheet(HOJA_RESULTADOS);
  if (res.getLastRow() === 0) res.appendRow(CABECERA);
  res.getRange("A:A").setNumberFormat("@");
  res.setFrozenRows(1);
  res.getRange(1, 1, 1, CABECERA.length).setFontWeight("bold");

  var cl = ss.getSheetByName(HOJA_CLASES) || ss.insertSheet(HOJA_CLASES);
  if (cl.getLastRow() === 0) {
    cl.appendRow(["Clase (una por fila; puedes editar la lista)"]);
    CLASES_INICIALES.forEach(function (c) { cl.appendRow([c]); });
    cl.setFrozenRows(1);
    cl.getRange(1, 1).setFontWeight("bold");
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** GET ?action=todo (clases + los tres rankings, una sola petición)
 *  GET ?action=clases  |  GET ?action=ranking&periodo=semana|mes|curso */
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === "todo") return json(todo());
    if (p.action === "clases") return json({ ok: true, clases: leerClases() });
    if (p.action === "ranking") return json(ranking(p.periodo || "semana"));
    return json({ ok: true, servicio: "Palabra · ranking" });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** POST {clase, fecha:"aaaa-mm-dd", dia, intentos (0 = no acertada), dificil, dispositivo} */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var clases = leerClases();
    var hoy = fechaMadrid(new Date());
    var ayer = sumarDias(hoy, -1);
    var intentos = Number(d.intentos);
    var disp = String(d.dispositivo || "").slice(0, 40);

    if (clases.indexOf(d.clase) < 0) return json({ ok: false, error: "clase" });
    if (d.fecha !== hoy && d.fecha !== ayer) return json({ ok: false, error: "fecha" });
    if (!(intentos >= 0 && intentos <= 6 && Math.floor(intentos) === intentos)) return json({ ok: false, error: "intentos" });
    if (!/^[a-z0-9]{6,40}$/.test(disp)) return json({ ok: false, error: "dispositivo" });

    lock.waitLock(10000);
    var cache = CacheService.getScriptCache();
    var clave = "d:" + disp + ":" + d.fecha;
    if (cache.get(clave) || yaEnviado(disp, d.fecha)) return json({ ok: false, error: "duplicado" });

    var puntos = intentos ? 7 - intentos : 0;
    hojaResultados().appendRow([d.fecha, Number(d.dia) || "", d.clase, intentos || "X", intentos ? "Sí" : "No", puntos, d.dificil ? "Sí" : "No", disp, new Date()]);
    cache.put(clave, "1", 21600);
    cache.removeAll(["rk:todo", "rk:semana", "rk:mes", "rk:curso"]);
    return json({ ok: true, puntos: puntos });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ---------------------------------------------------------------------------
// Lógica
// ---------------------------------------------------------------------------

/** Clases y rankings de semana, mes y curso calculados en UNA sola lectura de la hoja.
 *  Se guarda en caché 10 min y se invalida en cuanto llega un resultado nuevo. */
function todo() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get("rk:todo");
  if (hit) return JSON.parse(hit);

  var hoy = fechaMadrid(new Date());
  var clases = leerClases();
  var periodos = ["semana", "mes", "curso"];
  var desde = {}, t = {};
  periodos.forEach(function (k) {
    desde[k] = inicioPeriodo(k, hoy);
    t[k] = {};
    clases.forEach(function (c) { t[k][c] = { puntos: 0, partidas: 0, aciertos: 0, sumaIntentos: 0 }; });
  });
  var minimo = desde.curso < desde.semana ? desde.curso : desde.semana;

  var sh = hojaResultados();
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var rows = sh.getRange(2, 1, n, 4).getValues();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var fecha = r[0] instanceof Date ? Utilities.formatDate(r[0], TZ, "yyyy-MM-dd") : String(r[0]);
      if (fecha < minimo || fecha > hoy || !t.curso[r[2]]) continue;
      var it = Number(r[3]) || 0;
      for (var k = 0; k < 3; k++) {
        if (fecha < desde[periodos[k]]) continue;
        var x = t[periodos[k]][r[2]];
        x.partidas++;
        if (it) { x.aciertos++; x.sumaIntentos += it; x.puntos += 7 - it; }
      }
    }
  }

  var ranking = {};
  periodos.forEach(function (k) {
    ranking[k] = {
      periodo: k, desde: desde[k], hasta: hoy,
      clases: clases.map(function (c) {
        var x = t[k][c];
        return {
          clase: c, puntos: x.puntos, partidas: x.partidas,
          aciertos: x.partidas ? Math.round(x.aciertos / x.partidas * 100) : 0,
          media: x.aciertos ? Math.round(x.sumaIntentos / x.aciertos * 10) / 10 : null
        };
      }).sort(function (a, b) { return b.puntos - a.puntos || b.aciertos - a.aciertos || b.partidas - a.partidas; })
    };
  });

  var out = { ok: true, clases: clases, ranking: ranking, generado: new Date().toISOString() };
  try { cache.put("rk:todo", JSON.stringify(out), 600); } catch (e) { /* demasiado grande: sin caché */ }
  return out;
}

/** Compatibilidad con versiones anteriores del juego. */
function ranking(periodo) {
  if (["semana", "mes", "curso"].indexOf(periodo) < 0) periodo = "semana";
  var r = todo().ranking[periodo];
  r.ok = true;
  return r;
}

function inicioPeriodo(periodo, hoy) {
  var y = +hoy.slice(0, 4), m = +hoy.slice(5, 7);
  if (periodo === "mes") return hoy.slice(0, 8) + "01";
  if (periodo === "curso") return (m >= 9 ? y : y - 1) + "-09-01";
  var dow = new Date(Date.UTC(y, m - 1, +hoy.slice(8, 10))).getUTCDay(); // 0 = domingo
  return sumarDias(hoy, -((dow + 6) % 7));                               // lunes
}

function yaEnviado(disp, fecha) {
  var sh = hojaResultados(), last = sh.getLastRow();
  if (last < 2) return false;
  var n = Math.min(last - 1, 3000);
  var rows = sh.getRange(last - n + 1, 1, n, 8).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    var f = rows[i][0] instanceof Date ? Utilities.formatDate(rows[i][0], TZ, "yyyy-MM-dd") : String(rows[i][0]);
    if (rows[i][7] === disp && f === fecha) return true;
  }
  return false;
}

function leerClases() {
  var cache = CacheService.getScriptCache(), hit = cache.get("clases");
  if (hit) return JSON.parse(hit);
  var lista = leerClasesHoja();
  cache.put("clases", JSON.stringify(lista), 600);
  return lista;
}

function leerClasesHoja() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CLASES);
  if (!sh || sh.getLastRow() < 2) return CLASES_INICIALES.slice();
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (c) { return c; });
}

function hojaResultados() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_RESULTADOS);
  if (!sh) { configurar(); sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_RESULTADOS); }
  return sh;
}

function fechaMadrid(d) { return Utilities.formatDate(d, TZ, "yyyy-MM-dd"); }
function sumarDias(iso, n) {
  var d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 864e5);
  return d.toISOString().slice(0, 10);
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Al editar la hoja a mano (clases, borrar filas…) se vacía la caché para que se vea al momento. */
function onEdit() {
  CacheService.getScriptCache().removeAll(["clases", "rk:todo", "rk:semana", "rk:mes", "rk:curso"]);
}
