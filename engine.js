/* Doko-Zettel: Regelkern ohne Oberfläche. Reine Funktionen, in Node testbar. */
(function (root) {
  'use strict';
  var ABS = ['', 'Keine 90', 'Keine 60', 'Keine 30', 'Schwarz'];
  var TG = [120, 90, 60, 30], NEED = [151, 181, 211];
  var lvl = function (a) { return a >= 2 ? a - 1 : 0; };
  var blankEx = function () { return { R: { f: 0, d: 0, k: 0 }, K: { f: 0, d: 0, k: 0 } }; };

  function activeFor(n, dealer) {
    var a = [];
    for (var i = 0; i < n; i++) { if (n === 5 && i === dealer) continue; a.push(i); }
    return a;
  }

  /* Wertung eines Spiels. Hausregeln: je Ansage 1 Punkt, nur Minuspunkte (Verlierer zahlen),
     Solo = Differenz (x4), Bock = x2. Sonderpunkte werden vorher gegeneinander verrechnet. */
  function score(g, n) {
    var solo = g.mode === 'solo';
    var aug = { R: g.reAug, K: 240 - g.reAug };
    var L = { R: lvl(g.reA), K: lvl(g.kA) };
    var ann = { R: g.reA >= 1, K: g.kA >= 1 };
    var ok = function (X) {
      var o = X === 'R' ? 'K' : 'R', l = L[X];
      return l === 4 ? aug[o] === 0 : aug[X] >= NEED[l - 1];
    };
    var W;
    if (!L.R && !L.K) W = aug.R >= ((ann.K && !ann.R) ? 120 : 121) ? 'R' : 'K';
    else if (L.R && !L.K) W = ok('R') ? 'R' : 'K';
    else if (!L.R && L.K) W = ok('K') ? 'K' : 'R';
    else W = ok('R') ? 'R' : (ok('K') ? 'K' : null);
    var nm = { R: solo ? 'Solist' : 'Re', K: solo ? 'Gegner' : 'Kontra' };
    function party(X, win) {
      var O = X === 'R' ? 'K' : 'R', lines = [], oa = aug[O];
      if (win) { lines.push(['Gewonnen', 1]); if (X === 'K' && !solo) lines.push(['Gegen die Alten', 1]); }
      if (oa < 90) lines.push([nm[O] + ' unter 90', 1]);
      if (oa < 60) lines.push([nm[O] + ' unter 60', 1]);
      if (oa < 30) lines.push([nm[O] + ' unter 30', 1]);
      if (oa === 0) lines.push([nm[O] + ' schwarz', 1]);
      if (win) for (var s = 1; s <= L[X]; s++) lines.push([ABS[s] + ' angesagt', 1]);
      for (var t = 1; t <= L[O]; t++) if (aug[X] >= TG[t - 1]) lines.push([TG[t - 1] + ' Augen gegen „' + ABS[t] + '“', 1]);
      if (win) { if (ann.R) lines.push(['Re angesagt', 1]); if (ann.K) lines.push(['Kontra angesagt', 1]); }
      return lines;
    }
    var sum = function (a) { return a.reduce(function (t, x) { return t + x[1]; }, 0); };
    var groups = [], base;
    if (W) {
      var l = party(W, true), t = sum(l);
      groups.push({ title: W === 'R' ? (solo ? 'Solist gewinnt' : 'Re gewinnt') : (solo ? 'Gegner gewinnen' : 'Kontra gewinnt'), lines: l, total: t });
      base = (W === 'R' ? 1 : -1) * t;
    } else {
      var lr = party('R', false), lk = party('K', false);
      groups.push({ title: nm.R + ' (kein Gewinner)', lines: lr, total: sum(lr) }, { title: nm.K + ' (kein Gewinner)', lines: lk, total: sum(lk) });
      base = sum(lr) - sum(lk);
    }
    var exR = 0, exK = 0;
    var ex = g.ex || blankEx();
    if (!solo) {
      var el = [];
      [['f', 'Fuchs gefangen'], ['d', 'Doppelkopf'], ['k', 'Karlchen']].forEach(function (p) {
        var r = ex.R[p[0]], q = ex.K[p[0]];
        if (r) el.push(['Re: ' + p[1] + (r > 1 ? ' ×' + r : ''), r]);
        if (q) el.push(['Kontra: ' + p[1] + (q > 1 ? ' ×' + q : ''), -q]);
        exR += r; exK += q;
      });
      if (el.length) groups.push({ title: 'Sonderpunkte (Re minus Kontra)', lines: el, total: exR - exK });
    }
    var mult = g.bock ? 2 : 1;
    var raw = base + exR - exK;
    var netRe = raw * mult;
    var pp = []; for (var z = 0; z < n; z++) pp.push(0);
    var act = activeFor(n, g.dealer);
    var re = g.re || [], kon = act.filter(function (i) { return re.indexOf(i) < 0; });
    var v = Math.abs(netRe), f = solo ? 4 : 1;
    if (netRe > 0) kon.forEach(function (i) { pp[i] = -f * v; });
    else if (netRe < 0) re.forEach(function (i) { pp[i] = -f * v; });
    return { W: W, groups: groups, raw: raw, mult: mult, netRe: netRe, pp: pp, solo: solo };
  }

  /* Abendablauf: Geber, Pflichtsolo, letzte Runde. ev = {n, firstDealer, lastRound, lastRoundAt, dutyNext, soloRule:{count}} */
  function replay(ev, games) {
    var n = ev.n, need = (ev.soloRule && ev.soloRule.count != null) ? ev.soloRule.count : 1;
    var first = ev.firstDealer || 0, lastAt = ev.lastRoundAt || 0;
    var soloCount = []; for (var q = 0; q < n; q++) soloCount.push(0);
    var dealer = first, round = 1, phase = 'normal', bockNext = false, rows = [];
    var oweList = function () {
      var o = [];
      for (var k = 0; k < n; k++) { var p = (first + k) % n; if (soloCount[p] < need) o.push(p); }
      return o;
    };
    games.forEach(function (g, i) {
      var d = g.dealer != null ? g.dealer : dealer;
      var g2 = Object.assign({}, g, { dealer: d });
      var res = score(g2, n);
      var solo = g.mode === 'solo', s = solo ? g.re[0] : -1;
      var pflicht = solo && soloCount[s] < need;
      rows.push({ nr: i + 1, game: g2, res: res, dealer: d, pflicht: pflicht, round: round, phaseBefore: phase });
      if (solo) soloCount[s]++;
      bockNext = res.netRe === 0;
      var stay = pflicht;
      if (stay && n === 5 && soloCount[d] < need) stay = false;
      if (phase === 'pflicht') {
        if (!stay) dealer = (d + 1) % n; else dealer = d;
        if (oweList().length === 0) phase = 'fertig';
      } else if (phase === 'normal') {
        if (stay) dealer = d;
        else {
          var nd = (d + 1) % n;
          dealer = nd;
          if (nd === first) {
            if (ev.lastRound && i >= lastAt) { dealer = first; phase = oweList().length ? 'pflicht' : 'fertig'; }
            else round++;
          }
        }
      }
    });
    if (phase === 'normal' && ev.lastRound) phase = 'letzte';
    var owe = oweList();
    var forced = phase === 'pflicht' && ev.dutyNext != null && ev.dutyNext >= 0 && owe.indexOf(ev.dutyNext) >= 0;
    var expected = phase === 'pflicht' ? (forced ? ev.dutyNext : owe[0]) : -1;
    return {
      rows: rows, soloCount: soloCount, dealer: dealer, phase: phase, round: round, bockNext: bockNext,
      owe: owe, forced: forced, expected: expected, canCede: phase === 'pflicht' && !forced && owe.length > 1,
      active: activeFor(n, dealer), need: need
    };
  }

  /* Neuer Wert für dutyNext nach einem gespeicherten Spiel in der Pflichtsolo-Phase. */
  function nextDuty(st, soloist) {
    if (st.phase !== 'pflicht') return -1;
    if (soloist === st.expected) return -1;
    return st.expected;
  }

  /* Zusammenfassung je Spieler (Platz im Abend) */
  function summarize(ev, games) {
    var n = ev.n, st = replay(ev, games), out = [];
    for (var p = 0; p < n; p++) out.push({ games: 0, points: 0, won: 0, lost: 0, draw: 0, solos: 0, solosWon: 0, foxes: 0, karlchen: 0, doppelkopf: 0, bock: 0, gamesRe: 0, gamesKontra: 0, annRe: 0, annKontra: 0, absagen: 0 });
    st.rows.forEach(function (r) {
      var g = r.game, res = r.res;
      activeFor(n, r.dealer).forEach(function (p) {
        var o = out[p], inRe = g.re.indexOf(p) >= 0, X = inRe ? 'R' : 'K';
        o.games++; o.points += res.pp[p];
        if (inRe) o.gamesRe++; else o.gamesKontra++;
        if (res.netRe === 0) o.draw++;
        else if ((res.netRe > 0) === inRe) o.won++; else o.lost++;
        if (res.solo && inRe) { o.solos++; if (res.netRe > 0) o.solosWon++; }
        if (g.bock) o.bock++;
        if (!res.solo) { var e = g.ex[X]; o.foxes += e.f; o.doppelkopf += e.d; o.karlchen += e.k; }
        if ((inRe ? g.reA : g.kA) >= 1) { if (inRe) o.annRe++; else o.annKontra++; }
        if ((inRe ? g.reA : g.kA) >= 2) o.absagen++;
      });
    });
    out.forEach(function (o) { o.euro = Math.ceil(Math.abs(o.points) / 10); });
    return out;
  }

  function csvCell(v) { var s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV(meta, names, games) {
    var st = replay(meta.ev, games);
    var head = ['Abend', 'Spiel', 'Geber', 'Spielart', 'Pflichtsolo', 'Bock', 'Re-Spieler', 'Augen Re', 'Augen Kontra', 'Ansage Re', 'Ansage Kontra',
      'Fuchs Re', 'Fuchs Kontra', 'Doppelkopf Re', 'Doppelkopf Kontra', 'Karlchen Re', 'Karlchen Kontra', 'Ergebnis'];
    names.forEach(function (nm) { head.push('Punkte ' + nm); });
    var lines = [head.map(csvCell).join(';')];
    st.rows.forEach(function (r) {
      var g = r.game, res = r.res, e = g.ex;
      var row = [meta.date, r.nr, names[r.dealer], g.mode === 'solo' ? 'Solo' : 'Normal', r.pflicht ? 'ja' : 'nein', g.bock ? 'ja' : 'nein',
        g.re.map(function (i) { return names[i]; }).join(' + '), g.reAug, 240 - g.reAug, g.reA, g.kA,
        e.R.f, e.K.f, e.R.d, e.K.d, e.R.k, e.K.k, res.netRe === 0 ? 'unentschieden' : (res.netRe > 0 ? 'Re gewinnt' : 'Kontra gewinnt')];
      res.pp.forEach(function (x, i) { row.push(activeFor(meta.ev.n, r.dealer).indexOf(i) < 0 ? '' : x); });
      lines.push(row.map(csvCell).join(';'));
    });
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  root.Doko = { score: score, replay: replay, nextDuty: nextDuty, summarize: summarize, toCSV: toCSV, activeFor: activeFor, blankEx: blankEx, ABS: ABS };
  if (typeof module !== 'undefined') module.exports = root.Doko;
})(typeof window !== 'undefined' ? window : globalThis);
