/*
 * Small apps for the home screen: a clock, a timer, a scoreboard, a calendar and a world clock. Never more than five.
 * Each one fills the screen, is worked with the remote's arrows, OK and Back, needs no network and no account, and
 * keeps what it knows in localStorage, so the home screen can show it at a glance (Mini.status) without opening it.
 * One file, styles included (Mini.skin writes them). Plain ES5 and no CSS variables, grid or backdrop-filter, so it
 * also runs in the older WebViews and TV browsers.
 *
 *   Mini.list()                 the small apps, in order: [{id, name}]
 *   Mini.icon(id, parent, px)   its drawing, in the text color of where it is put
 *   Mini.status(id)             one short line for its tile ("04:32", "3 – 2", "Wed 25"), or ''
 *   Mini.live(id)               true while it has something going on (a timer running, a game with points)
 *   Mini.skin(colors)           the colors of the home screen it opens over (see SKIN)
 *   Mini.host(home)             the home screen's language and its 12 or 24 hours, where it has them (see host)
 *   Mini.open(id, layer, done)  draws it in layer (a 1920 x 1080 box); done() is called when it closes
 *   Mini.key(name)              'left', 'right', 'up', 'down', 'ok' or 'back', while one is open
 *   Mini.close(), Mini.isOpen() the id of the one that is open, or ''
 *   Mini.rows(id), Mini.month(), Mini.progress(id), Mini.time(h, m), Mini.date(d)   more for a tile with room
 *   Mini.tick()                 once a second from the home screen: rings when the timer ends, and says so ('timer')
 */
