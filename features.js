/* =============================================================
   features.js  —  BillPro New Features
   1. Barcode generator (scannable CODE128 + print)
   2. Daily Sales Report
   3. Monthly Sales + Attendance Report
   4. Patched loadStock — adds Barcode button to every row
   5. Patched showReportTab — adds Daily Sales and Monthly tabs
   Load order: billing_app.js → features.js → sidebar_panel.js
   ============================================================= */
'use strict';

/* ─────────────────────────────────────────────────────────────
   1.  BARCODE GENERATOR
   ───────────────────────────────────────────────────────────── */

var _bcCode  = '';
var _bcName  = '';
var _bcPrice = '';

function showBarcode(code, name, price) {
  _bcCode  = code;
  _bcName  = name;
  _bcPrice = price;

  document.getElementById('bcName').textContent        = name;
  document.getElementById('bcInfo').textContent        = 'Price: ₹' + parseFloat(price).toFixed(2) + '   |   Code: ' + code;
  document.getElementById('bcCodeDisplay').textContent = code;

  try {
    JsBarcode('#barcodesvg', code, {
      format:       'CODE128',
      width:        3,
      height:       90,
      displayValue: true,
      fontSize:     20,
      margin:       10,
      background:   '#ffffff',
      lineColor:    '#000000'
    });
  } catch (e) {
    document.getElementById('barcodesvg').innerHTML =
      '<text x="10" y="40" fill="red" font-size="14">Error: ' + e.message + '</text>';
  }

  document.getElementById('barcodeOverlay').classList.remove('hidden');
}

function closeBarcodeModal() {
  document.getElementById('barcodeOverlay').classList.add('hidden');
}

function printBarcode() {
  var svgEl   = document.getElementById('barcodesvg');
  var svgHTML = svgEl ? svgEl.outerHTML : '';
  var w = window.open('', '_blank', 'width=420,height=320');
  w.document.write(
    '<!DOCTYPE html><html><head><title>Barcode - ' + _bcCode + '</title>' +
    '<style>' +
    'body{font-family:Arial,sans-serif;text-align:center;padding:28px;margin:0;}' +
    'h2{margin:0 0 4px;font-size:18px;}' +
    'p{margin:0 0 16px;color:#555;font-size:13px;}' +
    '.code{font-size:24px;font-weight:700;letter-spacing:8px;margin-top:8px;}' +
    '@media print{body{padding:10px;}}' +
    '</style></head><body>' +
    '<h2>' + _bcName + '</h2>' +
    '<p>Price: &#8377;' + parseFloat(_bcPrice).toFixed(2) + '</p>' +
    svgHTML +
    '<div class="code">' + _bcCode + '</div>' +
    '<script>window.onload=function(){window.print();};<\/script>' +
    '</body></html>'
  );
  w.document.close();
}

/* ─────────────────────────────────────────────────────────────
   2.  PATCH loadStock — adds Barcode column to every product row
       Replaces the original loadStock from billing_app.js
   ───────────────────────────────────────────────────────────── */
