/**
 * Migration notice.
 * The site moved to https://plevantis.net/ — show a banner pointing visitors
 * to the same page on the new domain (the structure is identical, only the
 * domain differs).
 */
(function () {
  'use strict';

  var NEW_ORIGIN = 'https://plevantis.net';

  // Don't show on the new domain itself.
  if (location.hostname === 'plevantis.net') return;

  // Keep the same path + query + hash, just swap the origin.
  var newUrl = NEW_ORIGIN + location.pathname + location.search + location.hash;

  function build() {
    if (document.getElementById('migration-notice')) return;

    var bar = document.createElement('div');
    bar.id = 'migration-notice';
    bar.setAttribute('role', 'alert');
    bar.innerHTML =
      '<div class="mn-inner">' +
        '<span class="mn-text">' +
          '⚠️ Это старая версия сайта. Актуальная информация — на новом домене.' +
        '</span>' +
        '<a class="mn-btn" href="' + newUrl + '">Перейти на новый сайт →</a>' +
        '<button class="mn-close" aria-label="Закрыть" title="Закрыть">✕</button>' +
      '</div>';

    var style = document.createElement('style');
    style.textContent =
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
      'body{padding-top:52px!important}' +
      '@media(max-width:600px){body{padding-top:84px!important}}';

    document.head.appendChild(style);
    document.body.appendChild(bar);

    bar.querySelector('.mn-close').addEventListener('click', function () {
      bar.remove();
      style.textContent += 'body{padding-top:0!important}';
    });
  }

  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
