/* Doko-Zettel: Statistik, Zusammenfassung, PDF zum Teilen, CSV. */
(function () {
  'use strict';
  var App = window.App, S = App.S, D = App.D, Data = App.Data, esc = App.esc, MINUS = App.MINUS, $app = document.getElementById('app');
  var statSel = null, sumCache = null;

  var METRICS = [
    ['Zu zahlen', function (o) { return o.euro + ' €'; }, 'pay'],
    ['Minuspunkte', function (o) { return App.num(o.points); }],
    ['Spiele', function (o) { return o.games; }],
    ['Gewonnen', function (o) { return o.won; }],
    ['Verloren', function (o) { return o.lost; }],
    ['Gespielte Solos', function (o) { return o.solos; }],
    ['Gewonnene Solos', function (o) { return o.solosWon; }],
    ['Füchse gefangen', function (o) { return o.foxes; }],
    ['Karlchen', function (o) { return o.karlchen; }],
    ['Doppelkopf', function (o) { return o.doppelkopf; }],
    ['Bockspiele', function (o) { return o.bock; }],
    ['Spiele als Re', function (o) { return o.gamesRe; }],
    ['Spiele als Kontra', function (o) { return o.gamesKontra; }],
    ['Ansagen Re', function (o) { return o.annRe; }],
    ['Ansagen Kontra', function (o) { return o.annKontra; }],
    ['Absagen (keine 90/60/30)', function (o) { return o.absagen; }]
  ];

  function isoDate(iso) { try { var d = new Date(iso), z = function (x) { return String(x).padStart(2, '0'); }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes()); } catch (e) { return 'abend'; } }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  App.downloadCsv = function (ev, games) {
    var csv = D.toCSV({ date: App.dateStr(ev.created), ev: ev }, App.names(ev), games);
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'doppelkopf-' + isoDate(ev.created) + '.csv');
  };

  App.finishEvening = function (btn) {
    btn.disabled = true;
    var ev = S.ev, csv = D.toCSV({ date: App.dateStr(ev.created), ev: ev }, App.names(ev), S.games);
    Data.uploadCsv('doppelkopf-' + isoDate(ev.created) + '-' + ev.id.slice(-4) + '.csv', csv).catch(function () { return null; })
      .then(function (fileId) { return Data.updateEvening(ev.id, { status: 'beendet', endedAt: new Date().toISOString(), csvFileId: fileId }); })
      .then(function () { App.go('zusammenfassung/' + ev.id); })
      .catch(function (e) { btn.disabled = false; App.fail(e); });
  };

  /* ---------- Zusammenfassung ---------- */
  App.viewSummary = function (id) {
    return Promise.all([Data.evening(id), Data.games(id), App.loadProfiles()]).then(function (r) {
      var ev = r[0], games = r[1], names = App.names(ev), sm = D.summarize(ev, games);
      sumCache = { ev: ev, games: games, names: names, sm: sm };
      var head = '<th></th>' + names.map(function (n) { return '<th>' + esc(n) + '</th>'; }).join('');
      var rows = METRICS.map(function (m) {
        return '<tr class="' + (m[2] || '') + '"><td style="font:600 14px var(--font-ui)">' + m[0] + '</td>' + sm.map(function (o) { return '<td' + (m[2] ? ' class="pay"' : '') + '>' + m[1](o) + '</td>'; }).join('') + '</tr>';
      }).join('');
      var total = sm.reduce(function (t, o) { return t + o.euro; }, 0);
      $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Zusammenfassung</h1><p class="sub">Abend vom ' + App.dateStr(ev.created) + ' · ' + games.length + ' Spiele' + (ev.status === 'aktiv' ? ' · noch nicht abgeschlossen' : '') + '</p></div>' +
        '<button type="button" class="btn" data-act="goto" data-to="' + (ev.status === 'aktiv' ? 'abend/' + ev.id : 'home') + '">Zurück</button></header>' +
        '<div class="scroll"><table class="stat sum"><thead><tr>' + head.replace(/<th>/g, '<th style="text-align:right">').replace('<th style="text-align:right"></th>', '<th></th>') + '</tr></thead><tbody>' + rows.replace(/<td style="font:600 14px var\(--font-ui\)">/g, '<td style="font:600 14px var(--font-ui);position:sticky;left:0;background:var(--paper)">') + '</tbody></table></div>' +
        '<p class="hint">Zu zahlen: Minuspunkte geteilt durch 10, aufgerundet auf ganze Euro. Zusammen ' + total + ' €.</p>' +
        '<div class="list" style="margin-top:16px"><button type="button" class="btn primary big" data-act="sharePdf">PDF teilen (WhatsApp)</button>' +
        '<button type="button" class="btn big" data-act="shareText">Als Text an WhatsApp</button>' +
        '<button type="button" class="btn big" data-act="csvSum">CSV herunterladen</button>' +
        '<button type="button" class="btn big danger" data-act="delEv" data-id="' + ev.id + '">Abend löschen</button></div></main>';
    });
  };

  function summaryText() {
    var c = sumCache, lines = ['Doppelkopf vom ' + App.dateStr(c.ev.created) + ' (' + c.games.length + ' Spiele)', ''];
    c.sm.forEach(function (o, i) { lines.push(c.names[i] + ': ' + o.euro + ' € (' + App.num(o.points) + ' Punkte)'); });
    return lines.join('\n');
  }
  function buildPdf() {
    var c = sumCache, jsPDF = window.jspdf.jsPDF, doc = new jsPDF({ unit: 'mm', format: 'a4' });
    var minus = function (s) { return String(s).replace(new RegExp(MINUS, 'g'), '-'); };
    var W = 210, left = 16, labelW = 62, colW = (W - left * 2 - labelW) / c.names.length, y = 22;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('Doppelkopf', left, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); y += 7;
    doc.text('Abend vom ' + App.dateStr(c.ev.created) + ' - ' + c.games.length + ' Spiele - ' + c.names.length + ' Spieler', left, y);
    y += 12;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    c.names.forEach(function (n, i) { doc.text(n, left + labelW + colW * (i + 1) - 2, y, { align: 'right' }); });
    y += 3; doc.setLineWidth(0.5); doc.line(left, y, W - left, y); y += 7;
    METRICS.forEach(function (m, idx) {
      var pay = !!m[2];
      doc.setFont('helvetica', pay ? 'bold' : 'normal'); doc.setFontSize(pay ? 14 : 11);
      if (pay) y += 1;
      doc.text(m[0], left, y);
      c.sm.forEach(function (o, i) { doc.text(minus(m[1](o)), left + labelW + colW * (i + 1) - 2, y, { align: 'right' }); });
      y += pay ? 9 : 7.5;
      if (pay) { doc.setLineWidth(0.2); doc.line(left, y - 5, W - left, y - 5); }
    });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); y += 6;
    doc.text('Zu zahlen: Minuspunkte geteilt durch 10, aufgerundet auf ganze Euro.', left, y);
    return doc.output('blob');
  }

  App.reportAction = function (a, t) {
    if (a === 'delEv') {
      var id = t.dataset.id;
      Promise.all([Data.evening(id), Data.games(id)]).then(function (x) {
        var nm = App.names(x[0]).join(', ');
        App.openSheet('<div class="col"><div class="bar"><button type="button" class="btn ghost" data-act="close">Abbrechen</button><h2>Abend löschen</h2></div><div class="body">' +
          '<div class="note warn"><b>Abend vom ' + App.dateStr(x[0].created) + ' endgültig löschen?</b>' + esc(nm) + ' · ' + x[1].length + ' Spiele. Das lässt sich nicht rückgängig machen und gilt für alle Mitspieler.</div>' +
          '<button type="button" class="btn danger big" data-act="delEvOk" data-id="' + id + '">Ja, endgültig löschen</button></div></div>');
      }).catch(App.fail);
      return;
    }
    if (a === 'delEvOk') {
      t.disabled = true;
      Data.deleteEvening(t.dataset.id).then(function () { App.closeSheet(); App.toast('Abend gelöscht.'); App.go('home'); }).catch(function (e) { t.disabled = false; App.fail(e); });
      return;
    }
    if (a === 'sharePdf') {
      if (!sumCache) return;
      var blob, name = 'doppelkopf-' + isoDate(sumCache.ev.created) + '.pdf';
      try { blob = buildPdf(); } catch (e) { App.fail(e); return; }
      var file = new File([blob], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Doppelkopf vom ' + App.dateStr(sumCache.ev.created), text: summaryText() }).catch(function (e) { if (e && e.name !== 'AbortError') { saveBlob(blob, name); App.toast('Teilen ging nicht, das PDF wurde geladen.'); } });
      } else { saveBlob(blob, name); App.toast('Das PDF wurde geladen. Teile es aus deinen Downloads.'); }
    } else if (a === 'shareText') {
      if (!sumCache) return;
      var url = 'https://wa.me/?text=' + encodeURIComponent(summaryText());
      window.open(url, '_blank', 'noopener');
    } else if (a === 'csvSum') {
      if (sumCache) App.downloadCsv(sumCache.ev, sumCache.games);
    } else if (a === 'statPick') {
      statSel = arguments[1].dataset.id; renderStats();
    }
  };

  /* ---------- Statistik über alle Abende ---------- */
  var statData = null;
  function zero() { return { evenings: 0, games: 0, points: 0, won: 0, lost: 0, draw: 0, solos: 0, solosWon: 0, foxes: 0, karlchen: 0, doppelkopf: 0, bock: 0, gamesRe: 0, gamesKontra: 0, annRe: 0, annKontra: 0, absagen: 0, euro: 0 }; }
  App.viewStats = function () {
    return Promise.all([Data.allEvenings(), Data.allGames(), App.loadProfiles()]).then(function (r) {
      var evs = r[0], games = r[1], by = {}, agg = {};
      games.forEach(function (g) { (by[g.abendId] = by[g.abendId] || []).push(g); });
      evs.forEach(function (ev) {
        var gs = by[ev.id] || []; if (!gs.length) return;
        var sm = D.summarize(ev, gs);
        ev.players.forEach(function (pid, seat) {
          var o = sm[seat], a = agg[pid] = agg[pid] || zero();
          Object.keys(o).forEach(function (k) { a[k] += o[k]; });
          if (o.games) a.evenings++;
        });
      });
      statData = agg;
      if (!statSel || !agg[statSel]) statSel = (S.me && agg[S.me]) ? S.me : Object.keys(agg)[0] || null;
      renderStats();
    });
  };
  function renderStats() {
    var ids = Object.keys(statData).sort(function (a, b) { return App.nameOf(a).localeCompare(App.nameOf(b), 'de'); });
    if (!ids.length) { $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Statistik</h1></div><button type="button" class="btn" data-act="goto" data-to="home">Zurück</button></header><p class="hint">Sobald Spiele eingetragen sind, erscheint hier die Statistik.</p></main>'; return; }
    var chips = ids.map(function (id) { return '<button type="button" class="chip' + (id === statSel ? ' on' : '') + '" data-act="statPick" data-id="' + id + '" aria-pressed="' + (id === statSel) + '">' + esc(App.nameOf(id)) + '</button>'; }).join('');
    var a = statData[statSel];
    var kv = [['Abende', a.evenings], ['Spiele', a.games], ['Punkteschnitt pro Spiel', App.dec(a.games ? a.points / a.games : 0)], ['Gewonnen', App.pct(a.won, a.games)],
      ['Gewonnen / Verloren / Unentschieden', a.won + ' / ' + a.lost + ' / ' + a.draw], ['Gespielte Solos', a.solos], ['Solos gewonnen', App.pct(a.solosWon, a.solos)],
      ['Füchse gefangen', a.foxes], ['Karlchen', a.karlchen], ['Doppelkopf', a.doppelkopf], ['Bockspiele', a.bock], ['Spiele als Re / Kontra', a.gamesRe + ' / ' + a.gamesKontra], ['Bisher gezahlt', a.euro + ' €']];
    var rows = ids.map(function (id) {
      var o = statData[id];
      return '<tr class="' + (id === S.me ? 'me' : '') + '"><td>' + esc(App.nameOf(id)) + '</td><td>' + o.games + '</td><td>' + App.dec(o.games ? o.points / o.games : 0) + '</td><td>' + App.pct(o.won, o.games) + '</td><td>' + o.solos + '</td><td>' + App.pct(o.solosWon, o.solos) + '</td></tr>';
    }).join('');
    $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Statistik</h1><p class="sub">Über alle Abende</p></div><button type="button" class="btn" data-act="goto" data-to="home">Zurück</button></header>' +
      '<div class="chips">' + chips + '</div>' +
      '<section class="card" style="margin-top:14px"><dl class="kv">' + kv.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl></section>' +
      '<h3 class="sec">Alle im Vergleich</h3><div class="scroll"><table class="stat"><thead><tr><th></th><th>Spiele</th><th>Ø Punkte</th><th>gewonnen</th><th>Solos</th><th>Solo gew.</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="hint">Es zählen nur Minuspunkte, also ist der Schnitt näher an 0 besser. Unentschieden zählen nicht als gewonnen.</p></main>';
  }
})();