function loadStock() {
  var tb = document.getElementById('stockTbody');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="7" class="empty-td">Loading...</td></tr>';

  /* api() is defined in billing_app.js */
  api('GET', '/api/products').then(function (prods) {
    /* Keep productCache in sync (used by bill lookup) */
    if (typeof productCache !== 'undefined') {
      productCache = {};
      prods.forEach(function (p) { productCache[p.code] = p; });
    }

    if (!prods.length) {
      tb.innerHTML = '<tr><td colspan="7" class="empty-td">No products yet</td></tr>';
      return;
    }

    tb.innerHTML = prods.map(function (p) {
      var codeEsc  = p.code.replace(/'/g, "\\'");
      var nameEsc  = (p.name || '').replace(/'/g, "\\'");
      var priceVal = parseFloat(p.price || 0).toFixed(2);
      return '<tr>' +
        '<td><span class="code-pill">' + escHtml(p.code) + '</span></td>' +
        '<td><strong>' + escHtml(p.name) + '</strong></td>' +
        '<td>' + money(p.price) + '</td>' +
        '<td><strong>' + p.stock + '</strong></td>' +
        '<td>' + money(p.price * p.stock) + '</td>' +
        '<td><button class="btn btn-outline btn-sm" ' +
          'onclick="showBarcode(\'' + codeEsc + '\',\'' + nameEsc + '\',\'' + priceVal + '\')">' +
          '🔲 Barcode</button></td>' +
        '<td><button class="del-btn" onclick="deleteProduct(\'' + codeEsc + '\')">Delete</button></td>' +
        '</tr>';
    }).join('');

  }).catch(function (e) {
    tb.innerHTML = '<tr><td colspan="7" class="empty-td">✘ ' + escHtml(e.message) + '</td></tr>';
  });
}

/* ─────────────────────────────────────────────────────────────
   3.  DAILY SALES REPORT
   ───────────────────────────────────────────────────────────── */
function loadDailySales() {
  var dt = document.getElementById('dsDate').value;
  if (!dt) { if (typeof toast === 'function') toast('Please select a date', 'err'); return; }

  var loading = '<tr><td colspan="6" class="empty-td">⏳ Loading…</td></tr>';
  document.getElementById('dsBillsTb').innerHTML = loading;
  document.getElementById('dsProdTb').innerHTML  = '<tr><td colspan="3" class="empty-td">⏳</td></tr>';
  ['dsSales','dsBills','dsCusts'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.textContent = '…';
  });

  fetch('/api/reports/daily-sales?date=' + encodeURIComponent(dt), { credentials: 'include' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      /* Summary cards */
      var s = d.summary || {};
      var setEl = function(id, v){ var el=document.getElementById(id); if(el) el.textContent=v; };
      setEl('dsSales', money(s.total_sales  || 0));
      setEl('dsBills', s.total_bills        || 0);
      setEl('dsCusts', s.unique_customers   || 0);

      /* Bills table */
      var bills = d.bills || [];
      document.getElementById('dsBillsTb').innerHTML = bills.length
        ? bills.map(function (b) {
            return '<tr>' +
              '<td><strong>#' + String(b.id).padStart(3, '0') + '</strong></td>' +
              '<td>' + escHtml(b.customer_name) + '</td>' +
              '<td>' + escHtml(b.customer_phone) + '</td>' +
              '<td>' + (b.worker_number ? escHtml(b.worker_number) + ' ' + escHtml(b.worker_name || '') : '—') + '</td>' +
              '<td>' + (b.item_count || 0) + ' items / ' + (b.total_pieces || 0) + ' pcs</td>' +
              '<td><strong>' + money(b.total_amount) + '</strong></td>' +
              '</tr>';
          }).join('')
        : '<tr><td colspan="6" class="empty-td">No bills on this date</td></tr>';

      /* Products table */
      var prods = d.top_products || [];
      document.getElementById('dsProdTb').innerHTML = prods.length
        ? prods.map(function (p) {
            return '<tr><td>' + escHtml(p.product_name) + '</td><td>' + p.units + '</td><td>' + money(p.revenue) + '</td></tr>';
          }).join('')
        : '<tr><td colspan="3" class="empty-td">No products sold</td></tr>';
    })
    .catch(function () {
      document.getElementById('dsBillsTb').innerHTML =
        '<tr><td colspan="6" class="empty-td" style="color:red;">⚠ Failed to load. Check backend connection.</td></tr>';
    });
}

/* ─────────────────────────────────────────────────────────────
   4.  MONTHLY SALES + ATTENDANCE REPORT
       Called loadMonthlyFull() to avoid conflict with original
   ───────────────────────────────────────────────────────────── */
function loadMonthlyFull() {
  var year  = document.getElementById('monYear').value  || new Date().getFullYear();
  var month = document.getElementById('monMonth').value || (new Date().getMonth() + 1);

  var loading7 = '<tr><td colspan="7" class="empty-td">⏳ Loading…</td></tr>';
  var loading4 = '<tr><td colspan="4" class="empty-td">⏳ Loading…</td></tr>';
  var loading3 = '<tr><td colspan="3" class="empty-td">⏳ Loading…</td></tr>';
  document.getElementById('monDailyTb').innerHTML  = loading3;
  document.getElementById('monProdTb').innerHTML   = loading3;
  document.getElementById('monWorkerTb').innerHTML = loading4;
  document.getElementById('monTbody').innerHTML    = loading7;
  ['monSales','monBillsCt','monCusts'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.textContent='…';
  });

  fetch('/api/reports/monthly-sales?year=' + year + '&month=' + month, { credentials: 'include' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) {
        if (typeof toast === 'function') toast(d.error, 'err');
        return;
      }
      var setEl = function(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; };
      var s = d.summary || {};
      setEl('monSales',   money(s.total_sales     || 0));
      setEl('monBillsCt', s.total_bills           || 0);
      setEl('monCusts',   s.unique_customers      || 0);

      /* Daily breakdown */
      var daily = d.daily_breakdown || [];
      document.getElementById('monDailyTb').innerHTML = daily.length
        ? daily.map(function (r) {
            return '<tr><td>' + fmtDate(r.sale_date) + '</td><td>' + r.bills + '</td><td>' + money(r.sales) + '</td></tr>';
          }).join('')
        : '<tr><td colspan="3" class="empty-td">No sales this month</td></tr>';

      /* Top products */
      var prods = d.top_products || [];
      document.getElementById('monProdTb').innerHTML = prods.length
        ? prods.map(function (p) {
            return '<tr><td>' + escHtml(p.product_name) + '</td><td>' + p.units + '</td><td>' + money(p.revenue) + '</td></tr>';
          }).join('')
        : '<tr><td colspan="3" class="empty-td">—</td></tr>';

      /* Worker sales */
      var workers = d.worker_sales || [];
      document.getElementById('monWorkerTb').innerHTML = workers.length
        ? workers.map(function (w) {
            return '<tr><td>' + escHtml(w.worker_number) + '</td><td>' + escHtml(w.worker_name) +
                   '</td><td>' + w.bills + '</td><td>' + money(w.sales) + '</td></tr>';
          }).join('')
        : '<tr><td colspan="4" class="empty-td">No worker sales data</td></tr>';

      /* Attendance */
      var att = d.attendance || [];
      document.getElementById('monTbody').innerHTML = att.length
        ? att.map(function (r) {
            return '<tr>' +
              '<td><span class="code-pill">' + escHtml(r.number) + '</span></td>' +
              '<td><strong>' + escHtml(r.name) + '</strong></td>' +
              '<td>' + r.present + '</td><td>' + r.half + '</td>' +
              '<td>' + r.leave + '</td><td>' + r.absent + '</td>' +
              '<td><strong style="color:var(--primary)">' + r.total_present + '</strong></td>' +
              '</tr>';
          }).join('')
        : '<tr><td colspan="7" class="empty-td">No attendance data</td></tr>';
    })
    .catch(function () {
      if (typeof toast === 'function') toast('Failed to load monthly report. Make sure you are logged in.', 'err');
    });
}

