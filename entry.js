/* Doko-Zettel: Spiel eintragen, Spiel ansehen, ändern, löschen. */
(function () {
  'use strict';
  var App = window.App, S = App.S, D = App.D, Data = App.Data, esc = App.esc, MINUS = App.MINUS;
  var $sheet = App.$sheet;
  var REOPT = ['Keine Ansage', 'Re', 'Re · keine 90', 'Re · keine 60', 'Re · keine 30', 'Re · schwarz'];
  var KOPT = ['Keine Ansage', 'Kontra', 'Kontra · keine 90', 'Kontra · keine 60', 'Kontra · keine 30', 'Kontra · schwarz'];
  var EXROWS = [['f', 'Fuchs gefangen', 'Karo-Ass der Gegner', 2], ['d', 'Doppelkopf', 'Stich mit 40+ Augen', 6], ['k', 'Karlchen', 'Kreuz-Bube im letzten Stich', 1]];
  var draft = null, editRow = null, delArm = false, detailRow = null, st = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function nameOf(i) { return App.names(S.ev)[i]; }

  App.entryAction = function (a, t) {
    if (a === 'newGame') {
      if (!App.isWriter()) { App.toast('Nur der Schreiber trägt Spiele ein. Tippe auf „Schreiben übernehmen“.'); return; }
      st = App.engine();
      if (st.phase === 'fertig') return;
      var solo = st.phase === 'pflicht';
      draft = { mode: solo ? 'solo' : 'normal', dealer: st.dealer, re: solo ? [st.expected] : [], reAug: 120, reA: 0, kA: 0, ex: D.blankEx(), bock: !!st.bockNext };
      editRow = null;
      openForm();
    } else if (a === 'openGame') {
      detailRow = t.dataset.row; delArm = false;
      showDetail();
    }
  };

  /* ---------- Formular ---------- */
  function openForm() {
    var n = S.ev.n, solo = draft.mode === 'solo', pflichtPhase = !editRow && st.phase === 'pflicht';
    var title = editRow ? 'Spiel bearbeiten' : (pflichtPhase ? 'Pflichtsolo' : 'Spiel ' + (st.rows.length + 1));
    var opts = function (a) { return a.map(function (x, i) { return '<option value="' + i + '">' + x + '</option>'; }).join(''); };
    var ex = '';
    EXROWS.forEach(function (r) {
      ex += '<div class="exl"><b>' + r[1] + '</b><small>' + r[2] + '</small></div>';
      ['R', 'K'].forEach(function (P) {
        ex += '<div class="ctr"><button type="button" class="mini" data-act="ex" data-p="' + P + '" data-k="' + r[0] + '" data-d="-1" aria-label="' + r[1] + ' ' + (P === 'R' ? 'Re' : 'Kontra') + ' weniger">' + MINUS + '</button>' +
          '<output id="ex' + P + r[0] + '">0</output><button type="button" class="mini" data-act="ex" data-p="' + P + '" data-k="' + r[0] + '" data-d="1" aria-label="' + r[1] + ' ' + (P === 'R' ? 'Re' : 'Kontra') + ' mehr">+</button></div>';
      });
    });
    App.openSheet('<div class="col"><div class="bar"><button type="button" class="btn ghost" data-act="formClose">Abbrechen</button><h2>' + title + '</h2></div><div class="body">' +
      '<section class="blk"><h3>Spielart</h3><div class="seg"><button type="button" data-act="fmode" data-v="normal"' + (pflichtPhase ? ' disabled' : '') + '>Normalspiel</button><button type="button" data-act="fmode" data-v="solo">Solo</button></div>' +
      '<p class="hint" id="geber"></p></section>' +
      '<section class="blk"><h3 id="reTitle">Re-Spieler</h3><div class="chips" id="chips"></div><p class="hint" id="reHint"></p><div id="info"></div></section>' +
      '<section class="blk"><h3><label for="aug">Augen der Re-Partei</label></h3>' +
      '<input type="range" id="augRange" min="0" max="240" step="1" aria-label="Augen Re, Schieberegler"><div class="ticks"><span>0</span><span>60</span><span>120</span><span>180</span><span>240</span></div>' +
      '<div class="augnums"><span class="re">Re<b id="augRe">120</b></span><span>Kontra<b id="augK">120</b></span></div>' +
      '<div class="augctl"><button type="button" class="mini wide" data-act="fstep" data-d="-10">' + MINUS + '10</button><button type="button" class="mini" data-act="fstep" data-d="-1">' + MINUS + '1</button>' +
      '<input type="number" id="aug" inputmode="numeric" min="0" max="240" step="1" aria-label="Augen Re"><button type="button" class="mini" data-act="fstep" data-d="1">+1</button><button type="button" class="mini wide" data-act="fstep" data-d="10">+10</button></div>' +
      '</section>' +
      '<section class="blk"><h3>Ansagen</h3><div class="two"><label class="fld"><span id="reALbl">Re-Partei</span><select id="reA">' + opts(REOPT) + '</select></label>' +
      '<label class="fld"><span>Kontra-Partei</span><select id="kA">' + opts(KOPT) + '</select></label></div></section>' +
      '<section class="blk" id="exSec"><h3>Sonderpunkte</h3><div class="exgrid"><span></span><span class="ch">Re</span><span class="ch">Kontra</span>' + ex + '</div><p class="hint">Gezählt wird für die Partei, die den Punkt macht.</p></section>' +
      '<section class="blk"><label class="check"><input type="checkbox" id="bock"><span>Bockspiel: Punkte ×2</span></label></section>' +
      '<section class="blk"><h3>Rechenweg</h3><div class="ledger" id="ledger"></div></section></div>' +
      '<div class="foot"><div class="res" id="res"></div><button type="button" class="btn primary" id="saveBtn" data-act="fsave">Speichern</button></div></div>');
    sync();
  }

  function ledgerHTML(r) {
    var h = '';
    r.groups.forEach(function (gr) {
      h += '<div><h4>' + gr.title + '</h4>';
      h += gr.lines.length ? '<ul>' + gr.lines.map(function (l) { return '<li><span>' + l[0] + '</span><b>' + (l[1] > 0 ? '+' : MINUS) + Math.abs(l[1]) + '</b></li>'; }).join('') + '</ul>' : '<p class="hint">Keine Punkte</p>';
      h += '<div class="sumrow"><span>Summe</span><b>' + gr.total + '</b></div></div>';
    });
    var v = Math.abs(r.netRe);
    if (r.mult === 2) h += '<div class="sumrow"><span>Bockspiel ×2</span><b>' + v + '</b></div>';
    if (!r.solo && v > 0) h += '<div class="sumrow"><span>Geschriebene Punkte</span><b>' + 2 * v + '</b></div>';
    if (r.solo && v > 0) h += '<div class="sumrow"><span>Solo: Differenz (×4)</span><b>' + 4 * v + '</b></div>';
    return h;
  }
  function resultLine(r) {
    var m = 0 - (r.solo ? 4 : 2) * Math.abs(r.netRe);
    if (r.netRe === 0) return 'Unentschieden, keine Minuspunkte';
    if (r.solo) return r.netRe > 0 ? 'Jeder Gegner ' + App.fmt(m) + ' · Solist 0' : 'Solist ' + App.fmt(m) + ' · Gegner 0';
    return r.netRe > 0 ? 'Kontra ' + App.fmt(m) + ' je Spieler · Re 0' : 'Re ' + App.fmt(m) + ' je Spieler · Kontra 0';
  }

  function sync() {
    var n = S.ev.n, d = draft, solo = d.mode === 'solo', act = D.activeFor(n, d.dealer), s = $sheet;
    var pflichtPhase = !editRow && st && st.phase === 'pflicht';
    s.querySelectorAll('[data-act="fmode"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === d.mode)); });
    s.querySelector('#geber').textContent = 'Geber: ' + nameOf(d.dealer) + (n === 5 ? ' (setzt aus)' : '');
    var chips = '';
    for (var i = 0; i < n; i++) {
      var out = act.indexOf(i) < 0, on = d.re.indexOf(i) >= 0, sub = '', dis = out;
      if (out) sub = 'Geber';
      else if (solo && st) {
        var owes = st.soloCount[i] < st.need;
        if (pflichtPhase) { if (!owes || (st.forced && i !== st.expected)) dis = true; else if (i === st.expected) sub = 'muss'; else sub = 'tauscht'; }
        else if (owes) sub = 'Pflichtsolo';
      }
      chips += '<button type="button" class="chip' + (on ? ' on' : '') + '" data-act="fchip" data-i="' + i + '" aria-pressed="' + on + '"' + (dis ? ' disabled' : '') + '>' + esc(nameOf(i)) + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
    }
    s.querySelector('#chips').innerHTML = chips;
    s.querySelector('#reTitle').textContent = solo ? 'Solist' : 'Re-Spieler (Kreuz-Damen)';
    s.querySelector('#reHint').textContent = solo ? 'Wer spielt das Solo?' : 'Wer hat die Kreuz-Damen? Gewählt: ' + d.re.length + ' von 2';
    s.querySelector('#reALbl').textContent = solo ? 'Solist' : 'Re-Partei';

    var info = '';
    if (solo && d.re.length === 1 && st && !editRow) {
      var sp = d.re[0], need = st.soloCount[sp] < st.need;
      if (need) {
        var stay = !(n === 5 && st.soloCount[d.dealer] < st.need);
        info += '<div class="note me"><b>Pflichtsolo von ' + esc(nameOf(sp)) + '</b>' + esc(nameOf(sp)) + ' kommt selbst raus. ' +
          (stay ? 'Der Geber ' + esc(nameOf(d.dealer)) + ' bleibt für das nächste Spiel.' : 'Der Geber wechselt weiter, weil ' + esc(nameOf(d.dealer)) + ' selbst noch ein Solo braucht.') + '</div>';
      } else info += '<div class="note"><b>Weiteres Solo</b>Der Solist kommt nicht automatisch raus, es wird normal weitergegeben.</div>';
      if (pflichtPhase && sp !== st.expected && !st.forced) info += '<div class="note warn"><b>' + esc(nameOf(st.expected)) + ' tritt ab</b>' + esc(nameOf(st.expected)) + ' muss im nächsten Spiel das Solo spielen.</div>';
    }
    s.querySelector('#info').innerHTML = info;

    var ai = s.querySelector('#aug'); if (document.activeElement !== ai) ai.value = d.reAug;
    var rg = s.querySelector('#augRange'); rg.value = d.reAug; rg.style.setProperty('--fill', (d.reAug / 240 * 100) + '%');
    s.querySelector('#augRe').textContent = d.reAug; s.querySelector('#augK').textContent = 240 - d.reAug;
    s.querySelector('#reA').value = String(d.reA); s.querySelector('#kA').value = String(d.kA);
    s.querySelector('#exSec').hidden = solo;
    ['R', 'K'].forEach(function (P) { ['f', 'd', 'k'].forEach(function (k) { s.querySelector('#ex' + P + k).textContent = d.ex[P][k]; }); });
    s.querySelector('#bock').checked = !!d.bock;

    var valid = d.re.length === (solo ? 1 : 2) && d.re.every(function (i) { return act.indexOf(i) >= 0; });
    var r = D.score(Object.assign({}, d), n);
    s.querySelector('#ledger').innerHTML = ledgerHTML(r);
    var tt = r.netRe === 0 ? 'Unentschieden' : (r.netRe > 0 ? (solo ? 'Solist gewinnt' : 'Re gewinnt') : (solo ? 'Gegner gewinnen' : 'Kontra gewinnt'));
    s.querySelector('#res').innerHTML = valid ? '<strong>' + tt + '</strong><span>' + resultLine(r) + '</span>' : '<strong>' + (solo ? 'Solist wählen' : 'Zwei Re-Spieler wählen') + '</strong><span>Dann kann das Spiel gespeichert werden.</span>';
    s.querySelector('#saveBtn').disabled = !valid;
  }

  function save(btn) {
    var d = draft, g = { mode: d.mode, dealer: d.dealer, re: d.re.slice(), reAug: d.reAug, reA: d.reA, kA: d.kA, ex: d.ex, bock: !!d.bock };
    btn.disabled = true;
    var p;
    if (editRow) p = Data.updateGame(editRow, g);
    else {
      var nr = S.games.reduce(function (m, x) { return Math.max(m, x.nr || 0); }, 0) + 1;
      var duty = (st.phase === 'pflicht') ? D.nextDuty(st, g.re[0]) : -1;
      p = Data.addGame(S.ev.id, nr, g).then(function () { if (duty !== S.ev.dutyNext) return Data.updateEvening(S.ev.id, { dutyNext: duty }); });
    }
    p.then(function () { App.closeSheet(); return App.refresh(); }).catch(function (e) { btn.disabled = false; App.fail(e); });
  }

  /* ---------- Spiel ansehen ---------- */
  function showDetail() {
    var rows = App.engine().rows, row = null, i;
    for (i = 0; i < rows.length; i++) if (rows[i].game.rowId === detailRow) row = rows[i];
    if (!row) return;
    var g = row.game, r = row.res, n = S.ev.n, names = App.names(S.ev), act = D.activeFor(n, row.dealer), pl = '';
    for (i = 0; i < n; i++) {
      if (act.indexOf(i) < 0) { pl += '<div><span class="nm">' + esc(names[i]) + '</span><span class="d zero">–</span></div>'; continue; }
      pl += '<div class="' + (g.re.indexOf(i) >= 0 ? 're' : '') + '"><span class="nm">' + esc(names[i]) + '</span><span class="d ' + App.cls(r.pp[i]) + '">' + App.fmt(r.pp[i]) + '</span></div>';
    }
    var desc = [g.mode === 'solo' ? (row.pflicht ? 'Pflichtsolo' : 'Solo') : 'Normalspiel', 'Augen ' + g.reAug + ' : ' + (240 - g.reAug), 'Geber ' + names[row.dealer]];
    if (g.reA || g.kA) desc.push('Re: ' + REOPT[g.reA] + ', Kontra: ' + KOPT[g.kA]);
    if (g.bock) desc.push('Bockspiel');
    var mine = App.isWriter();
    App.openSheet('<div class="col"><div class="bar"><button type="button" class="btn ghost" data-act="close">Schließen</button><h2>Spiel ' + row.nr + '</h2></div><div class="body">' +
      '<p class="sub">' + esc(desc.join(' · ')) + '</p><div class="plist">' + pl + '</div>' +
      '<section class="blk"><h3>Rechenweg</h3><div class="ledger">' + ledgerHTML(r) + '</div></section>' +
      (mine ? '<div class="row"><button type="button" class="btn" data-act="gedit">Bearbeiten</button><button type="button" class="btn danger" data-act="gdel">' + (delArm ? 'Wirklich löschen?' : 'Löschen') + '</button></div>' : '<p class="hint">Nur der Schreiber kann Spiele ändern.</p>') + '</div></div>');
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    var a = t.dataset.act;
    if (a === 'formClose') App.closeSheet();
    else if (a === 'gedit') {
      var rows = App.engine().rows, row = rows.filter(function (x) { return x.game.rowId === detailRow; })[0];
      var g = clone(row.game); delete g.rowId; delete g.nr; delete g.abendId; delete g.created;
      draft = g; editRow = detailRow; st = App.engine(); openForm();
    }
    else if (a === 'gdel') {
      if (!delArm) { delArm = true; showDetail(); return; }
      Data.deleteGame(detailRow).then(function () { App.closeSheet(); return App.refresh(); }).catch(App.fail);
    }
    else if (draft && $sheet.contains(t)) {
      if (a === 'fmode') { draft.mode = t.dataset.v; draft.re = (!editRow && st.phase === 'pflicht' && draft.mode === 'solo') ? [st.expected] : []; if (draft.mode === 'solo') draft.ex = D.blankEx(); }
      else if (a === 'fchip') {
        var i = +t.dataset.i, max = draft.mode === 'solo' ? 1 : 2, at = draft.re.indexOf(i);
        if (at >= 0) draft.re.splice(at, 1); else { draft.re.push(i); while (draft.re.length > max) draft.re.shift(); }
      }
      else if (a === 'fstep') draft.reAug = Math.max(0, Math.min(240, draft.reAug + (+t.dataset.d)));
      else if (a === 'ex') {
        var row2 = EXROWS.filter(function (r) { return r[0] === t.dataset.k; })[0], P = t.dataset.p, k = t.dataset.k;
        draft.ex[P][k] = Math.max(0, Math.min(row2[3], draft.ex[P][k] + (+t.dataset.d)));
      }
      else if (a === 'fsave') { save(t); return; }
      else return;
      sync();
    }
  });
  document.addEventListener('input', function (e) {
    if (!draft || !$sheet.contains(e.target)) return;
    var t = e.target;
    if (t.id === 'aug') { var v = parseInt(t.value, 10); if (!isNaN(v)) { draft.reAug = Math.max(0, Math.min(240, v)); sync(); } }
    else if (t.id === 'augRange') { draft.reAug = +t.value; sync(); }
  });
  document.addEventListener('change', function (e) {
    if (!draft || !$sheet.contains(e.target)) return;
    var t = e.target;
    if (t.id === 'aug') { var v = parseInt(t.value, 10); if (!isNaN(v)) draft.reAug = Math.max(0, Math.min(240, v)); t.value = draft.reAug; sync(); }
    else if (t.id === 'reA') { draft.reA = +t.value; sync(); }
    else if (t.id === 'kA') { draft.kA = +t.value; sync(); }
    else if (t.id === 'bock') { draft.bock = t.checked; sync(); }
  });
  var oldClose = App.closeSheet;
  App.closeSheet = function () { draft = null; editRow = null; oldClose(); };
})();
