// Paginate an HTML page: move elements into page boxes (e.g., A4 paper) such that
// each box holds as much content as possible without exceeding the page height.
//
// How it works:
// 1. The content root (e.g., <main>) is emptied, and all its content is laid out
//    once on a probe page (probe()), so that content that reacts to the page width
//    settles and the positions of the blocks are known.
// 2. The children are put on pages one by one (fill() -> place()). Only the current
//    page is in the DOM, so measuring it is cheap (box.scrollHeight > H means the
//    page overflows), but each measurement is a forced layout; so children that
//    surely fit, according to their positions on the probe page, are put on a page
//    together and measured once (fitting()).
// 3. When an element makes the page overflow, split() puts as much of it as
//    possible on the current page and returns the rest, which goes to the next
//    page. An element can be broken in different ways (kindOf()): block elements
//    (e.g., lists and quotes) are cloned and their children are moved into the
//    clone as in step 2, with the child that overflows broken recursively; text,
//    table rows, and code lines are broken by lines/rows. Every piece of a broken
//    element has the classes pagesjs-fragmented, fragment-first, fragment-last
//    (the pieces can be styled differently in pages.css).
// 4. Each page contains empty copies of the ancestors of the content root, so
//    CSS selectors that depend on them still work (see ctx()).
// 5. In the end, page numbers and titles are added to the headers/footers.
(d => {

  // --- Utilities -----------------------------------------------------

  function  $(s, el = d) { return el?.querySelector(s); }
  function $$(s, el = d) { return el ? el.querySelectorAll(s) : []; }
  function nChild(el) { return el.childElementCount; }
  function kids(el) { return [...el.children]; }
  function firstEl(el) { return el.firstElementChild; }
  function lastEl(el) { return el.lastElementChild; }
  function rect(el) { return el.getBoundingClientRect(); }
  function style(el) { return getComputedStyle(el); }
  function num(v) { return parseFloat(v) || 0; }
  function has(el, c) { return el.classList.contains(c); }
  function addCls(el, ...c) { el.classList.add(...c); }
  function rmCls(el, ...c) { el.classList.remove(...c); }
  function make(tag, cls) {
    const el = d.createElement(tag);
    if (cls) el.className = cls;
    return el;
  }
  function range() { return d.createRange(); }
  function on(type, fn) { addEventListener(type, fn); }
  function fire(type) { dispatchEvent(new Event(type)); }

  // --- Constants and state -------------------------------------------

  const
    book = $$('h1').length > 1,  // a document with multiple <h1> is a book (chapters)
    // elements that are never broken across pages (CSS break-inside: avoid also works)
    atomic = 'h1,h2,h3,h4,h5,h6,hr,img,svg,video,canvas,iframe,object,embed,math,mjx-container,figure,.figure,.caption,details',
    // classes of the pieces of a broken element
    fr_cls = 'pagesjs-fragmented', fr_1 = 'fragment-first', fr_2 = 'fragment-last',
    // pixels that the content may hang over the bottom of a page (the page has a
    // much larger padding there), since sizes are rounded and the browsers differ
    tol = 3,
    // top/bottom page margin
    tb = ['top', 'bottom'].map(i =>
      num(style(d.documentElement).getPropertyValue(`--paper-margin-${i}`))
    ),
    // the template of a page
    tpl = make('div', 'pagesjs-page'),
    boxes = [],  // all pages
    wrapped = new WeakSet(),  // elements whose runs of inline nodes have been wrapped
    guessed = new WeakSet(),  // pages whose number of physical pages is an estimate (see calcPages())
    notes = new Map(),  // the items of each note (footnote or citation), by its marker (see detachNotes())
    probeY = new WeakMap(),  // the bottoms of the blocks on the probe page (see fitting())
    hold = make('div');  // a hidden container for elements that need styles
  tpl.innerHTML = `<div class="pagesjs-header"></div>
<div class="pagesjs-body"></div>
<div class="pagesjs-footer"></div>`;
  hold.style.display = 'none';

  let
    box, box_body,  // the current page and its body
    box_ctx,  // where the content goes in the body (see ctx())
    wrap = [],  // the ancestors of the content root (outermost first)
    H, B,  // the height of a page and of its body
    H_min, H_line,  // the height of a single-line paragraph (with margins) and of a line
    used,  // the height of the content of the page when it was last measured (see overflows())
    main_title,  // the title of the document
    probed,  // the content that is on the probe page (see probe())
    pending,  // the rest of the pagination, which is waiting for the probe
    running,  // the generator that does the rest of the pagination (see advance())
    progress, n_done = 0,  // the progress indicator and the number of finished pages
    finished;  // is the pagination finished?

  // --- Page boxes ----------------------------------------------------

  function newPage(el) {
    el && !$('.pagesjs-body', el) && el.insertAdjacentHTML('afterbegin', tpl.innerHTML);
    box = el || tpl.cloneNode(true); box_body = box.children[1]; box_ctx = null;
    boxes.includes(box) || boxes.push(box);  // store new pages in boxes
    return box;
  }
  // The margin at the end of the content of a page is truncated at the end of the
  // page (like in CSS fragmentation), so it should not count when the content is
  // tested if it fits the page. It is the margin of the last element and its last
  // descendants, until one with padding/border at the bottom.
  function trailingMargin(body = box_body) {
    let m = 0;
    for (let e = lastEl(body); e; e = lastEl(e)) {
      const cs = style(e);
      m = Math.max(m, num(cs.marginBottom));
      if (num(cs.paddingBottom) || num(cs.borderBottomWidth)) break;
    }
    return m;
  }
  // the height of the page without the margin at the end of its content
  function pageHeight() { syncNotes(); return rect(box).height - trailingMargin(); }
  // does the page overflow?
  function overflows() { syncNotes(); return (used = box.scrollHeight - trailingMargin()) > H; }
  // The notes are not measured inline (where they are floats next to their references),
  // but in a block after the page body, as in the end: put the notes of the references
  // that are on the page there (and take the others off).
  function syncNotes(b = box) {
    const body = b.children[1], ms = [...$$('.pagesjs-note', body)], items = ms.flatMap(m => notes.get(m));
    let c = $(':scope > .footnotes', b);
    if (!items.length) return c?.remove();
    c || body.after(c = make('div'));
    c.className = 'footnotes';
    if (items.some((e, i) => c.children[i] !== e) || nChild(c) !== items.length) c.replaceChildren(...items);
  }
  // start the next page and finish current page
  function nextPage(el, callback) {
    const cur = box; cur.after(newPage(el)); callback && callback(); finish(cur);
  }
  // compute page numbers and temporarily remove the box
  function finish(box) {
    syncNotes(box);
    const h = box.scrollHeight;
    // tolerate a few pixels (and the margin of the last element) hanging over the page bottom
    if (h - trailingMargin(box.children[1]) > H && !box.dataset.pagesOffset) {
      const n = calcPages(box, h);
      if (n > 1) box.dataset.pagesOffset = n, guessed.add(box);
    }
    box.remove();
    progress && (progress.textContent = `Paginating: ${++n_done} pages done`);
  }
  // The height of a page in fill mode is its natural height, which includes spaces that
  // are not needed in the end (e.g., the margins of the last element), so a page that is a
  // few pixels too tall may be fine with its fixed height. Check the pages in the end:
  // if the content doesn't reach the notes/footer after the body and nothing hangs over
  // the paper, the estimated number of pages is wrong.
  function checkOffsets() {
    boxes.forEach(box => {
      if (!guessed.has(box)) return;
      const body = box.children[1], r = range();
      r.selectNodeContents(body);
      if (rect(r).bottom <= rect(body.nextElementSibling).top &&
        box.scrollHeight <= box.clientHeight + 1) delete box.dataset.pagesOffset;
    });
  }
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

  // chain of the ancestors of el (outermost first), excluding <body>
  function ancestors(el) {
    const a = [];
    for (; el && el !== d.body; el = el.parentNode) a.unshift(el);
    return a;
  }
  // The container for the content on the current page. It is a chain of empty
  // clones of the content root and its ancestors (i.e., the original context), so
  // CSS selectors that depend on them (e.g., `main h2`) still apply on pages.
  function ctx() {
    if (!wrap.length) return box_body;
    if (!box_ctx || !box_body.contains(box_ctx)) {
      box_ctx = wrap.reduce((p, el) => {
        const c = el.cloneNode(); addCls(c, 'pagesjs-wrap');
        return p.appendChild(c);
      }, box_body);
    }
    return box_ctx;
  }
  function removeBlank(el) {
    if (!el || el.tagName === 'BODY') return false;
    // for <p>, don't treat it as empty unless its HTML is empty
    const v = !(el.tagName === 'P' ? el.innerHTML : el.innerText).trim();
    v && el.remove();
    return v;
  }

  // --- Putting elements on pages -------------------------------------

  function* fill(el, more = true) {
    // if the element is already a page, just use it as the box
    if (has(el, 'pagesjs-page')) {
      nextPage(el, () => nChild(el) > 3 && (
        // if current element is not empty, fill its content into the box
        box_body.append(...kids(el).slice(3)),
        // TODO: should we fragment this page if it's too long?
        nextPage()  // create a new empty page
      ));
    } else {
      // in a book, a chapter (a container of <h1>) starts on a new page
      if (book && box.innerText !== '' && $('h1', el)) nextPage();
      if (el.innerText.trim() && (syncNotes(), H - box.scrollHeight < H_min)) nextPage();
      yield* place(el, more);
    }
  }

  // append el to the page, and if it overflows, put as much of it as possible on
  // the page and the rest on the next page(s)
  function* place(el, more) {
    for (;;) {
      const c = ctx();
      endFrag(el);
      if (isBigBlock(el)) {
        // don't attach a big element to the page, since it takes time to style
        // and lay out all its content just to find out that it does not fit
        el = split(el, c, 'block', more);
      } else {
        c.append(el);
        if (!overflows()) return;
        el = split(el, c, undefined, more);
      }
      if (!el) return;
      nextPage();
      yield;  // (a chance to paint the progress)
      // TODO: remove possibly duplicated citations: .citation + div > [id^="ref-"]
    }
  }

  // Put as much of el (which has just overflowed the page in container) as
  // possible into container, and return the rest (detached) if any. Unless el is
  // the first thing on the page, it will be left out entirely if it can't be broken.
  function split(el, container, kind, more) {
    // (for a block, prev is determined after it is cut, to avoid laying it out)
    const k = kind || kindOf(el), prev = k === 'block' ? undefined : hasPrev(el),
      first = !has(el, fr_cls), r = k && splitters[k](el, container, prev, first, more);
    if (!r) return prev && (el.remove(), el);
    const [head, rest] = r;
    if (blank(head)) return head.remove(), rest;  // nothing fits
    if (rest) {
      addCls(rest, fr_cls); rmCls(rest, fr_1, fr_2);
    } else if (has(head, fr_1)) {
      rmCls(head, fr_cls, fr_1, fr_2);  // it's not really split
    } else {
      addCls(head, fr_2);  // the last piece
    }
    return rest;
  }

  // is an element a block that is too big to be put on a page as a whole?
  function isBigBlock(el) {
    return !['TABLE', 'PRE'].includes(el.tagName) && el.getElementsByTagName('*').length > 300;
  }
  function blank(el) { return !firstEl(el) && !el.textContent.trim(); }
  // is there anything above el on the page (which means el may go to the next page)?
  function hasPrev(el) {
    for (; el && el !== box_body; el = el.parentNode)
      for (let p = el.previousElementSibling; p; p = p.previousElementSibling)
        if (rect(p).height) return true;
    return false;
  }
  function inFlow(cs) {
    return cs.float === 'none' && !['absolute', 'fixed'].includes(cs.position);
  }
  // text, inline elements, and out-of-flow elements go with the text around them
  function isInline(n) {
    if (n.nodeType !== 1) return true;
    const cs = style(n), v = cs.display;
    return v.startsWith('inline') || v === 'none' || v === 'contents' || !inFlow(cs);
  }
  // is an element a part of the text (inline, and not a float, etc.)?
  function inTextFlow(el) {
    const cs = style(el);
    return (cs.display.startsWith('inline') || cs.display === 'contents') && inFlow(cs);
  }
  // lines of <pre><code>; tags open at the end of a line (e.g., a multi-line
  // comment) are closed there and reopened on the next line, so each line is balanced
  function codeLines(pre) {
    const open = [];
    return firstEl(pre).innerHTML.replace(/\n$/, '').split('\n').map(line => {
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
    const cs = style(el), t = el.tagName;
    if (/avoid/.test(cs.breakInside) || el.matches(atomic)) return;
    if (t === 'TABLE') return el.tBodies[0] && 'table';
    if (!['block', 'list-item', 'flow-root'].includes(cs.display) || !inFlow(cs)) return;
    if (t === 'PRE') {
      if (firstEl(el)?.tagName === 'CODE' && codeLines(el).length > 1) return 'code';
      // wrapped long lines: move to the next page if it fits there, otherwise break by lines
      if (el.offsetHeight <= B) return;
    }
    return kids(el).some(c => !isInline(c)) ? 'block' : 'inline';
  }
  function mark(el, first) {
    addCls(el, fr_cls); rmCls(el, fr_2); first && addCls(el, fr_1);
  }
  // pieces of a fragmented element that are put on a page as a whole are the last
  // pieces; mark them (and their fragmented descendants) before measuring, since
  // the size of the last piece is different (see pages.css); if it turns out to be
  // too big and is split, the mark is removed
  function endFrag(el) {
    if (el.nodeType === 1) [el, ...$$('.' + fr_cls, el)].forEach(e => has(e, fr_cls) && addCls(e, fr_2));
  }
  // shallow clone el (wrapper only) as the first piece of el in container
  function cut(el, container, first) {
    const head = el.cloneNode();
    el.remove(); container.append(head); mark(head, first);
    return head;
  }
  // wrap each run of inline nodes in a block (like an anonymous block box in CSS)
  // so mixed content (e.g., <li>text<ul>...</ul></li>) can be broken as paragraphs
  function wrapRuns(el) {
    // (a run is made of inline nodes already; wrapping it again would nest runs endlessly)
    if (wrapped.has(el) || has(el, 'pagesjs-run')) return;
    wrapped.add(el);
    // computed styles are available only in the DOM (but not necessarily on a page)
    el.isConnected || hold.append(el);
    let run = [];
    function flush() {
      if (run.some(n => n.nodeType === 1 || n.nodeType === 3 && n.nodeValue.trim())) {
        const s = make('span', 'pagesjs-run');
        run[0].before(s); s.append(...run);
      }
      run = [];
    }
    for (const n of [...el.childNodes]) isInline(n) ? run.push(n) : flush();
    flush();
    el.parentNode === hold && el.remove();
  }

  const splitters = {block: splitBlock, inline: splitInline, table: splitTable, code: splitCode};

  // --- Breaking elements ---------------------------------------------

  // Measuring the page after each child is slow (a forced layout), so put several children
  // on it at once when they surely fit: the nodes (in order) that end a line above the page
  // bottom, going by their distances on the probe page from the last child on the page. If
  // they turn out not to fit, they are taken back, so the estimate affects the speed but not
  // the result. The children of the content root need the room that fill() asks for (H_min,
  // and as much again for the margin after the previous child).
  function fitting(head, nodes, root) {
    const prev = lastEl(head), y0 = prev && !has(prev, fr_cls) ? probeY.get(prev) : undefined, run = [];
    if (y0 === undefined || !used) return run;
    let y = y0, n = 0;
    for (const c of nodes) {
      if (c.nodeType === 1) {
        const y1 = probeY.get(c);
        if (!(y1 >= y) || c.matches(`.${fr_cls}, .pagesjs-page`) || isBigBlock(c) || $('.pagesjs-note', c) ||
          used + y1 - y0 + H_line > H || root && (used + y - y0 + 2 * H_min > H || book && $('h1', c))) break;
        y = y1;
      }
      run.push(c);
      c.nodeType === 1 && (n = run.length);
    }
    return run.slice(0, n);
  }
  function* siblings(n) { for (; n; n = n.nextSibling) yield n; }
  // move children to a clone of el one by one until the page is full, and split
  // the child that overflows recursively, so elements can be broken at any depth
  function splitBlock(el, container, prev, first, more) {
    wrapRuns(el);
    const head = cut(el, container, first);
    prev = hasPrev(head);
    let item, partial;
    while (item = el.firstChild) {
      if (item.nodeType !== 1) { head.append(item); continue; }
      endFrag(item);
      const big = isBigBlock(item);
      if (!big) {
        const run = fitting(head, siblings(item));
        run.length || run.push(item);
        head.append(...run);
        if (!overflows()) continue;
        // (the estimate was too optimistic) take back all but the first
        if (run.length > 1 && (el.prepend(...run.slice(1)), !overflows())) continue;
      }
      const n = nChild(head), rest = split(item, head, big ? 'block' : undefined, more || !!firstEl(el));
      used = null;  // (the page has changed)
      if (rest) { partial = nChild(head) > n; el.prepend(rest); break; }
    }
    blank(el) && fitLastPiece(head, el, prev);  // (may push children to el)
    blank(el) || moveTrailingHeadings(head, el, prev);
    prev && !partial && moveShortHead(head, el);
    el.tagName === 'OL' && nChild(head) && !blank(el) && fixOlStart(head, el);
    return [head, blank(el) ? null : el];
  }

  // a legend or a caption (which is too tall for moveShortHead() when it's in a framed
  // block or above a table) should not be the last child of a piece that is continued,
  // so move it (and those before it) to the rest (el)
  function moveTrailingHeadings(head, el, prev) {
    for (let h; (h = lastEl(head))?.matches('legend, .caption') && (nChild(head) > 1 || prev);)
      el.prepend(h);
  }
  // if only about one line (e.g., a legend or the first list item) is left on the
  // page, and no child was split, move it to the next page with the rest (el)
  function moveShortHead(head, el) {
    if (!blank(el) && rect(head).height < 1.5 * H_line) {
      rejoin(lastEl(head), firstEl(el));
      el.prepend(...head.childNodes);
    }
  }
  // put back the piece a (at the end of the head) into its rest b (at the start of el),
  // so they are one element again
  function rejoin(a, b) {
    if (!a || !b || !has(a, fr_cls) || !has(b, fr_cls) || a.tagName !== b.tagName) return;
    rejoin(lastEl(a), firstEl(b));
    b.prepend(...a.childNodes);
    // (b is not marked as the last piece yet; if a was the first piece, they are the original element)
    rmCls(b, ...has(a, fr_1) ? [fr_cls, fr_1, fr_2] : [fr_1]);
    a.remove();
  }
  // If all children fit, head is the last piece, which has bottom margin/padding/
  // border that were hidden when it was measured as a non-last piece; if it is too
  // big now, break the last child (or push it out entirely if it can't be broken).
  function fitLastPiece(head, el, prev) {
    addCls(head, fr_2);
    while (overflows() && lastEl(head) && (nChild(head) > 1 || prev)) {
      const last = lastEl(head), rest = split(last, head, undefined, true);
      if (!rest) break;
      el.prepend(rest);
      if (rest !== last) break;  // (a piece of the child is still on the page)
    }
    blank(el) || rmCls(head, fr_2);
  }
  // update the start number of the rest of <ol> (an item split in half counts once)
  function fixOlStart(head, el) {
    el.start += nChild(head) - (has(firstEl(el), fr_cls) ? 1 : 0);
  }
  // split <p> by testing if a range fits the current box
  function splitInline(el, container, prev, first, more) {
    const ends = lineStarts(el);
    if (ends.length < 2) return;  // single-line paragraph
    const r = range(), rest = el.cloneNode(), n = ends.length;
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
      if (k > 0 && !overflows()) break;
    }
    // avoid a widow only when it is the very last line of the content, i.e.,
    // alone on a page (an orphan, or a widow followed by more content, is fine)
    if (k > 1 && n - k === 1 && !more) cutLine();
    return [el, rest];
  }

  // find the break position of each line (exclude block elements like footnotes)
  function lineStarts(el) {
    const r = range(), ends = [{node: el, i: 0}];
    const walker = d.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node, prev;
    // if the previous rect is at top-right of current rect, assume a line ends
    // before the current one (TODO: how about RTL languages?)
    function newLine(rect) {
      return prev && prev.bottom <= rect.top && prev.right > rect.left;
    }
    while (node = walker.nextNode()) {
      const t = node.tagName;
      if (t) {
        if (t === 'MJX-CONTAINER' || (t === 'SPAN' && $('.katex', node)) || !inTextFlow(node)) {
          node = walker.nextSibling();  // skip blocks and floats (footnotes) and math
          if (!node) break;
        }
        if (node.firstChild) continue;  // for element nodes, traverse to bottom
      }
      if (node.tagName) {
        const rc = rect(node);
        newLine(rc) && ends.push({node, i: -1});
        prev = rc;
      } else if (node.textContent.trim()) {
        // a text node has one rect per line, and a new line starts at the first
        // character that makes the range of the text have one more rect
        r.selectNodeContents(node);
        const rects = r.getClientRects();
        if (!rects.length) continue;
        newLine(rects[0]) && ends.push({node, i: 0});
        for (let k = 1; k < rects.length; k++) ends.push({node, i: lineOffset(node, k, r)});
        prev = rects[rects.length - 1];
      }
    }
    return ends;
  }
  // the offset of the first character on the k-th line of a text node (via bisection)
  function lineOffset(node, k, r) {
    let lo = 0, hi = node.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      r.setStart(node, 0); r.setEnd(node, mid);
      r.getClientRects().length > k ? hi = mid : lo = mid + 1;
    }
    return lo - 1;  // (the range ends after the first character of the line)
  }
  // split table rows
  function splitTable(el, container, prev, first) {
    const head = cut(el, container, first), tb = el.tBodies[0], tb2 = tb.cloneNode(),
      rows = [...tb.rows], n = rows.length, min = prev ? 0 : 1;
    // the caption (which is not broken) goes with the first rows, unless it is below the table
    const cap = el.caption && style(el.caption).captionSide !== 'bottom' ? el.caption : null;
    function clear() { cap && el.prepend(cap); head.innerHTML = ''; }
    cap && head.append(cap);
    // copy table header and footer (the header goes first, as in the original)
    [el.tHead, tb2, el.tFoot].forEach(t => t && head.append(t === tb2 ? t : t.cloneNode(true)));
    // Put all rows in the page and lay them out once. The rows whose bottoms are
    // below (the bottom of the last row - the overflow) do not fit; put them back.
    tb2.append(...rows);
    const over = pageHeight() - H - .5;  // (see fitLines())
    if (over >= 0) {
      const limit = rect(rows[n - 1]).bottom - over;
      let lo = 0, hi = n;  // the first row that is below the limit (by bisection)
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        rect(rows[mid]).bottom <= limit ? lo = mid + 1 : hi = mid;
      }
      let k = Math.max(lo, min);
      tb.prepend(...rows.slice(k));
      while (k > min && pageHeight() > H + .5) tb.prepend(rows[--k]);  // make sure they fit
    }
    // clear the clone if current page can't fit even one row
    tb2.rows.length || clear();
    // avoid a single row on either page
    const m = tb2.rows.length;
    if (tb.rows.length === 1 && m > 1 || m === 1 && prev && tb.rows.length) {
      tb.prepend(tb2.rows[m - 1]);
      if (m === 1) clear();
    }
    return [head, tb.rows.length ? el : null];
  }
  // split lines in <code> and move as many lines into the clone as possible
  function splitCode(el, container, prev, first) {
    const code = firstEl(el), lines = codeLines(el);
    // other children go to the first piece, except those after <code> in the normal
    // flow (e.g., a link to the output), which go to the last piece
    const ch = kids(el), tail = ch.filter((c, j) => j > ch.indexOf(code) && inFlow(style(c)));
    const head = cut(el, container, first), code2 = code.cloneNode();
    head.append(code2, ...ch.filter(c => c !== code && !tail.includes(c)));
    let i = fitLines(code2, lines, prev);
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
  // Figure out how many lines can fit the box. Instead of guessing and testing
  // different numbers of lines, put all lines in <code> and lay them out once, and
  // read the positions of the line breaks, which tells how many lines are below
  // the bottom of the page. (Lines are balanced, so their line breaks are in the
  // text nodes that are children of <code>.)
  function fitLines(code, lines, prev) {
    const n = lines.length, min = prev ? 0 : 1;
    code.innerHTML = lines.join('\n');
    // (the page fits if its height is rounded to H or less, i.e., it is < H + .5)
    const over = pageHeight() - H - .5;
    if (over < 0) return n;
    const r = range(), bottoms = [];  // the bottom of each line
    code.childNodes.forEach(node => {
      if (node.nodeType !== 3) return;
      for (let i = node.data.indexOf('\n'); i >= 0; i = node.data.indexOf('\n', i + 1)) {
        r.setStart(node, i); r.setEnd(node, i + 1);
        bottoms.push(rect(r).bottom);
      }
    });
    // the bottom of the last line (which has no line break), and the space after it
    r.selectNodeContents(code);
    const rects = r.getClientRects(), last = rects[rects.length - 1].bottom;
    bottoms.push(last);
    // the lines whose bottoms are not below (the bottom of the last line - over)
    let i = 0;
    while (i < n && bottoms[i] <= last - over) i++;
    // blank lines at the end don't take space, so don't leave them to the next page
    while (i && i < n && !lines[i].trim()) i++;
    code.innerHTML = lines.slice(0, Math.max(i, min)).join('\n');
    // make sure that the lines fit (e.g., when the line break is not at the bottom
    // of a line)
    while (i > min && pageHeight() > H + .5) {
      code.innerHTML = lines.slice(0, --i).join('\n');
    }
    return Math.max(i, min);
  }

  // --- Letting content settle before measuring it --------------------

  // Let content that reacts to the width of its container (e.g., diagrams that use
  // a ResizeObserver) settle at the page width before measuring anything: put all
  // content on a probe page and wait for a few frames.
  function probe(roots, els) {
    addCls(box, 'pagesjs-settle');
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
  // record the bottoms of the blocks that may be children of a broken element
  function markY(el) {
    probeY.set(el, rect(el).bottom);
    el.matches(`p, pre, table, ${atomic}`) || kids(el).forEach(markY);
  }
  function unprobe() {
    if (!probed) return;
    probed.forEach(ch => ch.forEach(markY));  // (before removing anything, to lay out only once)
    probed.forEach(ch => ch.forEach(el => el.remove()));
    box_body.innerHTML = ''; box_ctx = null; wrap = [];
    rmCls(box, 'pagesjs-settle');
    probed = null;
  }

  // --- Page numbers and titles ---------------------------------------

  // use data-short-title of a header if exists, and fall back to inner text
  function shortTitle(h) {
    return h && (h.dataset.shortTitle || h.innerText);
  }
  const ps = (book ? 'h1' : 'h2') + ':not(.pagesjs-front *)';  // page title selector
  // add page number, title, etc. to data-* attributes of page elements
  function numberPages() {
    let page_title, i = 0;
    const u = new URL(location.href);  // page URL without ?paged=1, shown on the last page
    u.searchParams.delete('paged');
    boxes.forEach(box => {
      if (book) {
        if ($('.pagesjs-front', box)) return;  // skip book frontmatter page
        $(ps, box) && (page_title = '');  // empty title for first page of chapter
      }
      const N = +box.dataset.pagesOffset || 1;
      if (N > 1) addCls(box, 'page-multiple');
      i += N;
      addCls(box, `page-${i % 2 === 0 ? 'even' : 'odd'}`);
      const info = {
        'pageNumber': i, 'mainTitle': main_title, 'pageTitle': page_title,
        'pageUrl': box === boxes.at(-1) && u.href
      };
      [box.children[0], lastEl(box)].forEach(el => {
        for (const key in info) info[key] && (el.dataset[key] = info[key]);
      });
      // find page title for next page
      page_title = shortTitle([...$$(ps, box)].pop()) || page_title;
    });
  }

  // add page numbers to TOC with data-* attributes
  function numberToc() {
    $$('#TOC a[href^="#"]').forEach(a => {
      const p = d.getElementById(a.getAttribute('href').slice(1))?.closest('.pagesjs-page');
      a.dataset.pageNumber = p?.children[0].dataset.pageNumber ?? '';
    });
  }

  // --- Pagination ----------------------------------------------------

  function ownText(el) {
    return [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
  }
  function canBeRoot(el) { return !['PRE', 'TABLE'].includes(el.tagName) && !ownText(el); }
  // The content root is specified via <body data-pages-root="selector">, or is
  // <main> (or an element with role="main"), or the top-level <article> elements,
  // or <body>. If <main> only has a child (e.g., <article>), the child is the root
  // (and so on). Everything else (e.g., navigation bars) will be hidden.
  function findRoots() {
    const sel = d.body.dataset.pagesRoot, x = sel ? [...$$(sel)] : [];
    if (x.length) return x;
    let main = $('main, [role="main"]');
    // if it only contains a wrapper (e.g., an <article>), use the wrapper instead
    // (but not an element that is broken by its own, or has text, which would be lost)
    while (main && nChild(main) === 1 && !ownText(main) && canBeRoot(firstEl(main)))
      main = firstEl(main);
    if (main) return [main];
    const articles = [...$$('article')].filter(el => !el.parentNode.closest('article'));
    return articles.length ? articles : [d.body];
  }
  // The frontmatter (title, author, etc.) of the document is <header> (a child of
  // <body>) by default, or specified via <body data-pages-front="selector">; it is
  // put on its own page in a book.
  function markFrontmatter() {
    $$(d.body.dataset.pagesFront || 'body > header').forEach(el => addCls(el, 'pagesjs-front'));
  }
  // remove the classes of the TOC, footnotes, etc. that put them in the margin on
  // screen but are not suitable for printing
  function removeSideClasses() {
    $$(':is(#TOC, .footnotes, .chapter-before, .chapter-after):is(.side-left, .side-right).side').forEach(el => {
      rmCls(el, 'side', 'side-left', 'side-right');
    });
  }
  // Replace the notes (footnotes and citations that sidenotes.js has put after their
  // references) with markers, which go with the references when the text is broken.
  function detachNotes() {
    $$('.footnotes').forEach(el => {
      const p = el.previousElementSibling;
      if (!p || !has(p, 'note-ref')) return;
      const m = make('span', 'pagesjs-note');
      m.hidden = true;
      notes.set(m, kids(el)); el.replaceWith(m);
    });
  }
  // test how much space a single-line paragraph needs
  function measureMinHeight() {
    const p = make('p'), H0 = box.scrollHeight;
    p.innerText = 'A'; box_body.append(p);
    H_min = box.scrollHeight - H0; H_line = rect(p).height; p.remove();
  }
  // add dot leaders to TOC (page numbers will be added after the pages are ready)
  function addTocLeaders() {
    $$('#TOC a[href^="#"]').forEach(a => {
      const s = make('span', 'toc-text');  // move TOC item content into a span
      a.append(s);
      let c; while (c = s.previousSibling) {
        // exclude section number spans
        if (c.nodeType === 1 && has(c, 'section-number')) break; s.prepend(c);
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
      const ch = kids(el).filter(el => ![box, hold, progress].includes(el) &&
        !['SCRIPT', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName));
      ch.forEach(el => el.remove());
      return ch;
    });
  }
  // iteratively add elements to pages
  function* fillPages(roots, els) {
    for (const el of $$('.pagesjs-front, .abstract, #TOC:not(.chapter-toc)')) {
      yield* fill(el);
      book && nextPage();
    }
    for (const [i, el] of roots.entries()) {
      wrap = ancestors(el); box_ctx = null;
      book && (box.innerText === '' ? newPage(box) : nextPage());
      const list = els[i];
      for (let j = 0; j < list.length; j++) {
        yield* fill(list[j], i < roots.length - 1 || j < list.length - 1);
        // put the next children on the page at once if they surely fit
        const run = fitting(ctx(), list.slice(j + 1), true);
        run.length && (ctx().append(...run), overflows() ? run.forEach(e => e.remove()) : j += run.length);
      }
      // clean up container and self if empty
      removeBlank(el.parentNode); removeBlank(el);
    }
    finish(box);  // finish the last box
    // unwrap the blocks created for runs of inline nodes
    $$('.pagesjs-run').forEach(el => el.replaceWith(...el.childNodes));
  }
  // Run the rest of the pagination. If it is not sync, do it in slices of 0.5s,
  // so the browser can show the progress in between (not too often, to save time).
  function advance(sync) {
    const t = performance.now();
    while (!running.next().done) {
      if (sync || performance.now() - t < 500) continue;
      return new Promise(go => { requestAnimationFrame(go); setTimeout(go, 50); })
        .then(() => advance());
    }
  }
  function paginate(sync) {
    // nobody sees the progress in a headless browser (and printing has to be sync)
    const quiet = sync || /Headless/.test(navigator.userAgent) || navigator.webdriver;
    // we need to wait for all resources to be fully loaded before paginating
    if (d.readyState !== 'complete') return on('load', () => paginate(sync));

    const cls = d.body.classList;
    if (cls.contains('pagesjs')) return;  // already paginated
    fire('pagesjs:before');
    const t0 = performance.now();

    markFrontmatter();
    // (get the title while the document is visible, so innerText works)
    main_title = shortTitle($('h1.title, .pagesjs-front h1, .title, h1'));

    cls.add('pagesjs');
    d.body.append(hold);
    if (!quiet) {  // a simple indicator to tell users to wait
      progress = make('div', 'pagesjs-progress');
      progress.textContent = 'Paginating...';
      d.body.append(progress);
    }
    d.body.insertAdjacentElement('afterbegin', newPage());
    H = (box.clientHeight || window.innerHeight) + tol; B = box_body.clientHeight || H;  // use window height if box height not specified
    removeSideClasses();
    cls.add('pagesjs-filling');
    measureMinHeight();
    addTocLeaders();

    detachNotes();
    const roots = findRoots(), els = detachContent(roots);
    function* run() {
      yield* fillPages(roots, els);
      cls.remove('pagesjs-filling');
      d.body.prepend(...boxes);  // unhide all pages
      checkOffsets();
      numberPages();
      numberToc();
      hold.remove(); progress?.remove();
      finished = true;
      const over = boxes.filter(b => b.classList.contains('page-multiple')).length;
      console.info(`pages.js: ${boxes.length} pages in ${Math.round(performance.now() - t0)} ms` +
        (over ? `; ${over} overflow their page` : ''));
      fire('pagesjs:after');
    }
    // Pagination is async unless it has to be sync (beforeprint). If printing
    // starts while it's pending (e.g., headless printing right after the page is
    // loaded), finish it right away.
    pending = sync => { pending = null; unprobe(); running = run(); return advance(sync || quiet); };
    sync ? pending(true) : probe(roots, els).then(() => pending?.());
  }
  on('beforeprint', () => {
    if (pending) pending(true);
    else if (running) while (!running.next().done);  // finish the pagination in progress
    else paginate(true);
  });
  // A script that controls the browser can request the pagination by dispatching
  // pagesjs:paginate, and wait for pagesjs:after (which is also dispatched if the
  // pagination was already finished)
  on('pagesjs:paginate', () => {
    finished ? fire('pagesjs:after') : paginate();
  });
  // use query param ?paged=1 to indicate pagination (press p to toggle)
  const SP = new URLSearchParams(location.search);
  SP.get('paged') && paginate();
  on('keypress', e => {
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
