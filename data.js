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

  function parseRule(count, per) {
    var m = /^runden:(\d+)$/.exec(per || '');
    return { count: count == null ? 1 : count, period: m ? 'runden' : (per === 'stunde' ? 'stunde' : 'abend'), every: m ? +m[1] : 5 };
  }
  function ruleStr(r) { return r.period === 'runden' ? 'runden:' + r.every : (r.period === 'stunde' ? 'stunde' : 'abend'); }
  function evOf(r) {
    var d = r.dutyNext;
    return {
      id: r.$id, created: r.$createdAt, status: r.status || 'aktiv', n: r.n, players: r.players || [], firstDealer: r.firstDealer || 0,
      writer: r.writer || null, lastRound: !!r.lastRound, lastRoundAt: r.lastRoundAt || 0,
      dutyNext: (d === null || d === undefined || d === '') ? -1 : parseInt(d, 10),
      soloRule: parseRule(r.soloCount, r.soloPeriod),
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

  var CFG = 'cfg:';
  function cfgRowId(evId) { return 'c' + evId; }
  function parseRules(row) { try { var r = JSON.parse(row.data); return (r && typeof r === 'object') ? r : {}; } catch (e) { return {}; } }
  function getRules(rowId) {
    return tdb.getRow({ databaseId: C.db, tableId: 'spiele', rowId: rowId }).then(parseRules).catch(function () { return null; });
  }
  function putRules(rowId, abendId, rules) {
    var data = { abendId: abendId, nr: 1, data: JSON.stringify(rules) };
    return tdb.updateRow({ databaseId: C.db, tableId: 'spiele', rowId: rowId, data: { data: data.data } })
      .catch(function () { return tdb.createRow({ databaseId: C.db, tableId: 'spiele', rowId: rowId, data: data }); });
  }
  function isCfg(r) { return (r.abendId || '').indexOf(CFG) === 0; }
  /* Feedback liegt ebenfalls in der Tabelle 'spiele', erkennbar am Präfix 'fb:' (Beiträge: 'fb:posts', Kommentare: 'fb:<Beitrags-ID>') */
  var FB = 'fb:', FB_POSTS = 'fb:posts';
  function isFb(r) { return (r.abendId || '').indexOf(FB) === 0; }
  function isMeta(r) { return isCfg(r) || isFb(r); }
  function fbOf(r) {
    var d = {};
    try { d = JSON.parse(r.data) || {}; } catch (e) { /* defekte Zeile wird ignoriert */ }
    d.id = r.$id; d.created = r.$createdAt; d.parent = r.abendId === FB_POSTS ? null : r.abendId.slice(FB.length);
    if (!d.parent) { d.votes = d.votes || []; d.status = d.status || 'neu'; }
    return d;
  }
  function fbData(o) { var c = Object.assign({}, o); delete c.id; delete c.created; delete c.parent; return JSON.stringify(c); }
  function nowNr() { return Math.floor(Date.now() / 1000); }

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
    evening: function (id) {
      return tdb.getRow({ databaseId: C.db, tableId: 'abende', rowId: id }).then(evOf).then(function (ev) {
        return getRules(cfgRowId(id)).then(function (r) { ev.rules = r || {}; return ev; });
      });
    },
    /* Punkte-Regeln eines Abends: nur Abweichungen vom Standard werden gespeichert */
    saveEveningRules: function (evId, rules) { return putRules(cfgRowId(evId), CFG + evId, rules || {}); },
    createEvening: function (o) {
      return tdb.createRow({
        databaseId: C.db, tableId: 'abende', rowId: ID.unique(),
        data: { status: 'aktiv', n: o.n, players: o.players, firstDealer: o.firstDealer, writer: o.writer || null, lastRound: false, lastRoundAt: 0, soloCount: o.soloCount == null ? 1 : o.soloCount, soloPeriod: ruleStr(o.rule || { period: 'abend' }) }
      }).then(evOf).then(function (ev) {
        ev.rules = o.rules || {};
        return putRules(cfgRowId(ev.id), CFG + ev.id, ev.rules).catch(function () { }).then(function () { return ev; });
      });
    },
    updateEvening: function (id, patch) {
      var d = Object.assign({}, patch);
      if (d.dutyNext !== undefined) d.dutyNext = d.dutyNext >= 0 ? String(d.dutyNext) : null;
      return tdb.updateRow({ databaseId: C.db, tableId: 'abende', rowId: id, data: d }).then(evOf);
    },

    deleteEvening: function (id) {
      return Data.games(id).then(function (gs) {
        return gs.reduce(function (p, g) { return p.then(function () { return tdb.deleteRow({ databaseId: C.db, tableId: 'spiele', rowId: g.rowId }); }); }, Promise.resolve());
      }).then(function () { return tdb.deleteRow({ databaseId: C.db, tableId: 'spiele', rowId: cfgRowId(id) }).catch(function () { }); })
        .then(function () { return tdb.deleteRow({ databaseId: C.db, tableId: 'abende', rowId: id }); });
    },
    games: function (eveningId) { return listAll('spiele', [Q.equal('abendId', [eveningId])]).then(function (rows) { return rows.map(gameOf).sort(byGame); }); },
    allGames: function () { return listAll('spiele').then(function (rows) { return rows.filter(function (r) { return !isMeta(r); }).map(gameOf).sort(byGame); }); },
    /* Statistik: Abende mit ihren Regeln und alle Spiele, ein Abruf */
    statsData: function () {
      return Promise.all([listAll('abende'), listAll('spiele')]).then(function (r) {
        var rules = {}, games = [];
        r[1].forEach(function (x) { if (isCfg(x)) rules[x.abendId.slice(CFG.length)] = parseRules(x); else if (!isFb(x)) games.push(gameOf(x)); });
        var evs = r[0].map(evOf); evs.forEach(function (ev) { ev.rules = rules[ev.id] || {}; });
        return { evenings: evs, games: games.sort(byGame) };
      });
    },
    addGame: function (eveningId, nr, g) {
      return tdb.createRow({ databaseId: C.db, tableId: 'spiele', rowId: ID.unique(), data: { abendId: eveningId, nr: nr, data: JSON.stringify(g) } }).then(gameOf);
    },
    updateGame: function (rowId, g) { return tdb.updateRow({ databaseId: C.db, tableId: 'spiele', rowId: rowId, data: { data: JSON.stringify(g) } }).then(gameOf); },
    deleteGame: function (rowId) { return tdb.deleteRow({ databaseId: C.db, tableId: 'spiele', rowId: rowId }); },

    /* ---------- Feedback ---------- */
    feedback: function () {
      return listAll('spiele', [Q.startsWith('abendId', FB)]).then(function (rows) {
        var posts = [], byId = {};
        rows.forEach(function (r) { var f = fbOf(r); if (!f.parent) { f.comments = []; posts.push(f); byId[f.id] = f; } });
        rows.forEach(function (r) { var f = fbOf(r); if (f.parent && byId[f.parent]) byId[f.parent].comments.push(f); });
        posts.forEach(function (p) { p.comments.sort(function (a, b) { return a.created < b.created ? -1 : 1; }); });
        return posts;
      });
    },
    addFeedback: function (o) {
      var d = { cat: o.cat, title: o.title, text: o.text, author: o.author, status: 'neu', votes: [] };
      return tdb.createRow({ databaseId: C.db, tableId: 'spiele', rowId: ID.unique(), data: { abendId: FB_POSTS, nr: nowNr(), data: JSON.stringify(d) } }).then(fbOf);
    },
    addComment: function (postId, o) {
      return tdb.createRow({ databaseId: C.db, tableId: 'spiele', rowId: ID.unique(), data: { abendId: FB + postId, nr: nowNr(), data: JSON.stringify({ text: o.text, author: o.author }) } }).then(fbOf);
    },
    /* Ändert einen Beitrag auf dem neuesten Stand aus der Datenbank, damit gleichzeitige Daumen nicht verloren gehen */
    patchFeedback: function (postId, fn) {
      return tdb.getRow({ databaseId: C.db, tableId: 'spiele', rowId: postId }).then(function (r) {
        var f = fbOf(r); fn(f);
        return tdb.updateRow({ databaseId: C.db, tableId: 'spiele', rowId: postId, data: { data: fbData(f) } }).then(fbOf);
      });
    },
    deleteFeedback: function (postId) {
      return listAll('spiele', [Q.equal('abendId', [FB + postId])]).then(function (rows) {
        return rows.reduce(function (p, r) { return p.then(function () { return tdb.deleteRow({ databaseId: C.db, tableId: 'spiele', rowId: r.$id }); }); }, Promise.resolve());
      }).then(function () { return tdb.deleteRow({ databaseId: C.db, tableId: 'spiele', rowId: postId }); });
    },
    deleteComment: function (id) { return tdb.deleteRow({ databaseId: C.db, tableId: 'spiele', rowId: id }); },

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
