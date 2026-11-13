// 高山鐡道 公式サイトのページ生成。data/site.json の中身から、全ページのHTMLを作る。
// 同じファイルを3か所で使う:
//   ・手元: node site-src/build.js
//   ・管理画面のプレビュー: takayama-railway/admin/generator.js (このファイルのコピー)
//   ・botが保存するとき: bot の site-generator.js (このファイルのコピー)
// 文章はすべてエスケープするので、管理画面からHTMLを入れても、そのまま文字として表示される。
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.TakatetsuSiteGenerator = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var BLOCK_TYPES = ['heading', 'subheading', 'text', 'note', 'image', 'button', 'list', 'table', 'gallery', 'stations', 'line', 'shifts'];
    var RESERVED_FILES = ['index.html', 'news.html', '404.html', 'verify/index.html'];

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function paras(text) {
        return String(text || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean)
            .map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('\n');
    }
    function lines(text) {
        return String(text || '').split('\n').map(esc).join('<br>');
    }
    // リンク先: http(s)、メール、サイト内の相対パスだけ許可
    function safeHref(h, r) {
        h = String(h || '').trim();
        if (/^https?:\/\//i.test(h) || /^mailto:/i.test(h)) return h;
        if (/^[a-z0-9_\-./#?=&%]+$/i.test(h) && h.indexOf('..') === -1 && h.charAt(0) !== '/') return (r || '') + h;
        return '#';
    }
    // 画像: サイト内の assets/ か https の画像だけ
    function safeSrc(src, r) {
        src = String(src || '').trim();
        if (/^https:\/\//i.test(src)) return src;
        if (/^assets\/[a-z0-9_\-./]+$/i.test(src) && src.indexOf('..') === -1) return (r || '') + src;
        return '';
    }
    function slugOk(s) { return /^[a-z0-9][a-z0-9-]{0,40}$/.test(String(s || '')); }

    function pageFile(content, id) {
        if (id === 'home') return 'index.html';
        if (id === 'news') return 'news.html';
        var p = (content.pages || []).filter(function (x) { return x.id === id; })[0];
        return p ? p.file : null;
    }

    // ---- 部品 ----
    function renderBlock(b, ctx) {
        var r = ctx.r;
        switch (b && b.type) {
            case 'heading': return '<h2>' + esc(b.text) + '</h2>';
            case 'subheading': return '<h3>' + esc(b.text) + '</h3>';
            case 'text': return paras(b.text);
            case 'note': return '<p class="muted">' + esc(b.text) + '</p>';
            case 'image': {
                var src = safeSrc(b.src, r);
                if (!src) return '';
                var img = '<img src="' + esc(src) + '" alt="' + esc(b.alt || b.caption || '') + '" loading="lazy">';
                return '<figure class="' + (b.link ? 'route-map' : '') + '">' + (b.link ? '<a href="' + esc(src) + '">' + img + '</a>' : img) +
                    (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
            }
            case 'button':
                return '<p><a class="button" href="' + esc(safeHref(b.href, r)) + '"' + (/^https?:/i.test(b.href || '') ? ' target="_blank" rel="noopener"' : '') + '>' + esc(b.label || 'ひらく') + '</a></p>';
            case 'list': {
                var tag = b.ordered ? 'ol' : 'ul';
                return '<' + tag + '>' + (b.items || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</' + tag + '>';
            }
            case 'table':
                return '<table class="' + (b.style === 'fare' ? 'fare' : '') + '">' + (b.rows || []).map(function (row) {
                    return '<tr><th>' + esc(row[0]) + '</th><td>' + lines(row[1]) + '</td></tr>';
                }).join('') + '</table>';
            case 'gallery':
                return '<div class="gallery">' + (b.items || []).map(function (it) {
                    var s = safeSrc(it.src, r);
                    if (!s) return '';
                    return '<figure><img src="' + esc(s) + '" alt="' + esc(it.caption) + '" loading="lazy"><figcaption>' + esc(it.caption) +
                        (it.credit ? ' <span>' + esc(it.credit) + '</span>' : '') + '</figcaption></figure>';
                }).join('') + '</div>';
            case 'stations':
                return '<ol class="line">' + (ctx.content.stations || []).map(function (s) {
                    return '<li' + (s.transfer ? ' class="transfer"' : '') + '><a href="' + r + 'stations/' + esc(s.slug) + '.html"><span class="code">' + esc(s.code) +
                        '</span><span class="name">' + esc(s.name) + '</span></a>' + (s.transfer ? '<span class="xfer">→ ' + esc(s.transfer) + '</span>' : '') + '</li>';
                }).join('') + '</ol>';
            case 'line':
                return '<ol class="line branch">' + (b.items || []).map(function (it) {
                    var inner = (it.code ? '<span class="code">' + esc(it.code) + '</span>' : '') + '<span class="name">' + esc(it.name) + '</span>';
                    return '<li' + (it.transfer ? ' class="transfer"' : '') + '>' + (it.station && slugOk(it.station) ? '<a href="' + r + 'stations/' + esc(it.station) + '.html">' + inner + '</a>' : inner) + '</li>';
                }).join('') + '</ol>';
            case 'shifts':
                return '<div id="shift-list" class="shift-list" aria-live="polite"><p class="muted">運行予定を読み込んでいます…</p></div>';
            default: return '';
        }
    }
    function renderBlocks(blocks, ctx) {
        return (blocks || []).map(function (b) { return renderBlock(b, ctx); }).join('\n');
    }

    function layout(content, opt) {
        var file = opt.file;
        var depth = file.split('/').length - 1;
        var r = new Array(depth + 1).join('../');
        var st = content.settings || {};
        var nav = (content.nav || []).map(function (n) {
            var target = n.page ? pageFile(content, n.page) : null;
            var href = target ? r + target : safeHref(n.href, r);
            var current = n.page && (n.page === opt.navId);
            var ext = !target && /^https?:/i.test(n.href || '');
            return '<a href="' + esc(href) + '"' + (current ? ' aria-current="page"' : '') + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(n.label) + '</a>';
        }).join('');
        var hero = opt.hero ? '\n<section class="hero" style="background-image:url(\'' + esc(safeSrc(opt.hero, r)) + '\')">\n  <div class="hero-inner">\n    <h1>' +
            esc(opt.heroTitle || opt.title) + '</h1>\n    ' + (opt.heroSub ? '<p>' + esc(opt.heroSub) + '</p>' : '') + '\n  </div>\n</section>' : '';
        var title = opt.title === st.siteName ? st.siteName + ' 公式サイト' : opt.title + ' | ' + (st.siteName || '');
        var links = (st.links || []).map(function (l) {
            return '<li><a href="' + esc(safeHref(l.href, r)) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a></li>';
        }).join('\n      ');
        return '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
            '<title>' + esc(title) + '</title>\n<meta name="description" content="' + esc(opt.description || st.description || '') + '">\n' +
            '<link rel="icon" href="' + r + 'assets/img/logo-square.jpg">\n<link rel="stylesheet" href="' + r + 'assets/style.css">\n' + (opt.extraHead || '') + '\n</head>\n' +
            '<body' + (opt.bodyClass ? ' class="' + opt.bodyClass + '"' : '') + '>\n' +
            '<header class="site-header">\n  <div class="bar">\n    <a class="brand" href="' + r + 'index.html"><img src="' + r + 'assets/img/logo-wide.jpg" alt="' + esc(st.siteName) + ' Takatetsu" width="160" height="49"></a>\n' +
            '    <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-label="メニュー">\n    <label for="nav-toggle" class="nav-button" aria-hidden="true"><span></span><span></span><span></span></label>\n' +
            '    <nav class="site-nav">' + nav + '</nav>\n  </div>\n</header>' + hero + '\n<main class="content">\n' + opt.body + '\n</main>\n' +
            '<footer class="site-footer">\n  <div class="footer-inner">\n    <div>\n      <img src="' + r + 'assets/img/logo-square.jpg" alt="" width="56" height="56" class="footer-logo">\n' +
            '      <p class="footer-name">' + esc(st.siteName) + ' <span>' + esc(st.siteNameEn) + '</span></p>\n    </div>\n    <ul class="footer-links">\n      ' + links + '\n    </ul>\n' +
            '    <p class="copyright">' + esc(st.footerNote) + '</p>\n  </div>\n</footer>\n</body>\n</html>\n';
    }

    function apiScript(content) {
        return '<script>window.TAKATETSU_API = ' + JSON.stringify((content.settings || {}).apiBase || '') + ';</script>';
    }

    // ---- 全ページ ----
    function generateSite(content) {
        var files = {};
        var st = content.settings || {};
        var home = content.home || {};
        var news = content.news || [];

        // トップ
        var newsItems = news.slice(0, home.newsCount || 3).map(function (n) {
            return '<li><span class="badge">' + esc(n.badge || 'NEW') + '</span><a href="news/' + esc(n.id) + '.html">' + esc(n.title) + '</a></li>';
        }).concat((home.extraNews || []).map(function (x) {
            return '<li><span class="badge">' + esc(x.badge || 'NEW') + '</span><a href="' + esc(safeHref(x.href, '')) + '"' + (/^https?:/i.test(x.href || '') ? ' target="_blank" rel="noopener"' : '') + '>' + esc(x.text) + '</a></li>';
        }));
        var homeBody =
            '<section class="news-strip">\n  <h2>最新のお知らせ</h2>\n  <ul>\n    ' + newsItems.join('\n    ') + '\n  </ul>\n</section>\n' +
            ((home.posters || []).length ? '<section class="posters">' + home.posters.map(function (p) {
                var s = safeSrc(p.src, ''); return s ? '<figure><img src="' + esc(s) + '" alt="' + esc(p.alt) + '" loading="lazy"></figure>' : '';
            }).join('') + '</section>\n' : '') +
            ((home.tagline || []).length ? '<section class="tagline">' + home.tagline.map(function (pair) {
                return '<p><span>' + esc(pair[0]) + '</span><span>' + esc(pair[1]) + '</span></p>';
            }).join('') + '</section>\n' : '') +
            ((home.tiles || []).length ? '<section class="tiles">' + home.tiles.map(function (t) {
                var target = t.page ? pageFile(content, t.page) : null;
                return '<a class="tile" href="' + esc(target || safeHref(t.href, '')) + '"><span>' + esc(t.label) + '</span></a>';
            }).join('') + '</section>\n' : '') +
            (home.sections || []).map(function (sec) {
                var bg = safeSrc(sec.image, '');
                return '<section class="cta"' + (bg ? ' style="background-image:url(\'' + esc(bg) + '\')"' : '') + '>\n  <div class="cta-inner">\n    <h2>' + esc(sec.title) + '</h2>\n    <p>' + lines(sec.text) + '</p>\n' +
                    (sec.buttonLabel ? '    <a class="button" href="' + esc(safeHref(sec.buttonHref, '')) + '" target="_blank" rel="noopener">' + esc(sec.buttonLabel) + '</a>\n' : '') +
                    (sec.note ? '    <p class="small">' + esc(sec.note) + '</p>\n' : '') + '  </div>\n</section>';
            }).join('\n');
        files['index.html'] = layout(content, { file: 'index.html', navId: 'home', title: st.siteName, hero: home.hero, heroTitle: home.heroTitle, heroSub: home.heroSub, bodyClass: 'home', body: homeBody });

        // 普通のページ
        (content.pages || []).forEach(function (p) {
            var depth = p.file.split('/').length - 1;
            var ctx = { content: content, r: new Array(depth + 1).join('../') };
            var hasShifts = (p.blocks || []).some(function (b) { return b.type === 'shifts'; });
            files[p.file] = layout(content, {
                file: p.file, navId: p.id, title: p.title, hero: p.hero, heroTitle: p.heroTitle, heroSub: p.heroSub,
                extraHead: hasShifts ? apiScript(content) + '<script src="' + ctx.r + 'assets/status.js" defer></script>' : '',
                body: '<section class="prose">\n' + renderBlocks(p.blocks, ctx) + '\n</section>'
            });
        });

        // 駅
        var stations = content.stations || [];
        stations.forEach(function (s, i) {
            if (!slugOk(s.slug)) return;
            var ctx = { content: content, r: '../' };
            var prev = stations[i - 1], next = stations[i + 1];
            var codes = [s.code, s.extraCode].filter(Boolean).join(' / ');
            var photo2 = s.photos && s.photos[1] ? safeSrc(s.photos[1], '../') : '';
            var body = '<section class="prose station">\n  <dl class="station-info">\n    <dt>駅番号</dt><dd>' + esc(codes) + '</dd>\n    <dt>停車種別</dt><dd>' + esc(s.stops) + '</dd>\n' +
                '    <dt>設備</dt><dd>' + (s.facilities || []).map(function (f) { return '<span class="chip">' + esc(f) + '</span>'; }).join('') + '</dd>\n' +
                (s.transfer ? '    <dt>乗り換え</dt><dd>' + esc(s.transfer) + '</dd>\n' : '') + '  </dl>\n' +
                (s.text ? paras(s.text) : '<p class="muted">この駅の紹介文は準備中です。</p>') + '\n' +
                (photo2 ? '<figure><img src="' + esc(photo2) + '" alt="' + esc(s.name) + '駅" loading="lazy"></figure>\n' : '') +
                '<nav class="station-nav">\n    ' + (prev ? '<a href="' + esc(prev.slug) + '.html">← ' + esc(prev.name) + '</a>' : '<span></span>') +
                '\n    <a href="../' + esc(pageFile(content, 'map') || 'map.html') + '">路線図へ</a>\n    ' + (next ? '<a href="' + esc(next.slug) + '.html">' + esc(next.name) + ' →</a>' : '<span></span>') + '\n  </nav>\n</section>';
            files['stations/' + s.slug + '.html'] = layout(content, {
                file: 'stations/' + s.slug + '.html', navId: 'map', title: s.name + '駅', hero: s.photos && s.photos[0], heroTitle: s.name, heroSub: codes,
                description: (st.siteName || '') + ' ' + s.name + '駅の紹介', body: body
            });
            void ctx;
        });

        // お知らせ
        var np = content.newsPage || {};
        files['news.html'] = layout(content, {
            file: 'news.html', navId: 'news', title: np.title || 'お知らせ', hero: np.hero,
            body: '<section class="prose">\n  <p>' + esc(np.intro) + '</p>\n  <ul class="news-list">\n    ' + news.map(function (n) {
                return '<li><span class="badge">' + esc(n.badge || 'NEW') + '</span><a href="news/' + esc(n.id) + '.html">' + esc(n.title) + '</a>' +
                    (n.date ? ' <span class="muted small">' + esc(n.date) + '</span>' : '') + '<p>' + esc(n.summary) + '</p></li>';
            }).join('\n    ') + '\n  </ul>\n</section>'
        });
        news.forEach(function (n) {
            if (!slugOk(n.id)) return;
            var ctx = { content: content, r: '../' };
            files['news/' + n.id + '.html'] = layout(content, {
                file: 'news/' + n.id + '.html', navId: 'news', title: n.title, hero: n.hero || np.hero,
                body: '<section class="prose">' + (n.date ? '<p class="muted small">' + esc(n.date) + '</p>' : '') + renderBlocks(n.blocks, ctx) + '\n  <p><a href="../news.html">← お知らせ一覧へ</a></p>\n</section>'
            });
        });

        // 認証画面と404(中身は固定)
        files['verify/index.html'] = layout(content, {
            file: 'verify/index.html', title: 'メンバー認証', bodyClass: 'verify-page',
            extraHead: '<meta name="robots" content="noindex, nofollow">\n<meta name="referrer" content="no-referrer">\n' + apiScript(content) + '\n<script src="verify.js" defer></script>',
            body: '<section class="verify-card" id="verify-root" aria-live="polite">\n  <noscript><p>認証にはJavaScriptが必要です。ブラウザの設定でJavaScriptを有効にしてください。</p></noscript>\n  <p class="muted">読み込んでいます…</p>\n</section>'
        });
        files['404.html'] = layout(content, {
            file: '404.html', title: 'ページが見つかりません',
            body: '<section class="prose"><h2>ページが見つかりません</h2><p>お探しのページは移動したか、削除された可能性があります。</p><p><a class="button" href="./index.html">トップへ戻る</a></p></section>'
        });
        return files;
    }

    // 保存してよい内容かを確かめる(壊れたデータでサイトを上書きしないため)
    function validateContent(c) {
        var errors = [];
        if (!c || typeof c !== 'object') return ['データが空です'];
        if (!Array.isArray(c.nav)) errors.push('タブ(メニュー)のデータがありません');
        if (!Array.isArray(c.pages)) errors.push('ページのデータがありません');
        var files = {};
        (c.pages || []).forEach(function (p, i) {
            var label = 'ページ「' + (p && p.title || i + 1) + '」';
            if (!p || !slugOk(p.id)) errors.push(label + ': IDは英小文字・数字・ハイフンで付けてください');
            if (!p || !/^([a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*\.html$/.test(p.file || '')) errors.push(label + ': ファイル名が正しくありません');
            else if (RESERVED_FILES.indexOf(p.file) >= 0 || /^(stations|news|verify|admin|assets|data)\//.test(p.file) && p.file.indexOf('pages/') !== 0) errors.push(label + ': このファイル名は使えません');
            else if (files[p.file]) errors.push(label + ': ファイル名が他のページと重なっています');
            else files[p.file] = true;
            if (!p || !String(p.title || '').trim()) errors.push(label + ': タイトルを入れてください');
            (p && p.blocks || []).forEach(function (b) { if (BLOCK_TYPES.indexOf(b && b.type) < 0) errors.push(label + ': 知らない部品があります'); });
        });
        (c.news || []).forEach(function (n, i) { if (!n || !slugOk(n.id)) errors.push('お知らせ' + (i + 1) + ': IDは英小文字・数字・ハイフンで付けてください'); });
        (c.stations || []).forEach(function (s, i) { if (!s || !slugOk(s.slug)) errors.push('駅' + (i + 1) + ': IDは英小文字・数字・ハイフンで付けてください'); });
        return errors;
    }

    return { generateSite: generateSite, validateContent: validateContent, BLOCK_TYPES: BLOCK_TYPES, pageFile: pageFile, esc: esc };
});
