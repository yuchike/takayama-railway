// 高山鐡道 公式サイトのページ生成。data/site.json の中身から、全ページのHTMLを作る。
// 同じファイルを3か所で使う:
//   ・手元: node site-src/build.js
//   ・管理画面のプレビュー: takayama-railway/admin/generator.js (このファイルのコピー)
//   ・botが保存するとき: bot の site-generator.js (このファイルのコピー)
// 文章はすべてエスケープする。使える書式は **太字** と [文字](リンク先) だけ。
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.TakatetsuSiteGenerator = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var BLOCK_TYPES = ['heading', 'subheading', 'text', 'note', 'image', 'columns', 'button', 'list', 'table', 'gallery', 'youtube', 'divider', 'lines', 'stations', 'line', 'shifts'];
    var RESERVED_FILES = ['index.html', 'news.html', '404.html', 'verify/index.html'];
    var DEFAULT_LINE_COLORS = ['#1f9a55', '#e9832b', '#2f6fdb', '#c0392b', '#8e44ad'];

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    function safeColor(c, fallback) { return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : fallback; }
    function slugOk(s) { return /^[a-z0-9][a-z0-9-]{0,40}$/.test(String(s || '')); }

    // **太字** と [文字](リンク先) だけ使える文章
    function rich(text, r) {
        var s = esc(text);
        s = s.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g, function (m, label, href) {
            var raw = href.replace(/&amp;/g, '&');
            var url = safeHref(raw, r);
            if (url === '#') return m;
            return '<a href="' + esc(url) + '"' + (/^https?:/i.test(raw) ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
        });
        s = s.replace(/\*\*([^*\n]{1,300})\*\*/g, '<strong>$1</strong>');
        return s;
    }
    function paras(text, r) {
        return String(text || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean)
            .map(function (l) { return '<p>' + rich(l, r) + '</p>'; }).join('\n');
    }
    function lines(text, r) {
        return String(text || '').split('\n').map(function (l) { return rich(l, r); }).join('<br>');
    }
    function youtubeId(url) {
        var m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        return m ? m[1] : (/^[A-Za-z0-9_-]{11}$/.test(String(url || '')) ? url : '');
    }

    function pageFile(content, id) {
        if (id === 'home') return 'index.html';
        if (id === 'news') return 'news.html';
        var p = (content.pages || []).filter(function (x) { return x.id === id; })[0];
        return p ? p.file : null;
    }
    function stationBySlug(content, slug) {
        return (content.stations || []).filter(function (s) { return s.slug === slug; })[0] || null;
    }
    function lineColor(line, i) { return safeColor(line && line.color, DEFAULT_LINE_COLORS[i % DEFAULT_LINE_COLORS.length]); }
    // その駅が入っている路線の一覧
    function linesOfStation(content, slug) {
        return (content.lines || []).filter(function (l) { return (l.stops || []).some(function (st) { return st.station === slug; }); });
    }

    // 1本の路線(駅の並び)
    function renderLine(content, line, idx, r) {
        var color = lineColor(line, idx);
        return '<ol class="line" style="--line-color:' + color + '">' + (line.stops || []).map(function (stop) {
            var st = stop.station ? stationBySlug(content, stop.station) : null;
            var name = st ? st.name : (stop.name || '？？？');
            var code = stop.code || (st ? st.code : '');
            var transfer = st && linesOfStation(content, st.slug).length > 1;
            var others = transfer ? linesOfStation(content, st.slug).filter(function (l) { return l !== line; }).map(function (l) { return l.name; }) : [];
            var extra = (st && st.transfer ? [st.transfer] : []).concat(others);
            var inner = (code ? '<span class="code">' + esc(code) + '</span>' : '') + '<span class="name">' + esc(name) + '</span>';
            return '<li' + (transfer || (st && st.transfer) ? ' class="transfer"' : '') + '>' +
                (st && slugOk(st.slug) ? '<a href="' + r + 'stations/' + esc(st.slug) + '.html">' + inner + '</a>' : inner) +
                (extra.length ? '<span class="xfer">→ ' + esc(extra.join('・')) + '</span>' : '') + '</li>';
        }).join('') + '</ol>';
    }

    // ---- 部品 ----
    function renderBlock(b, ctx) {
        var r = ctx.r;
        switch (b && b.type) {
            case 'heading': return '<h2>' + esc(b.text) + '</h2>';
            case 'subheading': return '<h3>' + esc(b.text) + '</h3>';
            case 'text': return paras(b.text, r);
            case 'note': return '<p class="muted">' + rich(b.text, r) + '</p>';
            case 'divider': return '<hr class="divider">';
            case 'image': {
                var src = safeSrc(b.src, r);
                if (!src) return '';
                var img = '<img src="' + esc(src) + '" alt="' + esc(b.alt || b.caption || '') + '" loading="lazy">';
                return '<figure class="' + (b.link ? 'route-map' : '') + '">' + (b.link ? '<a href="' + esc(src) + '">' + img + '</a>' : img) +
                    (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
            }
            case 'columns': {
                var s2 = safeSrc(b.src, r);
                return '<div class="two-col' + (b.side === 'right' ? ' img-right' : '') + '">' +
                    (s2 ? '<figure><img src="' + esc(s2) + '" alt="' + esc(b.caption || '') + '" loading="lazy">' + (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>' : '') +
                    '<div>' + (b.title ? '<h3>' + esc(b.title) + '</h3>' : '') + paras(b.text, r) + '</div></div>';
            }
            case 'button':
                return '<p><a class="button" href="' + esc(safeHref(b.href, r)) + '"' + (/^https?:/i.test(b.href || '') ? ' target="_blank" rel="noopener"' : '') + '>' + esc(b.label || 'ひらく') + '</a></p>';
            case 'list': {
                var tag = b.ordered ? 'ol' : 'ul';
                return '<' + tag + '>' + (b.items || []).map(function (x) { return '<li>' + rich(x, r) + '</li>'; }).join('') + '</' + tag + '>';
            }
            case 'table':
                return '<table class="' + (b.style === 'fare' ? 'fare' : '') + '">' + (b.rows || []).map(function (row) {
                    return '<tr><th>' + esc(row[0]) + '</th><td>' + lines(row[1], r) + '</td></tr>';
                }).join('') + '</table>';
            case 'gallery':
                return '<div class="gallery">' + (b.items || []).map(function (it) {
                    var s = safeSrc(it.src, r);
                    if (!s) return '';
                    return '<figure><img src="' + esc(s) + '" alt="' + esc(it.caption) + '" loading="lazy"><figcaption>' + esc(it.caption) +
                        (it.credit ? ' <span>' + esc(it.credit) + '</span>' : '') + '</figcaption></figure>';
                }).join('') + '</div>';
            case 'youtube': {
                var id = youtubeId(b.url);
                if (!id) return '';
                return '<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + '" title="' + esc(b.caption || 'YouTube動画') +
                    '" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>' +
                    (b.caption ? '<p class="muted small">' + esc(b.caption) + '</p>' : '');
            }
            case 'lines': // 全部の路線(路線図ページ用)
                return (ctx.content.lines || []).map(function (l, i) {
                    return '<h2 class="line-title" style="--line-color:' + lineColor(l, i) + '">' + esc(l.name) + '</h2>' +
                        (l.note ? '<p class="muted">' + rich(l.note, r) + '</p>' : '') + renderLine(ctx.content, l, i, r);
                }).join('\n');
            case 'stations': { // 1本目の路線(古いデータ用)
                var first = (ctx.content.lines || [])[0];
                return first ? renderLine(ctx.content, first, 0, r) : '';
            }
            case 'line': // 手で並べた駅(古いデータ用)
                return '<ol class="line" style="--line-color:' + DEFAULT_LINE_COLORS[1] + '">' + (b.items || []).map(function (it) {
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

    function themeStyle(st) {
        var t = st.theme || {};
        var vars = [];
        if (safeColor(t.navy)) vars.push('--navy:' + t.navy);
        if (safeColor(t.green)) vars.push('--green:' + t.green);
        if (safeColor(t.lime)) vars.push('--lime:' + t.lime);
        if (safeColor(t.footer)) vars.push('--navy-deep:' + t.footer);
        return vars.length ? '<style>:root{' + vars.join(';') + '}</style>\n' : '';
    }

    function layout(content, opt) {
        var file = opt.file;
        var depth = file.split('/').length - 1;
        var r = new Array(depth + 1).join('../');
        var st = content.settings || {};
        var logoWide = safeSrc(st.logoWide || 'assets/img/logo-wide.jpg', r) || r + 'assets/img/logo-wide.jpg';
        var logoSquare = safeSrc(st.logoSquare || 'assets/img/logo-square.jpg', r) || r + 'assets/img/logo-square.jpg';
        var nav = (content.nav || []).map(function (n) {
            var target = n.page ? pageFile(content, n.page) : null;
            var href = target ? r + target : safeHref(n.href, r);
            var current = n.page && (n.page === opt.navId);
            var ext = !target && /^https?:/i.test(n.href || '');
            return '<a href="' + esc(href) + '"' + (current ? ' aria-current="page"' : '') + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(n.label) + '</a>';
        }).join('');
        var heroSrc = opt.hero ? safeSrc(opt.hero, r) : '';
        var hero = heroSrc ? '\n<section class="hero" style="background-image:url(\'' + esc(heroSrc) + '\')">\n  <div class="hero-inner">\n    <h1>' +
            esc(opt.heroTitle || opt.title) + '</h1>\n    ' + (opt.heroSub ? '<p>' + esc(opt.heroSub) + '</p>' : '') + '\n  </div>\n</section>'
            : (opt.noTitle ? '' : '\n<section class="page-title"><div class="hero-inner"><h1>' + esc(opt.heroTitle || opt.title) + '</h1>' + (opt.heroSub ? '<p>' + esc(opt.heroSub) + '</p>' : '') + '</div></section>');
        var title = opt.title === st.siteName ? st.siteName + ' 公式サイト' : opt.title + ' | ' + (st.siteName || '');
        var links = (st.links || []).map(function (l) {
            return '<li><a href="' + esc(safeHref(l.href, r)) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a></li>';
        }).join('\n      ');
        return '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
            '<title>' + esc(title) + '</title>\n<meta name="description" content="' + esc(opt.description || st.description || '') + '">\n' +
            (st.build ? '<meta name="takatetsu-build" content="' + esc(st.build) + '">\n' : '') +
            '<link rel="icon" href="' + esc(logoSquare) + '">\n<link rel="stylesheet" href="' + r + 'assets/style.css">\n' + themeStyle(st) + (opt.extraHead || '') + '\n</head>\n' +
            '<body' + (opt.bodyClass ? ' class="' + opt.bodyClass + '"' : '') + '>\n' +
            '<header class="site-header">\n  <div class="bar">\n    <a class="brand" href="' + r + 'index.html"><img src="' + esc(logoWide) + '" alt="' + esc(st.siteName) + '" width="160" height="49"></a>\n' +
            '    <input type="checkbox" id="nav-toggle" class="nav-toggle" aria-label="メニュー">\n    <label for="nav-toggle" class="nav-button" aria-hidden="true"><span></span><span></span><span></span></label>\n' +
            '    <nav class="site-nav">' + nav + '</nav>\n  </div>\n</header>' + hero + '\n<main class="content">\n' + opt.body + '\n</main>\n' +
            '<footer class="site-footer">\n  <div class="footer-inner">\n    <div>\n      <img src="' + esc(logoSquare) + '" alt="" width="56" height="56" class="footer-logo">\n' +
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
        var newsItems = news.slice(0, home.newsCount == null ? 3 : home.newsCount).map(function (n) {
            return '<li><span class="badge">' + esc(n.badge || 'NEW') + '</span><a href="news/' + esc(n.id) + '.html">' + esc(n.title) + '</a></li>';
        }).concat((home.extraNews || []).map(function (x) {
            return '<li><span class="badge">' + esc(x.badge || 'NEW') + '</span><a href="' + esc(safeHref(x.href, '')) + '"' + (/^https?:/i.test(x.href || '') ? ' target="_blank" rel="noopener"' : '') + '>' + esc(x.text) + '</a></li>';
        }));
        var sections = {
            news: newsItems.length ? '<section class="news-strip">\n  <h2>' + esc(home.newsTitle || '最新のお知らせ') + '</h2>\n  <ul>\n    ' + newsItems.join('\n    ') + '\n  </ul>\n</section>' : '',
            posters: (home.posters || []).length ? '<section class="posters">' + home.posters.map(function (p) {
                var s = safeSrc(p.src, ''); return s ? '<figure><img src="' + esc(s) + '" alt="' + esc(p.alt) + '" loading="lazy"></figure>' : '';
            }).join('') + '</section>' : '',
            tagline: (home.tagline || []).length ? '<section class="tagline">' + home.tagline.map(function (pair) {
                return '<p><span>' + esc(pair[0]) + '</span><span>' + esc(pair[1]) + '</span></p>';
            }).join('') + '</section>' : '',
            tiles: (home.tiles || []).length ? '<section class="tiles">' + home.tiles.map(function (t) {
                var target = t.page ? pageFile(content, t.page) : null;
                return '<a class="tile" href="' + esc(target || safeHref(t.href, '')) + '"><span>' + esc(t.label) + '</span></a>';
            }).join('') + '</section>' : '',
            sections: (home.sections || []).map(function (sec) {
                var bg = safeSrc(sec.image, '');
                return '<section class="cta"' + (bg ? ' style="background-image:url(\'' + esc(bg) + '\')"' : '') + '>\n  <div class="cta-inner">\n    <h2>' + esc(sec.title) + '</h2>\n    <p>' + lines(sec.text, '') + '</p>\n' +
                    (sec.buttonLabel ? '    <a class="button" href="' + esc(safeHref(sec.buttonHref, '')) + '"' + (/^https?:/i.test(sec.buttonHref || '') ? ' target="_blank" rel="noopener"' : '') + '>' + esc(sec.buttonLabel) + '</a>\n' : '') +
                    (sec.note ? '    <p class="small">' + esc(sec.note) + '</p>\n' : '') + '  </div>\n</section>';
            }).join('\n'),
            blocks: (home.blocks || []).length ? '<section class="prose">' + renderBlocks(home.blocks, { content: content, r: '' }) + '</section>' : ''
        };
        var order = Array.isArray(home.order) && home.order.length ? home.order : ['news', 'posters', 'tagline', 'tiles', 'sections', 'blocks'];
        var homeBody = order.filter(function (k) { return sections[k] != null; }).map(function (k) { return sections[k]; }).filter(Boolean).join('\n');
        files['index.html'] = layout(content, {
            file: 'index.html', navId: 'home', title: st.siteName, hero: home.hero, heroTitle: home.heroTitle, heroSub: home.heroSub, noTitle: true,
            bodyClass: 'home' + (order[0] === 'news' && newsItems.length && safeSrc(home.hero, '') ? '' : ' no-overlap'), body: homeBody
        });

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
        var mapFile = pageFile(content, 'map') || 'map.html';
        (content.stations || []).forEach(function (s) {
            if (!slugOk(s.slug)) return;
            var codes = [s.code, s.extraCode].filter(Boolean).join(' / ');
            var photo2 = s.photos && s.photos[1] ? safeSrc(s.photos[1], '../') : '';
            var myLines = linesOfStation(content, s.slug);
            // 路線ごとの「前の駅・次の駅」
            var navs = myLines.map(function (l) {
                var stops = (l.stops || []).filter(function (x) { return x.station && stationBySlug(content, x.station); });
                var i = stops.map(function (x) { return x.station; }).indexOf(s.slug);
                var prev = i > 0 ? stationBySlug(content, stops[i - 1].station) : null;
                var next = i >= 0 && i < stops.length - 1 ? stationBySlug(content, stops[i + 1].station) : null;
                return '<nav class="station-nav">\n    ' + (prev ? '<a href="' + esc(prev.slug) + '.html">← ' + esc(prev.name) + '</a>' : '<span></span>') +
                    '\n    <span class="line-name" style="--line-color:' + lineColor(l, (content.lines || []).indexOf(l)) + '">' + esc(l.name) + '</span>\n    ' +
                    (next ? '<a href="' + esc(next.slug) + '.html">' + esc(next.name) + ' →</a>' : '<span></span>') + '\n  </nav>';
            }).join('\n');
            var body = '<section class="prose station">\n  <dl class="station-info">\n    <dt>駅番号</dt><dd>' + esc(codes || '—') + '</dd>\n' +
                (myLines.length ? '    <dt>路線</dt><dd>' + myLines.map(function (l) { return '<span class="chip">' + esc(l.name) + '</span>'; }).join('') + '</dd>\n' : '') +
                '    <dt>停車種別</dt><dd>' + esc(s.stops || '—') + '</dd>\n' +
                '    <dt>設備</dt><dd>' + ((s.facilities || []).map(function (f) { return '<span class="chip">' + esc(f) + '</span>'; }).join('') || '—') + '</dd>\n' +
                (s.transfer ? '    <dt>乗り換え</dt><dd>' + esc(s.transfer) + '</dd>\n' : '') + '  </dl>\n' +
                (s.text ? paras(s.text, '../') : '<p class="muted">この駅の紹介文は準備中です。</p>') + '\n' +
                (photo2 ? '<figure><img src="' + esc(photo2) + '" alt="' + esc(s.name) + '駅" loading="lazy"></figure>\n' : '') +
                navs + '\n  <p class="center"><a href="../' + esc(mapFile) + '">路線図へ戻る</a></p>\n</section>';
            files['stations/' + s.slug + '.html'] = layout(content, {
                file: 'stations/' + s.slug + '.html', navId: 'map', title: s.name + '駅', hero: s.photos && s.photos[0], heroTitle: s.name, heroSub: codes,
                description: (st.siteName || '') + ' ' + s.name + '駅の紹介', body: body
            });
        });

        // お知らせ
        var np = content.newsPage || {};
        files['news.html'] = layout(content, {
            file: 'news.html', navId: 'news', title: np.title || 'お知らせ', hero: np.hero,
            body: '<section class="prose">\n  ' + (np.intro ? '<p>' + rich(np.intro, '') + '</p>' : '') + '\n  <ul class="news-list">\n    ' + news.map(function (n) {
                return '<li><span class="badge">' + esc(n.badge || 'NEW') + '</span><a href="news/' + esc(n.id) + '.html">' + esc(n.title) + '</a>' +
                    (n.date ? ' <span class="muted small">' + esc(n.date) + '</span>' : '') + '<p>' + esc(n.summary) + '</p></li>';
            }).join('\n    ') + (news.length ? '' : '<li class="muted">まだお知らせはありません。</li>') + '\n  </ul>\n</section>'
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
            file: 'verify/index.html', title: 'メンバー認証', bodyClass: 'verify-page', noTitle: true,
            extraHead: '<meta name="robots" content="noindex, nofollow">\n<meta name="referrer" content="no-referrer">\n' + apiScript(content) + '\n<script src="verify.js" defer></script>',
            body: '<section class="verify-card" id="verify-root" aria-live="polite">\n  <noscript><p>認証にはJavaScriptが必要です。ブラウザの設定でJavaScriptを有効にしてください。</p></noscript>\n  <p class="muted">読み込んでいます…</p>\n</section>'
        });
        files['404.html'] = layout(content, {
            file: '404.html', title: 'ページが見つかりません', noTitle: true,
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
        var files = {}, ids = {};
        (c.pages || []).forEach(function (p, i) {
            var label = 'ページ「' + (p && p.title || i + 1) + '」';
            if (!p || !slugOk(p.id)) errors.push(label + ': IDは英小文字・数字・ハイフンで付けてください');
            else if (ids[p.id] || p.id === 'home' || p.id === 'news') errors.push(label + ': IDが他のページと重なっています');
            else ids[p.id] = true;
            if (!p || !/^([a-z0-9-]+\/)?[a-z0-9][a-z0-9-]*\.html$/.test(p.file || '')) errors.push(label + ': ファイル名が正しくありません');
            else if (RESERVED_FILES.indexOf(p.file) >= 0 || (/^(stations|news|verify|admin|assets|data)\//.test(p.file))) errors.push(label + ': このファイル名は使えません');
            else if (files[p.file]) errors.push(label + ': ファイル名が他のページと重なっています');
            else files[p.file] = true;
            if (!p || !String(p.title || '').trim()) errors.push(label + ': タイトルを入れてください');
            (p && p.blocks || []).forEach(function (b) { if (BLOCK_TYPES.indexOf(b && b.type) < 0) errors.push(label + ': 知らない部品があります'); });
        });
        var newsIds = {};
        (c.news || []).forEach(function (n, i) {
            if (!n || !slugOk(n.id)) errors.push('お知らせ' + (i + 1) + ': IDは英小文字・数字・ハイフンで付けてください');
            else if (newsIds[n.id]) errors.push('お知らせ「' + n.title + '」: IDが他のお知らせと重なっています');
            else newsIds[n.id] = true;
        });
        var slugs = {};
        (c.stations || []).forEach(function (s, i) {
            if (!s || !slugOk(s.slug)) errors.push('駅「' + (s && s.name || i + 1) + '」: IDは英小文字・数字・ハイフンで付けてください');
            else if (slugs[s.slug]) errors.push('駅「' + s.name + '」: IDが他の駅と重なっています');
            else slugs[s.slug] = true;
        });
        (c.lines || []).forEach(function (l, i) {
            if (!l || !String(l.name || '').trim()) errors.push('路線' + (i + 1) + ': 路線名を入れてください');
            (l && l.stops || []).forEach(function (stop) {
                if (stop.station && !slugs[stop.station]) errors.push('路線「' + l.name + '」: 消された駅が残っています(駅を選び直してください)');
            });
        });
        return errors;
    }

    return {
        generateSite: generateSite, validateContent: validateContent, BLOCK_TYPES: BLOCK_TYPES, pageFile: pageFile, esc: esc,
        linesOfStation: linesOfStation, youtubeId: youtubeId, DEFAULT_LINE_COLORS: DEFAULT_LINE_COLORS
    };
});
