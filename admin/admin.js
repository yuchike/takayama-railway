// 高山鐡道 公式サイト 管理画面
// ・パスワードでログイン → サイトの中身(data/site.json)を読み込む → フォームで直す(横に実際の見た目が出る) → 「保存して公開」
// ・保存すると、botが全ページを作り直してGitHubに保存し、公式サイトに反映されたかをこの画面が確かめる
// ・「AIへ送信」は、社長だけが見られるDiscordチャンネルに、Claudeへ貼れる形の依頼文を届ける
(function () {
  'use strict';
  var API = window.TAKATETSU_API;
  var G = window.TakatetsuSiteGenerator;
  var app = document.getElementById('app');
  var TOKEN_KEY = 'takatetsu-admin-token';
  var DRAFT_KEY = 'takatetsu-admin-draft';
  var PREVIEW_KEY = 'takatetsu-admin-preview';

  var S = {
    token: null, name: '', content: null, sha: null, dirty: false, tab: 'home',
    sel: { page: 0, news: 0, station: 0, line: 0 }, flash: null, livePreview: true, previewFile: 'index.html'
  };
  try {
    var saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
    if (saved && saved.expiresAt > Date.now()) { S.token = saved.token; S.name = saved.name; }
    S.livePreview = localStorage.getItem(PREVIEW_KEY) !== 'off';
  } catch (e) { /* なし */ }

  var TABS = [
    ['home', '🏠', 'トップページ', 'サイトの一番最初のページです。上の写真・お知らせ・ボタンなどを直せます。'],
    ['pages', '📄', 'ページ', '「高山鐡道とは」「運賃」などのページの中身を、部品を並べて作ります。新しいページも作れます。'],
    ['nav', '🧭', 'タブ(メニュー)', 'サイトの一番上に並ぶメニューです。並び順・名前・行き先を変えられます。'],
    ['news', '📰', 'お知らせ', 'お知らせを書きます。上にあるものほど新しい扱いで、トップページにも出ます。'],
    ['stations', '🚉', '駅・路線', '路線(高山本線・足洗支線など)と、駅のページを直します。路線図ページは自動で作られます。'],
    ['images', '🖼️', '画像', '画像のアップロードと一覧です。ここに入れた画像を各ページで選べます。'],
    ['settings', '⚙️', 'サイト設定', 'サイト名・ロゴ・色・一番下のリンクなど、サイト全体の設定です。'],
    ['preview', '👁️', '全ページを見る', '保存する前の見た目を、ページを選んで確認できます。'],
    ['ai', '🤖', 'AIへ送信', '管理画面ではできない変更を、社長に依頼します。']
  ];
  var BLOCK_LABEL = {
    heading: '見出し', subheading: '小見出し', text: '文章', note: '注意書き(小さい文字)', image: '画像', columns: '画像と文章を横に並べる',
    button: 'ボタン(リンク)', list: '箇条書き', table: '表', gallery: '写真ギャラリー', youtube: 'YouTube動画', divider: '区切り線',
    lines: '路線図(全部の路線・自動)', shifts: '運行予定(自動)', stations: '駅一覧(古い形式)', line: '駅の並び(古い形式)'
  };
  var BLOCK_ADDABLE = ['heading', 'subheading', 'text', 'note', 'image', 'columns', 'button', 'list', 'table', 'gallery', 'youtube', 'divider', 'lines', 'shifts'];
  var BLOCK_NEW = {
    heading: function () { return { type: 'heading', text: '新しい見出し' }; },
    subheading: function () { return { type: 'subheading', text: '小見出し' }; },
    text: function () { return { type: 'text', text: '' }; },
    note: function () { return { type: 'note', text: '' }; },
    image: function () { return { type: 'image', src: '', caption: '', link: false }; },
    columns: function () { return { type: 'columns', src: '', caption: '', title: '', text: '', side: 'left' }; },
    button: function () { return { type: 'button', label: 'くわしくはこちら', href: '' }; },
    list: function () { return { type: 'list', items: [], ordered: false }; },
    table: function () { return { type: 'table', rows: [['項目', '内容']] }; },
    gallery: function () { return { type: 'gallery', items: [] }; },
    youtube: function () { return { type: 'youtube', url: '', caption: '' }; },
    divider: function () { return { type: 'divider' }; },
    lines: function () { return { type: 'lines' }; },
    shifts: function () { return { type: 'shifts' }; }
  };
  var TEXT_HINT = '改行すると段落が分かれます。**太字** と [文字](https://…) でリンクも作れます。';

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
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function siteUrl(path) { return new URL('../' + (path || ''), location.href).href; }
  function slugOk(s) { return /^[a-z0-9][a-z0-9-]{0,40}$/.test(String(s || '')); }
  function stationBySlug(slug) { return (S.content.stations || []).filter(function (s) { return s.slug === slug; })[0]; }

  // ---------- 未保存の印・下書き・横のプレビュー ----------
  var draftTimer = null, previewTimer = null;
  function markDirty() {
    S.dirty = true;
    var f = document.getElementById('save-flag');
    if (f) { f.className = 'dirty'; f.textContent = '未保存の変更あり'; }
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ sha: S.sha, at: Date.now(), content: S.content })); } catch (e) { /* 容量不足など */ }
    }, 800);
    schedulePreview();
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* なし */ } }
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.content) {
      e.preventDefault();
      var b = document.getElementById('save-button');
      if (b && !b.disabled) b.click();
    }
  });

  function currentPreviewFile() {
    var c = S.content;
    switch (S.tab) {
      case 'pages': var p = c.pages[S.sel.page]; return p ? p.file : 'index.html';
      case 'news': var n = c.news[S.sel.news]; return n ? 'news/' + n.id + '.html' : 'news.html';
      case 'stations':
        if (S.stationMode === 'lines') return G.pageFile(c, 'map') || 'index.html';
        var s = c.stations[S.sel.station]; return s ? 'stations/' + s.slug + '.html' : 'index.html';
      default: return 'index.html';
    }
  }
  function renderPreviewInto(frame, file) {
    var files;
    try { files = G.generateSite(S.content); } catch (e) { return; }
    var html = files[file] || files['index.html'];
    var dir = file.indexOf('/') >= 0 ? file.replace(/[^/]+$/, '') : '';
    var y = 0;
    try { y = frame.contentWindow ? frame.contentWindow.scrollY : 0; } catch (e) { /* なし */ }
    frame.onload = function () { try { frame.contentWindow.scrollTo(0, y); } catch (e) { /* なし */ } };
    frame.srcdoc = html.replace('<head>', '<head><base href="' + siteUrl(dir) + '" target="_blank">');
  }
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      var frame = document.getElementById('live-frame');
      if (frame) renderPreviewInto(frame, currentPreviewFile());
      var label = document.getElementById('live-file');
      if (label) label.textContent = currentPreviewFile();
    }, 350);
  }

  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, S.token ? { Authorization: 'Bearer ' + S.token } : {}),
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit'
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, message: '返事を読み取れませんでした (' + res.status + ')' }; }).then(function (data) {
        if (res.status === 401 && path !== '/api/admin/login') { logout('ログインの期限が切れました。もう一度ログインしてください(書きかけの内容は下書きとして残っています)。'); }
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
    var ta = h('textarea', Object.assign({ value: obj[key] == null ? '' : obj[key], oninput: function (e) { obj[key] = e.target.value; markDirty(); if (counter) updateCount(); } }, attrs || {}));
    // 2行以上の文章欄には、下に便利ボタンを付ける(表のマスのような1行の欄には付けない)
    if (!attrs || !attrs.rows || attrs.rows < 2) return ta;
    var counter = h('span', { class: 'tool-count' });
    function updateCount() { counter.textContent = ta.value.replace(/\n/g, '').length + '文字'; }
    updateCount();
    return h('div', { class: 'text-tools-wrap' }, ta, textTools(ta, counter, updateCount));
  }

  // ---------- 文章の便利ボタン ----------
  var JP = '぀-ヿ㐀-鿿ｦ-ﾟ々〆ー';
  var TOOLS = {
    // 行の終わりに「。」を付ける(すでに句読点・記号・カッコで終わる行、URLやリンクで終わる行はそのまま)。全角のカンマ・ピリオドも直す
    punct: function (v) {
      return v.split('\n').map(function (line) {
        var t = line.replace(/[ \t]+$/, '');
        t = t.replace(new RegExp('([' + JP + '])[，,](?=[' + JP + '\\s])', 'g'), '$1、').replace(new RegExp('([' + JP + '])[．](?=[' + JP + '\\s]|$)', 'g'), '$1。');
        if (!t.trim()) return t;
        if (new RegExp('[' + JP + 'a-zA-Z0-9０-９]$').test(t) && !/https?:\/\/\S+$/.test(t) && !/^\s*[-・*※]/.test(t)) return t + '。';
        return t;
      }).join('\n');
    },
    // 全角の英数字を半角に、半角カタカナを全角に
    width: function (v) {
      return v.replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
        .replace(/[ｦ-ﾟ]+[ﾞﾟ]?/g, function (s) { return s.normalize('NFKC'); });
    },
    // 行末の空白・連続した空白・余分な空行を整える
    space: function (v) {
      return v.split('\n').map(function (l) { return l.replace(/[ \t]+$/, '').replace(/ {2,}/g, ' '); }).join('\n')
        .replace(/\n{3,}/g, '\n\n').replace(/^\s*\n/, '').replace(/\n\s*$/, '');
    },
    // 「!」「?」を全角に、「...」を「…」に
    marks: function (v) {
      return v.replace(new RegExp('([' + JP + '])!', 'g'), '$1！').replace(new RegExp('([' + JP + '])\\?', 'g'), '$1？').replace(/\.{3}/g, '…');
    }
  };

  function textTools(ta, counter, updateCount) {
    var undoValue = null;
    var undoBtn = btn('↩ 元に戻す', function () {
      if (undoValue == null) return;
      setValue(undoValue, true);
      undoValue = null; undoBtn.style.display = 'none';
    }, 'tool undo');
    undoBtn.style.display = 'none';

    function setValue(v, isUndo) {
      if (!isUndo) undoValue = ta.value;
      ta.value = v;
      ta.dispatchEvent(new Event('input'));
      if (!isUndo) undoBtn.style.display = '';
    }
    function whole(fn, label) {
      return btn(label, function () {
        var before = ta.value, after = fn(before);
        if (after === before) return flashTool(this, '変更なし');
        setValue(after);
        flashTool(this, '✓');
      }, 'tool');
    }
    // 選んだ部分を包む(選んでいなければ見本を入れて選ぶ)
    function wrapSel(before, after, sample) {
      var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
      var inner = v.slice(s, e) || sample;
      setValue(v.slice(0, s) + before + inner + after + v.slice(e));
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + inner.length);
    }
    function insert(text) {
      var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
      setValue(v.slice(0, s) + text + v.slice(e));
      ta.focus();
      ta.setSelectionRange(s + text.length, s + text.length);
    }
    var symbol = h('select', { class: 'tool-select', title: '記号を入れる', onchange: function (e) { if (e.target.value) insert(e.target.value); e.target.value = ''; } },
      [['', '記号…'], ['※', '※'], ['→', '→'], ['★', '★'], ['☆', '☆'], ['●', '●'], ['■', '■'], ['〜', '〜'], ['…', '…'], ['「」', '「」'], ['『』', '『』'], ['♪', '♪'], ['✅', '✅'], ['⚠️', '⚠️'], ['🚄', '🚄'], ['🚉', '🚉']]
        .map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    function today() { var d = new Date(); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
    return h('div', { class: 'text-tools' },
      whole(TOOLS.punct, '。句読点をつける'),
      whole(TOOLS.width, '英数字を半角に'),
      whole(TOOLS.marks, '！？を全角に'),
      whole(TOOLS.space, '空白・空行を整える'),
      btn('B 太字', function () { wrapSel('**', '**', '太字'); }, 'tool'),
      btn('🔗 リンク', function () {
        var url = window.prompt('リンク先のURL(またはページのファイル名)を入れてください', 'https://');
        if (!url || url === 'https://') return;
        wrapSel('[', '](' + url.trim() + ')', 'リンクの文字');
      }, 'tool'),
      btn('📅 今日の日付', function () { insert(today()); }, 'tool'),
      symbol, undoBtn, counter);
  }

  function flashTool(button, label) {
    var orig = button.textContent;
    button.textContent = label;
    button.disabled = true;
    setTimeout(function () { button.textContent = orig; button.disabled = false; }, 900);
  }
  function num(obj, key, attrs) {
    return h('input', Object.assign({ type: 'number', value: obj[key] == null ? '' : obj[key], oninput: function (e) { obj[key] = Number(e.target.value) || 0; markDirty(); } }, attrs || {}));
  }
  function color(obj, key, fallback) {
    return h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(obj[key] || '') ? obj[key] : fallback, oninput: function (e) { obj[key] = e.target.value; markDirty(); } });
  }
  function check(obj, key, label, onChange) {
    return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!obj[key], onchange: function (e) { obj[key] = e.target.checked; markDirty(); if (onChange) onChange(); } }), label);
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
  function btn(label, onclick, cls, attrs) { return h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), onclick: onclick }, attrs || {}), label); }
  function card(title, lead) {
    var args = Array.prototype.slice.call(arguments, 2);
    return h('div', { class: 'card' }, h('h2', { text: title }), lead ? h('p', { class: 'lead', text: lead }) : null, args);
  }

  function move(arr, i, d) {
    var j = i + d;
    if (j < 0 || j >= arr.length) return false;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    markDirty(); renderPanel();
    return true;
  }

  // 並べ替え・削除・追加ができる一覧
  function listEditor(arr, renderItem, makeNew, addLabel, opts) {
    opts = opts || {};
    return h('div', null,
      arr.length ? h('div', { class: 'sub-list' }, arr.map(function (item, i) {
        return h('div', { class: 'sub-item' },
          h('div', { class: 'sub-body' }, opts.numbered ? h('span', { class: 'num', text: String(i + 1) }) : null, renderItem(item, i)),
          h('div', { class: 'tools' },
            btn('↑', function () { move(arr, i, -1); }, 'small', { title: '上へ', disabled: i === 0 }),
            btn('↓', function () { move(arr, i, 1); }, 'small', { title: '下へ', disabled: i === arr.length - 1 }),
            btn('削除', function () { arr.splice(i, 1); markDirty(); renderPanel(); }, 'small danger')));
      })) : h('p', { class: 'muted small', text: 'まだありません。' }),
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
      showFlash('info', '「' + file.name + '」をアップロードしています…');
      api('POST', '/api/admin/upload', { filename: file.name, contentType: file.type, data: String(reader.result) }).then(function (res) {
        if (!res.ok) return showFlash('error', res.message || 'アップロードできませんでした。');
        S.content.images = S.content.images || [];
        if (S.content.images.indexOf(res.path) < 0) S.content.images.unshift(res.path);
        markDirty();
        showFlash('ok', '画像をアップロードしました。「保存して公開」すると、選んだページに反映されます(画像が見えるまで1〜2分かかることがあります)。');
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
      blocks.length ? h('div', { class: 'blocks' }, blocks.map(function (b, i) {
        return h('div', { class: 'block' },
          h('div', { class: 'block-head' },
            h('span', { class: 'tag', text: (i + 1) + '. ' + (BLOCK_LABEL[b.type] || b.type) }),
            btn('↑', function () { move(blocks, i, -1); }, 'small', { title: '上へ', disabled: i === 0 }),
            btn('↓', function () { move(blocks, i, 1); }, 'small', { title: '下へ', disabled: i === blocks.length - 1 }),
            btn('複製', function () { blocks.splice(i + 1, 0, JSON.parse(JSON.stringify(b))); markDirty(); renderPanel(); }, 'small'),
            btn('削除', function () { blocks.splice(i, 1); markDirty(); renderPanel(); }, 'small danger')),
          blockFields(b));
      })) : h('p', { class: 'muted small', text: 'まだ部品がありません。下から追加してください。' }),
      h('div', { class: 'add-row' },
        select(addType, 't', BLOCK_ADDABLE.map(function (k) { return [k, BLOCK_LABEL[k]]; })),
        btn('＋ 部品を追加', function () { blocks.push(BLOCK_NEW[addType.t]()); markDirty(); renderPanel(); }, 'lime')));
  }

  function blockFields(b) {
    switch (b.type) {
      case 'heading': case 'subheading': return text(b, 'text');
      case 'note': return field('文字', text(b, 'text'), '**太字** と [文字](https://…) が使えます。');
      case 'text': return field('文章', area(b, 'text', { rows: 5 }), TEXT_HINT);
      case 'divider': return h('p', { class: 'muted small', text: '横線を1本引きます。' });
      case 'image': return [field('画像', imagePicker(b, 'src')), field('説明(画像の下に出る文字)', text(b, 'caption')), check(b, 'link', '押すと画像を大きく表示する')];
      case 'columns': return [
        h('div', { class: 'grid2' }, field('画像', imagePicker(b, 'src')), field('画像の位置', select(b, 'side', [['left', '左に画像'], ['right', '右に画像']]))),
        field('画像の説明(任意)', text(b, 'caption')), field('見出し(任意)', text(b, 'title')), field('文章', area(b, 'text', { rows: 4 }), TEXT_HINT)];
      case 'button': return h('div', { class: 'grid2' }, field('ボタンの文字', text(b, 'label')), field('リンク先', text(b, 'href', { placeholder: 'https://… または fare.html など' })));
      case 'list': return [field('項目(1行に1つ)', linesArea(b, 'items', { rows: 5 }), '**太字** と [文字](https://…) が使えます。'), check(b, 'ordered', '番号付きにする(1. 2. 3.)')];
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
      case 'youtube': {
        var ok = h('span', { class: 'hint' });
        var update = function () { ok.textContent = G.youtubeId(b.url) ? '✅ 動画を読み込めます' : (b.url ? '⚠️ YouTubeのURLとして読み取れません' : ''); };
        var input = h('input', { type: 'text', value: b.url || '', placeholder: 'https://www.youtube.com/watch?v=…', oninput: function (e) { b.url = e.target.value; markDirty(); update(); } });
        update();
        return [h('div', { class: 'f' }, h('label', { text: 'YouTubeのURL' }), input, ok), field('説明(任意)', text(b, 'caption'))];
      }
      case 'lines': return h('p', { class: 'muted small', text: '「駅・路線」のタブで作った路線が、全部自動で並びます。' });
      case 'shifts': return h('p', { class: 'muted small', text: 'Discordの /shift で登録した運行予定が、自動でここに表示されます(なければ「なし」)。' });
      case 'stations': case 'line':
        return h('div', null, h('p', { class: 'muted small', text: '古い形式の部品です。「路線図(全部の路線・自動)」に置き換えると、「駅・路線」タブで直せるようになります。' }),
          btn('「路線図(自動)」に置き換える', function () { for (var k in b) delete b[k]; b.type = 'lines'; markDirty(); renderPanel(); }, 'small'));
      default: return h('p', { class: 'muted small', text: 'この部品は編集できません。' });
    }
  }

  // ---------- 各タブ ----------
  function panelHome() {
    var c = S.content.home;
    ['extraNews', 'posters', 'tagline', 'tiles', 'sections', 'blocks'].forEach(function (k) { c[k] = c[k] || []; });
    if (!Array.isArray(c.order) || !c.order.length) c.order = ['news', 'posters', 'tagline', 'tiles', 'sections', 'blocks'];
    var SECTION_LABEL = { news: '最新のお知らせ', posters: 'ポスター', tagline: 'キャッチコピー', tiles: '黒いボタン(タイル)', sections: '写真つきの案内', blocks: '自由な部品' };
    return [
      card('一番上の大きな写真', null,
        field('写真', imagePicker(c, 'hero')),
        h('div', { class: 'grid2' }, field('大きい文字', text(c, 'heroTitle')), field('小さい文字', text(c, 'heroSub')))),
      card('並び順', '写真の下に表示するものの順番です。', listEditor(c.order, function (k) { return h('b', { text: SECTION_LABEL[k] || k }); }, null, null, { numbered: true })),
      card('最新のお知らせ', '「お知らせ」タブで書いたものが、上から自動で並びます。',
        h('div', { class: 'grid2' }, field('見出し', text(c, 'newsTitle', { placeholder: '最新のお知らせ' })), field('表示する数', num(c, 'newsCount', { min: 0, max: 10 }))),
        h('div', { class: 'label', text: 'その下に出す追加のお知らせ(募集など)' }),
        listEditor(c.extraNews, function (x) {
          return h('div', { class: 'grid3' }, field('ラベル', text(x, 'badge', { placeholder: '募集' })), field('文字', text(x, 'text')), field('リンク先', text(x, 'href')));
        }, function () { return { badge: 'NEW', text: '', href: '' }; }, '追加のお知らせ')),
      card('ポスター', '2枚くらいがきれいに並びます。',
        listEditor(c.posters, function (p) { return [imagePicker(p, 'src', false), field('画像の説明', text(p, 'alt'))]; },
          function () { return { src: (S.content.images || [])[0] || '', alt: '' }; }, 'ポスター')),
      card('キャッチコピー', '左の文字は緑色で表示されます。',
        listEditor(c.tagline, function (pair) { return h('div', { class: 'grid2' }, text(pair, 0), text(pair, 1)); }, function () { return ['', '']; }, '行')),
      card('黒いボタン(タイル)', '何個でも並べられます(幅に合わせて自動で折り返します)。',
        listEditor(c.tiles, function (t) {
          return h('div', { class: 'grid2' }, field('文字', text(t, 'label')), field('行き先', select(t, 'page', pageOptions(true), function () { renderPanel(); })),
            !t.page ? field('URL', text(t, 'href')) : null);
        }, function () { return { label: '新しいボタン', page: 'about' }; }, 'タイル')),
      card('写真つきの案内(Discord・乗車など)', null,
        listEditor(c.sections, function (sec) {
          return [field('背景の写真', imagePicker(sec, 'image')),
            h('div', { class: 'grid2' }, field('見出し', text(sec, 'title')), field('小さい注意書き', text(sec, 'note'))),
            field('文章', area(sec, 'text', { rows: 3 }), TEXT_HINT),
            h('div', { class: 'grid2' }, field('ボタンの文字', text(sec, 'buttonLabel')), field('ボタンのリンク先', text(sec, 'buttonHref')))];
        }, function () { return { title: '新しい案内', text: '', buttonLabel: '', buttonHref: '', note: '', image: '' }; }, '案内')),
      card('自由な部品', 'ページと同じように、文章・画像・動画などを自由に追加できます。', blocksEditor(c.blocks))
    ];
  }

  function picker(list, selKey, labelOf) {
    return h('div', { class: 'picker' }, list.map(function (x, i) {
      return h('button', { type: 'button', 'aria-pressed': String(i === S.sel[selKey]), onclick: function () { S.sel[selKey] = i; renderPanel(); schedulePreview(); } }, labelOf(x) || '(無題)');
    }));
  }

  function panelPages() {
    var pages = S.content.pages;
    if (S.sel.page >= pages.length) S.sel.page = Math.max(0, pages.length - 1);
    var p = pages[S.sel.page];
    var newForm = { title: '', id: '', addNav: true };
    return [
      card('どのページを直しますか？', null, picker(pages, 'page', function (x) { return x.title; }),
        h('details', { class: 'new-box' }, h('summary', { text: '＋ 新しいページを作る' }),
          h('div', { class: 'grid2', style: 'margin-top:10px' },
            field('ページのタイトル', text(newForm, 'title')),
            field('ページのID(英小文字・数字・ハイフン)', text(newForm, 'id', { placeholder: '例: recruit' }), 'URLの一部になります。空なら自動で付けます。')),
          check(newForm, 'addNav', 'タブ(メニュー)にも追加する'),
          btn('作成する', function () {
            var title = (newForm.title || '').trim();
            var id = (newForm.id || '').trim().toLowerCase() || uid('page-');
            if (!title) return showFlash('error', 'タイトルを入れてください。');
            if (!slugOk(id)) return showFlash('error', 'IDは英小文字・数字・ハイフンで付けてください。');
            if (pages.some(function (x) { return x.id === id; }) || ['home', 'news'].indexOf(id) >= 0) return showFlash('error', 'そのIDはもう使われています。');
            pages.push({ id: id, file: 'pages/' + id + '.html', title: title, hero: '', heroTitle: '', heroSub: '', blocks: [{ type: 'text', text: '' }] });
            if (newForm.addNav) S.content.nav.push({ label: title, page: id });
            S.sel.page = pages.length - 1;
            markDirty(); renderPanel(); showFlash('ok', '「' + title + '」を作りました。中身を入れて「保存して公開」してください。');
          }, 'primary'))),
      p ? card('「' + p.title + '」の内容', 'ページのURL: ' + siteUrl(p.file),
        field('タイトル', text(p, 'title')),
        field('上の写真', imagePicker(p, 'hero'), '「(なし)」にすると、写真の代わりに紺色の帯でタイトルを出します。'),
        h('div', { class: 'grid2' }, field('上の大きい文字', text(p, 'heroTitle'), '空ならタイトルを表示'), field('上の小さい文字', text(p, 'heroSub'))),
        h('div', { class: 'label', text: 'ページの中身(上から順に表示)' }),
        blocksEditor(p.blocks = p.blocks || []),
        h('div', { class: 'add-row danger-zone' }, btn('このページを削除', function () {
          if (!window.confirm('「' + p.title + '」を削除しますか？(保存するまでは「読み込み直す」で元に戻せます)')) return;
          S.content.nav = S.content.nav.filter(function (n) { return n.page !== p.id; });
          (S.content.home.tiles || []).forEach(function (t) { if (t.page === p.id) t.page = 'home'; });
          pages.splice(S.sel.page, 1); S.sel.page = 0; markDirty(); renderPanel();
        }, 'danger'))) : h('p', { text: 'ページがありません。' })
    ];
  }

  function panelNav() {
    return card('タブ(上のメニュー)', '上から順に、左から並びます。行き先にページを選ぶか、外部リンクにしてURLを入れます。',
      listEditor(S.content.nav, function (n) {
        return h('div', { class: 'grid2' }, field('表示する文字', text(n, 'label')),
          field('行き先', select(n, 'page', pageOptions(true), function () { renderPanel(); })),
          !n.page ? field('URL', text(n, 'href', { placeholder: 'https://…' })) : null);
      }, function () { return { label: '新しいタブ', page: 'home' }; }, 'タブ', { numbered: true }));
  }

  function panelNews() {
    var list = S.content.news = S.content.news || [];
    if (S.sel.news >= list.length) S.sel.news = Math.max(0, list.length - 1);
    var n = list[S.sel.news];
    var np = S.content.newsPage = S.content.newsPage || {};
    return [
      card('お知らせ', '上にあるものほど新しい扱いで、トップページにも上から表示されます。', picker(list, 'news', function (x) { return x.title; }),
        btn('＋ 新しいお知らせを書く', function () {
          var d = new Date();
          list.unshift({ id: 'n-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + Math.random().toString(36).slice(2, 5),
            title: '新しいお知らせ', date: d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(), badge: 'NEW', summary: '', blocks: [{ type: 'text', text: '' }] });
          S.sel.news = 0; markDirty(); renderPanel(); schedulePreview();
        }, 'primary')),
      n ? card('「' + n.title + '」', null,
        h('div', { class: 'grid2' }, field('タイトル', text(n, 'title')), field('日付', text(n, 'date', { placeholder: '2026/11/14' })),
          field('ラベル', text(n, 'badge', { placeholder: 'NEW' }), '「NEW」「重要」など'), field('上の写真(空なら一覧と同じ)', imagePicker(n, 'hero'))),
        field('一覧に出す短い説明', text(n, 'summary')),
        h('div', { class: 'label', text: '本文' }),
        blocksEditor(n.blocks = n.blocks || []),
        h('div', { class: 'add-row danger-zone' },
          btn('↑ 上へ', function () { if (move(list, S.sel.news, -1)) { S.sel.news--; renderPanel(); } }, '', { disabled: S.sel.news === 0 }),
          btn('↓ 下へ', function () { if (move(list, S.sel.news, 1)) { S.sel.news++; renderPanel(); } }, '', { disabled: S.sel.news === list.length - 1 }),
          btn('このお知らせを削除', function () {
            if (!window.confirm('「' + n.title + '」を削除しますか？')) return;
            list.splice(S.sel.news, 1); S.sel.news = 0; markDirty(); renderPanel();
          }, 'danger'))) : null,
      card('お知らせ一覧のページ', null,
        field('ページのタイトル', text(np, 'title', { placeholder: 'お知らせ' })),
        field('上の写真', imagePicker(np, 'hero')), field('一覧ページの説明文', area(np, 'intro', { rows: 2 }), TEXT_HINT))
    ];
  }

  // 駅・路線
  function panelStations() {
    S.stationMode = S.stationMode || 'stations';
    var c = S.content;
    c.lines = c.lines || [];
    c.stations = c.stations || [];
    var modeBar = h('div', { class: 'picker mode' },
      h('button', { type: 'button', 'aria-pressed': String(S.stationMode === 'stations'), onclick: function () { S.stationMode = 'stations'; renderPanel(); schedulePreview(); } }, '🚉 駅のページ'),
      h('button', { type: 'button', 'aria-pressed': String(S.stationMode === 'lines'), onclick: function () { S.stationMode = 'lines'; renderPanel(); schedulePreview(); } }, '🛤️ 路線(駅の並び)'));
    return [modeBar].concat(S.stationMode === 'lines' ? panelLines() : panelStationPages());
  }

  function panelLines() {
    var lines = S.content.lines;
    if (S.sel.line >= lines.length) S.sel.line = Math.max(0, lines.length - 1);
    var l = lines[S.sel.line];
    var stationOpts = [['', '(駅のページなし・名前だけ)']].concat(S.content.stations.map(function (s) { return [s.slug, (s.code ? s.code + ' ' : '') + s.name]; }));
    return [
      card('路線', '路線図ページには、この順番で全部の路線が表示されます。駅は複数の路線に入れられます(乗り換え駅になります)。',
        picker(lines, 'line', function (x) { return x.name; }),
        h('div', { class: 'add-row' },
          btn('＋ 路線を追加', function () { lines.push({ id: uid('line-'), name: '新しい路線', color: G.DEFAULT_LINE_COLORS[lines.length % G.DEFAULT_LINE_COLORS.length], note: '', stops: [] }); S.sel.line = lines.length - 1; markDirty(); renderPanel(); }, 'primary'),
          l ? btn('← 左へ', function () { if (move(lines, S.sel.line, -1)) { S.sel.line--; renderPanel(); } }, '', { disabled: S.sel.line === 0 }) : null,
          l ? btn('右へ →', function () { if (move(lines, S.sel.line, 1)) { S.sel.line++; renderPanel(); } }, '', { disabled: S.sel.line === lines.length - 1 }) : null)),
      l ? card('「' + l.name + '」', null,
        h('div', { class: 'grid2' }, field('路線名', text(l, 'name')), field('路線の色', color(l, 'color', '#1f9a55'))),
        field('説明(任意・路線名の下に出る)', text(l, 'note')),
        h('div', { class: 'label', text: '駅の並び(上から順)' }),
        listEditor(l.stops = l.stops || [], function (stop) {
          var st = stop.station ? stationBySlug(stop.station) : null;
          return h('div', { class: 'grid3' },
            field('駅', select(stop, 'station', stationOpts, function () { renderPanel(); })),
            !stop.station ? field('駅名', text(stop, 'name', { placeholder: '？？？' })) : field('この路線での駅番号', text(stop, 'code', { placeholder: st && st.code ? st.code : '例: TA01' }), '空なら駅の番号'),
            stop.station ? h('div', { class: 'f' }, h('label', { text: ' ' }), btn('この駅を編集', function () { S.stationMode = 'stations'; S.sel.station = S.content.stations.indexOf(st); renderPanel(); schedulePreview(); }, 'small')) : null);
        }, function () { return { name: '？？？' }; }, '駅を追加', { numbered: true }),
        h('div', { class: 'add-row danger-zone' }, btn('この路線を削除', function () {
          if (!window.confirm('「' + l.name + '」を削除しますか？(駅のページは消えません)')) return;
          lines.splice(S.sel.line, 1); S.sel.line = 0; markDirty(); renderPanel();
        }, 'danger'))) : h('p', { class: 'muted', text: '路線がありません。「＋ 路線を追加」から作ってください。' })
    ];
  }

  function panelStationPages() {
    var list = S.content.stations;
    if (S.sel.station >= list.length) S.sel.station = Math.max(0, list.length - 1);
    var s = list[S.sel.station];
    if (s) { s.photos = s.photos || ['', '']; while (s.photos.length < 2) s.photos.push(''); }
    var addForm = { name: '', slug: '', code: '', line: (S.content.lines[0] || {}).id || '' };
    var myLines = s ? G.linesOfStation(S.content, s.slug) : [];
    var otherLines = s ? S.content.lines.filter(function (l) { return myLines.indexOf(l) < 0; }) : [];
    var slugBox = { v: s ? s.slug : '' };
    return [
      card('駅のページ', '駅ごとのページです。路線への並びは「🛤️ 路線」で変えられます。',
        picker(list, 'station', function (x) { return (x.code ? x.code + ' ' : '') + x.name; }),
        h('details', { class: 'new-box' }, h('summary', { text: '＋ 駅を追加する' }),
          h('div', { class: 'grid2', style: 'margin-top:10px' },
            field('駅名', text(addForm, 'name')), field('駅番号', text(addForm, 'code', { placeholder: '例: TA03' })),
            field('ページのID(英小文字・数字・ハイフン)', text(addForm, 'slug', { placeholder: '例: ashiarai' }), '空なら駅番号から自動で付けます'),
            field('入れる路線', select(addForm, 'line', S.content.lines.map(function (l) { return [l.id, l.name + 'の最後に追加']; }).concat([['', '(どの路線にも入れない)']])))),
          btn('追加する', function () {
            var name = (addForm.name || '').trim();
            if (!name) return showFlash('error', '駅名を入れてください。');
            var slug = (addForm.slug || '').trim().toLowerCase() || (addForm.code || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || uid('st-');
            if (!slugOk(slug)) return showFlash('error', 'IDは英小文字・数字・ハイフンで付けてください。');
            if (stationBySlug(slug)) return showFlash('error', 'そのIDの駅はもうあります。');
            list.push({ slug: slug, code: (addForm.code || '').trim(), extraCode: '', name: name, stops: '', facilities: [], transfer: '', photos: ['', ''], text: '' });
            var line = S.content.lines.filter(function (l) { return l.id === addForm.line; })[0];
            if (line) (line.stops = line.stops || []).push({ station: slug });
            S.sel.station = list.length - 1; markDirty(); renderPanel(); schedulePreview();
            showFlash('ok', name + '駅を追加しました' + (line ? '(' + line.name + 'の最後)' : '') + '。');
          }, 'primary'))),
      s ? card(s.name + '駅', null,
        h('div', { class: 'grid2' },
          field('駅名', text(s, 'name')),
          h('div', { class: 'f' }, h('label', { text: 'ページのID(URLの一部)' }),
            h('div', { class: 'row' }, h('input', { type: 'text', value: slugBox.v, oninput: function (e) { slugBox.v = e.target.value.trim().toLowerCase(); } }),
              btn('変更', function () {
                var nv = slugBox.v;
                if (nv === s.slug) return;
                if (!slugOk(nv)) return showFlash('error', 'IDは英小文字・数字・ハイフンで付けてください。');
                if (stationBySlug(nv)) return showFlash('error', 'そのIDの駅はもうあります。');
                S.content.lines.forEach(function (l) { (l.stops || []).forEach(function (stop) { if (stop.station === s.slug) stop.station = nv; }); });
                s.slug = nv; markDirty(); renderPanel(); schedulePreview(); showFlash('ok', 'IDを「' + nv + '」に変えました。前のURLは使えなくなります。');
              }, 'small')),
            h('span', { class: 'hint', text: '変えると前のURLは使えなくなります' })),
          field('駅番号', text(s, 'code', { placeholder: 'TK05' })), field('2つ目の駅番号(任意)', text(s, 'extraCode')),
          field('停車種別', text(s, 'stops', { placeholder: '特急・急行・普通' })), field('乗り換え(高山鐡道以外の路線など・任意)', text(s, 'transfer'))),
        field('設備(「、」で区切る)', h('input', { type: 'text', value: (s.facilities || []).join('、'), oninput: function (e) {
          s.facilities = e.target.value.split(/[、,]/).map(function (x) { return x.trim(); }).filter(Boolean); markDirty();
        } })),
        h('div', { class: 'f' }, h('label', { text: '入っている路線' }),
          h('div', { class: 'row' }, myLines.length ? myLines.map(function (l) { return h('span', { class: 'chip', text: l.name }); }) : h('span', { class: 'muted small', text: 'どの路線にも入っていません(路線図に出ません)' }),
            otherLines.map(function (l) { return btn('＋ ' + l.name + 'に追加', function () { (l.stops = l.stops || []).push({ station: s.slug }); markDirty(); renderPanel(); }, 'small'); }))),
        h('div', { class: 'grid2' }, field('上の写真', imagePicker(s.photos, 0)), field('本文の下の写真', imagePicker(s.photos, 1))),
        field('紹介文', area(s, 'text', { rows: 7 }), TEXT_HINT),
        h('div', { class: 'add-row danger-zone' },
          btn('この駅を削除', function () {
            if (!window.confirm(s.name + '駅を削除しますか？(路線の並びからも外れます)')) return;
            S.content.lines.forEach(function (l) { l.stops = (l.stops || []).filter(function (stop) { return stop.station !== s.slug; }); });
            list.splice(S.sel.station, 1); S.sel.station = 0; markDirty(); renderPanel();
          }, 'danger'))) : null
    ];
  }

  function usageCount(path) {
    var json = JSON.stringify(Object.assign({}, S.content, { images: [] }));
    return json.split('"' + path + '"').length - 1;
  }

  function panelImages() {
    var fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, style: 'display:none', onchange: function (e) {
      Array.prototype.forEach.call(e.target.files, function (f) { uploadImage(f, function () { renderPanel(); }); });
    } });
    var drop = h('div', { class: 'drop-zone', onclick: function () { fileInput.click(); },
      ondragover: function (e) { e.preventDefault(); drop.classList.add('over'); },
      ondragleave: function () { drop.classList.remove('over'); },
      ondrop: function (e) { e.preventDefault(); drop.classList.remove('over'); Array.prototype.forEach.call(e.dataTransfer.files, function (f) { uploadImage(f, function () { renderPanel(); }); }); } },
      '📤 ここに画像をドラッグ、または押して選ぶ(PNG・JPEG・WebP・GIF、4MBまで)');
    return card('画像', 'アップロードした画像は、各ページの「写真」「画像」で選べるようになります。',
      fileInput, drop,
      h('div', { class: 'img-grid' }, (S.content.images || []).map(function (p, i) {
        var used = usageCount(p);
        return h('figure', null, h('img', { src: siteUrl(p), alt: '', loading: 'lazy' }),
          h('figcaption', null, p.replace(/^assets\/img\//, ''), h('br'), h('span', { class: used ? 'used' : 'unused', text: used ? used + 'か所で使用中' : '使っていません' })),
          btn('一覧から外す', function () {
            if (used && !window.confirm('この画像は' + used + 'か所で使われています。一覧から外しても、ページの画像はそのまま残ります。外しますか？')) return;
            S.content.images.splice(i, 1); markDirty(); renderPanel();
          }, 'small danger'));
      })));
  }

  function panelSettings() {
    var st = S.content.settings;
    st.links = st.links || [];
    st.theme = st.theme || {};
    return [
      card('サイト全体', null,
        h('div', { class: 'grid2' }, field('サイト名', text(st, 'siteName')), field('英語名', text(st, 'siteNameEn'))),
        field('検索結果に出る説明', area(st, 'description', { rows: 2 })),
        field('一番下の小さい文字', text(st, 'footerNote'))),
      card('ロゴ', null,
        h('div', { class: 'grid2' }, field('左上のロゴ(横長)', imagePicker(st, 'logoWide', false)), field('アイコン(正方形・タブと一番下に出る)', imagePicker(st, 'logoSquare', false)))),
      card('色', 'サイト全体の色を変えられます。',
        h('div', { class: 'grid4' },
          field('メインの色(紺)', color(st.theme, 'navy', '#14286e')), field('アクセント(緑)', color(st.theme, 'green', '#1f9a55')),
          field('目立つ色(黄緑)', color(st.theme, 'lime', '#c6f26b')), field('一番下の背景', color(st.theme, 'footer', '#0b1640'))),
        btn('元の色に戻す', function () { st.theme = { navy: '#14286e', green: '#1f9a55', lime: '#c6f26b', footer: '#0b1640' }; markDirty(); renderPanel(); }, 'small')),
      card('一番下のリンク', null,
        listEditor(st.links, function (l) { return h('div', { class: 'grid2' }, field('文字', text(l, 'label')), field('リンク先', text(l, 'href'))); },
          function () { return { label: '', href: 'https://' }; }, 'リンク'))
    ];
  }

  function panelPreview() {
    var files;
    try { files = G.generateSite(S.content); } catch (e) { return h('div', { class: 'msg error', text: 'プレビューを作れませんでした: ' + e.message }); }
    var names = Object.keys(files).filter(function (f) { return f !== 'verify/index.html' && f !== '404.html'; });
    var state = { file: files[S.previewFile] ? S.previewFile : 'index.html' };
    var frame = h('iframe', { class: 'preview-frame', title: 'プレビュー', sandbox: 'allow-same-origin allow-popups' });
    function show() { S.previewFile = state.file; renderPreviewInto(frame, state.file); }
    setTimeout(show, 0);
    return card('全ページを見る(保存前の見た目)', '運行予定など、動きのある部分はプレビューでは表示されません。',
      h('div', { class: 'preview-bar' }, select(state, 'file', names.map(function (f) { return [f, f]; }), show), btn('作り直す', function () { show(); })),
      frame);
  }

  function panelAi() {
    var form = { page: '全体', text: '' };
    var result = h('div');
    var targets = [['全体', 'サイト全体'], ['トップページ', 'トップページ']].concat(S.content.pages.map(function (p) { return [p.title, p.title]; }))
      .concat([['お知らせ', 'お知らせ'], ['駅・路線', '駅・路線'], ['デザイン(色・レイアウト)', 'デザイン(色・レイアウト)'], ['管理画面', '管理画面そのもの']]);
    return card('🤖 AIへ送信', '管理画面ではできない変更(新しい機能・デザインの大きな変更など)をお願いするときに使います。社長だけが見られるDiscordの「ai依頼」チャンネルに、Claudeにそのまま貼れる形で届きます。',
      field('どこを変えたいですか？', select(form, 'page', targets)),
      field('やってほしいこと', area(form, 'text', { rows: 8, placeholder: '例: 運賃のページに、区間ごとの運賃表を追加してほしい。桜が丘〜京堂までの全部の組み合わせ。' }), 'できるだけ具体的に書くと、思った通りに作ってもらいやすいです。'),
      btn('送信する', function (e) {
        if (!form.text.trim()) return showFlash('error', 'やってほしいことを書いてください。');
        e.target.disabled = true;
        api('POST', '/api/admin/ai-request', form).then(function (res) {
          e.target.disabled = false;
          result.innerHTML = '';
          result.appendChild(h('div', { class: 'msg ' + (res.ok ? 'ok' : 'error'), text: res.message || (res.ok ? '送りました。' : '送れませんでした。') }));
        });
      }, 'primary'), result);
  }

  // ---------- 画面の組み立て ----------
  function showFlash(type, textMsg, extra) {
    S.flash = { type: type, text: textMsg, extra: extra };
    var box = document.getElementById('flash');
    if (box) { box.innerHTML = ''; box.appendChild(h('div', { class: 'msg ' + type }, textMsg, extra || null)); }
  }

  function renderPanel() {
    var panel = document.getElementById('panel');
    if (!panel) return render();
    var y = window.scrollY;
    panel.innerHTML = '';
    var tab = TABS.filter(function (t) { return t[0] === S.tab; })[0];
    if (tab && tab[3]) panel.appendChild(h('p', { class: 'tab-help', text: tab[3] }));
    var fn = { home: panelHome, pages: panelPages, nav: panelNav, news: panelNews, stations: panelStations, images: panelImages, settings: panelSettings, preview: panelPreview, ai: panelAi }[S.tab];
    append(panel, fn());
    window.scrollTo(0, y);
  }

  function hasLivePreview() { return ['home', 'pages', 'nav', 'news', 'stations', 'settings'].indexOf(S.tab) >= 0; }

  function render() {
    app.innerHTML = '';
    if (!S.token) return renderLogin();
    if (!S.content) return renderLoading();
    var tab = TABS.filter(function (t) { return t[0] === S.tab; })[0] || TABS[0];
    var memo = { v: '' };
    var live = S.livePreview && hasLivePreview();
    app.appendChild(h('div', { class: 'shell' },
      h('aside', { class: 'side' },
        h('div', { class: 'brand-mini' }, '高山鐡道 管理画面', h('small', { text: '公式サイトの編集' })),
        TABS.map(function (t) {
          return h('button', { type: 'button', 'aria-current': S.tab === t[0] ? 'page' : null, onclick: function () { S.tab = t[0]; render(); } }, t[1] + ' ' + t[2]);
        }),
        h('div', { class: 'who' }, 'ログイン中: ' + S.name, h('br'), h('a', { href: siteUrl(''), target: '_blank', rel: 'noopener', style: 'color:#c6f26b' }, '公式サイトを開く ↗'))),
      h('div', { class: 'main' },
        h('div', { class: 'topbar' },
          h('h1', { text: tab[1] + ' ' + tab[2] }),
          h('span', { id: 'save-flag', class: S.dirty ? 'dirty' : 'saved', text: S.dirty ? '未保存の変更あり' : '保存済み' }),
          hasLivePreview() ? btn(S.livePreview ? '横のプレビューを隠す' : '横にプレビューを出す', function () {
            S.livePreview = !S.livePreview;
            try { localStorage.setItem(PREVIEW_KEY, S.livePreview ? 'on' : 'off'); } catch (e) { /* なし */ }
            render();
          }, 'small') : null,
          h('input', { type: 'text', placeholder: '変更メモ(任意)', class: 'memo', oninput: function (e) { memo.v = e.target.value; } }),
          btn('読み込み直す', function () { if (S.dirty && !window.confirm('保存していない変更は消えます。読み込み直しますか？')) return; clearDraft(); loadContent(); }),
          btn('保存して公開', function (e) { save(memo.v, e.target); }, 'primary', { id: 'save-button', title: 'Ctrl + S でも保存できます' }),
          btn('ログアウト', function () { if (S.dirty && !window.confirm('保存していない変更があります(下書きとしてこのブラウザに残ります)。ログアウトしますか？')) return; api('POST', '/api/admin/logout'); logout(); }, 'small')),
        h('div', { id: 'flash', class: 'flash-wrap' }, S.flash ? h('div', { class: 'msg ' + S.flash.type }, S.flash.text, S.flash.extra || null) : null),
        h('div', { class: 'work' + (live ? ' with-preview' : '') },
          h('div', { id: 'panel', class: 'panel' }),
          live ? h('aside', { class: 'live' },
            h('div', { class: 'live-head' }, '👁️ プレビュー ', h('span', { id: 'live-file', class: 'muted small', text: currentPreviewFile() })),
            h('iframe', { id: 'live-frame', class: 'live-frame', title: 'プレビュー', sandbox: 'allow-same-origin allow-popups' })) : null))));
    renderPanel();
    if (live) schedulePreview();
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

  function normalize(c) {
    ['nav', 'pages', 'news', 'stations', 'images', 'lines'].forEach(function (k) { if (!Array.isArray(c[k])) c[k] = []; });
    c.settings = c.settings || {}; c.home = c.home || {}; c.newsPage = c.newsPage || {};
    return c;
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
      S.content = normalize(res.content); S.sha = res.sha; S.dirty = false; S.flash = null;
      // 前回保存していない下書きがあれば、戻すか聞く
      var draft = null;
      try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { /* なし */ }
      if (draft && draft.content && JSON.stringify(draft.content) !== JSON.stringify(S.content)) {
        var when = new Date(draft.at).toLocaleString('ja-JP');
        var stale = draft.sha !== res.sha;
        S.flash = { type: 'info', text: '保存していない下書きがあります(' + when + ')。' + (stale ? 'その後に誰かが保存しているので、戻すとその変更は消えます。' : ''),
          extra: h('span', null, ' ', btn('下書きを戻す', function () { S.content = normalize(draft.content); S.dirty = true; S.flash = null; render(); markDirty(); }, 'small primary'), ' ',
            btn('下書きを捨てる', function () { clearDraft(); S.flash = null; render(); }, 'small')) };
      }
      render();
    });
  }

  // 保存後、公式サイトに本当に反映されたかを確かめる
  function watchPublish(build) {
    var started = Date.now();
    var tick = function () {
      if (Date.now() - started > 4 * 60 * 1000) {
        return showFlash('info', '保存は完了しています。公式サイトへの反映に時間がかかっています(GitHubの混雑など)。数分後に見てみてください。');
      }
      fetch(siteUrl('index.html') + '?check=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (html) {
        if (html.indexOf('content="' + build + '"') >= 0) {
          showFlash('ok', '✅ 公式サイトに反映されました。', h('span', null, ' ', h('a', { href: siteUrl(S.tab === 'home' ? '' : currentPreviewFile()) + '?v=' + Date.now(), target: '_blank', rel: 'noopener' }, '公式サイトで見る ↗'),
            h('span', { class: 'muted small', text: '(古いページが出たら、ページを再読み込みしてください)' })));
        } else {
          var sec = Math.round((Date.now() - started) / 1000);
          showFlash('info', '保存しました。公式サイトに反映しています…(' + sec + '秒・ふつう1〜2分)');
          setTimeout(tick, 6000);
        }
      }, function () { setTimeout(tick, 8000); });
    };
    tick();
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
      if (res.build) S.content.settings.build = res.build;
      clearDraft();
      var f = document.getElementById('save-flag');
      if (f) { f.className = 'saved'; f.textContent = '保存済み'; }
      if (res.build) watchPublish(res.build); else showFlash('ok', '保存しました。1〜2分で公式サイトに反映されます。');
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
