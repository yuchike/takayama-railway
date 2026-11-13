// 高山鐡道 メンバー認証画面。処理はすべてBotのサーバー(Render)が行い、この画面は表示だけを担当する。
(function () {
  'use strict';
  var API = window.TAKATETSU_API;
  var root = document.getElementById('verify-root');
  var token = new URLSearchParams(location.search).get('t') || '';
  var busy = false;
  var captchaWidget = null;
  var captchaLoading = false;

  // 認証用のリンクはアドレスバーから見えないようにしておく(画面共有やスクショで漏れないように)。
  // 再読み込みしても続けられるよう、このタブの中だけに覚えておく
  try {
    if (token) sessionStorage.setItem('takatetsu-verify-token', token);
    else token = sessionStorage.getItem('takatetsu-verify-token') || '';
  } catch (e) { /* 保存できなくても続行 */ }
  if (location.search && history.replaceState) history.replaceState(null, '', location.pathname);

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function show() {
    root.innerHTML = '';
    // 部品のまとまり(配列)も、そのまま並べられるようにする
    (function add(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c) continue;
        if (Array.isArray(c)) add(c);
        else root.appendChild(c);
      }
    })(arguments);
  }

  function loading(text, sub) {
    show(h('div', { class: 'center' }, h('div', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { text: text }), sub ? h('p', { class: 'muted small', text: sub }) : null));
  }

  function request(method, path, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 75000);
    return fetch(API + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined,
      credentials: 'omit'
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return { step: 'error' }; });
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function act(action, extra) {
    if (busy) return;
    busy = true;
    Array.prototype.forEach.call(root.querySelectorAll('button, input'), function (b) { b.disabled = true; });
    var body = { t: token, action: action };
    if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    request('POST', '/api/verify/action', body).then(function (state) {
      busy = false;
      render(state);
    }, function () {
      busy = false;
      renderNetworkError();
    });
  }

  function stepsBar(current) {
    var labels = ['ロボット確認', 'Roblox確認', 'グループ確認', '利用規約'];
    return h('ol', { class: 'steps' }, labels.map(function (l, idx) {
      var n = idx + 1;
      return h('li', { class: n < current ? 'done' : n === current ? 'now' : '' }, l);
    }));
  }

  function flashBox(state) {
    if (!state.flash) return null;
    return h('p', { class: 'flash ' + (state.flash.type === 'error' ? 'error' : 'ok'), role: state.flash.type === 'error' ? 'alert' : 'status', text: state.flash.text });
  }

  function who(state) {
    return h('p', { class: 'verify-who' }, 'Discord: ', h('b', { text: state.discordName || '' }));
  }

  function helpBox(state) {
    if (!state.canAskHelp || state.step === 'done') return null;
    return h('div', { class: 'help-box' },
      h('p', { text: state.supportChannelName
        ? '相談用チャンネル「' + state.supportChannelName + '」がDiscordにあります。そちらで運営に状況を伝えてください。'
        : 'うまくいかないときは、運営に相談できます。あなたと社長だけが見られるチャンネルをDiscordに作ります。' }),
      h('button', { class: 'button ghost', type: 'button', onclick: function () { act('help'); } }, '運営に相談する'));
  }

  function primary(label, onclick) { return h('button', { class: 'button', type: 'button', onclick: onclick }, label); }
  function secondary(label, onclick) { return h('button', { class: 'button ghost', type: 'button', onclick: onclick }, label); }

  function loadCaptcha(siteKey, holder) {
    function draw() {
      try { captchaWidget = window.grecaptcha.render(holder, { sitekey: siteKey }); } catch (e) { captchaWidget = null; }
    }
    if (window.grecaptcha && window.grecaptcha.render) return draw();
    window.__takatetsuCaptcha = draw;
    if (captchaLoading) return;
    captchaLoading = true;
    var s = document.createElement('script');
    s.src = 'https://www.google.com/recaptcha/api.js?onload=__takatetsuCaptcha&render=explicit&hl=ja';
    s.async = true;
    document.head.appendChild(s);
  }

  function render(state) {
    if (!state || !state.step || state.step === 'error') return renderNetworkError();
    if (state.step === 'expired' || state.step === 'not_found') return renderExpired();

    if (state.step === 'done') {
      return show(stepsBar(5), h('div', { class: 'center' },
        h('div', { class: 'done-mark', 'aria-hidden': 'true' }, '✓'),
        h('h1', { text: '認証が完了しました' }),
        h('p', null, 'Robloxアカウント ', h('b', { text: state.robloxName || '' }), ' で認証し、メンバーロールを付けました。'),
        h('p', { class: 'muted', text: 'このページを閉じて、Discordに戻ってください。ようこそ、高山鐡道へ！' })));
    }

    if (state.step === 'captcha') {
      var holder = h('div', { class: 'g-recaptcha' });
      show(stepsBar(1), who(state), h('h1', { text: 'ロボットでないことの確認' }), flashBox(state),
        h('p', { text: '下のチェックを入れてから「次へ」を押してください。' }), holder,
        primary('次へ', function () {
          var resp = (window.grecaptcha && captchaWidget !== null) ? window.grecaptcha.getResponse(captchaWidget) : '';
          act('captcha', { 'g-recaptcha-response': resp });
        }), helpBox(state));
      if (state.captchaSiteKey) loadCaptcha(state.captchaSiteKey, holder);
      return;
    }

    if (state.step === 'reuse') {
      return show(stepsBar(2), who(state), h('h1', { text: 'おかえりなさい' }), flashBox(state),
        h('p', null, '前回は Robloxアカウント ', h('b', { text: state.previousRobloxName || '' }), ' で認証しています。同じアカウントで続けますか？'),
        primary((state.previousRobloxName || '') + ' で続ける', function () { act('reuse'); }),
        secondary('別のアカウントで認証する', function () { act('other-account'); }), helpBox(state));
    }

    if (state.step === 'code') {
      var codeEl = h('div', { class: 'code-box', text: state.code || '' });
      var copyBtn = secondary('コピーする', function () {
        if (navigator.clipboard) navigator.clipboard.writeText(state.code || '').then(function () { copyBtn.textContent = 'コピーしました'; });
      });
      return show(stepsBar(2), who(state), h('h1', { text: '確認コードを貼ってください' }), flashBox(state),
        h('p', null, 'Robloxアカウント ', h('b', { text: state.codeRobloxName || '' }), ' のプロフィールの', h('b', { text: '自己紹介' }), 'に、次の言葉をそのまま貼って保存してください。'),
        codeEl, copyBtn,
        h('ol', null,
          h('li', null, h('a', { href: state.codeProfileUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, '自分のプロフィール'), 'を開く'),
          h('li', { text: '自己紹介の編集で上の言葉を貼り付けて保存する' }),
          h('li', { text: 'この画面に戻って「確認する」を押す' })),
        primary('確認する', function () { act('code/check'); }),
        secondary('ユーザー名を入れ直す', function () { act('code/cancel'); }),
        h('p', { class: 'muted small', text: '認証が終わったら、自己紹介から消してかまいません。' }), helpBox(state));
    }

    if (state.step === 'identity') {
      var input = h('input', { type: 'text', id: 'username', maxlength: '20', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: '例: Takayama_Driver' });
      var submit = function () { act('code/start', { username: input.value.trim() }); };
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      var methods = [];
      if (state.gameEnabled) {
        methods.push(h('div', { class: 'method' },
          h('h2', { text: '🎮 ゲーム内で認証' }),
          h('p', { class: 'muted small', text: '高山鐡道のゲームに入って、ここに出る6桁の数字を入力します。いちばん簡単です。' }),
          primary('ゲーム内で認証する', function () { act('game/start'); })));
      }
      if (state.oauthUrl) {
        methods.push(h('div', { class: 'method' },
          h('h2', { text: '🔑 Robloxでログイン' }),
          h('p', { class: 'muted small', text: 'Roblox公式のログイン画面で確認します。' }),
          h('a', { class: 'button', href: state.oauthUrl }, 'Robloxでログインして確認')));
      }
      methods.push(h('div', { class: 'method' },
        h('h2', { text: '📝 プロフィールに確認コードを貼る' }),
        h('label', { for: 'username', text: 'Robloxのユーザー名(@の後ろの部分。表示名ではありません)' }), input,
        methods.length ? secondary('確認コードを出す', submit) : primary('確認コードを出す', submit)));
      show(stepsBar(2), who(state), h('h1', { text: 'Robloxアカウントの確認' }), flashBox(state),
        h('p', { class: 'muted', text: 'やりやすい方法をひとつ選んでください。' }), methods, helpBox(state));
      return;
    }

    if (state.step === 'game') {
      var poll = setInterval(function () {
        if (busy || !document.body.contains(codeBig)) return clearInterval(poll);
        request('GET', '/api/verify/state?t=' + encodeURIComponent(token)).then(function (st) {
          if (st && st.step !== 'game') { clearInterval(poll); render(st); }
        }, function () { /* 次の確認で再試行 */ });
      }, 4000);
      var codeBig = h('div', { class: 'game-code', 'aria-label': '入力する数字' }, (state.gameCode || '').split('').map(function (d) { return h('span', { text: d }); }));
      return show(stepsBar(2), who(state), h('h1', { text: 'ゲーム内で認証' }), flashBox(state),
        h('p', { text: '高山鐡道のゲームに入って、画面の「Discord認証」ボタンから次の数字を入力してください。' }),
        codeBig,
        h('a', { class: 'button lime', href: state.gameUrl, target: '_blank', rel: 'noopener noreferrer' }, 'ゲームを開く'),
        h('ol', null,
          h('li', { text: '上のボタンからゲームに入る' }),
          h('li', { text: '画面の「Discord認証」ボタンを押す' }),
          h('li', { text: 'この6桁の数字を入力して「送信」を押す' })),
        h('p', { class: 'center muted small' }, h('span', { class: 'spinner small-spinner', 'aria-hidden': 'true' }), 'ゲームでの入力を待っています…(入力すると自動で次に進みます)'),
        secondary('別の方法にする', function () { clearInterval(poll); act('game/cancel'); }), helpBox(state));
    }

    if (state.step === 'group') {
      return show(stepsBar(3), who(state), h('h1', { text: 'グループへの参加' }), flashBox(state),
        h('p', null, 'Robloxアカウント ', h('b', { text: state.robloxName || '' }), ' は、まだ高山鐡道のRobloxグループに参加していません。'),
        h('a', { class: 'button lime', href: state.groupUrl, target: '_blank', rel: 'noopener noreferrer' }, 'グループを開いて参加する'),
        secondary('参加したので、もう一度確認する', function () { act('group/check'); }), helpBox(state));
    }

    if (state.step === 'rules') {
      var agree = h('input', { type: 'checkbox', id: 'agree' });
      return show(stepsBar(4), who(state), h('h1', { text: '利用規約' }), flashBox(state),
        h('p', null, 'Roblox: ', h('b', { text: state.robloxName || '' }), '(グループのランク: ', state.groupRoleName || '—', ')'),
        h('p', { text: '高山鐡道のDiscordサーバーを利用するにあたり、次の規約を守ってください。' }),
        h('ol', { class: 'rules' }, (state.rules || []).map(function (r) { return h('li', { text: r }); })),
        h('p', { class: 'penalty', text: '⚠️ ' + (state.penalty || '') }),
        h('label', { class: 'check', for: 'agree' }, agree, '上の利用規約を読み、同意します'),
        primary('同意して認証を完了する', function () { act('agree', { agree: agree.checked }); }), helpBox(state));
    }

    return renderNetworkError();
  }

  function renderExpired() {
    show(h('h1', { text: '⏳ リンクの期限が切れています' }),
      h('p', { text: '認証リンクは15分で無効になります。Discordの認証チャンネルで「認証する」ボタンをもう一度押して、新しいリンクを開いてください。' }));
  }

  function renderNetworkError() {
    show(h('h1', { text: '⚠️ 接続できませんでした' }),
      h('p', { text: 'Botのサーバーにつながりませんでした。少し待ってから、もう一度読み込んでください。' }),
      primary('もう一度読み込む', start));
  }

  function start() {
    if (!token) return renderExpired();
    loading('読み込んでいます…');
    var slow = setTimeout(function () {
      loading('サーバーを起こしています…', 'しばらく使われていないと、起動に最大1分ほどかかります。このままお待ちください。');
    }, 3000);
    request('GET', '/api/verify/state?t=' + encodeURIComponent(token)).then(function (state) {
      clearTimeout(slow);
      render(state);
    }, function () {
      clearTimeout(slow);
      renderNetworkError();
    });
  }

  start();
})();
