(function () {
  'use strict';

  var D = window.ORG_DATA;
  if (!D) {
    document.querySelector('main').innerHTML =
      '<p class="note">Нет данных: запустите scripts/build-data.ps1, чтобы собрать data/data.js из PRD.md.</p>';
    return;
  }

  var LIMIT = 400;
  var ARRFR = 'Согласование АРРФР';
  var LAW = 'Требование закона/регулятора';

  var $ = function (s) { return document.querySelector(s); };
  var sum = function (arr, k) { return arr.reduce(function (a, x) { return a + (x[k] || 0); }, 0); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var fmtDelta = function (d) { return d === 0 ? '—' : (d > 0 ? '+' + d : '−' + Math.abs(d)); };
  var deltaCls = function (d) { return d < 0 ? 'dn' : d > 0 ? 'up' : ''; };
  var pair = function (b, a) {
    var d = a - b;
    return '<span class="pair">' + b + ' → <b>' + a + '</b>' +
      (d ? ' <span class="' + deltaCls(d) + '">' + fmtDelta(d) + '</span>' : '') + '</span>';
  };
  var basisTag = function (b) {
    var cls = b === ARRFR ? 'arrfr' : b === LAW ? 'law' : 'best';
    return '<span class="tag tag--' + cls + '">' + esc(b) + '</span>';
  };

  var deptById = {};
  D.departments.forEach(function (d) { deptById[d.id] = d; });

  // ---------- Тема ----------
  (function () {
    var root = document.documentElement;
    try { var saved = localStorage.getItem('theme'); if (saved) root.setAttribute('data-theme', saved); } catch (e) {}
    $('#themeBtn').addEventListener('click', function () {
      var cur = root.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  })();

  // ---------- Итоги ----------
  var totB = sum(D.departments, 'base'), totA = sum(D.departments, 'auto');
  var net = D.departments.filter(function (d) { return d.isBranchNetwork; });
  var netB = sum(net, 'base'), netA = sum(net, 'auto');
  var hqDepts = D.departments.filter(function (d) { return !d.isBranchNetwork; });
  var released = D.positions.reduce(function (a, p) { return a + Math.max(0, p.base - p.auto); }, 0);
  var newRoles = D.positions.filter(function (p) { return p.base === 0 && p.auto > 0; });
  var newRoleCount = sum(newRoles, 'auto');
  var arrfrCount = sum(D.positions.filter(function (p) { return p.basis === ARRFR; }), 'base');
  var pct = Math.round((totB - totA) / totB * 100);

  $('#lead').textContent = 'Штат ' + totB + ' → ' + totA + ' при автоматизации 30% процессов (−' + pct +
    '%). Высвобождено ' + released + ' рутинных ставок, резерв до лимита ' + LIMIT + ': ' + (LIMIT - totA) + '.';

  var kpis = [
    { l: 'Штат всего', b: totB, a: totA, s: 'лимит ' + LIMIT + ' · резерв ' + (LIMIT - totB) + ' → ' + (LIMIT - totA) },
    { l: 'Головной офис', b: totB - netB, a: totA - netA, s: hqDepts.length + ' подразделений' },
    { l: 'Филиальная сеть', b: netB, a: netA, s: D.branches.length + ' точек присутствия' },
    { l: 'Высвобождено ставок', v: released, s: 'бэк-офис, контакт-центр, учёт, сервис' },
    { l: 'Новые цифровые роли', v: newRoleCount, s: 'RPA, интеграции, data science, автоматизация' },
    { l: 'Согласование АРРФР', v: arrfrCount, s: 'руководящих должностей' }
  ];
  $('#kpis').innerHTML = kpis.map(function (k) {
    var val = k.v != null ? k.v : k.b + ' <small>→ ' + k.a + '</small>';
    return '<div class="kpi"><div class="kpi__label">' + k.l + '</div><div class="kpi__value">' + val +
      '</div><div class="kpi__sub">' + k.s + '</div></div>';
  }).join('');

  // ---------- Кураторы ----------
  var curators = [];
  D.departments.forEach(function (d) { if (curators.indexOf(d.curator) < 0) curators.push(d.curator); });
  $('#curators').innerHTML = curators.map(function (c) {
    var ds = D.departments.filter(function (d) { return d.curator === c; });
    return '<div class="cur"><div class="cur__head"><span>' + esc(c) + '</span>' + pair(sum(ds, 'base'), sum(ds, 'auto')) +
      '</div><ul>' + ds.map(function (d) {
        return '<li data-dept="' + d.id + '" title="Показать должности"><span>' + esc(d.name) + '</span>' + pair(d.base, d.auto) + '</li>';
      }).join('') + '</ul></div>';
  }).join('');
  $('#curators').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-dept]');
    if (!li) return;
    $('#fDept').value = li.getAttribute('data-dept');
    renderPositions();
    $('#positions').scrollIntoView();
  });

  // ---------- Блоки ----------
  var blocks = [];
  D.departments.forEach(function (d) { if (blocks.indexOf(d.block) < 0) blocks.push(d.block); });
  blocks.sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); });
  var blockData = blocks.map(function (b) {
    var ds = D.departments.filter(function (d) { return d.block === b; });
    return { name: b, base: sum(ds, 'base'), auto: sum(ds, 'auto') };
  });
  var maxBlock = Math.max.apply(null, blockData.map(function (b) { return b.base; }));
  $('#blockBars').innerHTML = blockData.map(function (b) {
    var w = function (v) { return (v / maxBlock * 85).toFixed(1) + '%'; };
    var d = b.auto - b.base;
    return '<div class="bar"><div class="bar__label">' + esc(b.name) + '</div><div class="bar__tracks">' +
      '<div class="bar__track"><span class="bar__fill" style="width:' + w(b.base) + ';background:var(--base)"></span>' + b.base + '</div>' +
      '<div class="bar__track"><span class="bar__fill" style="width:' + w(b.auto) + ';background:var(--auto)"></span>' + b.auto +
      (d ? ' <span class="pair"><span class="' + deltaCls(d) + '">' + fmtDelta(d) + '</span></span>' : '') + '</div></div></div>';
  }).join('');

  // ---------- Должности ----------
  var fDept = $('#fDept');
  D.departments.forEach(function (d) {
    var o = document.createElement('option');
    o.value = d.id; o.textContent = (d.code ? d.code + ' ' : '') + d.name + ' (' + d.base + ' → ' + d.auto + ')';
    fDept.appendChild(o);
  });

  function renderPositions() {
    var dept = fDept.value, q = $('#fSearch').value.trim().toLowerCase();
    var onlyChanged = $('#fChanged').checked, onlyReg = $('#fReg').checked;
    var rows = D.positions.filter(function (p) {
      if (dept && p.deptId !== dept) return false;
      if (onlyChanged && p.base === p.auto) return false;
      if (onlyReg && p.basis !== ARRFR && p.basis !== LAW) return false;
      if (q && (p.title + ' ' + p.comment).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    $('#posTable tbody').innerHTML = rows.map(function (p) {
      var d = p.auto - p.base;
      return '<tr' + (p.base === 0 ? ' class="is-new"' : '') + '><td>' + esc(p.title) + '</td><td>' + esc(deptById[p.deptId].name) +
        '</td><td class="num">' + p.base + '</td><td class="num">' + p.auto + '</td><td class="num ' + deltaCls(d) + '">' + fmtDelta(d) +
        '</td><td>' + basisTag(p.basis) + '</td><td>' + esc(p.comment) + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="muted">Нет должностей по выбранным фильтрам</td></tr>';
    var b = sum(rows, 'base'), a = sum(rows, 'auto');
    $('#posSummary').textContent = 'Показано должностей: ' + rows.length + ' · ставок ' + b + ' → ' + a + ' (' + fmtDelta(a - b) + ')';
  }
  ['#fDept', '#fChanged', '#fReg'].forEach(function (s) { $(s).addEventListener('change', renderPositions); });
  $('#fSearch').addEventListener('input', renderPositions);
  renderPositions();

  // ---------- Подразделения ----------
  $('#unitTable tbody').innerHTML = D.departments.map(function (d) {
    return '<tr><td><b>' + esc(d.name) + '</b><br><span class="muted">' + esc(d.block) + '</span></td><td>' + esc(d.curator) +
      '</td><td class="num">' + pair(d.base, d.auto) + '</td><td>' + esc(d.practice) + '</td><td>' + esc(d.legal) + '</td></tr>';
  }).join('');

  // ---------- Филиалы ----------
  var roles = [
    { k: 'director', l: 'Директор', c: 'var(--r1)' },
    { k: 'agentLeads', l: 'Рук. агентских групп', c: 'var(--r2)' },
    { k: 'bankCorp', l: 'Банки и корп. клиенты', c: 'var(--r3)' },
    { k: 'annuity', l: 'Аннуитеты', c: 'var(--r4)' },
    { k: 'service', l: 'Клиентский сервис', c: 'var(--r5)' }
  ];
  var roleVal = function (b, k, sc) {
    if (k === 'annuity') return sc === 'auto' ? b.annuityAuto : b.annuityBase;
    if (k === 'service') return sc === 'auto' ? b.serviceAuto : b.serviceBase;
    return b[k];
  };
  $('#roleLegend').innerHTML = roles.map(function (r) {
    return '<span><span class="sw" style="background:' + r.c + '"></span>' + r.l + '</span>';
  }).join('');
  var maxBranch = Math.max.apply(null, D.branches.map(function (b) { return b.totalBase; }));

  function renderBranches(sc) {
    $('#branchBars').innerHTML = D.branches.map(function (b) {
      var total = sc === 'auto' ? b.totalAuto : b.totalBase;
      var segs = roles.map(function (r) {
        var v = roleVal(b, r.k, sc);
        return v ? '<span style="width:' + (v / maxBranch * 100) + '%;background:' + r.c + '" title="' + r.l + ': ' + v + '"></span>' : '';
      }).join('');
      return '<div class="stack__row"><span>' + esc(b.city) + '</span><div class="stack__bar">' + segs +
        '</div><span class="stack__total">' + total + '</span></div>';
    }).join('');
  }
  var cell = function (b, a) { return b === a ? String(b) : b + ' → <b>' + a + '</b>'; };
  $('#branchTable tbody').innerHTML = D.branches.map(function (b) {
    return '<tr><td>' + esc(b.city) + '</td><td>' + esc(b.region) + '</td><td>' + esc(b.type) + '</td><td class="num">' + b.director +
      '</td><td class="num">' + b.agentLeads + '</td><td class="num">' + b.bankCorp + '</td><td class="num">' + cell(b.annuityBase, b.annuityAuto) +
      '</td><td class="num">' + cell(b.serviceBase, b.serviceAuto) + '</td><td class="num">' + cell(b.totalBase, b.totalAuto) + '</td></tr>';
  }).join('');
  var bs = function (k) { return sum(D.branches, k); };
  $('#branchTable tfoot').innerHTML = '<tr><td colspan="3">Итого</td><td class="num">' + bs('director') + '</td><td class="num">' +
    bs('agentLeads') + '</td><td class="num">' + bs('bankCorp') + '</td><td class="num">' + cell(bs('annuityBase'), bs('annuityAuto')) +
    '</td><td class="num">' + cell(bs('serviceBase'), bs('serviceAuto')) + '</td><td class="num">' + cell(bs('totalBase'), bs('totalAuto')) + '</td></tr>';

  // ---------- Практики ----------
  function renderPractices(scope) {
    $('#practiceCards').innerHTML = D.practices.filter(function (p) { return !scope || p.scope === scope; }).map(function (p) {
      return '<div class="card"><div class="card__meta"><span>' + esc(p.area) + '</span><span>' + (p.scope === 'kz' ? 'Казахстан' : 'Мир') +
        '</span></div><h3>' + esc(p.title) + '</h3><p>' + esc(p.description) + '</p><div class="card__effect">' + esc(p.effect) + '</div></div>';
    }).join('');
  }

  // ---------- Переключатели ----------
  function segmented(sel, onChange) {
    var el = $(sel);
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      el.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b === btn); });
      onChange(btn.getAttribute('data-v'));
    });
  }
  segmented('#branchScenario', renderBranches);
  segmented('#practiceScope', renderPractices);
  renderBranches('base');
  renderPractices('');

  // ---------- Законодательство ----------
  $('#lawTable tbody').innerHTML = D.requirements.map(function (r) {
    return '<tr><td><b>' + esc(r.area) + '</b></td><td>' + esc(r.act) + '</td><td>' + esc(r.units) + '</td><td>' + esc(r.what) + '</td></tr>';
  }).join('');
})();
