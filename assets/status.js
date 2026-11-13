// 運行状況ページ: Botが持っている運行予定(/roblox-shift)を読み込んで表示する
(function () {
  'use strict';
  var box = document.getElementById('shift-list');
  if (!box) return;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function message(text) {
    box.innerHTML = '';
    box.appendChild(el('p', 'muted', text));
  }

  var slow = setTimeout(function () {
    message('運行予定を読み込んでいます…(サーバーの起動に最大1分ほどかかることがあります)');
  }, 3000);

  var ctrl = window.AbortController ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 75000);

  fetch(window.TAKATETSU_API + '/roblox-shift', { signal: ctrl ? ctrl.signal : undefined, credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      clearTimeout(slow); clearTimeout(timer);
      var shifts = (data && data.shifts) || [];
      if (!shifts.length) return message('なし');
      box.innerHTML = '';
      shifts.forEach(function (s) {
        var card = el('div', 'shift');
        var when = el('div', 'when', s.start_str || '');
        when.appendChild(el('small', null, s.date_str || ''));
        card.appendChild(when);
        card.appendChild(el('div', 'title', s.title || '運行'));
        var meta = '〜' + (s.end_str || '') + '　ホスト: ' + (s.host || '—');
        if (s.memo) meta += '　' + s.memo;
        card.appendChild(el('div', 'meta', meta));
        box.appendChild(card);
      });
    })
    .catch(function () {
      clearTimeout(slow); clearTimeout(timer);
      message('運行予定を読み込めませんでした。最新の情報はDiscordサーバーをご確認ください。');
    });
})();