var Mini = (function () {
  'use strict';

  var MAX = 5;
  var NS = 'http://www.w3.org/2000/svg';

  // MARK: - Small helpers

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function move(node, x, y) {
    node.style.webkitTransform = node.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  /** What an app remembers, with def's values where it has none yet. Storage that fails (a full or locked one) is not an error. */
  function load(id, def) {
    var v = null, k;
    try { v = JSON.parse(localStorage.getItem('fma.mini.' + id)); } catch (e) { v = null; }
    if (!v || typeof v !== 'object') v = {};
    for (k in def) if (def.hasOwnProperty(k) && !v.hasOwnProperty(k)) v[k] = def[k];
    return v;
  }

  function save(id, v) {
    try { localStorage.setItem('fma.mini.' + id, JSON.stringify(v)); } catch (e) {}
  }

  /**
   * On-screen text, in English for now. Where the home screen's catalogues are loaded (strings.js) a word they already
   * have comes back translated; the small apps' own words are not in the catalogues yet (tools/translate.py).
   */
  function say(text) {
    try { if (typeof window.tr === 'function') return window.tr(text); } catch (e) {}
    return text;
  }

  function setClass(node, cls, on) {
    var has = (' ' + node.className + ' ').indexOf(' ' + cls + ' ') >= 0;
    if (on && !has) node.className += ' ' + cls;
    else if (!on && has) node.className = (' ' + node.className + ' ').replace(' ' + cls + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  // MARK: - Dates and times

  var LANG = (function () { try { return navigator.language || 'en'; } catch (e) { return 'en'; } })();

  /**
   * The home screen the small apps run in, when it has a say (Mini.host): {locale(), twelve(), setTwelve(on)}. Its
   * language names the days and months, and its 12 or 24 hours is the only such setting: the clock here changes that one.
   */
  var host = null;

  function lang() {
    try { if (host && host.locale) return host.locale() || LANG; } catch (e) {}
    return LANG;
  }
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /** A date's name in the TV's language where it can say it (Intl), else in English. */
  function named(date, opts, fallback) {
    try { if (window.Intl && Intl.DateTimeFormat) return new Intl.DateTimeFormat(lang(), opts).format(date); } catch (e) {}
    return fallback;
  }

  function weekday(d, short) {
    var f = DAYS[d.getDay()];
    return named(d, {weekday: short ? 'short' : 'long'}, short ? f.slice(0, 3) : f);
  }

  function month(d, short) {
    var f = MONTHS[d.getMonth()];
    return named(d, {month: short ? 'short' : 'long'}, short ? f.slice(0, 3) : f);
  }

  function longDate(d) { return weekday(d) + ', ' + d.getDate() + ' ' + month(d); }

  /** 12 or 24 hours: the home screen's setting where there is one, else what was picked in the clock, else the language's habit. */
  function twelve() {
    try {
      if (host && host.twelve) {
        var h = host.twelve();
        if (h === true || h === false) return h;
      }
    } catch (e) {}
    var s = load('clock', {face: 0, h12: null});
    if (s.h12 === true || s.h12 === false) return s.h12;
    try { return !!new Intl.DateTimeFormat(lang(), {hour: 'numeric'}).resolvedOptions().hour12; } catch (e2) { return false; }
  }

  function setTwelve(on) {
    if (host && host.setTwelve) { host.setTwelve(on); return; }
    var s = load('clock', {face: 0, h12: null});
    s.h12 = on;
    save('clock', s);
  }

  /** {text: '4:43', half: 'PM'} or {text: '16:43', half: ''}. */
  function clockText(h, m, h12) {
    if (!h12) return {text: pad(h) + ':' + pad(m), half: ''};
    return {text: (h % 12 || 12) + ':' + pad(m), half: h < 12 ? 'AM' : 'PM'};
  }

  /** Seconds as 4:59, 12:00 or 1:05:00. */
  function span(s) {
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? h + ':' + pad(m) + ':' + pad(r) : pad(m) + ':' + pad(r);
  }

  // MARK: - Drawings (24 x 24, lines only, in the text color)

  var ICONS = {
    clock: [['circle', {cx: 12, cy: 12, r: 8.5}], ['path', {d: 'M12 7.4V12l3.1 2'}]],
    timer: [['circle', {cx: 12, cy: 13.6, r: 7.4}], ['path', {d: 'M12 13.6V9.6M9.6 2.9h4.8M12 2.9v3.3'}]],
    score: [['rect', {x: 2.8, y: 5.2, width: 7.6, height: 13.6, rx: 1.8}], ['rect', {x: 13.6, y: 5.2, width: 7.6, height: 13.6, rx: 1.8}],
      ['path', {d: 'M6.6 9.6v4.8M17.4 9.6v4.8'}]],
    calendar: [['rect', {x: 3.4, y: 5, width: 17.2, height: 15.4, rx: 2.2}], ['path', {d: 'M3.4 10h17.2M8 3v3.6M16 3v3.6'}]],
    world: [['circle', {cx: 12, cy: 12, r: 8.5}], ['path', {d: 'M3.5 12h17M12 3.5c-3.3 3-3.3 14 0 17M12 3.5c3.3 3 3.3 14 0 17'}]]
  };

  function icon(id, parent, px) {
    var parts = ICONS[id] || [], size = px || 34;
    // Old WebKit (Tizen 2) draws an SVG without a width and height at 300 x 150.
    var s = svg('svg', {viewBox: '0 0 24 24', width: size, height: size, 'class': 'mini-icon', fill: 'none', stroke: 'currentColor',
      'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'}, parent);
    for (var i = 0; i < parts.length; i++) svg(parts[i][0], parts[i][1], s);
    return s;
  }

  // MARK: - Colors: the home screen says what it looks like, and the small apps follow

  var SKIN = {
    bg: '#F5F5F7',        // the screen
    fg: '#1D1D1F',        // text
    dim: '#6E6E73',       // quieter text
    line: 'rgba(0, 0, 0, 0.12)',
    accent: '#1D1D1F',    // what is picked: a filled shape
    onAccent: '#FFFFFF',  // text on it
    mark: '#1D1D1F',      // a thin line that has to show on the screen's color (the timer's ring, the second hand)
    weight: 200           // how heavy the large numerals are
  };

  var CSS = [
    '.mini{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden;background:%bg%;color:%fg%;',
    'font-family:"Inter","Helvetica Neue",Arial,sans-serif;opacity:0;-webkit-transform:scale(0.985);transform:scale(0.985);',
    '-webkit-transition:opacity .2s,-webkit-transform .2s;transition:opacity .2s,transform .2s}',
    '.mini.on{opacity:1;-webkit-transform:none;transform:none}',
    '.mini .m-name{position:absolute;left:96px;top:62px;height:40px;line-height:40px;font-size:30px;font-weight:600;color:%dim%;white-space:nowrap}',
    '.mini .m-name svg{position:absolute;left:0;top:3px}',
    '.mini .m-name span{margin-left:50px}',
    '.mini .m-hint{position:absolute;left:0;right:0;top:980px;height:44px;line-height:44px;text-align:center;font-size:25px;font-weight:500;',
    'color:%dim%;white-space:nowrap;-webkit-transition:opacity .6s;transition:opacity .6s}',
    '.mini .m-hint.gone{opacity:0}',
    '.mini .m-hint .cap{display:inline-block;vertical-align:top;height:40px;min-width:26px;padding:0 10px;margin:0 6px 0 0;border-radius:11px;',
    'box-shadow:inset 0 0 0 2px %line%;line-height:40px;font-size:21px;font-weight:600;color:%fg%}',
    '.mini .m-hint .cap svg{vertical-align:-3px}',
    '.mini .m-hint .what{margin:0 34px 0 8px}',
    '.mini .m-hint .what.last{margin-right:0}',
    '.mini .big{font-weight:%weight%;line-height:1;white-space:nowrap;letter-spacing:-0.02em;-webkit-font-feature-settings:"tnum";font-feature-settings:"tnum"}',
    '.mini .m-body{position:absolute;left:0;top:0;width:1920px;height:1080px;-webkit-transition:-webkit-transform 9s linear;transition:transform 9s linear}',
    '.mini .m-wrap{position:absolute;left:0;top:0;width:1920px;height:1080px}',

    // The clock
    '.mini .c-time{position:absolute;left:0;right:0;top:296px;text-align:center;font-size:372px}',
    '.mini .c-time .digits{position:relative;display:inline-block}',
    '.mini .c-time .half{position:absolute;left:100%;bottom:44px;font-size:76px;font-weight:500;letter-spacing:0;margin-left:26px;color:%dim%}',
    '.mini .c-date{position:absolute;left:0;right:0;top:716px;text-align:center;font-size:50px;font-weight:500;color:%dim%;white-space:nowrap}',
    '.mini .c-date.low{top:862px}',
    '.mini .c-face{position:absolute;left:630px;top:150px}',
    '.mini .c-face .tick{stroke:%dim%;stroke-width:5;stroke-linecap:round}',
    '.mini .c-face .tick.q{stroke:%fg%;stroke-width:8}',
    '.mini .c-face .hand{stroke:%fg%;stroke-linecap:round}',
    '.mini .c-face .sec{stroke:%mark%;stroke-width:4;stroke-linecap:round}',
    '.mini .c-face .hub{fill:%fg%}',

    // The timer
    '.mini .t-ring{position:absolute;left:610px;top:140px}',
    '.mini .t-ring .rail{fill:none;stroke:%line%;stroke-width:14}',
    '.mini .t-ring .left{fill:none;stroke:%mark%;stroke-width:14;stroke-linecap:round}',
    '.mini .t-time{position:absolute;left:610px;top:398px;width:700px;text-align:center;font-size:184px}',
    '.mini .t-time.long{font-size:136px;top:422px}',
    '.mini .t-sub{position:absolute;left:610px;top:604px;width:700px;text-align:center;font-size:36px;font-weight:500;color:%dim%;white-space:nowrap}',
    '.mini .t-step{position:absolute;top:446px;width:88px;height:88px;border-radius:44px;box-shadow:inset 0 0 0 2px %line%;color:%fg%;',
    '-webkit-transition:opacity .2s;transition:opacity .2s}',
    '.mini .t-step svg{position:absolute;left:26px;top:26px}',
    '.mini .t-step.less{left:452px}',
    '.mini .t-step.more{left:1380px}',
    '.mini .t-step.off{opacity:0}',
    '.mini.rung{background:%accent%;color:%onAccent%}',
    '.mini.rung .t-sub,.mini.rung .m-name,.mini.rung .m-hint{color:%onAccent%}',
    '.mini.rung .m-hint .cap{color:%onAccent%;box-shadow:inset 0 0 0 2px %onAccent%}',
    '.mini.rung .t-ring .rail{stroke:%onAccent%;opacity:.18}',
    '.mini.rung .t-ring .left{stroke:%onAccent%}',

    // The scoreboard
    '.mini .s-side{position:absolute;top:0;width:960px;height:1080px;color:%dim%;-webkit-transition:color .15s;transition:color .15s}',
    '.mini .s-side.b{left:960px}',
    '.mini .s-side .who{position:absolute;left:0;right:0;top:206px;text-align:center;font-size:44px;font-weight:600;white-space:nowrap}',
    '.mini .s-side .n{position:absolute;left:0;right:0;top:312px;text-align:center;font-size:420px}',
    '.mini .s-side .bar{position:absolute;left:400px;top:282px;width:160px;height:8px;border-radius:4px;background:%mark%;opacity:0;',
    '-webkit-transition:opacity .15s;transition:opacity .15s}',
    '.mini .s-side.at{color:%fg%}',
    '.mini .s-side.at .bar{opacity:1}',
    '.mini .s-mid{position:absolute;left:959px;top:230px;width:2px;height:500px;background:%line%}',
    '.mini .s-new{position:absolute;left:810px;top:838px;width:300px;height:76px;border-radius:38px;line-height:76px;text-align:center;font-size:29px;',
    'font-weight:600;color:%dim%;box-shadow:inset 0 0 0 2px %line%;white-space:nowrap;',
    '-webkit-transition:-webkit-transform .18s,background-color .15s,color .15s;transition:transform .18s,background-color .15s,color .15s}',
    '.mini .s-new.at{background:%accent%;color:%onAccent%;box-shadow:none;-webkit-transform:scale(1.06);transform:scale(1.06)}',

    // The calendar
    '.mini .k-month{position:absolute;left:96px;top:236px;width:600px;font-size:104px;font-weight:600;line-height:1.04;letter-spacing:-0.02em}',
    '.mini .k-month .y{display:block;font-weight:%weight%;color:%dim%}',
    '.mini .k-today{position:absolute;left:100px;top:548px;width:600px;font-size:38px;font-weight:500;color:%dim%;white-space:nowrap}',
    '.mini .k-grid{position:absolute;left:770px;top:150px;width:1050px}',
    '.mini .k-cell{position:absolute;width:150px;height:118px;line-height:118px;text-align:center;font-size:50px;font-weight:500;',
    '-webkit-font-feature-settings:"tnum";font-feature-settings:"tnum"}',
    '.mini .k-cell.head{height:60px;line-height:60px;font-size:27px;font-weight:600;color:%dim%;text-transform:uppercase;letter-spacing:.08em}',
    '.mini .k-cell.rest{color:%dim%}',
    '.mini .k-cell.now span{display:inline-block;width:100px;height:100px;line-height:100px;border-radius:50px;background:%accent%;color:%onAccent%;font-weight:700}',

    // The world clock
    '.mini .w-row{position:absolute;left:96px;width:1728px;height:176px;color:%dim%;-webkit-transition:color .15s;transition:color .15s}',
    '.mini .w-row .bar{position:absolute;left:0;top:26px;width:8px;height:124px;border-radius:4px;background:%mark%;opacity:0;',
    '-webkit-transition:opacity .15s;transition:opacity .15s}',
    '.mini .w-row .city{position:absolute;left:44px;top:30px;font-size:66px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap}',
    '.mini .w-row .city .pick{margin-left:26px;opacity:0;-webkit-transition:opacity .15s;transition:opacity .15s}',
    '.mini .w-row .city .pick svg{vertical-align:-2px;margin-right:6px}',
    '.mini .w-row .note{position:absolute;left:44px;top:114px;font-size:31px;font-weight:500;white-space:nowrap;color:%dim%}',
    '.mini .w-row .at{position:absolute;right:0;top:20px;font-size:136px;text-align:right}',
    '.mini .w-row .at .half{font-size:44px;font-weight:500;letter-spacing:0;margin-left:16px;color:%dim%}',
    '.mini .w-row.here{color:%fg%}',
    '.mini .w-row.on{color:%fg%}',
    '.mini .w-row.on .bar{opacity:1}',
    '.mini .w-row.on .city .pick{opacity:1}',
    '.mini .w-line{position:absolute;left:96px;width:1728px;height:2px;background:%line%}',
    '.mini .w-none{position:absolute;left:96px;top:480px;width:1728px;text-align:center;font-size:40px;font-weight:500;color:%dim%}'
  ].join('');

  var sheet = null;

  /** The colors of the screen the small apps open over; anything left out keeps its value. */
  function skin(colors) {
    var k, css = CSS;
    for (k in colors) if (colors.hasOwnProperty(k) && SKIN.hasOwnProperty(k)) SKIN[k] = colors[k];
    for (k in SKIN) if (SKIN.hasOwnProperty(k)) css = css.split('%' + k + '%').join(SKIN[k]);
    if (!sheet) {
      sheet = document.createElement('style');
      (document.head || document.documentElement).appendChild(sheet);
    }
    sheet.textContent = css;
  }

  // MARK: - What every small app shows: its name at the top, the keys that do something at the bottom

  var ARROWS = {left: 'M14.5 5.5L8 12l6.5 6.5', right: 'M9.5 5.5L16 12l-6.5 6.5', up: 'M5.5 14.5L12 8l6.5 6.5', down: 'M5.5 9.5L12 16l6.5-6.5'};

  function arrow(way, parent, px, extra) {
    var s = svg('svg', {viewBox: '0 0 24 24', width: px, height: px, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.6,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'}, parent);
    if (extra) s.setAttribute('class', extra);
    svg('path', {d: ARROWS[way]}, s);
    return s;
  }

  function title(box, id, name) {
    var t = el('div', 'm-name', box);
    icon(id, t, 34);
    el('span', '', t, say(name));
  }

  /** hint(box, [[['left', 'right'], 'Minutes'], [['ok'], 'Start']]): the keys, then what they do. */
  function hint(box, parts) {
    var h = box.querySelector('.m-hint') || el('div', 'm-hint', box);
    h.innerHTML = '';
    for (var i = 0; i < parts.length; i++) {
      var keys = parts[i][0];
      for (var k = 0; k < keys.length; k++) {
        var cap = el('span', 'cap', h);
        if (ARROWS[keys[k]]) arrow(keys[k], cap, 20);
        else cap.textContent = keys[k] === 'ok' ? 'OK' : say('Back');
      }
      el('span', i === parts.length - 1 ? 'what last' : 'what', h, say(parts[i][1]));
    }
    return h;
  }

  // MARK: - Clock: the time and the date, as digits or as a dial; it drifts a little so nothing burns in

  var ck = null;

  function clockOpen(box) {
    ck = {box: box, state: load('clock', {face: 0, h12: null}), wrap: el('div', 'm-wrap', box), shown: '', quiet: 0};
    clockDraw();
    clockHint();
  }

  function clockHint() {
    var h = hint(ck.box, [[['left', 'right'], 'Digits or dial'], [['ok'], '12 or 24 hours'], [['back'], 'Close']]);
    h.className = 'm-hint';
    ck.quiet = Date.now() + 6000;   // a clock is for looking at: the keys go away again
  }

  function clockDraw() {
    var w = ck.wrap, i;
    w.innerHTML = '';
    ck.shown = '';
    if (ck.state.face === 1) {
      var s = svg('svg', {viewBox: '0 0 660 660', width: 660, height: 660, 'class': 'c-face'}, w);
      for (i = 0; i < 12; i++) {
        var t = svg('line', {x1: 330, y1: 26, x2: 330, y2: i % 3 ? 52 : 66, 'class': i % 3 ? 'tick' : 'tick q'}, s);
        t.setAttribute('transform', 'rotate(' + i * 30 + ' 330 330)');
      }
      ck.hour = svg('line', {x1: 330, y1: 350, x2: 330, y2: 160, 'class': 'hand', 'stroke-width': 16}, s);
      ck.min = svg('line', {x1: 330, y1: 356, x2: 330, y2: 78, 'class': 'hand', 'stroke-width': 10}, s);
      ck.sec = svg('line', {x1: 330, y1: 384, x2: 330, y2: 60, 'class': 'sec'}, s);
      svg('circle', {cx: 330, cy: 330, r: 13, 'class': 'hub'}, s);
      ck.date = el('div', 'c-date low', w);
    } else {
      ck.time = el('div', 'c-time big', w);
      ck.date = el('div', 'c-date', w);
    }
    clockTick();
  }

  function clockTick() {
    var now = new Date(), h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    if (ck.state.face === 1) {
      ck.hour.setAttribute('transform', 'rotate(' + ((h % 12) * 30 + m / 2) + ' 330 330)');
      ck.min.setAttribute('transform', 'rotate(' + (m * 6 + s / 10) + ' 330 330)');
      ck.sec.setAttribute('transform', 'rotate(' + s * 6 + ' 330 330)');
    }
    var key = h + ':' + m + ':' + now.getDate();
    if (key !== ck.shown) {
      ck.shown = key;
      if (ck.state.face !== 1) {
        var t = clockText(h, m, twelve());
        ck.time.innerHTML = '';
        var digits = el('span', 'digits', ck.time, t.text);
        if (t.half) el('span', 'half', digits, t.half);
      }
      ck.date.textContent = longDate(now);
    }
    if (ck.quiet && Date.now() > ck.quiet) {
      ck.quiet = 0;
      setClass(ck.box.querySelector('.m-hint'), 'gone', true);
    }
  }

  function clockKey(k) {
    if (k === 'left' || k === 'right') {
      ck.state.face = ck.state.face === 1 ? 0 : 1;
      save('clock', ck.state);
      clockDraw();
    } else if (k === 'ok') {
      setTwelve(!twelve());
      ck.state = load('clock', {face: 0, h12: null});
      clockDraw();
    }
    clockHint();
    return true;
  }

  // MARK: - Timer: it keeps counting after you leave it, and rings wherever you are on the home screen

  var STEPS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120];   // minutes, with left and right
  var LONGEST = 180 * 60;
  var RING = 2 * Math.PI * 336;
  var tm = null;

  function timerState() { return load('timer', {dur: 300, end: 0, left: 0, rung: 0}); }

  /** Seconds to go: counting, held, or what it is set to. */
  function timerLeft(s) {
    if (s.end) return Math.max(0, Math.ceil((s.end - Date.now()) / 1000));
    return s.left || s.dur;
  }

  /** The moment a running timer ends, once: it stops, and remembers that it rang until someone has seen it. */
  function timerEnds() {
    var s = timerState();
    if (!s.end || Date.now() < s.end) return false;
    s.end = 0;
    s.left = 0;
    s.rung = Date.now();
    save('timer', s);
    if (tm) tm.state = s;
    chime();
    return true;
  }

  function timerOpen(box) {
    tm = {box: box, state: timerState(), shown: ''};
    var s = svg('svg', {viewBox: '0 0 700 700', width: 700, height: 700, 'class': 't-ring'}, box);
    svg('circle', {cx: 350, cy: 350, r: 336, 'class': 'rail'}, s);
    tm.arc = svg('circle', {cx: 350, cy: 350, r: 336, 'class': 'left', transform: 'rotate(-90 350 350)', 'stroke-dasharray': RING}, s);
    tm.less = el('div', 't-step less', box);
    arrow('left', tm.less, 36);
    tm.more = el('div', 't-step more', box);
    arrow('right', tm.more, 36);
    tm.time = el('div', 't-time big', box);
    tm.sub = el('div', 't-sub', box);
    timerDraw();
  }

  function timerDraw() {
    var s = tm.state, left = timerLeft(s), idle = !s.end && !s.left && !s.rung;
    var mode = s.rung ? 'rung' : s.end ? 'run' : s.left ? 'held' : 'idle';
    var key = mode + left + ':' + s.dur;
    if (key === tm.shown) return;
    tm.shown = key;
    tm.time.textContent = s.rung ? span(0) : span(left);
    tm.time.className = left >= 3600 && !s.rung ? 't-time big long' : 't-time big';
    var whole = s.rung ? 1 : idle ? 1 : left / Math.max(1, s.total || s.dur);
    tm.arc.setAttribute('stroke-dashoffset', RING * (1 - Math.max(0, Math.min(1, whole))));
    tm.sub.textContent = mode === 'rung' ? say('Time is up') : mode === 'held' ? say('Paused') : mode === 'idle' ? minutes(s.dur) : '';
    tm.less.className = 't-step less' + (idle ? '' : ' off');
    tm.more.className = 't-step more' + (idle ? '' : ' off');
    setClass(tm.box.parentNode, 'rung', mode === 'rung');
    if (mode === 'idle') hint(tm.box, [[['left', 'right'], 'Minutes'], [['ok'], 'Start'], [['back'], 'Close']]);
    else if (mode === 'run') hint(tm.box, [[['ok'], 'Pause'], [['up'], 'One more minute'], [['back'], 'Close']]);
    else if (mode === 'held') hint(tm.box, [[['ok'], 'Go on'], [['down'], 'Start over'], [['back'], 'Close']]);
    else hint(tm.box, [[['ok'], 'Done']]);
  }

  function minutes(sec) {
    var m = Math.round(sec / 60);
    return m === 1 ? say('1 minute') : m + ' ' + say('minutes');
  }

  function timerTick() {
    timerEnds();
    tm.state = timerState();
    timerDraw();
  }

  function timerKey(k) {
    var s = tm.state, i, m;
    if (s.rung) {
      if (k === 'ok' || k === 'down') s.rung = 0;
    } else if (s.end) {
      if (k === 'ok') { s.left = timerLeft(s); s.end = 0; }
      else if (k === 'up' && timerLeft(s) + 60 <= LONGEST) { s.end += 60000; s.total = (s.total || s.dur) + 60; }
    } else if (s.left) {
      if (k === 'ok') { s.end = Date.now() + s.left * 1000; s.left = 0; }
      else if (k === 'down') { s.left = 0; s.total = 0; }
      else if (k === 'up' && s.left + 60 <= LONGEST) { s.left += 60; s.total = (s.total || s.dur) + 60; }
    } else {
      m = Math.round(s.dur / 60);
      if (k === 'ok') { s.end = Date.now() + s.dur * 1000; s.total = s.dur; }
      else if (k === 'right') { for (i = 0; i < STEPS.length; i++) if (STEPS[i] > m) { s.dur = STEPS[i] * 60; break; } }
      else if (k === 'left') { for (i = STEPS.length - 1; i >= 0; i--) if (STEPS[i] < m) { s.dur = STEPS[i] * 60; break; } }
      else if (k === 'up') s.dur = Math.min(LONGEST, s.dur + 60);
      else if (k === 'down') s.dur = Math.max(60, s.dur - 60);
    }
    save('timer', s);
    timerDraw();
    return true;
  }

  function timerStatus() {
    var s = timerState();
    if (s.rung) return say('Time is up');
    if (s.end || s.left) return span(timerLeft(s));
    return span(s.dur);
  }

  /** Three short notes. A TV that will not play sound without a key press first stays silent: the screen still says it. */
  var audio = null;
  function chime() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio = audio || new AC();
      if (audio.resume) audio.resume();
      for (var i = 0; i < 3; i++) {
        var o = audio.createOscillator(), g = audio.createGain(), at = audio.currentTime + i * 0.42;
        o.type = 'sine';
        o.frequency.value = i === 2 ? 1174.66 : 880;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.36);
        o.connect(g);
        g.connect(audio.destination);
        o.start(at);
        o.stop(at + 0.4);
      }
    } catch (e) {}
  }

  // MARK: - Scoreboard: two sides and a way to start again

  var sc = null;

  function scoreState() { return load('score', {a: 0, b: 0, at: 0}); }

  function scoreOpen(box) {
    sc = {box: box, state: scoreState(), sides: []};
    var names = ['Home', 'Guests'];
    for (var i = 0; i < 2; i++) {
      var side = el('div', i ? 's-side b' : 's-side', box);
      el('div', 'bar', side);
      el('div', 'who', side, say(names[i]));
      sc.sides.push({node: side, n: el('div', 'n big', side)});
    }
    el('div', 's-mid', box);
    sc.again = el('div', 's-new', box, say('New game'));
    scoreDraw();
  }

  function scoreDraw() {
    var s = sc.state;
    sc.sides[0].n.textContent = s.a;
    sc.sides[1].n.textContent = s.b;
    sc.sides[0].node.className = 's-side' + (s.at === 0 ? ' at' : '');
    sc.sides[1].node.className = 's-side b' + (s.at === 2 ? ' at' : '');
    sc.again.className = 's-new' + (s.at === 1 ? ' at' : '');
    if (s.at === 1) hint(sc.box, [[['ok'], 'Both back to 0'], [['left', 'right'], 'Side'], [['back'], 'Close']]);
    else hint(sc.box, [[['up', 'down'], 'Score'], [['left', 'right'], 'Side'], [['back'], 'Close']]);
  }

  function scoreKey(k) {
    var s = sc.state, side = s.at === 0 ? 'a' : 'b';
    if (k === 'left') s.at = Math.max(0, s.at - 1);
    else if (k === 'right') s.at = Math.min(2, s.at + 1);
    else if (s.at === 1) { if (k === 'ok') { s.a = 0; s.b = 0; } }
    else if (k === 'up' || k === 'ok') s[side] = Math.min(999, s[side] + 1);
    else if (k === 'down') s[side] = Math.max(0, s[side] - 1);
    save('score', s);
    scoreDraw();
    return true;
  }

  function scoreStatus() {
    var s = scoreState();
    return s.a + ' – ' + s.b;
  }

  // MARK: - Calendar: a month at a time

  var cal = null;

  /** Countries whose printed calendars start the week on Sunday; everywhere else it is Monday. */
  var SUNDAY = ' US CA MX BR AR CO PE VE IN PK BD JP KR TW HK PH TH ID IL SA ZA KE AU ';

  function firstDay() {
    var m = /[-_]([A-Za-z]{2})\b/.exec(lang());
    return m && SUNDAY.indexOf(' ' + m[1].toUpperCase() + ' ') >= 0 ? 0 : 1;
  }

  function calOpen(box) {
    var now = new Date();
    cal = {box: box, y: now.getFullYear(), m: now.getMonth(), head: el('div', 'k-month', box), today: el('div', 'k-today', box),
      grid: el('div', 'k-grid', box), shown: ''};
    hint(box, [[['left', 'right'], 'Month'], [['up', 'down'], 'Year'], [['ok'], 'Today'], [['back'], 'Close']]);
    calDraw();
  }

  function calDraw() {
    var now = new Date(), first = new Date(cal.y, cal.m, 1), days = new Date(cal.y, cal.m + 1, 0).getDate(), start = firstDay();
    var key = cal.y + '-' + cal.m + '-' + now.getDate();
    if (key === cal.shown) return;
    cal.shown = key;
    cal.head.textContent = month(first);
    el('span', 'y', cal.head, cal.y);
    cal.today.textContent = longDate(now);
    cal.grid.innerHTML = '';
    var i, cell;
    for (i = 0; i < 7; i++) {
      // 2 January 2000 was a Sunday: the weekdays' names, in the TV's language, starting where the week does here.
      cell = el('div', 'k-cell head', cal.grid, weekday(new Date(2000, 0, 2 + start + i), true));
      cell.style.left = i * 150 + 'px';
      cell.style.top = '0';
    }
    var offset = (first.getDay() - start + 7) % 7;
    for (i = 1; i <= days; i++) {
      var at = offset + i - 1, col = at % 7, day = (start + col) % 7;
      var isNow = cal.y === now.getFullYear() && cal.m === now.getMonth() && i === now.getDate();
      cell = el('div', 'k-cell' + (isNow ? ' now' : day === 0 || day === 6 ? ' rest' : ''), cal.grid);
      el('span', '', cell, i);
      cell.style.left = col * 150 + 'px';
      cell.style.top = (76 + Math.floor(at / 7) * 118) + 'px';
    }
  }

  function calKey(k) {
    var now = new Date();
    if (k === 'left') cal.m--;
    else if (k === 'right') cal.m++;
    else if (k === 'up') cal.y--;
    else if (k === 'down') cal.y++;
    else if (k === 'ok') { cal.y = now.getFullYear(); cal.m = now.getMonth(); }
    if (cal.m < 0) { cal.m = 11; cal.y--; }
    if (cal.m > 11) { cal.m = 0; cal.y++; }
    cal.y = Math.max(1900, Math.min(2200, cal.y));
    calDraw();
    return true;
  }

  function calStatus() {
    var now = new Date();
    return weekday(now, true) + ' ' + now.getDate();
  }

  // MARK: - World clock: here, and three other places

  var CITIES = [
    ['Honolulu', 'Pacific/Honolulu'], ['Los Angeles', 'America/Los_Angeles'], ['Denver', 'America/Denver'], ['Mexico City', 'America/Mexico_City'],
    ['Chicago', 'America/Chicago'], ['New York', 'America/New_York'], ['Toronto', 'America/Toronto'], ['São Paulo', 'America/Sao_Paulo'],
    ['London', 'Europe/London'], ['Lisbon', 'Europe/Lisbon'], ['Lagos', 'Africa/Lagos'], ['Paris', 'Europe/Paris'], ['Berlin', 'Europe/Berlin'],
    ['Madrid', 'Europe/Madrid'], ['Rome', 'Europe/Rome'], ['Cairo', 'Africa/Cairo'], ['Johannesburg', 'Africa/Johannesburg'],
    ['Istanbul', 'Europe/Istanbul'], ['Nairobi', 'Africa/Nairobi'], ['Moscow', 'Europe/Moscow'], ['Dubai', 'Asia/Dubai'], ['Karachi', 'Asia/Karachi'],
    ['Mumbai', 'Asia/Kolkata'], ['Dhaka', 'Asia/Dhaka'], ['Bangkok', 'Asia/Bangkok'], ['Singapore', 'Asia/Singapore'], ['Hong Kong', 'Asia/Hong_Kong'],
    ['Shanghai', 'Asia/Shanghai'], ['Tokyo', 'Asia/Tokyo'], ['Seoul', 'Asia/Seoul'], ['Sydney', 'Australia/Sydney'], ['Auckland', 'Pacific/Auckland']
  ];
  var wd = null;

  function worldState() { return load('world', {zones: ['Europe/London', 'America/New_York', 'Asia/Tokyo'], row: 0}); }

  function cityIndex(zone) {
    for (var i = 0; i < CITIES.length; i++) if (CITIES[i][1] === zone) return i;
    return 0;
  }

  /** The date and time on the wall in a time zone, {y, mo, d, h, mi}, or null on a TV that cannot work it out. */
  function zoned(zone, at) {
    try {
      var s = new Date(at).toLocaleString('en-GB', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
        minute: '2-digit', hour12: false});
      var m = /(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+)/.exec(s);
      return m ? {d: +m[1], mo: +m[2], y: +m[3], h: +m[4] % 24, mi: +m[5]} : null;
    } catch (e) { return null; }
  }

  /** Older TVs take the time zone and answer with their own time: two places half a world apart then read the same. */
  var zonesOk = null;
  function zonesWork() {
    if (zonesOk === null) {
      var at = Date.now(), a = zoned('Asia/Tokyo', at), b = zoned('America/Los_Angeles', at);
      zonesOk = !!a && !!b && (a.h !== b.h || a.d !== b.d);
    }
    return zonesOk;
  }

  /** How far a place is from here, in words, and which day it is there. */
  function apart(there, now) {
    var here = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    var mins = Math.round((Date.UTC(there.y, there.mo - 1, there.d, there.h, there.mi) - here) / 60000 / 15) * 15;
    var h = Math.floor(Math.abs(mins) / 60), m = Math.abs(mins) % 60;
    var gap = !mins ? say('Same time') : (h ? h + ' h ' : '') + (m ? m + ' min ' : '') + say(mins > 0 ? 'ahead' : 'behind');
    var day = there.d === now.getDate() ? '' : (Date.UTC(there.y, there.mo - 1, there.d) > Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
      ? say('tomorrow') : say('yesterday'));
    return day ? gap + ' · ' + day : gap;
  }

  function worldOpen(box) {
    wd = {box: box, state: worldState(), rows: [], shown: ''};
    if (!zonesWork()) {
      el('div', 'w-none', box, say('This TV cannot tell the time in other places.'));
      hint(box, [[['back'], 'Close']]);
      wd.rows = null;
      return;
    }
    for (var i = 0; i < 4; i++) {
      var row = el('div', 'w-row', box);
      row.style.top = (132 + i * 204) + 'px';
      el('div', 'bar', row);
      var city = el('div', 'city', row), name = el('span', '', city);
      if (i) {
        var pick = el('span', 'pick', city);
        arrow('left', pick, 38);
        arrow('right', pick, 38);
      }
      wd.rows.push({node: row, name: name, note: el('div', 'note', row), at: el('div', 'at big', row)});
      if (i < 3) el('div', 'w-line', box).style.top = (132 + i * 204 + 189) + 'px';
    }
    hint(box, [[['up', 'down'], 'Place'], [['left', 'right'], 'Another city'], [['ok'], '12 or 24 hours'], [['back'], 'Close']]);
    worldDraw();
  }

  function worldDraw() {
    if (!wd.rows) return;
    var now = new Date(), h12 = twelve(), s = wd.state;
    var key = now.getHours() + ':' + now.getMinutes() + '|' + s.zones.join(',') + '|' + s.row + '|' + h12;
    if (key === wd.shown) return;
    wd.shown = key;
    for (var i = 0; i < 4; i++) {
      var r = wd.rows[i], there = i ? zoned(s.zones[i - 1], now.getTime()) : null;
      var t = i ? (there ? clockText(there.h, there.mi, h12) : {text: '–', half: ''}) : clockText(now.getHours(), now.getMinutes(), h12);
      r.name.textContent = i ? CITIES[cityIndex(s.zones[i - 1])][0] : say('Here');
      r.note.textContent = i ? (there ? apart(there, now) : '') : longDate(now);
      r.at.textContent = t.text;
      if (t.half) el('span', 'half', r.at, t.half);
      r.node.className = 'w-row' + (i ? '' : ' here') + (i && s.row === i - 1 ? ' on' : '');
    }
  }

  function worldKey(k) {
    if (!wd.rows) return true;
    var s = wd.state, at;
    if (k === 'up') s.row = Math.max(0, s.row - 1);
    else if (k === 'down') s.row = Math.min(2, s.row + 1);
    else if (k === 'left' || k === 'right') {
      // The next city along that is not already in another row.
      at = cityIndex(s.zones[s.row]);
      for (var n = 0; n < CITIES.length; n++) {
        at = (at + (k === 'right' ? 1 : CITIES.length - 1)) % CITIES.length;
        if (s.zones.indexOf(CITIES[at][1]) < 0) break;
      }
      s.zones[s.row] = CITIES[at][1];
    } else if (k === 'ok') {
      setTwelve(!twelve());
    }
    save('world', s);
    worldDraw();
    return true;
  }

  function worldStatus() {
    var s = worldState(), there = zoned(s.zones[0], Date.now());
    if (!there || !zonesWork()) return '';
    return CITIES[cityIndex(s.zones[0])][0] + ' ' + clockText(there.h, there.mi, twelve()).text;
  }

  /** Each place's name and time, for a tile large enough to list them: [{name, value}]. */
  function worldRows() {
    var s = worldState(), out = [];
    if (!zonesWork()) return out;
    for (var i = 0; i < s.zones.length; i++) {
      var there = zoned(s.zones[i], Date.now());
      if (!there) continue;
      var t = clockText(there.h, there.mi, twelve());
      out.push({name: CITIES[cityIndex(s.zones[i])][0], value: t.text + (t.half ? ' ' + t.half : '')});
    }
    return out;
  }

  function scoreRows() {
    var s = scoreState();
    return [{name: say('Home'), value: '' + s.a}, {name: say('Guests'), value: '' + s.b}];
  }

  /** This month for a tile that draws it as dots: where the 1st falls in its week, how many days, and today. */
  function monthNow() {
    var now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1);
    return {offset: (first.getDay() - firstDay() + 7) % 7, days: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      today: now.getDate(), weekday: weekday(now, true)};
  }

  // MARK: - The five

  var APPS = [
    {id: 'clock', name: 'Clock', open: clockOpen, key: clockKey, tick: clockTick, status: function () { return ''; }, live: function () { return false; }},
    {id: 'timer', name: 'Timer', open: timerOpen, key: timerKey, tick: timerTick, status: timerStatus,
      live: function () { var s = timerState(); return !!(s.end || s.left || s.rung); }},
    {id: 'score', name: 'Score', open: scoreOpen, key: scoreKey, tick: null, status: scoreStatus,
      live: function () { var s = scoreState(); return s.a + s.b > 0; }},
    {id: 'calendar', name: 'Calendar', open: calOpen, key: calKey, tick: calDraw, status: calStatus, live: function () { return false; }},
    {id: 'world', name: 'World clock', open: worldOpen, key: worldKey, tick: worldDraw, status: worldStatus, live: function () { return false; }}
  ].slice(0, MAX);

  function app(id) {
    for (var i = 0; i < APPS.length; i++) if (APPS[i].id === id) return APPS[i];
    return null;
  }

  var open = null;   // {app, box, body, done, timer}

  /**
   * A slow figure of eight, a few pixels across, once every ten minutes (the home screen's clock screensaver drifts the
   * same way): a score or a clock left up all evening never lights the same pixels for hours.
   */
  function drift(body) {
    var phase = 2 * Math.PI * (Date.now() / 1000 % 600) / 600;
    move(body, Math.round(30 * Math.sin(phase)), Math.round(20 * Math.sin(2 * phase + 0.7)));
  }

  function openApp(id, layer, done) {
    var a = app(id);
    if (!a || !layer) return false;
    if (open) closeApp(true);
    if (!sheet) skin({});
    var box = el('div', 'mini', layer), body = el('div', 'm-body', box), beat = 0;
    open = {app: a, box: box, body: body, done: done || null, timer: 0};
    title(body, a.id, a.name);
    a.open(body);
    drift(body);
    // Shown on the next frame, so the fade and the small rise are drawn.
    setTimeout(function () { if (open && open.box === box) setClass(box, 'on', true); }, 20);
    open.timer = setInterval(function () {
      if (!open || open.app !== a) return;
      if (a.tick) a.tick();
      if (++beat % 36 === 0) drift(body);   // every nine seconds, as long as its own transition
    }, 250);
    return true;
  }

  function closeApp(atOnce) {
    if (!open) return;
    var was = open, box = was.box;
    open = null;
    if (was.timer) clearInterval(was.timer);
    ck = tm = sc = cal = wd = null;
    setClass(box, 'on', false);
    if (atOnce) { if (box.parentNode) box.parentNode.removeChild(box); }
    else setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 220);
    if (was.done) was.done(was.app.id);
  }

  /** A key while a small app is open. Back closes it; the rest is the app's. True: the key was used. */
  function key(name) {
    if (!open) return false;
    if (name === 'back') { closeApp(false); return true; }
    return !!open.app.key(name);
  }

  return {
    MAX: MAX,
    list: function () {
      var out = [];
      for (var i = 0; i < APPS.length; i++) out.push({id: APPS[i].id, name: say(APPS[i].name)});
      return out;
    },
    icon: icon,
    status: function (id) { var a = app(id); return a ? a.status() : ''; },
    live: function (id) { var a = app(id); return a ? a.live() : false; },
    rows: function (id) { return id === 'world' ? worldRows() : id === 'score' ? scoreRows() : []; },
    month: monthNow,
    /** The time and the date as the small apps write them, so the home screen's own clock reads the same. */
    time: function (h, m) { return clockText(h, m, twelve()); },
    date: longDate,
    progress: function (id) {   // how much of the timer is left, 0 to 1 (1 when it is not running)
      var s = timerState();
      if (id !== 'timer' || s.rung || (!s.end && !s.left)) return 1;
      return Math.max(0, Math.min(1, timerLeft(s) / Math.max(1, s.total || s.dur)));
    },
    skin: skin,
    open: openApp,
    close: function () { closeApp(false); },
    isOpen: function () { return open ? open.app.id : ''; },   // the one that is open, or ''
    host: function (h) { host = h || null; },
    key: key,
    tick: function () { return timerEnds() ? 'timer' : ''; }
  };
})();
