/* Palabra · CEIP Carlos III — lógica del juego (sin dependencias, funciona también abriendo el archivo en local). */
(function () {
  "use strict";

  // ---------- Constantes ----------
  var LEN = 5, TRIES = 6;
  var LAUNCH = Date.UTC(2026, 8, 30); // Nº 1 = 30 de septiembre de 2026
  var TZ = "Europe/Madrid";
  var FLIP_STEP = 280, FLIP_DUR = 620;
  var STORE = "palabra-c3:";
  var PRAISE = ["¡Genial!", "¡Magnífico!", "¡Impresionante!", "¡Espléndido!", "¡Muy bien!", "¡Por los pelos!"];
  var KB = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ñ"],
    ["enter", "z", "x", "c", "v", "b", "n", "m", "back"]
  ];
  var RANK = { absent: 1, present: 2, correct: 3 };

  // ---------- Utilidades ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function norm(s) {
    return String(s).toLowerCase().replace(/ñ/g, "\u0001").normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/\u0001/g, "ñ");
  }
  function load(k, def) {
    try { var v = localStorage.getItem(STORE + k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function save(k, v) { try { localStorage.setItem(STORE + k, JSON.stringify(v)); } catch (e) { /* modo privado */ } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------- Diccionario ----------
  var VALID = new Set();
  (function () {
    var d = window.DICCIONARIO || "";
    for (var i = 0; i < d.length; i += LEN) VALID.add(d.substr(i, LEN));
  })();
  var SOLUTIONS = (window.PALABRAS || []).map(function (w) { return { key: norm(w), display: w }; });
  SOLUTIONS.forEach(function (s) { VALID.add(s.key); });

  // ---------- Fecha (hora de Madrid, igual para todo el colegio) ----------
  function madridParts(d) {
    var parts = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).formatToParts(d || new Date()).forEach(function (p) { parts[p.type] = +p.value; });
    if (parts.hour === 24) parts.hour = 0;
    return parts;
  }
  function todayIndex() {
    var p = madridParts();
    return Math.round((Date.UTC(p.year, p.month - 1, p.day) - LAUNCH) / 864e5);
  }
  function solutionFor(day) {
    var n = SOLUTIONS.length;
    return SOLUTIONS[((day % n) + n) % n];
  }
  function msToMidnight() {
    var p = madridParts();
    return (86400 - (p.hour * 3600 + p.minute * 60 + p.second)) * 1000;
  }

  // ---------- Evaluación ----------
  function evaluate(guess, answer) {
    var res = new Array(LEN).fill("absent"), pool = {}, i;
    for (i = 0; i < LEN; i++) {
      if (guess[i] === answer[i]) res[i] = "correct";
      else pool[answer[i]] = (pool[answer[i]] || 0) + 1;
    }
    for (i = 0; i < LEN; i++) {
      if (res[i] !== "correct" && pool[guess[i]] > 0) { res[i] = "present"; pool[guess[i]]--; }
    }
    return res;
  }
  function hardModeError(guess, history, answer) {
    for (var g = 0; g < history.length; g++) {
      var ev = evaluate(history[g], answer), need = {}, i;
      for (i = 0; i < LEN; i++) {
        if (ev[i] === "correct" && guess[i] !== history[g][i])
          return "La " + (i + 1) + "ª letra debe ser " + history[g][i].toUpperCase();
        if (ev[i] !== "absent") need[history[g][i]] = (need[history[g][i]] || 0) + 1;
      }
      for (var ch in need) {
        var have = guess.split(ch).length - 1;
        if (have < need[ch]) return "Tu intento debe incluir la " + ch.toUpperCase();
      }
    }
    return null;
  }

  // ---------- Retos (palabra cifrada en el enlace) ----------
  var SALT = "carlos-iii";
  function encodeChallenge(word) {
    var out = "";
    for (var i = 0; i < word.length; i++) {
      var c = word.charCodeAt(i) ^ SALT.charCodeAt(i % SALT.length) ^ (i * 29 + 7);
      out += String.fromCharCode(c & 0xff, c >> 8);
    }
    return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeChallenge(code) {
    try {
      var bin = atob(code.replace(/-/g, "+").replace(/_/g, "/")), w = "";
      for (var i = 0; i < bin.length / 2; i++) {
        var c = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
        w += String.fromCharCode(c ^ SALT.charCodeAt(i % SALT.length) ^ (i * 29 + 7));
      }
      w = norm(w);
      return /^[a-zñ]{5}$/.test(w) ? w : null;
    } catch (e) { return null; }
  }

  // ---------- Estado ----------
  var settings = Object.assign({ theme: "auto", hard: false, contrast: false, board: false, sound: false }, load("settings", {}));
  var stats = Object.assign({ played: 0, wins: 0, streak: 0, max: 0, dist: [0, 0, 0, 0, 0, 0], lastWin: null, lastDay: null }, load("stats", {}));
  var DAY = todayIndex();
  var mode = "daily";   // daily | free | challenge
  var game = null;       // { answer, display, guesses, status, day?, code? }
  var current = "";
  var busy = false;

  function newGame(kind) {
    if (kind === "daily") {
      var s = solutionFor(DAY), saved = load("daily", null);
      if (saved && saved.day === DAY && saved.answer === s.key) return saved;
      return { kind: "daily", day: DAY, answer: s.key, display: s.display, guesses: [], status: "playing" };
    }
    if (kind === "free") {
      var f = load("free", null);
      if (f && f.status === "playing") return f;
      var pick = SOLUTIONS[Math.floor(Math.random() * SOLUTIONS.length)];
      if (f && pick.key === f.answer) pick = SOLUTIONS[(SOLUTIONS.indexOf(pick) + 1) % SOLUTIONS.length];
      return { kind: "free", answer: pick.key, display: pick.display, guesses: [], status: "playing" };
    }
    return null;
  }
  function persist() {
    if (!game) return;
    if (game.kind === "daily") save("daily", game);
    else if (game.kind === "free") save("free", game);
    else save("challenge:" + game.code, game);
  }

  // Mantener la racha coherente si se ha saltado algún día
  if (stats.lastWin !== null && stats.lastWin < DAY - 1 && !(load("daily", {}).day === DAY)) {
    if (stats.streak) { stats.streak = 0; save("stats", stats); }
  }

  // ---------- Apariencia ----------
  var root = document.documentElement;
  function applySettings() {
    root.setAttribute("data-theme", settings.theme);
    root.classList.toggle("hc", !!settings.contrast);
    root.classList.toggle("board-mode", !!settings.board);
    $$("#theme-seg [data-theme-opt]").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.themeOpt === settings.theme));
    });
    $("#opt-hard").checked = !!settings.hard;
    $("#opt-contrast").checked = !!settings.contrast;
    $("#opt-board").checked = !!settings.board;
    $("#opt-sound").checked = !!settings.sound;
    var dark = settings.theme === "dark" || (settings.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    $$('meta[name="theme-color"]').forEach(function (m) { m.content = dark ? "#11100E" : "#F3EDE2"; });
  }

  // ---------- Sonido (WebAudio, sin archivos) ----------
  var actx = null;
  function tone(freq, dur, type, gain, delay) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var t = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain || .06, t + .008);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + .02);
    } catch (e) { /* sin audio */ }
  }
  var sfx = {
    key: function () { tone(880 + Math.random() * 60, .05, "triangle", .035); },
    back: function () { tone(520, .06, "triangle", .03); },
    err: function () { tone(170, .16, "sawtooth", .03); tone(150, .18, "sawtooth", .025, .07); },
    flip: function (s, i) {
      var base = s === "correct" ? 660 : s === "present" ? 520 : 330;
      tone(base * (1 + i * .06), .18, "sine", .05);
    },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, .5, "sine", .05, i * .09); }); }
  };

  // ---------- Construcción del DOM ----------
  var boardEl = $("#board"), kbEl = $("#keyboard"), rows = [], keys = {};

  function makeTile(r, c) {
    var t = document.createElement("div");
    t.className = "tile";
    t.setAttribute("role", "gridcell");
    t.style.setProperty("--r", r); t.style.setProperty("--c", c);
    t.innerHTML = '<div class="face front"></div><div class="face back" aria-hidden="true"></div>';
    return t;
  }
  function buildBoard() {
    boardEl.innerHTML = ""; rows = [];
    for (var r = 0; r < TRIES; r++) {
      var row = document.createElement("div");
      row.className = "row"; row.setAttribute("role", "row");
      row.setAttribute("aria-label", "Intento " + (r + 1));
      var tiles = [];
      for (var c = 0; c < LEN; c++) { var t = makeTile(r, c); row.appendChild(t); tiles.push(t); }
      boardEl.appendChild(row); rows.push({ el: row, tiles: tiles });
    }
  }
  function buildKeyboard() {
    kbEl.innerHTML = "";
    KB.forEach(function (line) {
      var row = document.createElement("div"); row.className = "kb-row";
      line.forEach(function (k) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "key"; b.dataset.key = k;
        if (k === "enter") { b.className += " wide enter"; b.textContent = "Enviar"; b.setAttribute("aria-label", "Enviar palabra"); }
        else if (k === "back") {
          b.className += " wide"; b.setAttribute("aria-label", "Borrar");
          b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5.5h10.5A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5H9L3 12z"/><path d="m11.5 9.5 5 5m0-5-5 5"/></svg>';
        } else { b.textContent = k.toUpperCase(); b.setAttribute("aria-label", k.toUpperCase()); }
        row.appendChild(b); keys[k] = b;
      });
      kbEl.appendChild(row);
    });
  }
  function stateLabel(s) { return s === "correct" ? "correcta" : s === "present" ? "en otro lugar" : s === "absent" ? "no está" : "vacía"; }

  function setTile(t, letter, state) {
    t.querySelector(".front").textContent = letter ? letter.toUpperCase() : "";
    t.querySelector(".back").textContent = letter ? letter.toUpperCase() : "";
    t.classList.toggle("filled", !!letter);
    if (state) t.dataset.state = state; else delete t.dataset.state;
    t.setAttribute("aria-label", letter ? letter.toUpperCase() + ", " + stateLabel(state) : "vacía");
  }

  function paint() {
    // Pinta el tablero completo desde el estado (sin animar volteos)
    rows.forEach(function (row, r) {
      var g = game.guesses[r], ev = g ? evaluate(g, game.answer) : null;
      row.el.classList.toggle("current", r === game.guesses.length && game.status === "playing");
      row.tiles.forEach(function (t, c) {
        t.classList.remove("flip", "win", "pop", "cursor");
        if (g) { setTile(t, g[c], ev[c]); t.classList.add("revealed"); }
        else {
          t.classList.remove("revealed");
          setTile(t, r === game.guesses.length ? current[c] : "", null);
        }
      });
    });
    updateCursor();
    paintKeys();
  }
  function paintKeys() {
    var best = {};
    game.guesses.forEach(function (g) {
      evaluate(g, game.answer).forEach(function (s, i) {
        if (!best[g[i]] || RANK[s] > RANK[best[g[i]]]) best[g[i]] = s;
      });
    });
    Object.keys(keys).forEach(function (k) {
      if (best[k]) { keys[k].dataset.state = best[k]; keys[k].setAttribute("aria-label", k.toUpperCase() + ", " + stateLabel(best[k])); }
      else if (k.length === 1) { delete keys[k].dataset.state; keys[k].setAttribute("aria-label", k.toUpperCase()); }
    });
  }
  function updateCursor() {
    rows.forEach(function (row) { row.tiles.forEach(function (t) { t.classList.remove("cursor"); }); });
    if (game.status !== "playing") { keys.enter.classList.remove("ready"); return; }
    var row = rows[game.guesses.length];
    if (row && current.length < LEN) row.tiles[current.length].classList.add("cursor");
    keys.enter.classList.toggle("ready", current.length === LEN);
  }

  // ---------- Toasts / lector de pantalla ----------
  function toast(msg, opts) {
    opts = opts || {};
    var el = document.createElement("div");
    el.className = "toast" + (opts.big ? " big" : "");
    el.textContent = msg;
    var box = $("#toasts");
    while (box.children.length > 2) box.removeChild(box.firstChild);
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add("out");
      setTimeout(function () { el.remove(); }, 400);
    }, opts.ms || 1600);
  }
  function announce(msg) { var s = $("#sr"); s.textContent = ""; setTimeout(function () { s.textContent = msg; }, 30); }

  function shakeRow() {
    var row = rows[game.guesses.length].el;
    row.classList.remove("shake"); void row.offsetWidth; row.classList.add("shake");
    setTimeout(function () { row.classList.remove("shake"); }, 520);
    sfx.err();
    if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) {}
  }

  // ---------- Entrada ----------
  function addLetter(ch) {
    if (busy || game.status !== "playing" || current.length >= LEN) return;
    current += ch;
    var t = rows[game.guesses.length].tiles[current.length - 1];
    setTile(t, ch, null);
    t.classList.remove("pop"); void t.offsetWidth; t.classList.add("pop");
    sfx.key(); updateCursor();
  }
  function removeLetter() {
    if (busy || game.status !== "playing" || !current.length) return;
    current = current.slice(0, -1);
    setTile(rows[game.guesses.length].tiles[current.length], "", null);
    sfx.back(); updateCursor();
  }

  function submit() {
    if (busy || game.status !== "playing") return;
    if (current.length < LEN) { shakeRow(); toast("Faltan letras"); return; }
    if (!VALID.has(current) && current !== game.answer) { shakeRow(); toast("No está en nuestra lista de palabras"); return; }
    if (settings.hard) {
      var err = hardModeError(current, game.guesses, game.answer);
      if (err) { shakeRow(); toast(err); return; }
    }
    var guess = current, rowIdx = game.guesses.length;
    game.guesses.push(guess);
    current = "";
    if (guess === game.answer) game.status = "won";
    else if (game.guesses.length >= TRIES) game.status = "lost";
    if (game.kind === "daily" && game.status !== "playing") recordStats();
    persist();
    reveal(rowIdx, guess);
  }

  function reveal(r, guess) {
    busy = true;
    var ev = evaluate(guess, game.answer), row = rows[r];
    row.el.classList.remove("current");
    row.tiles.forEach(function (t, i) {
      t.classList.remove("cursor", "pop");
      setTile(t, guess[i], ev[i]);
      t.style.setProperty("--d", (i * FLIP_STEP) + "ms");
      t.classList.add("flip");
      setTimeout(function () { sfx.flip(ev[i], i); }, i * FLIP_STEP + FLIP_DUR / 2);
    });
    announce(guess.toUpperCase().split("").map(function (c, i) { return c + " " + stateLabel(ev[i]); }).join(", "));
    var total = reduced ? 50 : (LEN - 1) * FLIP_STEP + FLIP_DUR;
    setTimeout(function () {
      row.tiles.forEach(function (t) { t.classList.remove("flip"); t.classList.add("revealed"); });
      paintKeys();
      busy = false;
      if (game.status === "won") celebrate(r);
      else if (game.status === "lost") lose();
      else { rows[r + 1].el.classList.add("current"); updateCursor(); }
    }, total + 20);
  }

  function celebrate(r) {
    busy = true;
    toast(PRAISE[r], { big: true, ms: 2000 });
    sfx.win();
    rows[r].tiles.forEach(function (t, i) {
      t.classList.remove("revealed"); t.style.setProperty("--d", (i * 90) + "ms"); t.classList.add("win");
    });
    confetti();
    setTimeout(function () {
      rows[r].tiles.forEach(function (t) { t.classList.remove("win"); t.classList.add("revealed"); });
      busy = false; openStats(true);
    }, reduced ? 900 : 1900);
  }
  function lose() {
    toast(game.display.toUpperCase(), { big: true, ms: 2600 });
    updateCursor();
    setTimeout(function () { openStats(true); }, 1700);
  }

  function recordStats() {
    if (stats.lastDay === game.day) return;
    stats.played++; stats.lastDay = game.day;
    if (game.status === "won") {
      stats.wins++;
      stats.dist[game.guesses.length - 1]++;
      stats.streak = stats.lastWin === game.day - 1 ? stats.streak + 1 : 1;
      stats.lastWin = game.day;
      stats.max = Math.max(stats.max, stats.streak);
    } else stats.streak = 0;
    save("stats", stats);
  }

  // ---------- Confeti (canvas ligero) ----------
  function confetti() {
    if (reduced) return;
    var cv = $("#confetti"), ctx = cv.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
    var cs = getComputedStyle(root);
    var colors = ["--correct", "--present", "--accent", "--ink"].map(function (v) { return cs.getPropertyValue(v).trim(); });
    var rect = boardEl.getBoundingClientRect(), ox = (rect.left + rect.width / 2) * dpr, oy = (rect.top + rect.height * .45) * dpr;
    var parts = [];
    for (var i = 0; i < 140; i++) {
      var a = Math.random() * Math.PI * 2, sp = (4 + Math.random() * 11) * dpr;
      parts.push({
        x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 7 * dpr,
        w: (5 + Math.random() * 7) * dpr, h: (8 + Math.random() * 10) * dpr,
        r: Math.random() * 6, vr: (Math.random() - .5) * .35, c: colors[i % colors.length],
        shape: Math.random() < .3 ? 1 : 0, life: 0
      });
    }
    var start = performance.now();
    (function frame(now) {
      var t = now - start;
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vx *= .985; p.vy = p.vy * .985 + .32 * dpr;
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - t / 2600);
        ctx.fillStyle = p.c;
        if (p.shape) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.scale(1, Math.cos(p.r * 2)); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        ctx.restore();
      });
      if (t < 2700) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(start);
  }

  // ---------- Diálogos ----------
  function openDialog(id) {
    var d = $(id);
    $$("dialog[open]").forEach(function (o) { if (o !== d) closeDialog(o, true); });
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
  }
  function closeDialog(d, instant) {
    if (!d.open) return;
    if (instant || reduced) { d.classList.remove("closing"); d.close ? d.close() : d.removeAttribute("open"); return; }
    d.classList.add("closing");
    setTimeout(function () { d.classList.remove("closing"); d.close ? d.close() : d.removeAttribute("open"); }, 230);
  }
  $$("dialog").forEach(function (d) {
    d.addEventListener("click", function (e) {
      if (e.target === d || e.target.closest("[data-close]")) closeDialog(d);
    });
    d.addEventListener("cancel", function (e) { e.preventDefault(); closeDialog(d); });
  });

  function miniTiles(container, word, states, animate) {
    container.innerHTML = "";
    word.split("").forEach(function (ch, i) {
      var t = makeTile(0, i);
      setTile(t, ch, states ? states[i] : null);
      if (states) {
        if (animate && !reduced) { t.style.setProperty("--d", (200 + i * 120) + "ms"); t.classList.add("flip"); }
        else t.classList.add("revealed");
      }
      container.appendChild(t);
    });
  }

  var countdownTimer = null;
  function openStats(fromEnd) {
    var finished = game.status !== "playing";
    var res = $("#result");
    res.hidden = !finished;
    if (finished) {
      var won = game.status === "won";
      $("#result-eyebrow").textContent = won ? "¡Lo conseguiste!" : "La palabra era";
      var disp = norm(game.display) === game.answer ? game.display : game.answer;
      miniTiles($("#reveal-word"), game.answer, game.answer.split("").map(function () { return won ? "correct" : "absent"; }), fromEnd);
      var n = game.guesses.length;
      $("#result-line").innerHTML = won
        ? "Resuelta en <b>" + n + "</b> " + (n === 1 ? "intento" : "intentos") + (disp !== game.answer ? " · <b>" + escapeHtml(disp) + "</b>" : "")
        : "<b>" + escapeHtml(disp.charAt(0).toUpperCase() + disp.slice(1)) + "</b>. " + (game.kind === "daily" ? "¡Mañana más!" : "¡A la próxima!");
      $("#rae-link").href = "https://dle.rae.es/" + encodeURIComponent(disp);
    }

    // Estadísticas (solo cuentan las de la palabra del día)
    var showStats = game.kind === "daily" || !finished;
    $("#stats-block").hidden = !showStats;
    res.classList.toggle("solo", !showStats);
    $("#st-played").textContent = stats.played;
    $("#st-win").textContent = stats.played ? Math.round(stats.wins / stats.played * 100) : 0;
    $("#st-streak").textContent = stats.streak;
    $("#st-max").textContent = stats.max;
    var maxD = Math.max.apply(null, stats.dist.concat(1));
    var hit = game.kind === "daily" && game.status === "won" ? game.guesses.length - 1 : -1;
    $("#dist").innerHTML = stats.dist.map(function (v, i) {
      return '<li><span>' + (i + 1) + '</span><div class="bar' + (i === hit ? " hit" : "") + '" style="--w:' + (v / maxD).toFixed(3) + ';--i:' + i + '">' + v + "</div></li>";
    }).join("");

    // Pie
    var isDaily = game.kind === "daily";
    $("#countdown-wrap").hidden = !isDaily || !finished;
    $("#btn-share").hidden = !finished;
    var other = $("#btn-play-free");
    other.textContent = isDaily ? "Modo libre →" : game.kind === "free" ? "Otra palabra ↻" : "Palabra del día →";
    other.hidden = isDaily && !finished;
    $("#stats-footer").hidden = !finished && isDaily;
    tickCountdown(); clearInterval(countdownTimer); countdownTimer = setInterval(tickCountdown, 1000);
    openDialog("#dlg-stats");
  }
  function tickCountdown() {
    var ms = msToMidnight(), s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    $("#countdown").textContent = [h, m, ss].map(function (x) { return String(x).padStart(2, "0"); }).join(":");
    if (todayIndex() !== DAY) { DAY = todayIndex(); if (mode === "daily" && !busy) switchMode("daily", true); }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }

  // ---------- Compartir ----------
  function shareText() {
    var hc = settings.contrast;
    var map = { correct: hc ? "🟧" : "🟩", present: hc ? "🟦" : "🟨", absent: "⬜" };
    var head = game.kind === "daily" ? "Palabra nº " + (game.day + 1)
      : game.kind === "challenge" ? "Reto de Palabra" : "Palabra · modo libre";
    var score = (game.status === "won" ? game.guesses.length : "X") + "/" + TRIES + (settings.hard ? "*" : "");
    var grid = game.guesses.map(function (g) { return evaluate(g, game.answer).map(function (s) { return map[s]; }).join(""); }).join("\n");
    return head + " · " + score + "\nCEIP Carlos III\n\n" + grid;
  }
  function share() {
    var text = shareText();
    var url = location.href.split("#")[0];
    if (game.kind !== "challenge") url = url.split("?")[0];
    var full = text + "\n" + url;
    var touch = matchMedia("(pointer: coarse)").matches;
    if (navigator.share && touch) {
      navigator.share({ text: full }).catch(function () {});
      return;
    }
    copy(full, "Resultado copiado");
  }
  function copy(text, okMsg) {
    var done = function () { toast(okMsg); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text) ? done() : toast("No se pudo copiar"); });
    } else fallbackCopy(text) ? done() : toast("No se pudo copiar");
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove(); return ok;
  }

  // ---------- Modos ----------
  function switchMode(m) {
    mode = m;
    var tabMode = m === "challenge" ? "free" : m;
    $(".modes").dataset.mode = tabMode;
    $$(".mode").forEach(function (b) {
      var on = b.dataset.mode === tabMode && m !== "challenge";
      b.classList.toggle("is-active", on); b.setAttribute("aria-selected", String(on));
    });
    if (m === "challenge") $(".modes").dataset.mode = "none";
    current = "";
    if (m === "daily" || m === "free") {
      game = newGame(m);
      if (m === "free") persist();
      history.replaceState(null, "", location.pathname);
    }
    updateBanner();
    buildBoard(); paint();
  }
  function updateBanner() {
    var b = $("#banner");
    if (game.kind === "challenge") {
      b.hidden = false;
      b.innerHTML = '<span class="dot"></span><span><b>Reto de clase</b> · una palabra elegida por tu profe</span><button type="button" id="leave-challenge">Salir</button>';
      $("#leave-challenge").onclick = function () { switchMode("daily"); };
    } else b.hidden = true;
  }
  function startChallenge(code) {
    var word = decodeChallenge(code);
    if (!word) { toast("El enlace del reto no es válido"); return false; }
    var saved = load("challenge:" + code, null);
    game = saved && saved.answer === word ? saved
      : { kind: "challenge", code: code, answer: word, display: word, guesses: [], status: "playing" };
    VALID.add(word);
    switchMode("challenge", true);
    return true;
  }

  // ---------- Eventos ----------
  kbEl.addEventListener("click", function (e) {
    var b = e.target.closest(".key"); if (!b) return;
    var k = b.dataset.key;
    if (k === "enter") submit(); else if (k === "back") removeLetter(); else addLetter(k);
    b.blur();
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ($("dialog[open]")) return;
    if (e.target.closest && e.target.closest("input, textarea")) return;
    var k = e.key, key = null;
    if (k === "Enter") { key = "enter"; submit(); }
    else if (k === "Backspace" || k === "Delete") { key = "back"; removeLetter(); }
    else if (k && k.length === 1) {
      var n = norm(k);
      if (/^[a-zñ]$/.test(n)) { key = n; addLetter(n); }
    }
    if (key) {
      e.preventDefault();
      if (keys[key]) { keys[key].classList.add("pressed"); setTimeout(function () { keys[key].classList.remove("pressed"); }, 110); }
    }
  });

  $("#btn-help").onclick = function () { openDialog("#dlg-help"); };
  $("#btn-stats").onclick = function () { openStats(false); };
  $("#btn-settings").onclick = function () { openDialog("#dlg-settings"); };
  $("#btn-share").onclick = share;
  $("#btn-play-free").onclick = function () {
    closeDialog($("#dlg-stats"));
    if (game.kind === "free") { save("free", null); switchMode("free"); }
    else if (game.kind === "challenge") switchMode("daily");
    else switchMode("free");
  };
  $$(".mode").forEach(function (b) {
    b.onclick = function () { if (busy) return; if (b.dataset.mode !== mode) switchMode(b.dataset.mode); };
  });

  $$("#theme-seg [data-theme-opt]").forEach(function (b) {
    b.onclick = function () { settings.theme = b.dataset.themeOpt; save("settings", settings); applySettings(); };
  });
  $("#opt-hard").onchange = function (e) {
    if (e.target.checked && game.status === "playing" && game.guesses.length) {
      e.target.checked = false;
      toast("El modo difícil solo se activa al empezar una partida");
      return;
    }
    settings.hard = e.target.checked; save("settings", settings);
  };
  $("#opt-contrast").onchange = function (e) { settings.contrast = e.target.checked; save("settings", settings); applySettings(); };
  $("#opt-board").onchange = function (e) { settings.board = e.target.checked; save("settings", settings); applySettings(); };
  $("#opt-sound").onchange = function (e) { settings.sound = e.target.checked; save("settings", settings); if (settings.sound) sfx.flip("correct", 0); };
  matchMedia("(prefers-color-scheme: dark)").addEventListener &&
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applySettings);

  $("#challenge-form").onsubmit = function (e) {
    e.preventDefault();
    var w = norm($("#challenge-input").value.trim());
    if (!/^[a-zñ]{5}$/.test(w)) { toast("Escribe una palabra de 5 letras"); return; }
    if (!VALID.has(w)) toast("Aviso: no está en el diccionario, pero se aceptará en el reto", { ms: 2600 });
    var url = location.href.split(/[?#]/)[0] + "?reto=" + encodeChallenge(w);
    $("#challenge-url").value = url;
    $("#challenge-out").hidden = false;
    $("#challenge-url").select();
  };
  $("#challenge-copy").onclick = function () { copy($("#challenge-url").value, "Enlace copiado"); };

  // ---------- Inicio ----------
  function start() {
    applySettings();
    $$(".brand-word span").forEach(function (s, i) { s.style.setProperty("--i", i); });
    buildKeyboard();

    var p = madridParts();
    var date = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
    var wd = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: "UTC" }).format(date);
    var mo = new Intl.DateTimeFormat("es-ES", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
    var fmt = wd + " " + p.day + " " + mo;
    $("#dl-date").textContent = fmt;
    $("#dl-number").textContent = "Nº " + String(DAY + 1).padStart(3, "0");

    // Ejemplos de la ayuda
    var ex = [["gatos", 0, "correct"], ["palma", 2, "present"], ["tunel", 1, "absent"]];
    $$(".ex-row").forEach(function (row, i) {
      var e = ex[i];
      e[0].split("").forEach(function (ch, j) {
        var t = makeTile(0, j); setTile(t, ch, j === e[1] ? e[2] : null);
        if (j === e[1]) t.classList.add("revealed");
        row.appendChild(t);
      });
    });

    var code = new URLSearchParams(location.search).get("reto");
    if (!(code && startChallenge(code))) switchMode("daily", true);

    if (!load("seenHelp", false)) {
      save("seenHelp", true);
      setTimeout(function () { openDialog("#dlg-help"); }, reduced ? 0 : 900);
    } else if (game.status !== "playing") {
      setTimeout(function () { openStats(false); }, reduced ? 0 : 900);
    }
  }
  start();

  // Service worker (solo en http/https; en local se ignora)
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }

  // Exponer para pruebas
  window.__palabra = { evaluate: evaluate, norm: norm, encode: encodeChallenge, decode: decodeChallenge, hard: hardModeError, valid: VALID };
})();
