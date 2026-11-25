/* Doko-Zettel: Feedback-Pinnwand mit Kommentaren, Daumen, Kategorie und Status. */
(function () {
  'use strict';
  var App = window.App, S = App.S, Data = App.Data, esc = App.esc, $app = document.getElementById('app');
  var CATS = [['wunsch', 'Wunsch'], ['fehler', 'Fehler'], ['regel', 'Regelfrage']];
  var STATUS = [['neu', 'Neu'], ['geplant', 'Geplant'], ['erledigt', 'Erledigt'], ['abgelehnt', 'Abgelehnt']];
  var posts = [], openId = null, sort = 'neu', filter = 'offen', draft = null, delArm = null;

  function label(list, k) { for (var i = 0; i < list.length; i++) if (list[i][0] === k) return list[i][1]; return k; }
  /* Vorläufige Admin-Prüfung über den Spielernamen; mit echten Logins wird nur diese Funktion ersetzt */
  function isAdmin() {
    var me = S.me && S.pm[S.me], admins = (window.DOKO_CONFIG.admins || []).map(function (n) { return n.toLowerCase(); });
    return !!(me && admins.indexOf(me.name.trim().toLowerCase()) >= 0);
  }
  function canDelete(author) { return isAdmin() || (S.me && author === S.me); }
  function needMe(fn) { if (!S.me) { App.askMe(fn); return false; } return true; }
  function byId(id) { for (var i = 0; i < posts.length; i++) if (posts[i].id === id) return posts[i]; return null; }
  function when(iso) { try { return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; } }
  function multiline(s) { return esc(s).replace(/\n/g, '<br>'); }
  function tags(p) {
    return '<span class="tag">' + esc(label(CATS, p.cat)) + '</span><span class="tag st-' + esc(p.status) + '">' + esc(label(STATUS, p.status)) + '</span>';
  }
  function voteBtn(p) {
    var mine = S.me && p.votes.indexOf(S.me) >= 0;
    return '<button type="button" class="vote' + (mine ? ' on' : '') + '" data-act="fbVote" data-id="' + p.id + '" aria-pressed="' + !!mine + '" aria-label="Daumen hoch, ' + p.votes.length + ' Stimmen">👍 <b>' + p.votes.length + '</b></button>';
  }

  function load() { return Promise.all([Data.feedback(), App.loadProfiles()]).then(function (r) { posts = r[0]; }); }

  App.viewFeedback = function (id) {
    openId = id || null; delArm = null;
    return load().then(function () { render(); App.watchView(); });
  };
  App.fbRefresh = function () { return load().then(render).catch(function () { }); };

  function render() {
    if (S.route !== 'feedback') return;
    if (openId) return renderDetail();
    var list = posts.filter(function (p) {
      if (filter === 'offen') return p.status === 'neu' || p.status === 'geplant';
      if (filter === 'fertig') return p.status === 'erledigt' || p.status === 'abgelehnt';
      return true;
    }).sort(function (a, b) {
      if (sort === 'top' && b.votes.length !== a.votes.length) return b.votes.length - a.votes.length;
      return a.created < b.created ? 1 : -1;
    });
    var items = list.map(function (p) {
      return '<div class="item fb"><button type="button" class="fb-open" data-act="goto" data-to="feedback/' + p.id + '"><b>' + esc(p.title) + '</b>' +
        '<span class="tags">' + tags(p) + '</span>' +
        '<small>' + esc(App.nameOf(p.author)) + ' · ' + when(p.created) + ' · ' + p.comments.length + (p.comments.length === 1 ? ' Kommentar' : ' Kommentare') + '</small></button>' + voteBtn(p) + '</div>';
    }).join('');
    $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Feedback</h1><p class="sub">Wünsche, Fehler und Regelfragen zur App</p></div><button type="button" class="btn" data-act="goto" data-to="home">Zurück</button></header>' +
      '<div class="seg" style="margin-bottom:10px"><button type="button" data-act="fbFilter" data-v="offen" aria-pressed="' + (filter === 'offen') + '">Offen</button><button type="button" data-act="fbFilter" data-v="fertig" aria-pressed="' + (filter === 'fertig') + '">Erledigt</button><button type="button" data-act="fbFilter" data-v="alle" aria-pressed="' + (filter === 'alle') + '">Alle</button></div>' +
      '<div class="seg" style="margin-bottom:14px"><button type="button" data-act="fbSort" data-v="neu" aria-pressed="' + (sort === 'neu') + '">Neueste zuerst</button><button type="button" data-act="fbSort" data-v="top" aria-pressed="' + (sort === 'top') + '">Meiste Daumen</button></div>' +
      '<div class="list">' + (items || '<p class="hint">' + (posts.length ? 'Hier ist gerade nichts.' : 'Noch kein Feedback. Schreib den ersten Beitrag.') + '</p>') + '</div></main>' +
      '<div class="dock"><div class="dock-in"><button type="button" class="btn primary big" data-act="fbNew">Feedback schreiben</button></div></div>';
  }

  function renderDetail() {
    var p = byId(openId);
    if (!p) { $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Feedback</h1></div><button type="button" class="btn" data-act="goto" data-to="feedback">Zurück</button></header><div class="note warn"><b>Beitrag nicht gefunden</b>Er wurde vermutlich gelöscht.</div></main>'; return; }
    var old = document.getElementById('fbComment'), keep = old ? old.value : '', hadFocus = old && document.activeElement === old;
    var admin = isAdmin();
    var statusCtl = admin ? '<div class="blk"><h3>Status (nur Admin)</h3><div class="seg">' + STATUS.map(function (s) {
      return '<button type="button" data-act="fbStatus" data-v="' + s[0] + '" aria-pressed="' + (p.status === s[0]) + '">' + s[1] + '</button>';
    }).join('') + '</div></div>' : '';
    var comments = p.comments.map(function (c) {
      return '<div class="cmt"><div class="cmt-h"><b>' + esc(App.nameOf(c.author)) + '</b><small>' + when(c.created) + '</small>' +
        (canDelete(c.author) ? '<button type="button" class="linkbtn" data-act="fbDelC" data-id="' + c.id + '">' + (delArm === c.id ? 'Wirklich löschen?' : 'Löschen') + '</button>' : '') + '</div>' +
        '<p>' + multiline(c.text) + '</p></div>';
    }).join('');
    $app.innerHTML = '<main class="wrap"><header class="top"><div><h1>Feedback</h1></div><button type="button" class="btn" data-act="goto" data-to="feedback">Zurück</button></header>' +
      '<section class="card"><div><h2 class="fb-title">' + esc(p.title) + '</h2><span class="tags">' + tags(p) + '</span>' +
      '<p class="hint">' + esc(App.nameOf(p.author)) + ' · ' + when(p.created) + '</p></div>' +
      (p.text ? '<p>' + multiline(p.text) + '</p>' : '') +
      '<div class="row">' + voteBtn(p) + '<span class="hint" style="margin:0">' + (p.votes.length ? esc(p.votes.map(App.nameOf).join(', ')) : 'Noch keine Daumen') + '</span></div>' +
      statusCtl +
      (canDelete(p.author) ? '<button type="button" class="btn small danger" data-act="fbDelP">' + (delArm === p.id ? 'Wirklich löschen? Kommentare gehen mit.' : 'Beitrag löschen') + '</button>' : '') + '</section>' +
      '<h3 class="sec">Kommentare (' + p.comments.length + ')</h3>' +
      '<div class="list">' + (comments || '<p class="hint">Noch keine Kommentare.</p>') + '</div>' +
      '<div class="card" style="margin-top:14px"><label class="fld"><span>Dein Kommentar' + (S.me ? ' als ' + esc(App.nameOf(S.me)) : '') + '</span><textarea id="fbComment" maxlength="500" rows="3" placeholder="Was meinst du dazu?"></textarea></label>' +
      '<button type="button" class="btn primary big" data-act="fbComment">Kommentar senden</button></div></main>';
    var ta = document.getElementById('fbComment');
    if (keep) ta.value = keep;
    if (hadFocus) ta.focus();
  }

  function openNew() {
    draft = draft || { cat: 'wunsch', title: '', text: '' };
    App.openSheet('<div class="col"><div class="bar"><button type="button" class="btn ghost" data-act="close">Abbrechen</button><h2>Feedback</h2></div><div class="body">' +
      '<section class="blk"><h3>Art</h3><div class="seg">' + CATS.map(function (c) { return '<button type="button" data-act="fbCat" data-v="' + c[0] + '" aria-pressed="' + (draft.cat === c[0]) + '">' + c[1] + '</button>'; }).join('') + '</div></section>' +
      '<label class="fld"><span>Kurz und knapp</span><input type="text" id="fbTitle" maxlength="80" autocomplete="off" placeholder="z. B. Bockspiel farbig markieren" value="' + esc(draft.title) + '"></label>' +
      '<label class="fld"><span>Beschreibung (freiwillig)</span><textarea id="fbText" maxlength="1000" rows="5" placeholder="Was genau? Bei Fehlern: Was hast du gemacht, was ist passiert?">' + esc(draft.text) + '</textarea></label>' +
      '<p class="hint">Du schreibst als ' + esc(App.nameOf(S.me)) + '. Alle in der Runde können den Beitrag sehen, kommentieren und mit Daumen hoch unterstützen.</p>' +
      '<button type="button" class="btn primary big" data-act="fbSave">Abschicken</button></div></div>');
  }
  function readDraft() {
    var t = document.getElementById('fbTitle'), x = document.getElementById('fbText');
    if (t) draft.title = t.value; if (x) draft.text = x.value;
  }

  function fbAction(a, t) {
    if (a === 'fbFilter') { filter = t.dataset.v; render(); }
    else if (a === 'fbSort') { sort = t.dataset.v; render(); }
    else if (a === 'fbNew') { if (needMe(openNew)) openNew(); }
    else if (a === 'fbCat') { readDraft(); draft.cat = t.dataset.v; App.$sheet.querySelectorAll('[data-act="fbCat"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === draft.cat)); }); }
    else if (a === 'fbSave') {
      readDraft();
      var title = draft.title.trim();
      if (!title) { App.toast('Bitte kurz beschreiben, worum es geht.'); return; }
      t.disabled = true;
      Data.addFeedback({ cat: draft.cat, title: title, text: draft.text.trim(), author: S.me }).then(function (p) {
        draft = null; App.closeSheet(); App.toast('Danke für dein Feedback!'); App.go('feedback/' + p.id);
      }).catch(function (e) { t.disabled = false; App.fail(e); });
    }
    else if (a === 'fbVote') {
      if (!needMe(function () { t.click(); })) return;
      var id = t.dataset.id;
      t.disabled = true;
      Data.patchFeedback(id, function (f) {
        var i = f.votes.indexOf(S.me);
        if (i >= 0) f.votes.splice(i, 1); else f.votes.push(S.me);
      }).then(App.fbRefresh).catch(function (e) { t.disabled = false; App.fail(e); });
    }
    else if (a === 'fbStatus') {
      if (!isAdmin()) return;
      var v = t.dataset.v;
      Data.patchFeedback(openId, function (f) { f.status = v; }).then(App.fbRefresh).catch(App.fail);
    }
    else if (a === 'fbComment') {
      if (!needMe(function () { t.click(); })) return;
      var ta = document.getElementById('fbComment'), txt = ta.value.trim();
      if (!txt) { App.toast('Der Kommentar ist noch leer.'); return; }
      t.disabled = true;
      Data.addComment(openId, { text: txt, author: S.me }).then(function () { ta.value = ''; return App.fbRefresh(); })
        .catch(function (e) { t.disabled = false; App.fail(e); });
    }
    else if (a === 'fbDelC') {
      var cid = t.dataset.id;
      if (delArm !== cid) { delArm = cid; render(); return; }
      delArm = null;
      Data.deleteComment(cid).then(App.fbRefresh).catch(App.fail);
    }
    else if (a === 'fbDelP') {
      if (delArm !== openId) { delArm = openId; render(); return; }
      delArm = null;
      Data.deleteFeedback(openId).then(function () { App.toast('Beitrag gelöscht.'); App.go('feedback'); }).catch(App.fail);
    }
    else return false;
    return true;
  }

  /* An die gemeinsame Klick-Verteilung in app.js anhängen */
  var next = App.reportAction;
  App.reportAction = function (a, t) { if (a.indexOf('fb') === 0 && fbAction(a, t)) return; if (next) next(a, t); };
})();
