/**
 * Migration gate.
 *
 * The site moved to https://plevantis.net/ (identical structure, only the
 * domain differs).
 *
 *  - TL role            -> keep access to this old site, show a dismissible
 *                          "old version" banner with a link to the new site.
 *  - Any other role     -> no access: show a "site moved" screen with a link
 *    (support/operator/    to the same page on the new domain and redirect there.
 *     supervisor/ops)
 *  - Not signed in      -> show the info banner with a link (so a TL can still
 *                          reach the login page and sign in).
 */
(function () {
  'use strict';

  var NEW_ORIGIN = 'https://plevantis.net';
  var REDIRECT_DELAY_MS = 2500;

  // Don't run on the new domain itself.
  if (location.hostname === 'plevantis.net') return;

  // Keep the same path + query + hash, just swap the origin.
  var newUrl = NEW_ORIGIN + location.pathname + location.search + location.hash;

  function injectStyles() {
    if (document.getElementById('migration-style')) return;
    var style = document.createElement('style');
    style.id = 'migration-style';
    style.textContent =
      // ── top info banner (TL / signed-out) ──
      '#migration-notice{position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'background:linear-gradient(90deg,#f59e42,#f5b942);color:#0a0c10;' +
      "font-family:'Mulish',system-ui,sans-serif;font-size:14px;font-weight:600;" +
      'box-shadow:0 2px 16px rgba(0,0,0,0.4);animation:mnDrop .35s ease}' +
      '@keyframes mnDrop{from{transform:translateY(-100%)}to{transform:translateY(0)}}' +
      '#migration-notice .mn-inner{max-width:1100px;margin:0 auto;padding:10px 16px;' +
      'display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center}' +
      '#migration-notice .mn-text{flex:1 1 auto;min-width:200px}' +
      '#migration-notice .mn-btn{flex:0 0 auto;background:#0a0c10;color:#fff;' +
      'text-decoration:none;padding:7px 16px;border-radius:8px;white-space:nowrap;' +
      'transition:opacity .2s}' +
      '#migration-notice .mn-btn:hover{opacity:.85}' +
      '#migration-notice .mn-close{flex:0 0 auto;background:transparent;border:none;' +
      'color:#0a0c10;font-size:16px;cursor:pointer;padding:4px 8px;line-height:1;' +
      'border-radius:6px}' +
      '#migration-notice .mn-close:hover{background:rgba(0,0,0,0.12)}' +
      'body.mn-has-banner{padding-top:52px!important}' +
      '@media(max-width:600px){body.mn-has-banner{padding-top:84px!important}}' +
      // ── full-screen "moved" gate (non-TL roles) ──
      '#migration-gate{position:fixed;inset:0;z-index:2147483647;background:#0a0c10;' +
      "color:#e8eaf0;font-family:'Mulish',system-ui,sans-serif;display:flex;" +
      'align-items:center;justify-content:center;padding:24px;text-align:center}' +
      '#migration-gate .mg-card{max-width:440px}' +
      '#migration-gate .mg-icon{font-size:40px;margin-bottom:18px}' +
      '#migration-gate h1{font-size:22px;font-weight:700;color:#fff;margin:0 0 12px}' +
      '#migration-gate p{font-size:15px;line-height:1.6;color:#9ca3b0;margin:0 0 26px}' +
      '#migration-gate a.mg-btn{display:inline-block;background:linear-gradient(135deg,#4f8ef7,#3a7bd5);' +
      'color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;' +
      'font-weight:700;font-size:14px;box-shadow:0 4px 20px rgba(79,142,247,0.3)}' +
      '#migration-gate a.mg-btn:hover{opacity:.9}' +
      '#migration-gate .mg-sub{margin-top:18px;font-size:13px;color:#6b7280}';
    document.head.appendChild(style);
  }

  function showBanner() {
    if (document.getElementById('migration-notice')) return;
    injectStyles();

    var bar = document.createElement('div');
    bar.id = 'migration-notice';
    bar.setAttribute('role', 'alert');
    bar.innerHTML =
      '<div class="mn-inner">' +
        '<span class="mn-text">⚠️ Это старая версия сайта. Актуальная информация — на новом домене.</span>' +
        '<a class="mn-btn" href="' + newUrl + '">Перейти на новый сайт →</a>' +
        '<button class="mn-close" aria-label="Закрыть" title="Закрыть">✕</button>' +
      '</div>';

    document.body.appendChild(bar);
    document.body.classList.add('mn-has-banner');

    bar.querySelector('.mn-close').addEventListener('click', function () {
      bar.remove();
      document.body.classList.remove('mn-has-banner');
    });
  }

  function showGate() {
    if (document.getElementById('migration-gate')) return;
    injectStyles();

    var gate = document.createElement('div');
    gate.id = 'migration-gate';
    gate.innerHTML =
      '<div class="mg-card">' +
        '<div class="mg-icon">🚀</div>' +
        '<h1>Сайт переехал</h1>' +
        '<p>Эта версия портала больше не используется. Вся актуальная работа теперь на новом домене.</p>' +
        '<a class="mg-btn" href="' + newUrl + '">Перейти на новый сайт →</a>' +
        '<div class="mg-sub">Перенаправляем автоматически…</div>' +
      '</div>';

    document.body.appendChild(gate);
    setTimeout(function () { location.replace(newUrl); }, REDIRECT_DELAY_MS);
  }

  function decide() {
    // Ask the backend who's signed in. Old site and new site share the same
    // /api, so the role is authoritative here.
    fetch('/api/check', { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .catch(function () { return null; })
      .then(function (data) {
        if (data && data.ok && data.role && data.role !== 'tl') {
          // Signed in as a non-TL role -> kick to the new site.
          showGate();
        } else {
          // TL or not signed in -> keep access, just inform.
          showBanner();
        }
      });
  }

  if (document.body) decide();
  else document.addEventListener('DOMContentLoaded', decide);
})();