/* ─────────────────────────────────────────────────────────────
   5.  PATCH showReportTab — handles new tabs cleanly
   ───────────────────────────────────────────────────────────── */
var _origShowReportTab = null;

window.addEventListener('load', function () {
  /* Grab original after billing_app.js has loaded */
  if (typeof showReportTab === 'function') {
    _origShowReportTab = showReportTab;
  }

  /* Override */
  window.showReportTab = function (tab) {
    /* Switch tab UI */
    document.querySelectorAll('.rtab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.report-subpage').forEach(function (p) { p.classList.remove('active'); });
    var btn = document.getElementById('rtab-' + tab);
    var pg  = document.getElementById('rpage-' + tab);
    if (btn) btn.classList.add('active');
    if (pg)  pg.classList.add('active');

    if (tab === 'sales') {
      if (typeof loadReports === 'function') loadReports();
    } else if (tab === 'daily') {
      /* Set today as default and load */
      var el = document.getElementById('dsDate');
      if (el && !el.value) el.value = todayISO();
      loadDailySales();
    } else if (tab === 'monthly') {
      /* Check login then show gate or body */
      var gate = document.getElementById('monLoginGate');
      var body = document.getElementById('monBody');
      if (typeof refreshAuth === 'function') {
        refreshAuth().then(function () {
          if (typeof AUTH !== 'undefined' && AUTH.logged_in) {
            if (gate) gate.classList.add('hidden');
            if (body) body.classList.remove('hidden');
            var n = new Date();
            var yr = document.getElementById('monYear');
            var mo = document.getElementById('monMonth');
            if (yr && !yr.value) yr.value = n.getFullYear();
            if (mo && !mo.value) mo.value = n.getMonth() + 1;
            loadMonthlyFull();
          } else {
            if (gate) gate.classList.remove('hidden');
            if (body) body.classList.add('hidden');
          }
        });
      } else {
        if (gate) gate.classList.remove('hidden');
      }
    }
  };

  /* Set default date for daily sales */
  var dsEl = document.getElementById('dsDate');
  if (dsEl && !dsEl.value) dsEl.value = todayISO();
});

/* ─────────────────────────────────────────────────────────────
   6.  HELPERS  (safe fallbacks in case billing_app.js differs)
   ───────────────────────────────────────────────────────────── */
function money(n) {
  return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch (e) { return s; }
}
function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}
function todayISO() {
  var d = new Date(), z = function(n){ return n < 10 ? '0' + n : n; };
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}
