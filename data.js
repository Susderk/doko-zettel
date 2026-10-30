/* Datenzugriff: anonyme Anmeldung, Spieler, Abende, Spiele, Live-Updates. */
(function () {
  'use strict';
  var C = window.DOKO_CONFIG, A = window.Appwrite;
  var client = new A.Client().setEndpoint(C.endpoint).setProject(C.project);
  var account = new A.Account(client), tdb = new A.TablesDB(client), storage = new A.Storage(client);
  var Q = A.Query, ID = A.ID;

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ohne Speicher weiter */ }
    return null;
  }

  function listAll(tableId, queries) {
    var out = [];
    function page(last) {
      var q = [Q.limit(100)].concat(queries || []);
      if (last) q.push(Q.cursorAfter(last));
      return tdb.listRows({ databaseId: C.db, tableId: tableId, queries: q }).then(function (r) {
        out = out.concat(r.rows);
        return r.rows.length < 100 ? out : page(r.rows[r.rows.length - 1].$id);
      });
    }
    return page(null);
  }

  function evOf(r) {
    var d = r.dutyNext;
    return {
      id: r.$id, created: r.$createdAt, status: r.status || 'aktiv', n: r.n, players: r.players || [], firstDealer: r.firstDealer || 0,
      writer: r.writer || null, lastRound: !!r.lastRound, lastRoundAt: r.lastRoundAt || 0,
      dutyNext: (d === null || d === undefined || d === '') ? -1 : parseInt(d, 10),
      soloRule: { count: r.soloCount == null ? 1 : r.soloCount, period: r.soloPeriod || 'abend' },
      csvFileId: r.csvFileId || null, endedAt: r.endedAt || null
    };
  }
  function gameOf(r) {
    var g = {};
    try { g = JSON.parse(r.data); } catch (e) { /* defekte Zeile wird ignoriert */ }
    g.rowId = r.$id; g.nr = r.nr; g.abendId = r.abendId; g.created = r.$createdAt;
    return g;
  }
  function byGame(a, b) { return a.nr - b.nr || (a.created < b.created ? -1 : 1); }

  var Data = {
    userId: null,
    ready: function () {
      return account.get().catch(function () { return account.createAnonymousSession().then(function () { return account.get(); }); })
        .then(function (u) { Data.userId = u.$id; return u; });
    },
    myProfileId: function () { return ls('doko.me'); },
    setMyProfileId: function (id) { ls('doko.me', id); },

    profiles: function () {
      return listAll('profiles').then(function (rows) {
        return rows.map(function (r) { return { id: r.$id, name: r.name }; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
      });
    },
    createProfile: function (name) {
      return tdb.createRow({ databaseId: C.db, tableId: 'profiles', rowId: ID.unique(), data: { name: name } })
        .then(function (r) { return { id: r.$id, name: r.name }; });
    },
    renameProfile: function (id, name) {
      return tdb.updateRow({ databaseId: C.db, tableId: 'profiles', rowId: id, data: { name: name } });
    },

    activeEvenings: function () { return listAll('abende', [Q.equal('status', ['aktiv'])]).then(function (rows) { return rows.map(evOf); }); },
    allEvenings: function () { return listAll('abende').then(function (rows) { return rows.map(evOf); }); },
    evening: function (id) { return tdb.getRow({ databaseId: C.db, tableId: 'abende', rowId: id }).then(evOf); },
    createEvening: function (o) {
      return tdb.createRow({
        databaseId: C.db, tableId: 'abende', rowId: ID.unique(),
        data: { status: 'aktiv', n: o.n, players: o.players, firstDealer: o.firstDealer, writer: o.writer || null, lastRound: false, lastRoundAt: 0, soloCount: o.soloCount || 1, soloPeriod: 'abend' }
      }).then(evOf);
    },
    updateEvening: function (id, patch) {
      var d = Object.assign({}, patch);
      if (d.dutyNext !== undefined) d.dutyNext = d.dutyNext >= 0 ? String(d.dutyNext) : null;
      return tdb.updateRow({ databaseId: C.db, tableId: 'abende', rowId: id, data: d }).then(evOf);
    },

    games: function (eveningId) { return listAll('spiele', [Q.equal('abendId', [eveningId])]).then(function (rows) { return rows.map(gameOf).sort(byGame); }); },
    allGames: function () { return listAll('spiele').then(function (rows) { return rows.map(gameOf).sort(byGame); }); },
    addGame: function (eveningId, nr, g) {
      return tdb.createRow({ databaseId: C.db, tableId: 'spiele', rowId: ID.unique(), data: { abendId: eveningId, nr: nr, data: JSON.stringify(g) } }).then(gameOf);
    },
    updateGame: function (rowId, g) { return tdb.updateRow({ databaseId: C.db, tableId: 'spiele', rowId: rowId, data: { data: JSON.stringify(g) } }).then(gameOf); },
    deleteGame: function (rowId) { return tdb.deleteRow({ databaseId: C.db, tableId: 'spiele', rowId: rowId }); },

    uploadCsv: function (name, text) {
      var f = new File([text], name, { type: 'text/csv' });
      return storage.createFile({ bucketId: C.bucket, fileId: ID.unique(), file: f }).then(function (r) { return r.$id; });
    },

    /* Live-Updates: Realtime, dazu Abfrage alle 20 s und beim Zurückkehren in die App. */
    watch: function (onChange) {
      var chans = ['abende', 'spiele', 'profiles'].map(function (t) { return 'tablesdb.' + C.db + '.tables.' + t + '.rows'; });
      var timer = null;
      function fire(why) { if (timer) clearTimeout(timer); timer = setTimeout(function () { timer = null; onChange(why); }, 250); }
      var unsub = null;
      try { unsub = client.subscribe(chans, function () { fire('live'); }); } catch (e) { unsub = null; }
      var poll = setInterval(function () { if (!document.hidden) fire('poll'); }, 20000);
      function vis() { if (!document.hidden) fire('sichtbar'); }
      document.addEventListener('visibilitychange', vis);
      window.addEventListener('online', vis);
      return function stop() {
        clearInterval(poll); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', vis);
        if (typeof unsub === 'function') unsub();
      };
    }
  };
  window.Data = Data;
})();
