/* Doko-Zettel: Grundgerüst, Startseite, Spieler, neuer Abend, Zettel. */
(function () {
  'use strict';
  var D = window.Doko, Data = window.Data;
  var $app = document.getElementById('app'), $sheet = document.getElementById('sheet'), $toast = document.getElementById('toast');
  var MINUS = '−';
  var S = { profiles: [], pm: {}, me: null, active: [], ev: null, games: [], setup: null, stop: null, route: 'home', stale: false, busy: false };
  var App = window.App = { S: S, D: D, Data: Data, MINUS: MINUS };

  App.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  App.fmt = function (v) { return v > 0 ? '+' + v : v < 0 ? MINUS + Math.abs(v) : '±0'; };
  App.num = function (v) { return v < 0 ? MINUS + Math.abs(v) : String(v); };
  App.cls = function (v) { return v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'; };
  App.dec = function (v) { var s = (Math.round(Math.abs(v) * 10) / 10).toFixed(1).replace('.', ','); return (v < 0 && s !== '0,0' ? MINUS : '') + s; };
  App.pct = function (a, b) { return b ? Math.round(100 * a / b) + ' %' : '–'; };
  var esc = App.esc;
  App.nameOf = function (id) { return (S.pm[id] && S.pm[id].name) || 'Unbekannt'; };
  App.names = function (ev) { return ev.players.map(App.nameOf); };
  App.dateStr = function (iso) { try { var d = new Date(iso); return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'; } catch (e) { return ''; } };
  App.isWriter = function () { return !!(S.ev && S.me && S.ev.writer === S.me); };

  App.toast = function (msg) {
    $toast.textContent = msg; $toast.hidden = false;
    clearTimeout(App._tt); App._tt = setTimeout(function () { $toast.hidden = true; }, 3200);
  };
  App.fail = function (e) { console.error(e); App.toast('Das hat nicht geklappt: ' + ((e && e.message) || 'keine Verbindung') + ' Bitte noch einmal versuchen.'); };

  /* Blätter über der Seite */
  App.openSheet = function (html) { $sheet.innerHTML = html; $sheet.hidden = false; document.documentElement.style.overflow = 'hidden'; };
  App.closeSheet = function () { $sheet.hidden = true; $sheet.innerHTML = ''; document.documentElement.style.overflow = ''; App.draft = null; if (S.stale) { S.stale = false; App.refresh(); } };
  App.sheetOpen = function () { return !$sheet.hidden; };
  App.$sheet = $sheet;

  /* Daten laden */
  function loadProfiles() {
    return Data.profiles().then(function (p) { S.profiles = p; S.pm = {}; p.forEach(function (x) { S.pm[x.id] = x; }); });
  }
  App.loadProfiles = loadProfiles;

  App.go = function (hash) { if (location.hash === '#' + hash) route(); else location.hash = hash; };
  function setBusy() { $app.innerHTML = '<p class="busy">Lade …</p>'; }

  function route() {
    if (App.stopWatch) { App.stopWatch(); App.stopWatch = null; }
    if (App.sheetOpen()) App.closeSheet();
    var h = (location.hash || '#home').slice(1).split('/');
    S.route = h[0] || 'home';
    window.scrollTo(0, 0);
    var go = {
      home: viewHome, neu: viewSetup, spieler: viewPlayers, abend: function () { return viewEvening(h[1]); },
      statistik: function () { return App.viewStats(); }, archiv: viewArchive, regeln: function () { return App.viewRules(); }, zusammenfassung: function () { return App.viewSummary(h[1]); }
    }[S.route] || viewHome;
    setBusy();
    Promise.resolve().then(go).catch(function (e) { App.fail(e); $app.innerHTML = '<div class="note warn"><b>Keine Verbindung</b>Die Daten konnten nicht geladen werden.</div><button class="btn primary big" data-act="reload">Noch einmal laden</button>'; });
  }
  App.route = route;

  App.refresh = function () {
    if (S.route === 'abend' && S.ev) {
      return Promise.all([Data.evening(S.ev.id), Data.games(S.ev.id), loadProfiles()]).then(function (r) { S.ev = r[0]; S.games = r[1]; renderZettel(); }).catch(function (er) { if (er && er.code === 404) { App.toast('Dieser Abend wurde gelöscht.'); App.go('home'); } });
    }
    if (S.route === 'home') return Promise.all([Data.activeEvenings(), loadProfiles()]).then(function (r) { S.active = r[0]; renderHome(); }).catch(function () { });
    return Promise.resolve();
  };
  function watchView() {
    App.stopWatch = Data.watch(function () { if (App.sheetOpen()) { S.stale = true; return; } App.refresh(); });
  }

  /* ---------- Wer bin ich ---------- */
  App.askMe = function (after) {
    var items = S.profiles.map(function (p) { return '<button type="button" class="chip" data-act="iam" data-id="' + p.id + '">' + esc(p.name) + '</button>'; }).join('');
    App.openSheet('<div class="col"><div class="bar"><button type="button" class="btn ghost" data-act="close">Abbrechen</button><h2>Wer bist du?</h2></div><div class="body">' +
      '<p class="hint">Damit siehst du deine eigene Statistik und kannst das Schreiben übernehmen.</p>' +
      '<div class="chips">' + (items || '<p class="hint">Es gibt noch keine Spieler. Lege unten deinen Namen an.</p>') + '</div>' +
      '<label class="fld"><span>Oder neu anlegen</span><input type="text" id="newMe" maxlength="14" autocomplete="off" placeholder="Dein Name"></label>' +
      '<button type="button" class="btn primary big" data-act="iamNew">Neu anlegen und das bin ich</button></div></div>');
    App._afterMe = after || null;
  };
  function setMe(id) {
    S.me = id; Data.setMyProfileId(id); App.closeSheet();
    var f = App._afterMe; App._afterMe = null;
    if (f) f(); else App.refresh().then(function () { if (S.route !== 'abend') route(); });
  }

  /* ---------- Startseite ---------- */
  function viewHome() {
    return Promise.all([Data.activeEvenings(), loadProfiles()]).then(function (r) { S.active = r[0]; renderHome(); watchView(); });
  }
  function renderHome() {
    var me = S.me && S.pm[S.me];
    if (S.me && !me) { S.me = null; Data.setMyProfileId(null); }
    var cards = S.active.map(function (ev) {
      var names = App.names(ev).join(', ');
      return '<div class="item"><div class="grow"><b>Abend vom ' + App.dateStr(ev.created) + '</b><small>' + esc(names) + '</small><small>Schreiber: ' + esc(ev.writer ? App.nameOf(ev.writer) : 'niemand') + '</small></div>' +
        '<button type="button" class="btn primary small" data-act="openEv" data-id="' + ev.id + '">Öffnen</button></div>';
    }).join('');
    $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Doko-Zettel</h1><p class="sub">Doppelkopf zählen, gemeinsam und live</p></div></header>' +
      '<div class="note ' + (me ? 'me' : 'warn') + '">' + (me ? '<b>Du bist ' + esc(me.name) + '</b>' : '<b>Wer bist du?</b>Wähle dein Profil, damit du Statistik und Schreibrechte nutzen kannst.') +
      '<button type="button" class="btn small" style="margin-top:8px" data-act="askMe">' + (me ? 'Anderes Profil wählen' : 'Profil wählen') + '</button></div>' +
      '<h3 class="sec">Laufende Abende</h3>' +
      '<div class="list">' + (cards || '<p class="hint">Gerade läuft kein Abend. Starte unten einen neuen.</p>') + '</div>' +
      '<div class="menu"><button type="button" class="btn" data-act="goto" data-to="statistik">Statistik</button><button type="button" class="btn" data-act="goto" data-to="archiv">Abgeschlossene Abende</button>' +
      '<button type="button" class="btn" data-act="goto" data-to="spieler">Spieler</button><button type="button" class="btn" data-act="goto" data-to="regeln">Punkte-Regeln</button></div></main>' +
      '<div class="dock"><div class="dock-in"><button type="button" class="btn primary big" data-act="goto" data-to="neu">Neuer Abend</button></div></div>';
  }

  /* ---------- Spieler ---------- */
  function viewPlayers() {
    return loadProfiles().then(renderPlayers);
  }
  function renderPlayers() {
    var rows = S.profiles.map(function (p) {
      return '<div class="item"><div class="grow"><b>' + esc(p.name) + (p.id === S.me ? ' (du)' : '') + '</b></div>' +
        '<button type="button" class="btn small" data-act="rename" data-id="' + p.id + '">Umbenennen</button></div>';
    }).join('');
    $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Spieler</h1><p class="sub">Alle Mitspieler können Profile anlegen und ändern.</p></div><button type="button" class="btn" data-act="goto" data-to="home">Zurück</button></header>' +
      '<div class="list">' + (rows || '<p class="hint">Noch keine Spieler.</p>') + '</div>' +
      '<div class="card" style="margin-top:16px"><label class="fld"><span>Neuer Spieler</span><input type="text" id="newPlayer" maxlength="14" autocomplete="off" placeholder="Name"></label>' +
      '<button type="button" class="btn primary big" data-act="addPlayer">Spieler anlegen</button></div></main>';
  }

  /* ---------- Neuer Abend ---------- */
  function viewSetup() {
    return loadProfiles().then(function () {
      if (!S.setup) S.setup = { n: 4, picked: [], first: 0, count: 1, period: 'abend', every: 5 };
      renderSetup();
    });
  }
  function renderSetup() {
    var st = S.setup, n = st.n;
    var chips = S.profiles.map(function (p) {
      var at = st.picked.indexOf(p.id);
      return '<button type="button" class="chip' + (at >= 0 ? ' on' : '') + '" data-act="pick" data-id="' + p.id + '" aria-pressed="' + (at >= 0) + '">' + esc(p.name) + (at >= 0 ? '<small>Platz ' + (at + 1) + '</small>' : '') + '</button>';
    }).join('');
    var opts = st.picked.map(function (id, i) { return '<option value="' + i + '"' + (st.first === i ? ' selected' : '') + '>' + esc(App.nameOf(id)) + '</option>'; }).join('');
    var ok = st.picked.length === n;
    $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Neuer Abend</h1></div><button type="button" class="btn" data-act="goto" data-to="home">Abbrechen</button></header>' +
      '<section class="card"><div class="blk"><h3>Am Tisch</h3><div class="seg"><button type="button" data-act="setN" data-v="4" aria-pressed="' + (n === 4) + '">4 Spieler</button><button type="button" data-act="setN" data-v="5" aria-pressed="' + (n === 5) + '">5 Spieler</button></div>' +
      '<p class="hint">' + (n === 5 ? 'Bei fünf Spielern setzt der Geber aus.' : 'Alle vier spielen jede Runde mit.') + '</p></div>' +
      '<div class="blk"><h3>Spieler in Sitzreihenfolge (' + st.picked.length + ' von ' + n + ')</h3><div class="chips">' + chips + '</div>' +
      '<p class="hint">Tippe die Spieler in der Reihenfolge an, in der sie am Tisch sitzen. Noch einmal tippen nimmt sie wieder heraus.</p>' +
      '<div class="row" style="margin-top:10px"><input type="text" id="quickName" maxlength="14" class="grow" autocomplete="off" placeholder="Neuer Spieler"><button type="button" class="btn small" data-act="quickAdd">Anlegen</button></div></div>' +
      '<div class="blk"><h3><label for="first">Erster Geber</label></h3><select id="first"' + (ok ? '' : ' disabled') + '>' + (opts || '<option>Zuerst Spieler wählen</option>') + '</select></div>' +
      '<div class="blk"><h3>Pflichtsolo</h3><div class="row"><button type="button" class="mini" data-act="soloDec" aria-label="Weniger">' + MINUS + '</button><b style="font:500 24px var(--font-num);min-width:2ch;text-align:center">' + st.count + '</b><button type="button" class="mini" data-act="soloInc" aria-label="Mehr">+</button><span class="grow">Solo(s) pro Spieler</span></div>' +
      '<div class="seg" style="margin-top:10px"><button type="button" data-act="setPer" data-v="abend" aria-pressed="' + (st.period === 'abend') + '">pro Abend</button><button type="button" data-act="setPer" data-v="stunde" aria-pressed="' + (st.period === 'stunde') + '">pro Stunde</button><button type="button" data-act="setPer" data-v="runden" aria-pressed="' + (st.period === 'runden') + '">pro x Runden</button></div>' +
      (st.period === 'runden' ? '<div class="row" style="margin-top:10px"><button type="button" class="mini" data-act="evDec" aria-label="Weniger Runden">' + MINUS + '</button><b style="font:500 24px var(--font-num);min-width:2ch;text-align:center">' + st.every + '</b><button type="button" class="mini" data-act="evInc" aria-label="Mehr Runden">+</button><span class="grow">Runden (1 Runde = alle geben einmal)</span></div>' : '') +
      '<p class="hint">' + (st.period === 'abend' ? 'Jeder spielt sein Pflichtsolo einmal pro Abend.' : st.period === 'stunde' ? 'Pro volle Stunde Spielzeit schuldet jeder die eingestellte Anzahl Solos. Was am Ende fehlt, wird nach der letzten Runde nachgespielt.' : 'Pro ' + st.every + ' volle Runde(n) schuldet jeder die eingestellte Anzahl Solos. Was am Ende fehlt, wird nach der letzten Runde nachgespielt.') + '</p></div>' +
      '<p class="hint">Die Punkte-Werte stehen unter „Punkte-Regeln“ im Menü. Sie werden beim Start festgehalten.</p>' +
      '<button type="button" class="btn primary big" data-act="startEv"' + (ok ? '' : ' disabled') + '>Abend starten</button></section></main>';
  }

  /* ---------- Archiv ---------- */
  function viewArchive() {
    return Promise.all([Data.allEvenings(), loadProfiles()]).then(function (r) {
      var done = r[0].filter(function (e) { return e.status === 'beendet'; }).sort(function (a, b) { return a.created < b.created ? 1 : -1; });
      var rows = done.map(function (ev) {
        return '<div class="item"><div class="grow"><b>Abend vom ' + App.dateStr(ev.created) + '</b><small>' + esc(App.names(ev).join(', ')) + '</small></div>' +
          '<button type="button" class="btn small" data-act="goto" data-to="zusammenfassung/' + ev.id + '">Ansehen</button></div>';
      }).join('');
      $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Abende</h1><p class="sub">Abgeschlossen, mit Zusammenfassung und CSV</p></div><button type="button" class="btn" data-act="goto" data-to="home">Zurück</button></header>' +
        '<div class="list">' + (rows || '<p class="hint">Noch kein Abend abgeschlossen.</p>') + '</div></main>';
    });
  }

  /* ---------- Zettel ---------- */
  function viewEvening(id) {
    return Promise.all([Data.evening(id), Data.games(id), loadProfiles()]).then(function (r) {
      S.ev = r[0]; S.games = r[1];
      if (S.ev.status === 'beendet') { App.go('zusammenfassung/' + id); return; }
      renderZettel(); watchView();
    });
  }
  App.engine = function () { return D.replay(S.ev, S.games); };

  function renderZettel() {
    if (S.route !== 'abend' || !S.ev) return;
    var ev = S.ev, n = ev.n, st = App.engine(), names = App.names(ev), cum = [], rowsCum = [], p;
    for (p = 0; p < n; p++) cum.push(0);
    st.rows.forEach(function (r) { for (p = 0; p < n; p++) cum[p] += r.res.pp[p]; rowsCum.push(cum.slice()); });
    var best = Math.max.apply(null, cum);
    var head = '<th class="nr" scope="col">#</th>';
    for (p = 0; p < n; p++) head += '<th scope="col"><span class="nm">' + esc(names[p]) + '</span><span class="tot ' + (st.rows.length && cum[p] === best ? 'lead ' : '') + App.cls(cum[p]) + '">' + App.num(cum[p]) + '</span></th>';
    head += '<th class="wv" scope="col" title="Spielwert aus Sicht der Re-Partei"><span class="nm">Wert</span></th>';
    var body = '';
    if (!st.rows.length) body = '<tr><td colspan="' + (n + 2) + '" class="empty"><b>Noch kein Spiel</b>Der Schreiber trägt Spiele ein. Alle anderen sehen den Stand sofort.</td></tr>';
    for (var i = st.rows.length - 1; i >= 0; i--) {
      var r = st.rows[i], g = r.game, tags = [];
      if (g.mode === 'solo') tags.push(r.pflicht ? 'Pflichtsolo' : 'Solo');
      if (g.bock) tags.push('Bock');
      body += '<tr data-act="openGame" data-row="' + g.rowId + '" tabindex="0"><td class="nr"><b>' + r.nr + '</b>' + (tags.length ? '<small>' + tags.join(' · ') + '</small>' : '') + '</td>';
      var act = D.activeFor(n, r.dealer);
      for (p = 0; p < n; p++) {
        if (act.indexOf(p) < 0) { body += '<td class="out"><span class="d">–</span><span class="s">' + App.num(rowsCum[i][p]) + '</span></td>'; continue; }
        var v = r.res.pp[p];
        body += '<td class="' + (g.re.indexOf(p) >= 0 ? 're' : '') + '"><span class="d ' + App.cls(v) + '">' + App.fmt(v) + '</span><span class="s">' + App.num(rowsCum[i][p]) + '</span>' + (n === 4 && r.dealer === p ? '<i class="g">G</i>' : '') + '</td>';
      }
      var nv = r.res.netRe;
      body += '<td class="wv">' + (nv === 0 ? '±0' : (nv > 0 ? '+' : MINUS) + Math.abs(nv)) + '</td></tr>';
    }
    var banner = '', dealerName = esc(names[st.dealer]);
    if (st.phase === 'normal') banner = '<div class="note"><b>Runde ' + st.round + ' · Geber: ' + dealerName + '</b>' + (n === 5 ? esc(names[st.dealer]) + ' setzt aus.' : '') + '</div>';
    else if (st.phase === 'letzte') banner = '<div class="note warn"><b>Letzte Runde · Geber: ' + dealerName + '</b>Sie endet, wenn die Geberreihenfolge wieder bei ' + esc(names[ev.firstDealer]) + ' ankommt. Pflichtsoli verlängern sie.</div>';
    else if (st.phase === 'pflicht') {
      banner = '<div class="note warn"><b>Pflichtsolo: ' + esc(names[st.expected]) + ' muss spielen</b>Noch ohne Solo: ' + esc(st.owe.map(function (x) { return names[x]; }).join(', ')) + '.' +
        (st.forced ? ' ' + esc(names[st.expected]) + ' hat abgetreten und ist jetzt dran.' : (st.canCede ? ' ' + esc(names[st.expected]) + ' kann abtreten, muss dann aber im nächsten Spiel selbst spielen.' : '')) + '</div>';
    } else if (st.phase === 'fertig') banner = '<div class="note me"><b>Alle Pflichtsoli sind gespielt</b>Der Abend kann abgeschlossen werden.</div>';
    if (st.bockNext && st.phase !== 'fertig') banner += '<div class="note"><b>Nächstes Spiel ist ein Bockspiel</b>Das letzte Spiel ergab 0 Punkte. Punkte ×' + D.mergeRules(S.ev.rules).bock + '.</div>';

    var writer = ev.writer ? App.nameOf(ev.writer) : null, mine = App.isWriter();
    var wline = '<div class="note ' + (mine ? 'me' : '') + '"><b>' + (mine ? 'Du schreibst' : 'Schreiber: ' + esc(writer || 'niemand')) + '</b>' +
      (mine ? 'Die anderen sehen alles live und können jederzeit übernehmen.' : 'Du siehst alles live.') + '</div>';
    var dock;
    if (mine) {
      dock = '';
      if (st.phase === 'fertig') dock += '<button type="button" class="btn primary big" data-act="finish">Abend abschließen</button>';
      else dock += '<button type="button" class="btn primary big" data-act="newGame">' + (st.phase === 'pflicht' ? 'Pflichtsolo eintragen' : 'Spiel ' + (st.rows.length + 1) + ' eintragen') + '</button>';
      if (st.phase === 'normal' || st.phase === 'letzte') dock += '<button type="button" class="btn small" data-act="toggleLast">' + (ev.lastRound ? 'Letzte Runde zurücknehmen' : 'Letzte Runde ausrufen') + '</button>';
    } else dock = '<button type="button" class="btn primary big" data-act="takeOver">Schreiben übernehmen</button>';

    $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Zettel</h1><p class="sub">Abend vom ' + App.dateStr(ev.created) + ' · ' + n + ' Spieler</p></div>' +
      '<button type="button" class="btn" data-act="goto" data-to="home">Übersicht</button></header>' + wline + banner +
      '<p class="legend">Blau = Re-Partei. Große Zahl = Minuspunkte im Spiel, kleine Zahl = Zwischenstand.' + (n === 4 ? ' G = Geber.' : '') + '</p>' +
      '<table class="zettel"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="row" style="margin-top:14px"><button type="button" class="btn small" data-act="csvNow">CSV laden</button><button type="button" class="btn small danger" data-act="delEv" data-id="' + ev.id + '">Abend löschen</button></div></main>' +
      '<div class="dock"><div class="dock-in">' + dock + '</div></div>';
  }
  App.renderZettel = renderZettel;

  /* ---------- Aktionen ---------- */
  function needMe(fn) { if (!S.me) { App.askMe(fn); return false; } return true; }
  function evPatchThenRefresh(p) { return Data.updateEvening(S.ev.id, p).then(function (e) { e.rules = S.ev.rules; S.ev = e; renderZettel(); }); }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    var a = t.dataset.act, st = S.setup;
    if (a === 'reload') route();
    else if (a === 'goto') App.go(t.dataset.to);
    else if (a === 'close') App.closeSheet();
    else if (a === 'askMe') App.askMe(null);
    else if (a === 'iam') setMe(t.dataset.id);
    else if (a === 'iamNew') {
      var nm = document.getElementById('newMe').value.trim();
      if (!nm) { App.toast('Bitte einen Namen eintragen.'); return; }
      Data.createProfile(nm).then(function (p) { S.profiles.push(p); S.pm[p.id] = p; setMe(p.id); }).catch(App.fail);
    }
    else if (a === 'addPlayer') {
      var v = document.getElementById('newPlayer').value.trim();
      if (!v) { App.toast('Bitte einen Namen eintragen.'); return; }
      Data.createProfile(v).then(function () { return loadProfiles(); }).then(renderPlayers).catch(App.fail);
    }
    else if (a === 'rename') {
      var p = S.pm[t.dataset.id];
      App.openSheet('<div class="col"><div class="bar"><button type="button" class="btn ghost" data-act="close">Abbrechen</button><h2>Umbenennen</h2></div><div class="body"><label class="fld"><span>Name</span><input type="text" id="renameTo" maxlength="14" autocomplete="off" value="' + esc(p.name) + '"></label>' +
        '<button type="button" class="btn primary big" data-act="doRename" data-id="' + p.id + '">Speichern</button></div></div>');
    }
    else if (a === 'doRename') {
      var nn = document.getElementById('renameTo').value.trim();
      if (!nn) return;
      Data.renameProfile(t.dataset.id, nn).then(function () { App.closeSheet(); return loadProfiles(); }).then(renderPlayers).catch(App.fail);
    }
    else if (a === 'openEv') App.go('abend/' + t.dataset.id);
    else if (a === 'setN') { st.n = +t.dataset.v; st.picked = st.picked.slice(0, st.n); st.first = Math.min(st.first, st.picked.length - 1); if (st.first < 0) st.first = 0; renderSetup(); }
    else if (a === 'pick') {
      var id = t.dataset.id, at = st.picked.indexOf(id);
      if (at >= 0) st.picked.splice(at, 1); else if (st.picked.length < st.n) st.picked.push(id); else { App.toast('Es sitzen schon ' + st.n + ' Spieler am Tisch.'); return; }
      if (st.first >= st.picked.length) st.first = 0;
      renderSetup();
    }
    else if (a === 'quickAdd') {
      var q = document.getElementById('quickName').value.trim();
      if (!q) return;
      Data.createProfile(q).then(function (pr) { S.profiles.push(pr); S.pm[pr.id] = pr; if (st.picked.length < st.n) st.picked.push(pr.id); renderSetup(); }).catch(App.fail);
    }
    else if (a === 'soloDec') { st.count = Math.max(0, st.count - 1); renderSetup(); }
    else if (a === 'setPer') { st.period = t.dataset.v; renderSetup(); }
    else if (a === 'evDec') { st.every = Math.max(1, st.every - 1); renderSetup(); }
    else if (a === 'evInc') { st.every = Math.min(10, st.every + 1); renderSetup(); }
    else if (a === 'soloInc') { st.count = Math.min(3, st.count + 1); renderSetup(); }
    else if (a === 'startEv') {
      if (!needMe(function () { t.click(); })) return;
      t.disabled = true;
      Data.createEvening({ n: st.n, players: st.picked, firstDealer: st.first, writer: S.me, soloCount: st.count, rule: { period: st.period, every: st.every } })
        .then(function (ev) { S.setup = null; App.go('abend/' + ev.id); }).catch(function (er) { t.disabled = false; App.fail(er); });
    }
    else if (a === 'takeOver') {
      if (!needMe(function () { t.click(); })) return;
      evPatchThenRefresh({ writer: S.me }).then(function () { App.toast('Du schreibst jetzt.'); }).catch(App.fail);
    }
    else if (a === 'toggleLast') {
      var on = !S.ev.lastRound;
      evPatchThenRefresh({ lastRound: on, lastRoundAt: on ? S.games.length : 0 }).catch(App.fail);
    }
    else if (a === 'finish') App.finishEvening(t);
    else if (a === 'csvNow') App.downloadCsv(S.ev, S.games);
    else if (a === 'newGame' || a === 'openGame') App.entryAction(a, t);
    else if (App.reportAction) App.reportAction(a, t);
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'first' && S.setup) S.setup.first = +e.target.value;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && App.sheetOpen()) App.closeSheet();
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-act]')) { e.preventDefault(); e.target.click(); }
  });
  window.addEventListener('hashchange', route);

  App.start = function () {
    S.me = Data.myProfileId();
    Data.ready().then(function () { route(); }).catch(function (e) {
      console.error(e);
      $app.innerHTML = '<main class="wrap"><div class="note warn"><b>Keine Verbindung</b>Der Dienst ist gerade nicht erreichbar. Prüfe dein Netz und lade die Seite neu.</div><button class="btn primary big" data-act="reload">Neu laden</button></main>';
    });
  };
})();
