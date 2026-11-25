export interface JsInfo {
  features: Set<string>;
  pageMode: boolean;
  initialFrameId: string | null;
}

/**
 * Generates the small interaction runtime for exported HTML.
 * Only the blocks needed by the generated markup are included; returns '' when nothing is needed.
 * No eval(), no libraries – plain ES5 DOM code.
 */
export function generateJavaScript(info: JsInfo): string {
  const f = info.features;
  if (f.size === 0 && !info.pageMode) return '';
  const out: string[] = [];
  out.push(`(function () {
  'use strict';
  var doc = document;
  function all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function hit(e, sel) { return e.target && e.target.closest ? e.target.closest(sel) : null; }`);

  if (info.pageMode) {
    out.push(`
  // ---- frame navigation (prototype flows) ----
  var frames = all('[data-frame]');
  var initial = ${JSON.stringify(info.initialFrameId)};
  var trail = [];
  function showFrame(id, push) {
    var target = doc.getElementById(id);
    if (!target || !target.hasAttribute('data-frame')) return;
    frames.forEach(function (fr) { fr.hidden = fr !== target; });
    all('.overlay').forEach(function (o) { o.hidden = true; });
    window.scrollTo(0, 0);
    if (push !== false) {
      trail.push(id);
      try { history.pushState({ frame: id }, '', '#' + id); } catch (err) { /* sandboxed preview */ }
    }
  }
  window.addEventListener('popstate', function (e) {
    showFrame((e.state && e.state.frame) || initial, false);
  });
  var fromHash = location.hash ? location.hash.slice(1) : '';
  showFrame(fromHash && doc.getElementById(fromHash) ? fromHash : initial, false);`);
  }

  out.push(`
  doc.addEventListener('click', function (e) {
    var n;`);
  if (info.pageMode) {
    out.push(`    if ((n = hit(e, '[data-nav]'))) { e.preventDefault(); showFrame(n.getAttribute('data-nav')); return; }
    if ((n = hit(e, '[data-back]'))) {
      e.preventDefault();
      trail.pop();
      showFrame(trail.length ? trail[trail.length - 1] : initial, false);
      return;
    }`);
  }
  if (f.has('url')) {
    out.push(
      `    if ((n = hit(e, '[data-url]'))) { e.preventDefault(); window.open(n.getAttribute('data-url'), '_blank', 'noopener'); return; }`,
    );
  }
  if (f.has('scroll')) {
    out.push(`    if ((n = hit(e, '[data-scroll]'))) {
      e.preventDefault();
      var el = doc.getElementById(n.getAttribute('data-scroll'));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }`);
  }
  if (f.has('overlay')) {
    out.push(`    if ((n = hit(e, '[data-open]'))) {
      e.preventDefault();
      var ov = doc.getElementById(n.getAttribute('data-open'));
      if (ov) { ov.hidden = false; var fr = ov.querySelector('[tabindex],button,a'); if (fr && fr.focus) fr.focus(); }
      return;
    }
    if ((n = hit(e, '[data-close]'))) {
      e.preventDefault();
      var box = n.closest('.overlay, [data-component="modal"]');
      if (box) box.hidden = true;
      return;
    }
    if (e.target && e.target.classList && e.target.classList.contains('overlay')) { e.target.hidden = true; return; }`);
  }
  if (f.has('menu')) {
    out.push(`    if ((n = hit(e, '[data-role="menu-toggle"]'))) {
      var scope = n.closest('[data-frame]') || doc;
      var panel = scope.querySelector('[data-role="menu-panel"]');
      if (panel) { panel.hidden = !panel.hidden; n.setAttribute('aria-expanded', String(!panel.hidden)); }
      return;
    }`);
  }
  if (f.has('tabs')) {
    out.push(`    if ((n = hit(e, '[data-role="tab"]'))) {
      var group = n.closest('[data-component="tabs"]');
      if (group) {
        var tabs = all('[data-role="tab"]', group);
        var panels = all('[data-role="panel"]', group);
        var idx = tabs.indexOf(n);
        tabs.forEach(function (t, i) { t.setAttribute('aria-selected', String(i === idx)); });
        if (panels.length === tabs.length) panels.forEach(function (p, i) { p.hidden = i !== idx; });
      }
      return;
    }`);
  }
  if (f.has('accordion')) {
    out.push(`    if ((n = hit(e, '[data-role="accordion-header"]'))) {
      var item = n.parentNode;
      var open = false;
      all('[data-role="accordion-content"]', item).forEach(function (c) { c.hidden = !c.hidden; open = !c.hidden; });
      n.setAttribute('aria-expanded', String(open));
      return;
    }`);
  }
  if (f.has('dropdown')) {
    out.push(`    if ((n = hit(e, '[data-role="dropdown-trigger"]'))) {
      var dd = n.closest('[data-component="dropdown"]');
      var menu = dd && dd.querySelector('[data-role="dropdown-menu"]');
      if (menu) { menu.hidden = !menu.hidden; n.setAttribute('aria-expanded', String(!menu.hidden)); }
      return;
    }
    all('[data-role="dropdown-menu"]').forEach(function (m) {
      if (!m.contains(e.target)) m.hidden = true;
    });`);
  }
  out.push(`  });`);

  if (f.has('form')) {
    out.push(`
  // forms never submit in exported previews
  all('form').forEach(function (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  });`);
  }
  out.push(`
  // keyboard activation for non-native buttons, Escape closes popups
  doc.addEventListener('keydown', function (e) {
    var t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t && t.getAttribute && t.getAttribute('role') === 'button') {
      e.preventDefault();
      t.click();
    }
    if (e.key === 'Escape') {
      all('.overlay').forEach(function (o) { o.hidden = true; });
      all('[data-role="dropdown-menu"]').forEach(function (m) { m.hidden = true; });
    }
  });
})();`);
  return out.join('\n');
}
