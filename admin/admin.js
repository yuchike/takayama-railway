// 高山鐡道 公式サイト 管理画面
// ・パスワードでログイン → サイトの中身(data/site.json)を読み込む → フォームで直す → 「保存して公開」
// ・保存すると、botが全ページを作り直してGitHubに保存し、1〜2分で公式サイトに反映される
// ・「AIへ送信」は、社長だけが見られるDiscordチャンネルに、Claudeへ貼れる形の依頼文を届ける
(function () {
  'use strict';
  var API = window.TAKATETSU_API;
  var G = window.TakatetsuSiteGenerator;
  var app = document.getElementById('app');
  var TOKEN_KEY = 'takatetsu-admin-token';

  var S = {
    token: null, name: '', content: null, sha: null, dirty: false, tab: 'home',
    sel: { page: 0, news: 0, station: 0 }, flash: null, busy: false, status: null
  };
  try { var saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null'); if (saved && saved.expiresAt > Date.now()) { S.token = saved.token; S.name = saved.name; } } catch (e) { /* なし */ }

  var TABS = [
    ['home', '🏠', 'トップページ'], ['pages', '📄', 'ページ'], ['nav', '🧭', 'タブ(メニュー)'], ['news', '📰', 'お知らせ'],
    ['stations', '🚉', '駅'], ['images', '🖼️', '画像'], ['settings', '⚙️', 'サイト設定'], ['preview', '👁️', 'プレビュー'], ['ai', '🤖', 'AIへ送信']
  ];
  var BLOCK_LABEL = {
    heading: '見出し', subheading: '小見出し', text: '文章', note: '注意書き(小さい文字)', image: '画像', button: 'ボタン(リンク)',
    list: '箇条書き', table: '表', gallery: '写真ギャラリー', stations: '駅一覧(自動)', line: '路線(駅の並び)', shifts: '運行予定(自動)'
  };
  var BLOCK_NEW = {
    heading: function () { return { type: 'heading', text: '新しい見出し' }; },
    subheading: function () { return { type: 'subheading', text: '小見出し' }; },
    text: function () { return { type: 'text', text: '' }; },
    note: function () { return { type: 'note', text: '' }; },
    image: function () { return { type: 'image', src: '', caption: '', link: false }; },
    button: function () { return { type: 'button', label: 'くわしくはこちら', href: '' }; },
    list: function () { return { type: 'list', items: [], ordered: false }; },
    table: function () { return { type: 'table', rows: [['項目', '内容']] }; },
    gallery: function () { return { type: 'gallery', items: [] }; },
    stations: function () { return { type: 'stations' }; },
    line: function () { return { type: 'line', items: [{ name: '' }] }; },
    shifts: function () { return { type: 'shifts' }; }
  };

  // ---------- 小さな道具 ----------
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { append(el, x); });
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function siteUrl(path) { return new URL('../' + (path || ''), location.href).href; }

  function markDirty() {
    S.dirty = true;
    var f = document.getElementById('save-flag');
    if (f) { f.className = 'dirty'; f.textContent = '未保存の変更あり'; }
  }
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, S.token ? { Authorization: 'Bearer ' + S.token } : {}),
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit'
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, message: '返事を読み取れませんでした (' + res.status + ')' }; }).then(function (data) {
        if (res.status === 401 && path !== '/api/admin/login') { logout('ログインの期限が切れました。もう一度ログインしてください。'); }
        data.httpStatus = res.status;
        return data;
      });
    }, function () {
      return { ok: false, message: 'Botのサーバーにつながりませんでした。しばらく使われていないと起動に1分ほどかかるので、少し待ってからもう一度試してください。' };
    });
  }

  // ---------- 入力部品(値を書き換えたら未保存にする) ----------
  function text(obj, key, attrs) {
    return h('input', Object.assign({ type: 'text', value: obj[key] == null ? '' : obj[key], oninput: function (e) { obj[key] = e.target.value; markDirty(); } }, attrs || {}));
  }
  function area(obj, key, attrs) {
    return h('textarea', Object.assign({ value: obj[key] == null ? '' : obj[key], oninput: function (e) { obj[key] = e.target.value; markDirty(); } }, attrs || {}));
  }
  function num(obj, key, attrs) {
    return h('input', Object.assign({ type: 'number', value: obj[key] == null ? '' : obj[key], oninput: function (e) { obj[key] = Number(e.target.value) || 0; markDirty(); } }, attrs || {}));
  }
  function check(obj, key, label) {
    return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!obj[key], onchange: function (e) { obj[key] = e.target.checked; markDirty(); } }), label);
  }
  function select(obj, key, options, onChange) {
    var s = h('select', { onchange: function (e) { obj[key] = e.target.value; markDirty(); if (onChange) onChange(e.target.value); } },
      options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    s.value = obj[key] == null ? '' : obj[key];
    return s;
  }
  function linesArea(obj, key, attrs) {
    return h('textarea', Object.assign({ value: (obj[key] || []).join('\n'), oninput: function (e) { obj[key] = e.target.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); markDirty(); } }, attrs || {}));
  }
  function field(label, control, hint) {
    return h('div', { class: 'f' }, h('label', { text: label }), control, hint ? h('span', { class: 'hint', text: hint }) : null);
  }
  function btn(label, onclick, cls) { return h('button', { type: 'button', class: 'btn ' + (cls || ''), onclick: onclick }, label); }

  function move(arr, i, d) {
    var j = i + d;
    if (j < 0 || j >= arr.length) return;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    markDirty(); renderPanel();
  }

  // 並べ替え・削除・追加ができる一覧
  function listEditor(arr, renderItem, makeNew, addLabel) {
    return h('div', null,
      h('div', { class: 'sub-list' }, arr.map(function (item, i) {
        return h('div', { class: 'sub-item' },
          h('div', null, renderItem(item, i)),
          h('div', { class: 'tools' },
            btn('↑', function () { move(arr, i, -1); }, 'small'),
            btn('↓', function () { move(arr, i, 1); }, 'small'),
            btn('削除', function () { arr.splice(i, 1); markDirty(); renderPanel(); }, 'small danger')));
      })),
      makeNew ? h('div', { class: 'add-row' }, btn('＋ ' + (addLabel || '追加'), function () { arr.push(makeNew()); markDirty(); renderPanel(); })) : null);
  }

  // 画像を選ぶ(一覧から選ぶか、その場でアップロード)
  function imagePicker(obj, key, allowEmpty) {
    var images = S.content.images || [];
    var opts = (allowEmpty !== false ? [['', '(なし)']] : []).concat(images.map(function (p) { return [p, p.replace(/^assets\/img\//, '')]; }));
    if (obj[key] && images.indexOf(obj[key]) < 0) opts.push([obj[key], obj[key]]);
    var preview = h('img', { src: obj[key] ? siteUrl(obj[key]) : '', alt: '' });
    var sel = select(obj, key, opts, function (v) { preview.src = v ? siteUrl(v) : ''; });
    var fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none', onchange: function (e) {
      var f = e.target.files[0];
      if (f) uploadImage(f, function (path) { obj[key] = path; markDirty(); renderPanel(); });
    } });
    return h('div', { class: 'img-pick' }, preview, sel, fileInput, btn('アップロード', function () { fileInput.click(); }, 'small'));
  }

  function uploadImage(file, done) {
    if (file.size > 4 * 1024 * 1024) return showFlash('error', '画像は4MBまでです。');
    var reader = new FileReader();
    reader.onload = function () {
      showFlash('info', '画像をアップロードしています…');
      api('POST', '/api/admin/upload', { filename: file.name, contentType: file.type, data: String(reader.result) }).then(function (res) {
        if (!res.ok) return showFlash('error', res.message || 'アップロードできませんでした。');
        S.content.images = S.content.images || [];
        if (S.content.images.indexOf(res.path) < 0) S.content.images.unshift(res.path);
        markDirty();
        showFlash('ok', '画像をアップロードしました。使うページを「保存して公開」すると反映されます(画像が表示されるまで1〜2分かかります)。');
        if (done) done(res.path);
      });
    };
    reader.readAsDataURL(file);
  }

  function pageOptions(includeLink) {
    var opts = [['home', 'トップページ'], ['news', 'お知らせ一覧']].concat((S.content.pages || []).map(function (p) { return [p.id, p.title]; }));
    if (includeLink) opts.push(['', '外部リンク(URLを入れる)']);
    return opts;
  }

  // ---------- 部品(ブロック)の編集 ----------
  function blocksEditor(blocks) {
    var addType = { t: 'text' };
    return h('div', null,
      h('div', { class: 'blocks' }, blocks.map(function (b, i) {
        return h('div', { class: 'block' },
          h('div', { class: 'block-head' },
            h('span', { class: 'tag', text: BLOCK_LABEL[b.type] || b.type }),
            btn('↑', function () { move(blocks, i, -1); }, 'small'),
            btn('↓', function () { move(blocks, i, 1); }, 'small'),
            btn('削除', function () { blocks.splice(i, 1); markDirty(); renderPanel(); }, 'small danger')),
          blockFields(b));
      })),
      h('div', { class: 'add-row' },
        select(addType, 't', Object.keys(BLOCK_LABEL).map(function (k) { return [k, BLOCK_LABEL[k]]; })),
        btn('＋ 部品を追加', function () { blocks.push(BLOCK_NEW[addType.t]()); markDirty(); renderPanel(); }, 'lime')));
  }

  function blockFields(b) {
    switch (b.type) {
      case 'heading': case 'subheading': return text(b, 'text');
      case 'note': return text(b, 'text');
      case 'text': return field('文章', area(b, 'text', { rows: 5 }), '改行すると段落が分かれます。');
      case 'image': return [field('画像', imagePicker(b, 'src')), field('説明(画像の下に出る文字)', text(b, 'caption')), check(b, 'link', '押すと画像を大きく表示する')];
      case 'button': return h('div', { class: 'grid2' }, field('ボタンの文字', text(b, 'label')), field('リンク先', text(b, 'href', { placeholder: 'https://… または fare.html など' })));
      case 'list': return [field('項目(1行に1つ)', linesArea(b, 'items', { rows: 5 })), check(b, 'ordered', '番号付きにする(1. 2. 3.)')];
      case 'table':
        b.rows = b.rows || [];
        return listEditor(b.rows, function (row) {
          return h('div', { class: 'grid2' }, text(row, 0, { placeholder: '項目' }), area(row, 1, { rows: 1, placeholder: '内容' }));
        }, function () { return ['', '']; }, '行を追加');
      case 'gallery':
        b.items = b.items || [];
        return listEditor(b.items, function (it) {
          return [imagePicker(it, 'src', false), h('div', { class: 'grid2' }, field('説明', text(it, 'caption')), field('撮影者など', text(it, 'credit')))];
        }, function () { return { src: (S.content.images || [])[0] || '', caption: '', credit: '' }; }, '写真を追加');
      case 'line':
        b.items = b.items || [];
        return listEditor(b.items, function (it) {
          return h('div', { class: 'grid2' },
            field('駅名', text(it, 'name')), field('駅番号(任意)', text(it, 'code')),
            field('押したときの駅ページ', select(it, 'station', [['', '(なし)']].concat((S.content.stations || []).map(function (s) { return [s.slug, s.name]; })))),
            check(it, 'transfer', '乗り換え駅にする(印が変わる)'));
        }, function () { return { name: '' }; }, '駅を追加');
      case 'stations': return h('p', { class: 'muted small', text: '「駅」のタブに登録した駅が、自動でここに並びます。' });
      case 'shifts': return h('p', { class: 'muted small', text: 'Discordの /shift で登録した運行予定が、自動でここに表示されます(なければ「なし」)。' });
      default: return h('p', { class: 'muted small', text: 'この部品は編集できません。' });
    }
  }

  // ---------- 各タブ ----------
  function panelHome() {
    var c = S.content.home;
    c.extraNews = c.extraNews || []; c.posters = c.posters || []; c.tagline = c.tagline || []; c.tiles = c.tiles || []; c.sections = c.sections || [];
    return [
      h('div', { class: 'card' }, h('h2', { text: '一番上の大きな写真' }),
        field('写真', imagePicker(c, 'hero', false)),
        h('div', { class: 'grid2' }, field('大きい文字', text(c, 'heroTitle')), field('小さい文字', text(c, 'heroSub')))),
      h('div', { class: 'card' }, h('h2', { text: '最新のお知らせ' }),
        h('p', { class: 'lead', text: '「お知らせ」のタブで追加したものが、上から自動で並びます。' }),
        field('表示する数', num(c, 'newsCount', { min: 0, max: 10 })),
        h('div', { class: 'label', text: 'その下に出す追加のお知らせ(募集など)' }),
        listEditor(c.extraNews, function (x) {
          return h('div', { class: 'grid2' }, field('ラベル', text(x, 'badge', { placeholder: '募集' })), field('文字', text(x, 'text')), field('リンク先', text(x, 'href')));
        }, function () { return { badge: 'NEW', text: '', href: '' }; }, '追加のお知らせ')),
      h('div', { class: 'card' }, h('h2', { text: 'ポスター' }),
        listEditor(c.posters, function (p) { return [imagePicker(p, 'src', false), field('画像の説明', text(p, 'alt'))]; },
          function () { return { src: (S.content.images || [])[0] || '', alt: '' }; }, 'ポスター')),
      h('div', { class: 'card' }, h('h2', { text: 'キャッチコピー' }),
        h('p', { class: 'lead', text: '左の文字は緑色で表示されます。' }),
        listEditor(c.tagline, function (pair) { return h('div', { class: 'grid2' }, text(pair, 0), text(pair, 1)); }, function () { return ['', '']; }, '行')),
      h('div', { class: 'card' }, h('h2', { text: '黒いボタン(タイル)' }),
        listEditor(c.tiles, function (t) {
          return h('div', { class: 'grid2' }, field('文字', text(t, 'label')), field('行き先', select(t, 'page', pageOptions(true), function () { renderPanel(); })),
            !t.page ? field('URL', text(t, 'href')) : null);
        }, function () { return { label: '新しいボタン', page: 'about' }; }, 'タイル')),
      h('div', { class: 'card' }, h('h2', { text: '写真つきの案内(Discord・乗車など)' }),
        listEditor(c.sections, function (sec) {
          return [field('背景の写真', imagePicker(sec, 'image')),
            h('div', { class: 'grid2' }, field('見出し', text(sec, 'title')), field('小さい注意書き', text(sec, 'note'))),
            field('文章', area(sec, 'text', { rows: 3 })),
            h('div', { class: 'grid2' }, field('ボタンの文字', text(sec, 'buttonLabel')), field('ボタンのリンク先', text(sec, 'buttonHref')))];
        }, function () { return { title: '新しい案内', text: '', buttonLabel: '', buttonHref: '', note: '', image: '' }; }, '案内'))
    ];
  }

  function panelPages() {
    var pages = S.content.pages;
    if (S.sel.page >= pages.length) S.sel.page = Math.max(0, pages.length - 1);
    var p = pages[S.sel.page];
    var newForm = { title: '', id: '', addNav: true };
    return [
      h('div', { class: 'card' }, h('h2', { text: 'どのページを直しますか？' }),
        h('div', { class: 'picker' }, pages.map(function (pg, i) {
          return h('button', { type: 'button', 'aria-pressed': String(i === S.sel.page), onclick: function () { S.sel.page = i; renderPanel(); } }, pg.title || '(無題)');
        })),
        h('details', null, h('summary', { text: '＋ 新しいページを作る' }),
          h('div', { class: 'grid2', style: 'margin-top:10px' },
            field('ページのタイトル', text(newForm, 'title')),
            field('ページのID(英小文字・数字・ハイフン)', text(newForm, 'id', { placeholder: '例: recruit' }), 'URLの一部になります。空なら自動で付けます。')),
          check(newForm, 'addNav', 'タブ(メニュー)にも追加する'),
          btn('作成する', function () {
            var title = (newForm.title || '').trim();
            var id = (newForm.id || '').trim().toLowerCase() || uid('page-');
            if (!title) return showFlash('error', 'タイトルを入れてください。');
            if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) return showFlash('error', 'IDは英小文字・数字・ハイフンで付けてください。');
            if (pages.some(function (x) { return x.id === id; }) || ['home', 'news'].indexOf(id) >= 0) return showFlash('error', 'そのIDはもう使われています。');
            pages.push({ id: id, file: 'pages/' + id + '.html', title: title, hero: 'assets/img/header-main.jpg', heroTitle: '', heroSub: '', blocks: [{ type: 'text', text: '' }] });
            if (newForm.addNav) S.content.nav.push({ label: title, page: id });
            S.sel.page = pages.length - 1;
            markDirty(); renderPanel();
          }, 'primary'))),
      p ? h('div', { class: 'card' }, h('h2', { text: '「' + p.title + '」の内容' }),
        h('p', { class: 'lead', text: 'ページのURL: ' + siteUrl(p.file) }),
        field('タイトル', text(p, 'title')),
        field('上の写真', imagePicker(p, 'hero')),
        h('div', { class: 'grid2' }, field('写真の上の大きい文字', text(p, 'heroTitle'), '空ならタイトルを表示'), field('写真の上の小さい文字', text(p, 'heroSub'))),
        h('div', { class: 'label', text: 'ページの中身(上から順に表示)', style: 'font-weight:700;margin:12px 0 8px' }),
        blocksEditor(p.blocks = p.blocks || []),
        h('div', { class: 'add-row', style: 'margin-top:20px' }, btn('このページを削除', function () {
          if (!window.confirm('「' + p.title + '」を削除しますか？(保存するまでは元に戻せます)')) return;
          S.content.nav = S.content.nav.filter(function (n) { return n.page !== p.id; });
          pages.splice(S.sel.page, 1); S.sel.page = 0; markDirty(); renderPanel();
        }, 'danger'))) : h('p', { text: 'ページがありません。' })
    ];
  }

  function panelNav() {
    return h('div', { class: 'card' }, h('h2', { text: 'タブ(上のメニュー)' }),
      h('p', { class: 'lead', text: '上から順に左から並びます。行き先にページを選ぶか、外部リンクにしてURLを入れます。' }),
      listEditor(S.content.nav, function (n) {
        return h('div', { class: 'grid2' }, field('表示する文字', text(n, 'label')),
          field('行き先', select(n, 'page', pageOptions(true), function () { renderPanel(); })),
          !n.page ? field('URL', text(n, 'href', { placeholder: 'https://…' })) : null);
      }, function () { return { label: '新しいタブ', page: 'home' }; }, 'タブ'));
  }

  function panelNews() {
    var list = S.content.news = S.content.news || [];
    if (S.sel.news >= list.length) S.sel.news = Math.max(0, list.length - 1);
    var n = list[S.sel.news];
    var np = S.content.newsPage = S.content.newsPage || {};
    return [
      h('div', { class: 'card' }, h('h2', { text: 'お知らせ' }),
        h('p', { class: 'lead', text: '上にあるものほど新しい扱いで、トップページにも上から表示されます。' }),
        h('div', { class: 'picker' }, list.map(function (x, i) {
          return h('button', { type: 'button', 'aria-pressed': String(i === S.sel.news), onclick: function () { S.sel.news = i; renderPanel(); } }, x.title || '(無題)');
        })),
        btn('＋ 新しいお知らせを書く', function () {
          var d = new Date();
          list.unshift({ id: uid('n-'), title: '新しいお知らせ', date: d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(), badge: 'NEW', summary: '', blocks: [{ type: 'text', text: '' }] });
          S.sel.news = 0; markDirty(); renderPanel();
        }, 'primary')),
      n ? h('div', { class: 'card' }, h('h2', { text: '「' + n.title + '」' }),
        h('div', { class: 'grid2' }, field('タイトル', text(n, 'title')), field('日付', text(n, 'date', { placeholder: '2026/11/14' })),
          field('ラベル', text(n, 'badge', { placeholder: 'NEW' })), field('上の写真(空なら一覧と同じ)', imagePicker(n, 'hero'))),
        field('一覧に出す短い説明', text(n, 'summary')),
        h('div', { class: 'label', text: '本文', style: 'font-weight:700;margin:12px 0 8px' }),
        blocksEditor(n.blocks = n.blocks || []),
        h('div', { class: 'add-row', style: 'margin-top:20px' },
          btn('↑ 上へ', function () { if (S.sel.news > 0) { move(list, S.sel.news, -1); S.sel.news--; renderPanel(); } }),
          btn('↓ 下へ', function () { if (S.sel.news < list.length - 1) { move(list, S.sel.news, 1); S.sel.news++; renderPanel(); } }),
          btn('このお知らせを削除', function () {
            if (!window.confirm('「' + n.title + '」を削除しますか？')) return;
            list.splice(S.sel.news, 1); S.sel.news = 0; markDirty(); renderPanel();
          }, 'danger'))) : null,
      h('div', { class: 'card' }, h('h2', { text: 'お知らせ一覧のページ' }),
        field('一覧ページの上の写真', imagePicker(np, 'hero')), field('一覧ページの説明文', area(np, 'intro', { rows: 2 })))
    ];
  }

  function panelStations() {
    var list = S.content.stations = S.content.stations || [];
    if (S.sel.station >= list.length) S.sel.station = Math.max(0, list.length - 1);
    var s = list[S.sel.station];
    if (s) { s.photos = s.photos || ['', '']; while (s.photos.length < 2) s.photos.push(''); }
    var facilityProxy = s ? { v: (s.facilities || []).join('、') } : null;
    return [
      h('div', { class: 'card' }, h('h2', { text: '駅(高山本線)' }),
        h('p', { class: 'lead', text: 'この並び順で路線図ページに表示され、駅ごとのページも自動で作られます。' }),
        h('div', { class: 'picker' }, list.map(function (x, i) {
          return h('button', { type: 'button', 'aria-pressed': String(i === S.sel.station), onclick: function () { S.sel.station = i; renderPanel(); } }, (x.code ? x.code + ' ' : '') + x.name);
        })),
        btn('＋ 駅を追加', function () {
          list.push({ slug: uid('st-'), code: '', extraCode: '', name: '新しい駅', stops: '', facilities: [], transfer: '', photos: ['assets/img/header-main.jpg', ''], text: '' });
          S.sel.station = list.length - 1; markDirty(); renderPanel();
        }, 'primary')),
      s ? h('div', { class: 'card' }, h('h2', { text: s.name + '駅' }),
        h('div', { class: 'grid2' },
          field('駅名', text(s, 'name')), field('ページのID(英小文字)', text(s, 'slug'), 'URLの一部。変えると前のURLは使えなくなります。'),
          field('駅番号', text(s, 'code', { placeholder: 'TK05' })), field('2つ目の駅番号(任意)', text(s, 'extraCode')),
          field('停車種別', text(s, 'stops', { placeholder: '特急・急行・普通' })), field('乗り換え(任意)', text(s, 'transfer'))),
        field('設備(「、」で区切る)', h('input', { type: 'text', value: facilityProxy.v, oninput: function (e) {
          s.facilities = e.target.value.split(/[、,]/).map(function (x) { return x.trim(); }).filter(Boolean); markDirty();
        } })),
        field('上の写真', imagePicker(s.photos, 0)),
        field('本文の下の写真', imagePicker(s.photos, 1)),
        field('紹介文', area(s, 'text', { rows: 7 }), '改行すると段落が分かれます。'),
        h('div', { class: 'add-row' },
          btn('↑ 前へ', function () { if (S.sel.station > 0) { move(list, S.sel.station, -1); S.sel.station--; renderPanel(); } }),
          btn('↓ 後ろへ', function () { if (S.sel.station < list.length - 1) { move(list, S.sel.station, 1); S.sel.station++; renderPanel(); } }),
          btn('この駅を削除', function () {
            if (!window.confirm(s.name + '駅を削除しますか？')) return;
            list.splice(S.sel.station, 1); S.sel.station = 0; markDirty(); renderPanel();
          }, 'danger'))) : null
    ];
  }

  function panelImages() {
    var fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, style: 'display:none', onchange: function (e) {
      Array.prototype.forEach.call(e.target.files, function (f) { uploadImage(f, function () { renderPanel(); }); });
    } });
    return h('div', { class: 'card' }, h('h2', { text: '画像' }),
      h('p', { class: 'lead', text: 'アップロードした画像は、各ページの「写真」「画像」で選べるようになります(4MBまで)。' }),
      h('div', { class: 'add-row', style: 'margin:0 0 14px' }, fileInput, btn('＋ 画像をアップロード', function () { fileInput.click(); }, 'primary')),
      h('div', { class: 'img-grid' }, (S.content.images || []).map(function (p) {
        return h('figure', null, h('img', { src: siteUrl(p), alt: '', loading: 'lazy' }), h('figcaption', { text: p.replace(/^assets\/img\//, '') }));
      })));
  }

  function panelSettings() {
    var st = S.content.settings;
    st.links = st.links || [];
    return [
      h('div', { class: 'card' }, h('h2', { text: 'サイト全体' }),
        h('div', { class: 'grid2' }, field('サイト名', text(st, 'siteName')), field('英語名', text(st, 'siteNameEn'))),
        field('検索結果に出る説明', area(st, 'description', { rows: 2 })),
        field('一番下の小さい文字', text(st, 'footerNote'))),
      h('div', { class: 'card' }, h('h2', { text: '一番下のリンク' }),
        listEditor(st.links, function (l) { return h('div', { class: 'grid2' }, field('文字', text(l, 'label')), field('リンク先', text(l, 'href'))); },
          function () { return { label: '', href: 'https://' }; }, 'リンク'))
    ];
  }

  function panelPreview() {
    var files;
    try { files = G.generateSite(S.content); } catch (e) { return h('div', { class: 'msg error', text: 'プレビューを作れませんでした: ' + e.message }); }
    var names = Object.keys(files).filter(function (f) { return f !== 'verify/index.html' && f !== '404.html'; });
    var state = { file: S.previewFile && files[S.previewFile] ? S.previewFile : 'index.html' };
    var frame = h('iframe', { class: 'preview-frame', title: 'プレビュー', sandbox: 'allow-same-origin' });
    function show() {
      S.previewFile = state.file;
      var dir = state.file.indexOf('/') >= 0 ? state.file.replace(/[^/]+$/, '') : '';
      frame.srcdoc = files[state.file].replace('<head>', '<head><base href="' + siteUrl(dir) + '">');
    }
    setTimeout(show, 0);
    return h('div', { class: 'card' }, h('h2', { text: 'プレビュー(保存前の見た目)' }),
      h('div', { class: 'preview-bar' }, select(state, 'file', names.map(function (f) { return [f, f]; }), show),
        btn('作り直す', function () { renderPanel(); })),
      frame,
      h('p', { class: 'muted small', text: '運行予定など、動きのある部分はプレビューでは表示されません。' }));
  }

  function panelAi() {
    var form = { page: '全体', text: '' };
    var result = h('div');
    var targets = [['全体', 'サイト全体'], ['トップページ', 'トップページ']].concat(S.content.pages.map(function (p) { return [p.title, p.title]; }))
      .concat([['お知らせ', 'お知らせ'], ['駅のページ', '駅のページ'], ['デザイン(色・レイアウト)', 'デザイン(色・レイアウト)']]);
    return h('div', { class: 'card' }, h('h2', { text: '🤖 AIへ送信' }),
      h('p', { class: 'lead', text: '管理画面ではできない変更(新しい機能・デザインの大きな変更など)をお願いするときに使います。社長だけが見られるDiscordの「ai依頼」チャンネルに、Claudeにそのまま貼れる形で届きます。社長が中身を確認して、Claudeに作ってもらいます。' }),
      field('どこを変えたいですか？', select(form, 'page', targets)),
      field('やってほしいこと', area(form, 'text', { rows: 8, placeholder: '例: 運賃のページに、区間ごとの運賃表を追加してほしい。桜が丘〜京堂までの全部の組み合わせ。' })),
      btn('送信する', function (e) {
        if (!form.text.trim()) return showFlash('error', 'やってほしいことを書いてください。');
        e.target.disabled = true;
        api('POST', '/api/admin/ai-request', form).then(function (res) {
          e.target.disabled = false;
          result.innerHTML = '';
          result.appendChild(h('div', { class: 'msg ' + (res.ok ? 'ok' : 'error'), text: res.message || (res.ok ? '送りました。' : '送れませんでした。') }));
          if (res.ok) { form.text = ''; }
        });
      }, 'primary'), result);
  }

  // ---------- 画面の組み立て ----------
  function showFlash(type, textMsg) {
    S.flash = { type: type, text: textMsg };
    var box = document.getElementById('flash');
    if (box) { box.innerHTML = ''; box.appendChild(h('div', { class: 'msg ' + type, text: textMsg })); }
  }

  function renderPanel() {
    var panel = document.getElementById('panel');
    if (!panel) return render();
    var y = window.scrollY;
    panel.innerHTML = '';
    var fn = { home: panelHome, pages: panelPages, nav: panelNav, news: panelNews, stations: panelStations, images: panelImages, settings: panelSettings, preview: panelPreview, ai: panelAi }[S.tab];
    append(panel, fn());
    window.scrollTo(0, y);
  }

  function render() {
    app.innerHTML = '';
    if (!S.token) return renderLogin();
    if (!S.content) return renderLoading();
    var title = (TABS.filter(function (t) { return t[0] === S.tab; })[0] || [])[2];
    var memo = { v: '' };
    app.appendChild(h('div', { class: 'shell' },
      h('aside', { class: 'side' },
        h('div', { class: 'brand-mini' }, '高山鐡道 管理画面', h('small', { text: '公式サイトの編集' })),
        TABS.map(function (t) {
          return h('button', { type: 'button', 'aria-current': S.tab === t[0] ? 'page' : null, onclick: function () { S.tab = t[0]; render(); } }, t[1] + ' ' + t[2]);
        }),
        h('div', { class: 'who' }, 'ログイン中: ' + S.name, h('br'), h('a', { href: siteUrl(''), target: '_blank', rel: 'noopener', style: 'color:#c6f26b' }, '公式サイトを開く'))),
      h('div', { class: 'main' },
        h('div', { class: 'topbar' },
          h('h1', { text: title }),
          h('span', { id: 'save-flag', class: S.dirty ? 'dirty' : 'saved', text: S.dirty ? '未保存の変更あり' : '保存済み' }),
          h('input', { type: 'text', placeholder: '変更メモ(任意)', style: 'width:180px', oninput: function (e) { memo.v = e.target.value; } }),
          btn('読み込み直す', function () { if (S.dirty && !window.confirm('保存していない変更は消えます。読み込み直しますか？')) return; loadContent(); }),
          btn('保存して公開', function (e) { save(memo.v, e.target); }, 'primary'),
          btn('ログアウト', function () { if (S.dirty && !window.confirm('保存していない変更は消えます。ログアウトしますか？')) return; api('POST', '/api/admin/logout'); logout(); }, 'small')),
        h('div', { id: 'flash', style: 'padding:0 20px' }, S.flash ? h('div', { class: 'msg ' + S.flash.type, text: S.flash.text }) : null),
        h('div', { id: 'panel', class: 'panel' }))));
    renderPanel();
  }

  function renderLogin(message) {
    var form = { password: '', name: S.name || '' };
    var box = h('div');
    if (message) box.appendChild(h('div', { class: 'msg error', text: message }));
    var statusBox = h('div');
    api('GET', '/api/admin/status').then(function (st) {
      if (!st.ok) return;
      var warn = [];
      if (!st.passwordSet) warn.push('管理者パスワード(ADMIN_SITE_PASSWORD)がRenderにまだ設定されていません。');
      if (!st.githubReady) warn.push('GitHubの鍵(GITHUB_TOKEN)がRenderにまだ設定されていないため、保存できません。');
      if (!st.generatorReady) warn.push('botに site-generator.js がないため、保存できません。');
      warn.forEach(function (w) { statusBox.appendChild(h('div', { class: 'msg info', text: w })); });
    });
    function submit() {
      box.innerHTML = '';
      box.appendChild(h('div', { class: 'msg info', text: 'ログインしています…(サーバーの起動に1分ほどかかることがあります)' }));
      api('POST', '/api/admin/login', form).then(function (res) {
        box.innerHTML = '';
        if (!res.ok) return box.appendChild(h('div', { class: 'msg error', text: res.message || 'ログインできませんでした。' }));
        S.token = res.token; S.name = res.name;
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: res.token, name: res.name, expiresAt: res.expiresAt })); } catch (e) { /* なし */ }
        render();
      });
    }
    var pw = h('input', { type: 'password', autocomplete: 'current-password', oninput: function (e) { form.password = e.target.value; }, onkeydown: function (e) { if (e.key === 'Enter') submit(); } });
    app.appendChild(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' },
      h('img', { src: '../assets/img/logo-wide.jpg', alt: '高山鐡道' }),
      h('h1', { text: '管理画面にログイン' }),
      field('名前(記録に残ります)', text(form, 'name', { placeholder: '例: yuchike', autocomplete: 'nickname' })),
      field('管理者パスワード', pw),
      btn('ログイン', submit, 'primary'), box, statusBox,
      h('p', { class: 'muted small', style: 'margin-top:16px' }, h('a', { href: '../index.html' }, '← 公式サイトに戻る')))));
    setTimeout(function () { pw.focus(); }, 0);
  }

  function renderLoading() {
    app.appendChild(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' },
      h('div', { class: 'spinner' }), h('p', { class: 'center', text: 'サイトの中身を読み込んでいます…' }))));
    loadContent();
  }

  function loadContent() {
    api('GET', '/api/admin/content').then(function (res) {
      if (!S.token) return;
      if (!res.ok) {
        S.content = null;
        app.innerHTML = '';
        app.appendChild(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' },
          h('h1', { text: '読み込めませんでした' }), h('div', { class: 'msg error', text: res.message || '' }),
          btn('もう一度', function () { render(); }, 'primary'), ' ', btn('ログアウト', function () { logout(); }))));
        return;
      }
      S.content = res.content; S.sha = res.sha; S.dirty = false; S.flash = null;
      ['nav', 'pages', 'news', 'stations', 'images'].forEach(function (k) { if (!Array.isArray(S.content[k])) S.content[k] = []; });
      S.content.settings = S.content.settings || {}; S.content.home = S.content.home || {};
      render();
    });
  }

  function save(memo, button) {
    var errors = G.validateContent(S.content);
    if (errors.length) return showFlash('error', '保存できません: ' + errors.join(' / '));
    button.disabled = true;
    showFlash('info', '保存しています…');
    api('POST', '/api/admin/save', { content: S.content, baseSha: S.sha, message: memo }).then(function (res) {
      button.disabled = false;
      if (!res.ok) return showFlash('error', (res.message || '保存できませんでした。') + (res.errors ? ' ' + res.errors.join(' / ') : ''));
      S.sha = res.sha; S.dirty = false;
      var f = document.getElementById('save-flag');
      if (f) { f.className = 'saved'; f.textContent = '保存済み'; }
      showFlash('ok', '保存しました。1〜2分で公式サイトに反映されます。');
    });
  }

  function logout(message) {
    S.token = null; S.content = null; S.sha = null; S.dirty = false; S.flash = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* なし */ }
    app.innerHTML = '';
    renderLogin(message);
  }

  render();
})();
