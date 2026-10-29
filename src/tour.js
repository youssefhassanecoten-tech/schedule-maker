/* Guided tour engine.
 *
 *   SM.tour.afterFileLoaded()  - called after a schedule is loaded; starts the
 *                                full first-run tour or the update tour
 *   SM.tour.restartFull()      - "Show the tutorial again"
 *
 * The spotlight is one element with a huge outer box-shadow, so only the target
 * stays lit. The card is positioned next to it and carries a small arrow.
 */
(function (global) {
  'use strict';
  var SM = global.SM || (global.SM = {});
  var KEY = 'schedule-maker-tour-v1';

  var active = null;      // { steps, i, onDone, before, target }
  var started = false;
  var root = null, backdrop, spot, card;
  var titleEl, textEl, stepEl, nextBtn, backBtn;

  function version() { return (SM.config && SM.config.VERSION) || '0.0.0'; }
  function lang() {
    return (document.documentElement.lang || 'ru').toLowerCase().indexOf('en') === 0 ? 'en' : 'ru';
  }
  function tr(key) {
    return (SM.i18n && SM.i18n.t) ? SM.i18n.t(key) : key;
  }
  function store() {
    try { return JSON.parse(global.localStorage.getItem(KEY) || 'null') || {}; }
    catch (e) { return {}; }
  }
  function persist(s) {
    try { global.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }
  function markFull() {
    var s = store();
    s.fullDone = true;
    s.version = version();
    persist(s);
  }
  function markUpdate() {
    var s = store();
    s.version = version();
    s.seenUpdates = s.seenUpdates || [];
    if (s.seenUpdates.indexOf(version()) < 0) s.seenUpdates.push(version());
    persist(s);
  }

  function node(tag, cls) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function build() {
    root = node('div', 'tour-root');
    root.id = 'tourRoot';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');

    backdrop = node('div', 'tour-backdrop');
    backdrop.addEventListener('click', function (e) { e.stopPropagation(); });

    spot = node('div', 'tour-spot');

    card = node('div', 'tour-card');
    card.dataset.place = 'bottom';

    var head = node('div', 'tour-head');
    stepEl = node('span', 'tour-step');
    var skip = node('button', 'tour-skip');
    skip.id = 'tourSkip';
    skip.type = 'button';
    skip.textContent = tr('tourSkip');
    skip.onclick = function () { finish(true); };
    head.appendChild(stepEl);
    head.appendChild(skip);

    titleEl = node('h3', 'tour-title');
    textEl = node('p', 'tour-text');

    var actions = node('div', 'tour-actions');
    backBtn = node('button', 'btn btn-sm tour-back');
    backBtn.type = 'button';
    backBtn.textContent = tr('tourBack');
    backBtn.onclick = prev;
    nextBtn = node('button', 'btn btn-sm btn-primary tour-next');
    nextBtn.type = 'button';
    nextBtn.onclick = next;
    actions.appendChild(backBtn);
    actions.appendChild(nextBtn);

    card.appendChild(head);
    card.appendChild(titleEl);
    card.appendChild(textEl);
    card.appendChild(actions);

    root.appendChild(backdrop);
    root.appendChild(spot);
    root.appendChild(card);
    document.body.appendChild(root);
  }

  function start(steps, onDone) {
    if (active || !steps || !steps.length) return false;
    active = {
      steps: steps.slice(),
      i: 0,
      onDone: onDone,
      before: (SM.ui && SM.ui.state) ? SM.ui.state.tab : null,
      target: null
    };
    build();
    document.addEventListener('keydown', onKey, true);
    global.addEventListener('resize', reposition);
    global.addEventListener('scroll', reposition, true);
    show(0);
    return true;
  }

  function current() { return active ? active.steps[active.i] : null; }

  function show(i) {
    if (!active) return;
    if (i >= active.steps.length) { finish(false); return; }
    active.i = Math.max(0, i);
    var step = current();
    if (step.tab && SM.ui && SM.ui.openTab) SM.ui.openTab(step.tab);
    global.setTimeout(function () { resolve(step); }, 90);
  }

  function resolve(step) {
    if (!active || current() !== step) return;
    var target = step.selector ? document.querySelector(step.selector) : null;
    if (!target) {
      if (active.i + 1 < active.steps.length) show(active.i + 1);
      else finish(false);
      return;
    }
    active.target = target;
    render(step, target);
  }

  function render(step, target) {
    titleEl.textContent = (step.title && (step.title[lang()] || step.title.ru)) || '';
    textEl.textContent = (step.text && (step.text[lang()] || step.text.ru)) || '';
    stepEl.textContent = (active.i + 1) + ' / ' + active.steps.length;
    nextBtn.textContent = (active.i + 1 === active.steps.length) ? tr('tourFinish') : tr('tourNext');
    backBtn.style.visibility = active.i === 0 ? 'hidden' : 'visible';

    var r = target.getBoundingClientRect();
    var vh = global.innerHeight;
    if (r.top < 70 || r.bottom > vh - 24) {
      target.scrollIntoView({ block: 'center', inline: 'center' });
    }
    /* Two frames: scrolling and tab switches settle before measuring. */
    global.setTimeout(function () { if (active && active.target === target) place(target); }, 40);
    global.setTimeout(function () { nextBtn.focus(); }, 50);
  }

  function place(target) {
    if (!active || !target) return;
    var r = target.getBoundingClientRect();
    var pad = 8;
    spot.style.left = Math.max(2, r.left - pad) + 'px';
    spot.style.top = Math.max(2, r.top - pad) + 'px';
    spot.style.width = Math.min(global.innerWidth - 4, Math.max(24, r.width + pad * 2)) + 'px';
    spot.style.height = Math.min(global.innerHeight - 4, Math.max(20, r.height + pad * 2)) + 'px';

    var cw = card.offsetWidth, ch = card.offsetHeight;
    var vw = global.innerWidth, vh = global.innerHeight, gap = 18;
    var mode = 'center';
    if (r.bottom + gap + ch <= vh - 12) mode = 'bottom';
    else if (r.top - gap - ch >= 12) mode = 'top';
    else if (r.right + gap + cw <= vw - 12) mode = 'right';
    else if (r.left - gap - cw >= 12) mode = 'left';
    else mode = 'center';

    var left, top;
    if (mode === 'bottom' || mode === 'top') {
      left = clamp(r.left + r.width / 2 - cw / 2, 12, vw - cw - 12);
      top = mode === 'bottom' ? r.bottom + gap : r.top - gap - ch;
      card.style.setProperty('--arrow-x', clamp(r.left + r.width / 2 - left, 20, cw - 20) + 'px');
    } else if (mode === 'right' || mode === 'left') {
      top = clamp(r.top + r.height / 2 - ch / 2, 12, vh - ch - 12);
      left = mode === 'right' ? r.right + gap : r.left - gap - cw;
      card.style.setProperty('--arrow-y', clamp(r.top + r.height / 2 - top, 20, ch - 20) + 'px');
    } else {
      left = (vw - cw) / 2;
      top = (vh - ch) / 2;
    }
    card.dataset.place = mode;
    card.style.left = Math.max(8, left) + 'px';
    card.style.top = Math.max(8, top) + 'px';
  }

  function reposition() {
    if (active && active.target) place(active.target);
  }

  function next() {
    if (!active) return;
    if (active.i + 1 >= active.steps.length) finish(false);
    else show(active.i + 1);
  }
  function prev() {
    if (!active || active.i === 0) return;
    show(active.i - 1);
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  }

  function finish(skipped) {
    if (!active) return;
    var done = active.onDone, before = active.before;
    active = null;
    document.removeEventListener('keydown', onKey, true);
    global.removeEventListener('resize', reposition);
    global.removeEventListener('scroll', reposition, true);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    if (before && SM.ui && SM.ui.openTab) SM.ui.openTab(before);
    if (done) done(skipped);
  }

  function afterFileLoaded() {
    if (started || active) return;
    started = true;
    var s = store();
    var V = version();
    if (!s.fullDone) {
      start((SM.tours && SM.tours.full) || [], markFull);
      return;
    }
    if (s.version !== V) {
      var steps = (SM.tours && SM.tours.updates && SM.tours.updates[V]) || [];
      if (steps.length) start(steps, markUpdate);
      else markUpdate();
    }
  }

  function restartFull() {
    return start((SM.tours && SM.tours.full) || [], function () { markFull(); });
  }

  SM.tour = {
    start: start,
    afterFileLoaded: afterFileLoaded,
    restartFull: restartFull,
    markFull: markFull,
    markUpdate: markUpdate
  };

})(typeof window !== 'undefined' ? window : globalThis);
