/*
 * Free My Android TV. It draws the chosen look on a 1920 x 1080 stage, moves the focus with the arrows
 * the way a TV does (to the nearest thing in that direction), opens the small apps (mini.js), and has three pages of
 * its own: every app on the TV, This TV (which of the television list's apps are on, and which are switched off), and
 * Settings. On the TV the apps are the TV's own, read through the app's bridge (window.FMA, MainActivity.java). In a
 * desktop browser, with no bridge, stand-ins take their place so the screens can be looked at.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function toggle(node, cls, on) { node.classList.toggle(cls, !!on); }

  function place(node, x, y, w, h) {
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    if (w) node.style.width = w + 'px';
    if (h) node.style.height = h + 'px';
    return node;
  }

  var stage = $('stage'), lookBox = $('look'), sheetBox = $('sheet'), miniBox = $('mini'), toastBox = $('toast');

  var BRIDGE = window.FMA || null;

  /** Stand-ins for the TV's apps, for a desktop browser only: a name and its colors. */
  var STAND_INS = [
    {name: 'Netflix', top: '#0A0A0A', bottom: '#000000', dot: '#E50914'},
    {name: 'YouTube', top: '#1C1C1E', bottom: '#09090A', dot: '#FF0033'},
    {name: 'Prime Video', top: '#2AA8FF', bottom: '#0A68D4', dot: '#2AA8FF'},
    {name: 'Disney+', top: '#173584', bottom: '#08143F', dot: '#4A7BF0'},
    {name: 'Max', top: '#5C30E8', bottom: '#221684', dot: '#7C58F2'},
    {name: 'Apple TV', top: '#1C1C1E', bottom: '#000000', dot: '#9A9AA0'},
    {name: 'Jellyfin', top: '#AA5CC3', bottom: '#00A4DC', dot: '#AA5CC3'},
    {name: 'Spotify', top: '#1DB954', bottom: '#0F7A36', dot: '#1DB954'}
  ];

  /** The apps a look shows on the home: the first eight. Every one is under All apps. */
  var SHOWN = 8;
  var APPS = [];

  /** The TV's apps, through the bridge: the ones people open most first, the rest by name. */
  var FIRST = ['netflix', 'youtube', 'amazon', 'prime', 'hotstar', 'disney', 'jiocinema', 'zee5', 'sonyliv', 'spotify', 'plex', 'jellyfin', 'kodi'];
  function readApps() {
    if (!BRIDGE) { APPS = STAND_INS; return; }
    var list = [];
    try { list = JSON.parse(BRIDGE.apps()) || []; } catch (e) { list = []; }
    function rank(a) {
      var s = (a.pkg + ' ' + a.label).toLowerCase();
      for (var i = 0; i < FIRST.length; i++) if (s.indexOf(FIRST[i]) >= 0) return i;
      return FIRST.length;
    }
    list.sort(function (a, b) { return rank(a) - rank(b) || a.label.localeCompare(b.label); });
    APPS = list.map(function (a) { return {name: a.label, pkg: a.pkg, art: a.art, banner: a.banner}; });
  }

  /** An app's picture in a tile: its banner, filling the tile, or its icon in the middle. False when it has neither. */
  function art(node, a) {
    if (!a.art) return false;
    node.className += a.banner ? ' has-banner' : ' has-icon';
    var img = el('img', 'art', node);
    img.src = a.art;
    img.alt = '';
    return true;
  }

  var LOOKS = [{id: 'quiet', name: 'Quiet'}, {id: 'board', name: 'Board'}, {id: 'list', name: 'List'}];
  var MODES = [{id: 'auto', name: 'By the clock'}, {id: 'day', name: 'Day'}, {id: 'night', name: 'Night'}];
  var CLOCKS = [{id: 'auto', name: 'Automatic'}, {id: '12', name: '12 hours'}, {id: '24', name: '24 hours'}];

  /** What each look tells the small apps to wear (Mini.skin), by day and by night. */
  var SKINS = {
    quiet: {
      day: {bg: '#F5F5F7', fg: '#1D1D1F', dim: '#6E6E73', line: 'rgba(0, 0, 0, 0.12)', accent: '#1D1D1F', onAccent: '#FFFFFF', mark: '#1D1D1F', weight: 200},
      night: {bg: '#0B0B0D', fg: '#F5F5F7', dim: 'rgba(245, 245, 247, 0.62)', line: 'rgba(255, 255, 255, 0.16)', accent: '#F5F5F7', onAccent: '#1D1D1F', mark: '#F5F5F7', weight: 200}
    },
    board: {
      day: {bg: '#E9E9E4', fg: '#121212', dim: '#5E5E5E', line: 'rgba(0, 0, 0, 0.12)', accent: '#D5EF72', onAccent: '#121212', mark: '#121212', weight: 200},
      night: {bg: '#022438', fg: '#F2F4F6', dim: '#8FA3B2', line: 'rgba(255, 255, 255, 0.14)', accent: '#D5EF72', onAccent: '#121212', mark: '#D5EF72', weight: 200}
    },
    list: {
      day: {bg: '#F5F5F3', fg: '#121212', dim: '#8E949B', line: '#DADAD6', accent: '#D5EF72', onAccent: '#121212', mark: '#121212', weight: 700},
      night: {bg: '#121212', fg: '#F2F2F0', dim: '#7E848B', line: '#2E2E2E', accent: '#D5EF72', onAccent: '#121212', mark: '#D5EF72', weight: 700}
    }
  };

  var st = {look: 'quiet', mode: 'auto', clock: 'auto', kept: {}};
  var items = [], at = 0, ticks = [], scale = 1, wasNight = null;
  var bare = !!window.FMA || /[?&]bare\b/.test(location.search);

  function isNight() {
    if (st.mode !== 'auto') return st.mode === 'night';
    var h = new Date().getHours();
    return h >= 19 || h < 6;
  }

  function known(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  // MARK: - Focus: one thing at a time, and the arrows go to the nearest thing that way

  function F(node, key, act) {
    var i = items.length;
    node.className += ' f';
    items.push({node: node, key: key, act: act});
    node.addEventListener('mouseenter', function () { if (!busy()) focus(i); });
    node.addEventListener('click', function () {
      if (busy()) return;
      focus(i);
      act();
    });
    return node;
  }

  function busy() { return !!Mini.isOpen() || sheetOpen; }   // a page's own things take the pointer

  function focus(i) {
    at = Math.max(0, Math.min(items.length - 1, i));
    for (var k = 0; k < items.length; k++) toggle(items[k].node, 'focus', k === at);
    if (page) { scrollPage(); return; }
    if (items[at]) st.kept[st.look] = items[at].key;
  }

  /** Where a thing is on the stage. Everything that takes the focus is placed on the stage itself, so this is exact. */
  function rect(n) {
    return {l: n.offsetLeft, t: n.offsetTop, r: n.offsetLeft + n.offsetWidth, b: n.offsetTop + n.offsetHeight,
      x: n.offsetLeft + n.offsetWidth / 2, y: n.offsetTop + n.offsetHeight / 2};
  }

  function step(dx, dy) {
    if (!items.length) return;
    var a = rect(items[at].node), best = -1, bestScore = Infinity;
    for (var i = 0; i < items.length; i++) {
      if (i === at) continue;
      var b = rect(items[i].node), gap, overlap, off;
      if (dx) {
        gap = dx > 0 ? b.l - a.r : a.l - b.r;
        overlap = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        off = Math.abs(a.y - b.y);
      } else {
        gap = dy > 0 ? b.t - a.b : a.t - b.b;
        overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        off = Math.abs(a.x - b.x);
      }
      if (gap < -1) continue;   // not that way
      // In line with where we are comes first, nearest first; then whatever is closest off to the side.
      var score = gap + (overlap > 0 ? 0 : 1000 - overlap * 2) + off * 0.3;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0) focus(best);
  }

  // MARK: - What all three looks share

  function clockInto(timeNode, dateNode, half) {
    ticks.push(function () {
      var now = new Date(), p = Mini.time(now.getHours(), now.getMinutes());
      timeNode.textContent = p.text;
      if (half && p.half) el('small', '', timeNode, p.half);
      if (dateNode) dateNode.textContent = Mini.date(now);
    });
  }

  function openMini(id) {
    miniBox.className = 'open';
    Mini.open(id, miniBox, function () {
      miniBox.className = '';
      tick();
    });
  }

  function opens(a) {
    return function () {
      if (BRIDGE && a.pkg) { if (!BRIDGE.open(a.pkg)) toast(a.name + ' would not open'); }
      else toast('Opens ' + a.name + ' on the TV');
    };
  }

  /** The words under the apps, the same in every look: every app, this TV, and the settings. */
  var LINKS = [
    {name: 'All apps', icon: 'apps', act: function () { openPage('apps'); }},
    {name: 'This TV', icon: 'tv', act: function () { openPage('tv'); }},
    {name: 'Settings', icon: 'settings', act: function () { openSheet(); }}
  ];

  var GLYPHS = {
    apps: ['M5 5h4v4H5zM10 5h4v4h-4zM15 5h4v4h-4zM5 10h4v4H5zM10 10h4v4h-4zM15 10h4v4h-4zM5 15h4v4H5zM10 15h4v4h-4zM15 15h4v4h-4z', true],
    tv: ['M3.5 5.5h17a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1zM8.5 20.5h7', false],
    settings: ['M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zM19.4 13.5l1.7 1.3-1.8 3.1-2-.8a7.6 7.6 0 0 1-2 1.2l-.3 2.1h-3.6l-.3-2.1a7.6 7.6 0 0 1-2-1.2l-2 .8-1.8-3.1 1.7-1.3a7.7 7.7 0 0 1 0-2.4L3.3 9.8 5.1 6.7l2 .8a7.6 7.6 0 0 1 2-1.2L9.4 4.2h3.6l.3 2.1a7.6 7.6 0 0 1 2 1.2l2-.8 1.8 3.1-1.7 1.3a7.7 7.7 0 0 1 0 2.4z', false]
  };

  function glyph(name, parent, px) {
    var g = GLYPHS[name], s = svg('svg', {viewBox: '0 0 24 24', width: px, height: px}, parent);
    svg('path', g[1] ? {d: g[0], fill: 'currentColor'} : {d: g[0], fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'}, s);
    return s;
  }

  /** A word that is too long for its tile gets smaller until it fits. */
  function fitWord(node, size, least) {
    node.style.fontSize = size + 'px';
    while (size > least && node.scrollWidth > node.clientWidth) {
      size -= 1;
      node.style.fontSize = size + 'px';
    }
  }

  // MARK: - Quiet: the home screen as it is now, with one row added

  function quiet() {
    var clock = el('div', 'q-clock num', lookBox), time = el('span', '', clock), date = el('span', 'date', clock);
    clockInto(time, date, false);

    LINKS.forEach(function (l, i) {
      var b = place(el('div', 'q-round' + (i === LINKS.length - 1 ? ' last' : ''), lookBox), 1596 + i * 88, 69);
      glyph(l.icon, b, 28);
      el('span', 'tip', b, l.name);
      F(b, 'link:' + i, l.act);
    });

    el('div', 'q-title', lookBox, 'Small apps');
    Mini.list().forEach(function (m, i) {
      var k = el('div', 'q-key', lookBox);
      k.style.left = (880 + i * 196) + 'px';
      Mini.icon(m.id, k, 34);
      el('div', 'label', k, m.name);
      var s = el('div', 'status num', k);
      ticks.push(function () {
        var text = Mini.status(m.id);
        s.textContent = text;
        toggle(k, 'bare', !text);
        toggle(k, 'live', Mini.live(m.id));
      });
      F(k, 'mini:' + m.id, function () { openMini(m.id); });
    });

    el('div', 'q-platter', lookBox);
    APPS.slice(0, SHOWN).forEach(function (a, i) {
      var t = el('div', 'q-tile', lookBox);
      t.style.left = (80 + i * 226) + 'px';
      if (a.top) t.style.background = 'linear-gradient(' + a.top + ', ' + a.bottom + ')';
      if (!art(t, a)) {
        var w = el('div', 'word', t, a.name);
        words.push(function () { fitWord(w, 30, 18); });
      }
      F(t, 'app:' + i, opens(a));
    });
    if (!APPS.length) el('div', 'q-none', lookBox, 'No apps found on this TV');
  }

  // MARK: - Board: every small app is a tile that says what it is doing

  function tile(x, y, w, h, cls) { return place(el('div', 'b-tile' + (cls ? ' ' + cls : ''), lookBox), x, y, w, h); }

  function cap(parent, id, name) {
    var c = el('div', 'b-cap', parent);
    Mini.icon(id, c, 28);
    el('span', '', c, name);
    return c;
  }

  function board() {
    var names = {};
    Mini.list().forEach(function (m) { names[m.id] = m.name; });

    var c = tile(72, 76, 736, 560, 'b-clock');
    cap(c, 'clock', names.clock);
    clockInto(el('div', 'time num', c), el('div', 'day', c), true);
    F(c, 'mini:clock', function () { openMini('clock'); });

    var t = tile(832, 76, 496, 268);
    cap(t, 'timer', names.timer);
    var tBig = el('div', 'b-big', t), R = 2 * Math.PI * 58;
    var ring = svg('svg', {viewBox: '0 0 132 132', width: 132, height: 132, 'class': 'b-ring'}, t);
    svg('circle', {cx: 66, cy: 66, r: 58, 'class': 'rail'}, ring);
    var arc = svg('circle', {cx: 66, cy: 66, r: 58, 'class': 'left', transform: 'rotate(-90 66 66)', 'stroke-dasharray': R}, ring);
    ticks.push(function () {
      tBig.textContent = Mini.status('timer');
      tBig.style.fontSize = tBig.textContent.length > 7 ? '58px' : '';
      arc.setAttribute('stroke-dashoffset', R * (1 - Mini.progress('timer')));
      arc.style.opacity = Mini.live('timer') ? 1 : 0;
      toggle(t, 'live', Mini.live('timer'));
    });
    F(t, 'mini:timer', function () { openMini('timer'); });

    var s = tile(1352, 76, 496, 268);
    cap(s, 'score', names.score);
    var sBox = el('div', 'b-score', s), sides = [];
    for (var i = 0; i < 2; i++) {
      var side = el('div', i ? 'side b' : 'side', sBox);
      sides.push({n: el('div', 'n', side), who: el('div', 'who', side)});
      if (!i) el('div', 'mid', sBox);
    }
    ticks.push(function () {
      var rows = Mini.rows('score');
      for (var k = 0; k < 2; k++) { sides[k].n.textContent = rows[k].value; sides[k].who.textContent = rows[k].name; }
    });
    F(s, 'mini:score', function () { openMini('score'); });

    var k = tile(832, 368, 496, 268);
    cap(k, 'calendar', names.calendar);
    var kBig = el('div', 'b-big', k), dots = el('div', 'b-dots', k);
    ticks.push(function () {
      var m = Mini.month(), key = m.offset + '/' + m.days + '/' + m.today;
      if (dots.getAttribute('data-shown') === key) return;
      dots.setAttribute('data-shown', key);
      kBig.textContent = m.today;
      el('small', '', kBig, m.weekday);
      dots.innerHTML = '';
      for (var d = 0; d < m.offset; d++) el('i', 'none', dots);
      for (d = 1; d <= m.days; d++) el('i', d === m.today ? 'now' : '', dots);
    });
    F(k, 'mini:calendar', function () { openMini('calendar'); });

    var w = tile(1352, 368, 496, 268);
    cap(w, 'world', names.world);
    var zones = el('div', 'b-zones', w);
    ticks.push(function () {
      var rows = Mini.rows('world'), key = JSON.stringify(rows);
      if (zones.getAttribute('data-shown') === key) return;
      zones.setAttribute('data-shown', key);
      zones.innerHTML = '';
      rows.forEach(function (r) {
        var line = el('div', '', zones);
        el('span', '', line, r.name);
        el('span', '', line, r.value);
      });
    });
    F(w, 'mini:world', function () { openMini('world'); });

    el('div', 'b-row', lookBox, 'Apps').style.top = '672px';
    APPS.slice(0, SHOWN).forEach(function (a, n) {
      var app = place(el('div', 'b-app', lookBox), 72 + n * 225, 710, 201);
      if (!art(app, a)) {
        el('div', 'dot', app).style.background = a.dot || 'currentColor';
        var word = el('div', 'word', app, a.name);
        words.push(function () { fitWord(word, 31, 22); });
      }
      F(app, 'app:' + n, opens(a));
    });

    var x = 72;
    LINKS.forEach(function (l, n) {
      var p = el('div', 'b-pill', lookBox, l.name);
      p.style.left = x + 'px';
      F(p, 'link:' + n, l.act);
      x += p.offsetWidth + 16;
    });
  }

  // MARK: - List: no tiles and no colors, only names

  function list() {
    var date = place(el('div', 'l-cap', lookBox), 96, 92);
    var time = el('div', 'l-time num', lookBox);
    clockInto(time, date, true);

    place(el('div', 'l-cap', lookBox, 'Small apps'), 96, 566);
    Mini.list().forEach(function (m, i) {
      var row = el('div', 'l-mini', lookBox);
      row.style.top = (606 + i * 76) + 'px';
      Mini.icon(m.id, row, 34);
      el('div', 'label', row, m.name);
      var s = el('div', 'status', row);
      ticks.push(function () {
        s.textContent = Mini.status(m.id);
        toggle(row, 'live', Mini.live(m.id));
      });
      F(row, 'mini:' + m.id, function () { openMini(m.id); });
    });

    el('div', 'l-rule', lookBox);
    place(el('div', 'l-cap', lookBox, 'Apps'), 960, 92);
    APPS.slice(0, SHOWN).forEach(function (a, i) {
      var row = el('div', 'l-app', lookBox);
      row.style.top = (134 + i * 90) + 'px';
      el('div', 'word', row, a.name);
      var go = svg('svg', {viewBox: '0 0 24 24', width: 40, height: 40, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'}, row);
      svg('path', {d: 'M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5'}, go);
      F(row, 'app:' + i, opens(a));
    });

    var x = 936;
    LINKS.forEach(function (l, n) {
      var link = el('div', 'l-link', lookBox, l.name);
      link.style.left = x + 'px';
      F(link, 'link:' + n, l.act);
      x += link.offsetWidth + 6;
    });
  }

  var BUILD = {quiet: quiet, board: board, list: list};
  var words = [];

  // MARK: - Drawing, and the second-by-second upkeep

  function render() {
    if (page) { stale = true; return; }   // drawn again when the page closes
    var night = isNight();
    wasNight = night;
    stage.className = st.look + (night ? ' night' : ' day');
    lookBox.innerHTML = '';
    items = [];
    ticks = [];
    words = [];
    Mini.skin(SKINS[st.look][night ? 'night' : 'day']);
    BUILD[st.look]();
    tick();
    refit();
    var want = st.kept[st.look] || 'app:0', pick = 0;
    for (var i = 0; i < items.length; i++) if (items[i].key === want) pick = i;
    focus(pick);
    controls();
  }

  function refit() { for (var i = 0; i < words.length; i++) words[i](); }

  function tick() {
    for (var i = 0; i < ticks.length; i++) ticks[i]();
  }

  function controls() {
    var night = isNight(), i, nodes = document.querySelectorAll('[data-look]');
    for (i = 0; i < nodes.length; i++) toggle(nodes[i], 'on', nodes[i].getAttribute('data-look') === st.look);
    nodes = document.querySelectorAll('[data-mode]');
    for (i = 0; i < nodes.length; i++) toggle(nodes[i], 'on', (nodes[i].getAttribute('data-mode') === 'night') === night);
  }

  function remember() {
    try {
      localStorage.setItem('fma.look', st.look);
      localStorage.setItem('fma.mode', st.mode);
      localStorage.setItem('fma.clock', st.clock);
    } catch (e) {}
  }

  function setLook(id) {
    if (known(LOOKS, id) < 0) return;
    st.look = id;
    remember();
    render();
    if (sheetOpen) drawSheet();
    else toast('Look ' + (known(LOOKS, id) + 1) + ' of ' + LOOKS.length + ': ' + LOOKS[known(LOOKS, id)].name);
  }

  function setMode(id) {
    st.mode = id;
    remember();
    render();
    if (sheetOpen) drawSheet();
  }

  // MARK: - Home Settings: where the look would be chosen on the TV

  var sheetOpen = false, sheetRow = 0;

  function chevron(way, parent) {
    var s = svg('svg', {viewBox: '0 0 24 24', width: 30, height: 30, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.6,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'}, parent);
    svg('path', {d: way < 0 ? 'M14.5 5.5L8 12l6.5 6.5' : 'M9.5 5.5L16 12l-6.5 6.5'}, s);
  }

  function drawSheet() {
    sheetBox.innerHTML = '';
    el('div', 'dim', sheetBox);
    var box = el('div', 'box', sheetBox);
    el('h2', '', box, 'Settings');
    var rows = [['Look', LOOKS[known(LOOKS, st.look)].name], ['Day or night', MODES[known(MODES, st.mode)].name],
      ['Clock', CLOCKS[known(CLOCKS, st.clock)].name]];
    rows.forEach(function (r, i) {
      var row = el('div', 'srow' + (i === sheetRow ? ' focus' : ''), box, r[0]);
      var v = el('span', 'v', row);
      chevron(-1, v);
      el('span', '', v, r[1]);
      chevron(1, v);
    });
    el('p', 'note', box, 'Left and right change it. Back closes this.');
    var dev = device();
    el('p', 'note quiet', box, 'Free My Android ' + (dev.version || '') + '. It has no internet access: nothing it shows leaves this TV.');
  }

  function openSheet() {
    sheetOpen = true;
    sheetRow = 0;
    drawSheet();
    sheetBox.className = 'open';
  }

  function closeSheet() {
    sheetOpen = false;
    sheetBox.className = '';
  }

  function sheetKey(k) {
    if (k === 'back' || k === 'ok') return closeSheet();
    if (k === 'up' || k === 'down') { sheetRow = Math.max(0, Math.min(2, sheetRow + (k === 'up' ? -1 : 1))); return drawSheet(); }
    var d = k === 'right' ? 1 : -1, list = [LOOKS, MODES, CLOCKS][sheetRow], now = known(list, [st.look, st.mode, st.clock][sheetRow]);
    var next = list[(now + d + list.length) % list.length].id;
    if (sheetRow === 0) setLook(next);
    else if (sheetRow === 1) setMode(next);
    else { st.clock = next; remember(); render(); drawSheet(); }
  }

  // MARK: - A message that goes away by itself

  var toastTimer = 0;

  function toast(text) {
    toastBox.innerHTML = '';
    el('span', '', toastBox, text);
    toastBox.className = 'on';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastBox.className = ''; }, 2400);
  }

  // MARK: - Keys: a keyboard, a TV remote in a TV's browser, or the buttons under the picture on a phone

  var CODES = {37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 23: 'ok', 32: 'ok', 27: 'back', 8: 'back', 461: 'back', 10009: 'back',
    49: '1', 50: '2', 51: '3', 97: '1', 98: '2', 99: '3', 78: 'n'};

  function press(k) {
    if (!BRIDGE && (k === '1' || k === '2' || k === '3')) return setLook(LOOKS[+k - 1].id);
    if (!BRIDGE && k === 'n') return setMode(isNight() ? 'day' : 'night');
    if (k === '1' || k === '2' || k === '3' || k === 'n') return;
    if (Mini.isOpen()) { Mini.key(k); return; }
    if (sheetOpen) return sheetKey(k);
    if (page && k === 'back') { closePage(); return; }
    if (k === 'back') return;
    if (k === 'ok') { if (items[at]) items[at].act(); return; }
    if (k === 'left') step(-1, 0);
    else if (k === 'right') step(1, 0);
    else if (k === 'up') step(0, -1);
    else if (k === 'down') step(0, 1);
  }

  document.addEventListener('keydown', function (e) {
    var k = CODES[e.keyCode];
    if (!k || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    press(k);
  });

  document.addEventListener('click', function (e) {
    var n = e.target;
    while (n && n !== document.body) {
      if (n.getAttribute) {
        if (n.hasAttribute('data-key')) return press(n.getAttribute('data-key'));
        if (n.hasAttribute('data-look')) return setLook(n.getAttribute('data-look'));
        if (n.hasAttribute('data-mode')) return setMode(n.getAttribute('data-mode'));
      }
      n = n.parentNode;
    }
  });

  // A touch on the picture while a small app or the settings are open: there is nothing to aim at, so it does nothing.
  sheetBox.addEventListener('click', function () { if (sheetOpen) closeSheet(); });

  /** The TV's Back key (MainActivity): true when something here closed, false to leave the app. */
  window.fmaBack = function () {
    if (Mini.isOpen()) { Mini.key('back'); return true; }
    if (sheetOpen) { closeSheet(); return true; }
    if (page) { closePage(); return true; }
    return false;
  };

  /** Back from an app opened here: the TV may have gained or lost apps, and This TV may read differently. */
  window.fmaResumed = function () {
    if (!BRIDGE) return;
    readApps();
    if (page === 'tv') { closePage(); openPage('tv'); }
    else if (!page) render();
  };

  // MARK: - Pages: every app, and This TV. Each has its own things to focus; the home's wait underneath.

  var page = '', saved = null, stale = false, pageBox = $('page'), pageList = null;

  function openPage(kind) {
    if (page) closePage();
    page = kind;
    saved = {items: items, at: at};
    items = [];
    pageBox.innerHTML = '';
    pageBox.className = 'open';
    var head = el('div', 'pg-head', pageBox);
    pageList = el('div', 'pg-list', pageBox);
    if (kind === 'apps') appsPage(head); else tvPage(head);
    focus(0);
    scrollPage();
  }

  function closePage() {
    page = '';
    pageBox.className = '';
    pageBox.innerHTML = '';
    items = saved ? saved.items : [];
    var back = saved ? saved.at : 0;
    saved = null;
    if (stale) { stale = false; render(); }
    else focus(back);
  }

  /** The list slides so the focused thing is on the screen, with a little of what comes next. */
  function scrollPage() {
    if (!page || !items[at]) return;
    var n = items[at].node, top = n.offsetTop, h = pageList.scrollHeight, room = 700;
    var y = Math.max(0, Math.min(Math.max(0, h - room), top - 240));
    pageList.style.transform = 'translateY(' + (-y) + 'px)';
  }

  function appsPage(head) {
    el('h2', '', head, 'All apps');
    el('p', '', head, APPS.length + (APPS.length === 1 ? ' app' : ' apps') + ' on this TV');
    APPS.forEach(function (a, i) {
      var cell = el('div', 'pg-app', pageList);
      cell.style.left = (i % 5) * 352 + 'px';
      cell.style.top = Math.floor(i / 5) * 252 + 'px';
      var face = el('div', 'face', cell);
      if (a.top) face.style.background = 'linear-gradient(' + a.top + ', ' + a.bottom + ')';
      if (!art(face, a)) el('div', 'word', face, a.name);
      el('div', 'name', cell, a.name);
      F(cell, 'all:' + i, opens(a));
    });
    pageList.style.height = Math.ceil(APPS.length / 5) * 252 + 'px';
  }

  function device() {
    if (!BRIDGE) return {maker: 'A browser', model: '(preview)', android: '', version: '0.1'};
    try { return JSON.parse(BRIDGE.device()) || {}; } catch (e) { return {}; }
  }

  /**
   * Which of the television list's apps are on this TV, and whether each one is on or switched off. Reading only:
   * switching them is done from a computer, with Free My Android, so every change is written down with its undo.
   */
  function tvPage(head) {
    var list = window.TV_LIST || [], ids = list.map(function (p) { return p.id; }), states = {}, made = !BRIDGE;
    if (BRIDGE) { try { states = JSON.parse(BRIDGE.states(JSON.stringify(ids))) || {}; } catch (e) { states = {}; } }
    else list.forEach(function (p, i) { states[p.id] = i % 5 === 0 ? 'off' : i % 3 === 0 ? 'absent' : 'on'; });
    var here = list.filter(function (p) { return states[p.id] === 'on' || states[p.id] === 'off'; });
    var off = here.filter(function (p) { return states[p.id] === 'off'; });
    here.sort(function (a, b) { return (states[a.id] === 'off' ? 0 : 1) - (states[b.id] === 'off' ? 0 : 1); });
    var dev = device();
    el('h2', '', head, 'This TV');
    el('p', '', head, [dev.maker, dev.model].filter(Boolean).join(' ') + (dev.android ? ' \u00b7 Android ' + dev.android : '') +
      (made ? ' \u00b7 made-up states, for looking at the page' : ''));
    var sum = el('div', 'pg-sum', head);
    [[here.length, 'of the ' + list.length + ' on the list are on this TV'], [off.length, 'switched off'],
      [here.length - off.length, 'still on']].forEach(function (f) {
      var b = el('div', '', sum);
      el('strong', '', b, f[0]);
      el('span', '', b, f[1]);
    });
    if (!Object.keys(states).length) el('p', 'pg-note', head, 'This TV would not say which apps it has.');
    here.forEach(function (p, i) {
      var row = el('div', 'pg-row', pageList);
      row.style.top = i * 92 + 'px';
      el('div', 'label', row, p.label);
      el('div', 'id', row, p.id);
      var tags = el('div', 'tags', row);
      el('span', 'tag ' + p.risk, tags, p.risk === 'risky' ? 'held back' : p.risk);
      el('span', 'state ' + states[p.id], tags, states[p.id] === 'off' ? 'Switched off' : 'On');
      F(row, 'tv:' + i, function () {});
    });
    var end = el('p', 'pg-end', pageList, 'Switching them off, and back on, is done from a computer with Free My Android. ' +
      'This app only reads; it changes nothing.');
    end.style.top = here.length * 92 + 24 + 'px';
    pageList.style.height = here.length * 92 + 140 + 'px';
    if (!here.length) F(end, 'tv:end', function () {});
  }

  // MARK: - The television fits the window; a phone held upright gets the remote under it

  function fit() {
    // A phone on its side has no height to spare: the picture gets all of it, and Home Settings changes the look.
    // The page's own box, not innerWidth: some TVs' WebViews report the layout viewport there, wider than the screen.
    var W = document.documentElement.clientWidth || window.innerWidth, H = document.documentElement.clientHeight || window.innerHeight, tall = !bare && H > W * 1.15, short = !tall && H < 520;
    var bar = bare || tall || short ? 0 : 52;
    document.body.className = (tall ? 'tall' : 'wide') + (bare ? ' bare' : '') + (short ? ' short' : '');
    scale = Math.min(W / 1920, (H - bar) / 1080);
    stage.style.transform = 'scale(' + scale + ')';
    stage.style.left = Math.round((W - 1920 * scale) / 2) + 'px';
    stage.style.top = tall ? '0px' : Math.round((H - bar - 1080 * scale) / 2) + 'px';
    $('pad').style.top = tall ? Math.round(1080 * scale) + 'px' : '';
    if (window.FMA && window.FMA.log) {
      window.FMA.log('fit ' + W + 'x' + H + ' dpr ' + window.devicePixelRatio + ' screen ' + screen.width + 'x' + screen.height +
        ' doc ' + document.documentElement.clientWidth + 'x' + document.documentElement.clientHeight + ' scale ' + scale);
    }
  }

  // MARK: - Start

  (function start() {
    try {
      if (known(LOOKS, localStorage.getItem('fma.look')) >= 0) st.look = localStorage.getItem('fma.look');
      if (known(MODES, localStorage.getItem('fma.mode')) >= 0) st.mode = localStorage.getItem('fma.mode');
      if (known(CLOCKS, localStorage.getItem('fma.clock')) >= 0) st.clock = localStorage.getItem('fma.clock');
    } catch (e) {}
    // #board, #list-night: a link straight to one look.
    var m = /^#([a-z]+)(?:-(day|night))?$/.exec(location.hash);
    if (m && known(LOOKS, m[1]) >= 0) {
      st.look = m[1];
      if (m[2]) st.mode = m[2];
    }
    Mini.host({
      locale: function () { return navigator.language || 'en'; },
      twelve: function () { return st.clock === '12' ? true : st.clock === '24' ? false : null; },
      setTwelve: function (on) { st.clock = on ? '12' : '24'; remember(); }
    });
    readApps();
    fit();
    render();
    window.addEventListener('resize', fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { render(); });
    setInterval(function () {
      if (isNight() !== wasNight) render();
      tick();
      if (Mini.tick() === 'timer' && Mini.isOpen() !== 'timer') toast('Timer: time is up');
    }, 1000);
  })();
})();
