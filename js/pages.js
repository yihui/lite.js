// move elements into page boxes such that each box contains as many elements as
// possible and will not exceed the given size (e.g. A4 paper)
(d => {
  function  $(s, el = d) { return el?.querySelector(s); }
  function $$(s, el = d) { return el ? el.querySelectorAll(s) : []; }
  function nChild(el) { return el.childElementCount; }

  const tpl = d.createElement('div'), book = $$('h1').length > 1, boxes = [],
    // elements that are never broken across pages (CSS break-inside: avoid also works)
    atomic = 'h1,h2,h3,h4,h5,h6,hr,img,svg,video,canvas,iframe,object,embed,math,mjx-container,figure,.figure,details',
    fr_cls = 'pagesjs-fragmented', fr_1 = 'fragment-first', fr_2 = 'fragment-last',
    tb = ['top', 'bottom'].map(i =>
      parseFloat(getComputedStyle(d.documentElement).getPropertyValue(`--paper-margin-${i}`)) || 0
    );  // top/bottom page margin
  tpl.className = 'pagesjs-page';
  tpl.innerHTML = `<div class="pagesjs-header"></div>
<div class="pagesjs-body"></div>
<div class="pagesjs-footer"></div>`;
  let box, box_body, box_ctx, wrap = [], H, B, H_min;  // B: height of page body
  function newPage(el) {
    el && !$('.pagesjs-body', el) && el.insertAdjacentHTML('afterbegin', tpl.innerHTML);
    box = el || tpl.cloneNode(true); box_body = box.children[1]; box_ctx = null;
    boxes.includes(box) || boxes.push(box);  // store new pages in boxes
    return box;
  }
  // start the next page and finish current page
  function nextPage(el, callback) {
    const cur = box; cur.after(newPage(el)); callback && callback(); finish(cur);
  }
  // compute page numbers and temporarily remove the box
  function finish(box) {
    const h = box.scrollHeight;
    // tolerate a few pixels (and the margin of the last element) hanging over the page bottom
    let m = 3;
    for (let e = box.children[1].lastElementChild; e; e = e.lastElementChild)
      m = Math.max(m, parseFloat(getComputedStyle(e).marginBottom) || 0);
    if (h - m > H && !box.dataset.pagesOffset) {
      const n = calcPages(box, h);
      if (n > 1) box.dataset.pagesOffset = n;
    }
    box.remove();
  }
  function removeBlank(el) {
    if (!el || el.tagName === 'BODY') return false;
    // for <p>, don't treat it as empty unless its HTML is empty
    const v = !(el.tagName === 'P' ? el.innerHTML : el.innerText).trim();
    v && el.remove();
    return v;
  }
  // chain of the ancestors of el (outermost first), excluding <body>
  function ancestors(el) {
    const a = [];
    for (; el && el !== d.body; el = el.parentNode) a.unshift(el);
    return a;
  }
  // The container for the content on the current page. It is a chain of empty
  // clones of the content root and its ancestors (i.e., the original context), so
  // CSS selectors that depend on them (e.g., `.body h2`) still apply on pages.
  function ctx() {
    if (!wrap.length) return box_body;
    if (!box_ctx || !box_body.contains(box_ctx)) {
      box_ctx = wrap.reduce((p, el) => {
        const c = el.cloneNode(); c.classList.add('pagesjs-wrap');
        return p.appendChild(c);
      }, box_body);
    }
    return box_ctx;
  }
  function fill(el) {
    // if the element is already a page, just use it as the box
    if (el.classList.contains('pagesjs-page')) {
      nextPage(el, () => nChild(el) > 3 && (
        // if current element is not empty, fill its content into the box
        box_body.append(...[...el.children].slice(3)),
        // TODO: should we fragment this page if it's too long?
        nextPage()  // create a new empty page
      ));
    } else {
      // in a book, a chapter (a container of <h1>) starts on a new page
      if (book && box.innerText !== '' && $('h1', el)) nextPage();
      if (el.innerText.trim() && H - box.scrollHeight < H_min) breakPage();
      place(el);
    }
  }
  // append el to the page, and if it overflows, put as much of it as possible on
  // the page and the rest on the next page(s)
  function place(el) {
    for (;;) {
      const c = ctx();
      endFrag(el);
      if (isBigBlock(el)) {
        // don't attach a big element to the page, since it takes time to style
        // and lay out all its content just to find out that it does not fit
        el = split(el, c, 'block');
      } else {
        c.append(el);
        if (box.scrollHeight <= H) return;
        el = split(el, c);
      }
      if (!el) return;
      breakPage();
      // TODO: remove possibly duplicated citations: .citation + div > [id^="ref-"]
    }
  }

  // start a new page, but don't leave a heading alone at the bottom of the page
  function breakPage() {
    const h = ctx().lastElementChild;
    const keep = h?.matches('h1,h2,h3,h4,h5,h6') && hasPrev(h) && h;
    keep && keep.remove();
    nextPage();
    keep && ctx().append(keep);
  }
  // is an element a block that is too big to be put on a page as a whole?
  function isBigBlock(el) {
    return !['TABLE', 'PRE'].includes(el.tagName) && el.getElementsByTagName('*').length > 300;
  }
  function blank(el) { return !el.firstElementChild && !el.textContent.trim(); }
  // is there anything above el on the page (which means el may go to the next page)?
  function hasPrev(el) {
    for (; el && el !== box_body; el = el.parentNode)
      for (let p = el.previousElementSibling; p; p = p.previousElementSibling)
        if (p.getBoundingClientRect().height) return true;
    return false;
  }
  function inFlow(cs) {
    return cs.float === 'none' && !['absolute', 'fixed'].includes(cs.position);
  }
  // text, inline elements, and out-of-flow elements go with the text around them
  function isInline(n) {
    if (n.nodeType !== 1) return true;
    const cs = getComputedStyle(n), v = cs.display;
    return v.startsWith('inline') || v === 'none' || v === 'contents' || !inFlow(cs);
  }
  // lines of <pre><code>; tags open at the end of a line (e.g., a multi-line
  // comment) are closed there and reopened on the next line, so each line is balanced
  function codeLines(pre) {
    const open = [];
    return pre.firstElementChild.innerHTML.replace(/\n$/, '').split('\n').map(line => {
      const start = open.map(t => t[0]).join('');
      line.replace(/<(\/?)([a-z][\w-]*)[^>]*>/gi, (m, c, t) => {
        c ? open.pop() : open.push([m, t]);
      });
      return start + line + open.map(t => `</${t[1]}>`).reverse().join('');
    });
  }
  // how can the element be broken: by 'block' (its child blocks), 'inline' (text
  // lines), 'table' (rows), 'code' (lines), or not at all (undefined)?
  function kindOf(el) {
    const cs = getComputedStyle(el), t = el.tagName;
    if (/avoid/.test(cs.breakInside) || el.matches(atomic)) return;
    if (t === 'TABLE') return el.tBodies[0] && 'table';
    if (!['block', 'list-item', 'flow-root'].includes(cs.display) || !inFlow(cs)) return;
    if (t === 'PRE') {
      if (el.firstElementChild?.tagName === 'CODE' && codeLines(el).length > 1) return 'code';
      // wrapped long lines: move to the next page if it fits there, otherwise break by lines
      if (el.offsetHeight <= B) return;
    }
    return [...el.children].some(c => !isInline(c)) ? 'block' : 'inline';
  }
  function mark(el, first) {
    el.classList.add(fr_cls); el.classList.remove(fr_2); first && el.classList.add(fr_1);
  }
  // pieces of a fragmented element that are put on a page as a whole are the last
  // pieces; mark them (and their fragmented descendants) before measuring, since
  // the size of the last piece is different (see pages.css); if it turns out to be
  // too big and is split, the mark is removed
  function endFrag(el) {
    if (el.nodeType === 1) [el, ...$$('.' + fr_cls, el)].forEach(e => e.classList.contains(fr_cls) && e.classList.add(fr_2));
  }
  // Put as much of el (which has just overflowed the page in container) as
  // possible into container, and return the rest (detached) if any. Unless el is
  // the first thing on the page, it will be left out entirely if it can't be broken.
  function split(el, container, kind) {
    // (for a block, prev is determined after it is cut, to avoid laying it out)
    const k = kind || kindOf(el), prev = k === 'block' ? undefined : hasPrev(el),
      first = !el.classList.contains(fr_cls), r = k && splitters[k](el, container, prev, first);
    if (!r) return prev && (el.remove(), el);
    const [head, rest] = r;
    if (blank(head)) return head.remove(), rest;  // nothing fits
    if (rest) {
      rest.classList.add(fr_cls); rest.classList.remove(fr_1, fr_2);
    } else {
      head.classList.add(fr_2);  // the last piece (also the first if it's not really split)
    }
    return rest;
  }
  // shallow clone el (wrapper only) as the first piece of el in container
  function cut(el, container, first) {
    const head = el.cloneNode();
    el.remove(); container.append(head); mark(head, first);
    return head;
  }
  // wrap each run of inline nodes in a block (like an anonymous block box in CSS)
  // so mixed content (e.g., <li>text<ul>...</ul></li>) can be broken as paragraphs
  const wrapped = new WeakSet(), hold = d.createElement('div');  // hold: a hidden container
  hold.style.display = 'none';
  function wrapRuns(el) {
    if (wrapped.has(el)) return;
    wrapped.add(el);
    // computed styles are available only in the DOM (but not necessarily on a page)
    el.isConnected || hold.append(el);
    let run = [];
    function flush() {
      if (run.some(n => n.nodeType === 1 || n.nodeType === 3 && n.nodeValue.trim())) {
        const s = d.createElement('span');
        s.className = 'pagesjs-run'; run[0].before(s); s.append(...run);
      }
      run = [];
    }
    for (const n of [...el.childNodes]) isInline(n) ? run.push(n) : flush();
    flush();
    el.parentNode === hold && el.remove();
  }
  const splitters = {block: splitBlock, inline: splitInline, table: splitTable, code: splitCode};

  // move children to a clone of el one by one until the page is full, and split
  // the child that overflows recursively, so elements can be broken at any depth
  function splitBlock(el, container, prev, first) {
    wrapRuns(el);
    const head = cut(el, container, first);
    prev = hasPrev(head);
    let item, partial;
    while (item = el.firstChild) {
      if (item.nodeType !== 1) { head.append(item); continue; }
      endFrag(item);
      const big = isBigBlock(item);
      if (!big) {
        head.append(item);
        if (box.scrollHeight <= H) continue;
      }
      const n = nChild(head), rest = split(item, head, big ? 'block' : undefined);
      if (rest) { partial = nChild(head) > n; el.prepend(rest); break; }
    }
    // if only about one line (e.g., a legend or the first list item) is left on the
    // page, and no child was split, move it to the next page with the rest
    if (prev && !partial && !blank(el) && head.getBoundingClientRect().height < 1.5 * H_min)
      el.prepend(...head.childNodes);
    // if all children fit, head is the last piece, which has bottom margin/padding/
    // border that were hidden when it was measured as a non-last piece; push the
    // last children out if it's too big now
    if (blank(el)) {
      head.classList.add(fr_2);
      while (box.scrollHeight > H && head.lastElementChild && (nChild(head) > 1 || prev))
        el.prepend(head.lastElementChild);
      blank(el) || head.classList.remove(fr_2);
    }
    if (el.tagName === 'OL' && nChild(head) && !blank(el)) {
      // update the start number of <ol> (an item split in half counts once)
      el.start += nChild(head) - (el.firstElementChild.classList.contains(fr_cls) ? 1 : 0);
    }
    return [head, blank(el) ? null : el];
  }
  // split <p> by testing if a range fits the current box
  function splitInline(el, container, prev, first) {
    const ends = lineStarts(el);
    if (ends.length < 2) return;  // single-line paragraph
    const r = d.createRange(), rest = el.cloneNode(), n = ends.length;
    let k = n;  // number of lines left in el
    function cutLine() {
      const loc = ends[--k];
      loc.i < 0 ? r.setStartBefore(loc.node) : r.setStart(loc.node, loc.i);
      r.setEnd(el, el.childNodes.length);
      rest.prepend(r.extractContents());
      const last = el.lastChild;  // strip trailing empty tags left by range extraction
      last?.innerHTML === '' && last.remove();
    }
    mark(el, first);
    // remove lines from the end of paragraph (but keep the first line if el is
    // the first thing on the page)
    while (k > (prev ? 0 : 1)) {
      cutLine();
      if (k > 0 && box.scrollHeight <= H) break;
    }
    // avoid a widow (single last line on the next page) and an orphan (single
    // first line at the bottom of the page)
    if (k > 1 && n - k === 1) cutLine();
    if (k === 1 && prev && n < 5) cutLine();  // (not for a long paragraph, to avoid moving too much)
    return [el, rest];
  }
  // find the break position of each line (exclude block elements like footnotes)
  function lineStarts(el) {
    const r = d.createRange(), ends = [{node: el, i: 0}];
    const walker = d.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node, prev;
    function collectEnds(el, i) {
      const rect = el.getBoundingClientRect();
      // if the previous el is at top-right of current el, assume line
      // ends before current el (TODO: how about RTL languages?)
      prev && prev.bottom <= rect.top && prev.right > rect.left && ends.push({node, i});
      prev = rect;
    }
    while (node = walker.nextNode()) {
      const t = node.tagName;
      if (t) {
        if (t === 'MJX-CONTAINER' || (t === 'SPAN' && $('.katex', node)) || !isInline(node)) {
          node = walker.nextSibling();  // skip blocks (footnotes) and math
          if (!node) break;
        }
        if (node.firstChild) continue;  // for element nodes, traverse to bottom
      }
      if (node.tagName) {
        collectEnds(node, -1);
      } else {
        const txt = node.textContent;
        if (txt.trim()) for (let i = 0; i < txt.length; i++) {
          r.setStart(node, i); r.setEnd(node, i + 1); collectEnds(r, i);
        }
      }
    }
    return ends;
  }
  // split table rows
  function splitTable(el, container, prev, first) {
    const head = cut(el, container, first), tb = el.tBodies[0], tb2 = tb.cloneNode(),
      rows = [...tb.rows];
    head.append(tb2);
    // copy table header and footer
    [el.tHead, el.tFoot].forEach(t => t && head.append(t.cloneNode(true)));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      tb2.append(row);
      if (box.offsetHeight > H) {
        if (i > 0 || prev) tb.prepend(row);
        // clear the clone if current page can't fit even one row
        if (i === 0 && prev) head.innerHTML = '';
        break;
      }
    }
    // avoid a single row on either page
    const m = tb2.rows.length;
    if (tb.rows.length === 1 && m > 1 || m === 1 && prev && tb.rows.length) {
      tb.prepend(tb2.rows[m - 1]);
      if (m === 1) head.innerHTML = '';
    }
    return [head, tb.rows.length ? el : null];
  }
  // split lines in <code> and move as many lines into the clone as possible
  function splitCode(el, container, prev, first) {
    const code = el.firstElementChild, lines = codeLines(el),
      h = code.offsetHeight / lines.length;  // approx line height
    // other children go to the first piece, except those after <code> in the normal
    // flow (e.g., a link to the output), which go to the last piece
    const kids = [...el.children], tail = kids.filter((c, j) => j > kids.indexOf(code) && inFlow(getComputedStyle(c)));
    const head = cut(el, container, first), code2 = code.cloneNode();
    head.append(code2, ...kids.filter(c => c !== code && !tail.includes(c)));
    let i = fitLines(code2, lines, h, prev);
    // avoid a single line on either page
    if (i > 1 && lines.length - i === 1) i--;
    if (i === 1 && prev) i = 0;
    // i == 0 means not enough space to split code on current page
    if (i) code2.innerHTML = lines.slice(0, i).join('\n'); else head.innerHTML = '';
    code.innerHTML = lines.slice(i).join('\n');
    if (code.innerHTML.trim()) return [head, el];
    i && head.append(...tail);
    return [head, null];
  }
  // figure out how many lines can fit the box via bisection
  function fitLines(el, lines, h, prev) {
    let i = 1, i1 = 1, n = lines.length, i2 = n + 2;
    const sols = [];  // solutions tried
    while (i2 > i1 + 1) {
      el.innerHTML = lines.slice(0, i).join('\n');
      const delta = H - box.offsetHeight;
      if (delta === 0) return i;
      if (delta < 0) {
        if (i <= 1) return prev ? 0 : 1;
        i2 = i;
      } else {
        if (i >= n) return i;
        i1 = i;
      }
      sols.push(i);
      // estimate the number of (more or less) lines needed
      const i3 = Math.min(Math.max(i + Math.round(delta / h), 1), n);
      // if a solution has been tried, shorten step and (in/de)crement by 1
      i = sols.includes(i3) ? i + (delta > 0 ? 1 : -1) : i3;
      (delta > 0 && i >= n) && (i2 = n + 2, i = n);
    }
    return i1;
  }

  // use data-short-title of a header if exists, and fall back to inner text
  function shortTitle(h) {
    return h && (h.dataset.shortTitle || h.innerText);
  }
  const main = shortTitle($('h1.title, .frontmatter h1, .title, h1')),  // main title
    ps = (book ? 'h1' : 'h2') + ':not(.frontmatter *)';  // page title selector

  // calculate how many new pages we need for overflowed content (this is just
  // an estimate; if not accurate, use <div class="pagesjs-page" data-pages-offset="N">
  // to provide a number manually)
  function calcPages(box, h) {
    let n = +box.dataset.pagesOffset;
    if (n) return n;
    n = Math.ceil(h/H);
    if (n <= 1) return n;
    // consider top/bottom page margin and table headers (which may be repeated on each page)
    const m = tb.concat([...$$('thead', box)].map(el => +el.offsetHeight)).reduce((m1, m2) => m1 + m2);
    if (!m) return n;
    function nPages() { return Math.ceil((h + (n - 1) * m)/H); }
    let n2 = nPages();
    while (n2 > n) {
      n = n2; n2 = nPages();
    }
    return n;
  }

  // Let content that reacts to the width of its container (e.g., diagrams that use
  // a ResizeObserver) settle at the page width before measuring anything: put all
  // content on a probe page and wait for a few frames.
  let probed;
  function probe(roots, els) {
    box.classList.add('pagesjs-settle');
    roots.forEach((el, i) => {
      wrap = ancestors(el); box_ctx = null; ctx().append(...els[i]);
    });
    probed = els;
    return new Promise(done => {
      const t = setTimeout(done, 500);  // rAF doesn't run in background tabs
      let n = 0;
      (function tick() {
        requestAnimationFrame(() => ++n < 3 ? tick() : (clearTimeout(t), done()));
      })();
    });
  }
  function unprobe() {
    if (!probed) return;
    probed.forEach(ch => ch.forEach(el => el.remove()));
    box_body.innerHTML = ''; box_ctx = null; wrap = [];
    box.classList.remove('pagesjs-settle');
    probed = null;
  }
  let pending;  // the rest of pagination that is waiting for the probe

  let finished;  // is the pagination finished?
  // The content root is specified via <body data-pages-root="selector">, or is
  // <main> (or an element with role="main"), or the top-level <article> elements,
  // or <body>. Everything else (e.g., navigation bars) will be hidden.
  function findRoots() {
    const sel = d.body.dataset.pagesRoot, x = sel ? [...$$(sel)] : [];
    if (x.length) return x;
    const main = $('main, [role="main"]');
    if (main) return [main];
    const articles = [...$$('article')].filter(el => !el.parentNode.closest('article'));
    return articles.length ? articles : [d.body];
  }

  // remove the classes of the TOC, footnotes, etc. that put them in the margin on
  // screen but are not suitable for printing
  function removeSideClasses() {
    $$(':is(#TOC, .footnotes, .chapter-before, .chapter-after):is(.side-left, .side-right).side').forEach(el => {
      el.classList.remove('side', 'side-left', 'side-right');
    });
  }
  // test how much space a single-line paragraph needs
  function measureMinHeight() {
    const p = d.createElement('p'), H0 = box.scrollHeight;
    p.innerText = 'A'; box_body.append(p);
    H_min = box.scrollHeight - H0; p.remove();
  }
  // add dot leaders to TOC (page numbers will be added after the pages are ready)
  function addTocLeaders() {
    $$('#TOC a[href^="#"]').forEach(a => {
      const s = d.createElement('span');  // move TOC item content into a span
      s.className = 'toc-text'; a.append(s);
      let c; while (c = s.previousSibling) {
        // exclude section number spans
        if (c.classList?.contains('section-number')) break; s.prepend(c);
      }
      a.dataset.pageNumber = '000';  // placeholder for page numbers
    });
  }
  // take the children of the roots out of the DOM (to speed up rendering single
  // pages), and return them
  function detachContent(roots) {
    return roots.map(el => {
      // move <style>/<link> into <head> so styles can be applied globally (not
      // only when they are in the DOM), no matter how deeply they are nested
      $$('style, link[rel="stylesheet"]', el).forEach(el => d.head.append(el));
      const ch = [...el.children].filter(el => el !== box &&
        !['SCRIPT', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName));
      ch.forEach(el => el.remove());
      return ch;
    });
  }
  // iteratively add elements to pages
  function fillPages(roots, els) {
    $$('.frontmatter, .abstract, #TOC:not(.chapter-toc)').forEach(el => {
      (fill(el), book && nextPage());
    });
    roots.forEach((el, i) => {
      wrap = ancestors(el); box_ctx = null;
      book && (box.innerText === '' ? newPage(box) : nextPage());
      els[i].forEach(fill);
      // clean up container and self if empty
      removeBlank(el.parentNode); removeBlank(el);
    });
    finish(box);  // finish the last box
    // unwrap the blocks created for runs of inline nodes
    $$('.pagesjs-run').forEach(el => el.replaceWith(...el.childNodes));
  }
  // add page number, title, etc. to data-* attributes of page elements
  function numberPages() {
    let page_title, i = 0;
    boxes.forEach(box => {
      if (book) {
        if ($('.frontmatter', box)) return;  // skip book frontmatter page
        $(ps, box) && (page_title = '');  // empty title for first page of chapter
      }
      const N = +box.dataset.pagesOffset || 1;
      if (N > 1) box.classList.add('page-multiple');
      i += N;
      box.classList.add(`page-${i % 2 === 0 ? 'even' : 'odd'}`);
      const info = {
        'pageNumber': i, 'mainTitle': main, 'pageTitle': page_title
      };
      [box.children[0], box.children[2]].forEach(el => {
        for (const key in info) info[key] && (el.dataset[key] = info[key]);
      });
      // find page title for next page
      page_title = shortTitle([...$$(ps, box)].pop()) || page_title;
      let ft;  // first footnote on page
      // move all footnotes after the page body
      $$('.footnotes', box).forEach((el, i) => {
        i === 0 ? (ft = el, box.children[1].after(el)) : (ft.append(...el.children), el.remove());
      });
    });
  }
  // add page numbers to TOC with data-* attributes
  function numberToc() {
    $$('#TOC a[href^="#"]').forEach(a => {
      const id = CSS.escape(a.getAttribute('href').replace(/^#/, '')),
        p = $(`.pagesjs-page:has(#${id}) .pagesjs-header`);
      a.dataset.pageNumber = p ? p.dataset.pageNumber : '';
    });
  }

  function paginate(sync) {
    // we need to wait for all resources to be fully loaded before paginating
    if (d.readyState !== 'complete') return addEventListener('load', () => paginate(sync));

    const cls = d.body.classList;
    if (cls.contains('pagesjs')) return;  // already paginated
    dispatchEvent(new Event('pagesjs:before'));

    cls.add('pagesjs');
    d.body.append(hold);
    d.body.insertAdjacentElement('afterbegin', newPage());
    H = box.clientHeight || window.innerHeight; B = box_body.clientHeight || H;  // use window height if box height not specified
    removeSideClasses();
    cls.add('pagesjs-filling');
    measureMinHeight();
    addTocLeaders();

    const roots = findRoots(), els = detachContent(roots);
    function run() {
      fillPages(roots, els);
      cls.remove('pagesjs-filling');
      numberPages();
      d.body.prepend(...boxes);  // unhide all pages
      numberToc();
      hold.remove();
      finished = true;
      dispatchEvent(new Event('pagesjs:after'));
    }
    // Pagination is async unless it has to be sync (beforeprint). If printing
    // starts while it's pending (e.g., headless printing right after the page is
    // loaded), finish it right away.
    pending = () => { pending = null; unprobe(); run(); };
    sync ? pending() : probe(roots, els).then(() => pending?.());
  }
  addEventListener('beforeprint', () => pending ? pending() : paginate(true));
  // A script that controls the browser can request the pagination by dispatching
  // pagesjs:paginate, and wait for pagesjs:after (which is also dispatched if the
  // pagination was already finished)
  addEventListener('pagesjs:paginate', () => {
    finished ? dispatchEvent(new Event('pagesjs:after')) : paginate();
  });
  // use query param ?paged=1 to indicate pagination (press p to toggle)
  const SP = new URLSearchParams(location.search);
  SP.get('paged') && paginate();
  addEventListener('keypress', e => {
    if (e.key === 'p') {
      if (SP.get('paged')) {
        SP.delete('paged'); location.href = location.pathname + (SP.size ? `?${SP}` : '');
      } else {
        paginate();
        SP.set('paged', 1); history.replaceState({}, '', `${location.pathname}?${SP}`);
      }
    }
  });
})(document);
