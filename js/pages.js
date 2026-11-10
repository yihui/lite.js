// Paginate an HTML page into page boxes (e.g., A4) so each holds as much content as fits.
//
// 1. The content root (e.g., <main>) is emptied and laid out once on a probe page, so
//    width-dependent content settles and block positions are known (probe()).
// 2. Children go onto pages one by one (fill() -> place()). Only the current page is in
//    the DOM; children that surely fit by their probe positions are measured together (fitting()).
// 3. When an element overflows, split() puts as much as possible on the page, the rest on the
//    next. kindOf() decides how: blocks are cloned and their children moved (recursively);
//    text, table rows, and code lines are broken by lines/rows. Pieces get the classes
//    pagesjs-fragmented, fragment-first, fragment-last (styled in pages.css).
//    Floats (isFloat()) are never broken: one that does not fit waits for the next page
//    (pagesjs-waited) while later content fills the gap. A tall float takes a page alone,
//    and a wide one (.pagesjs-wide) a landscape page (takePage()).
// 4. Each page holds empty clones of the ancestors of the content root, so CSS selectors
//    that depend on them still match (ctx()).
// 5. In the end, page numbers and titles go into data-* attributes for the headers/footers.
(d => {

  // --- Utilities -----------------------------------------------------

  function $(s, el = d) { return el?.querySelector(s); }
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
    book = $$('h1').length > 1,  // several <h1>: a book, whose chapters start on new pages
    // never broken across pages (CSS break-inside: avoid also works)
    atomic = 'h1,h2,h3,h4,h5,h6,hr,img,svg,video,canvas,iframe,object,embed,math,mjx-container,figure,.figure,.pagesjs-float,.pagesjs-wide,.caption,details',
    fr_cls = 'pagesjs-fragmented', fr_1 = 'fragment-first', fr_2 = 'fragment-last',
    // px that content may hang over the page bottom (the page has more padding there;
    // browsers round sizes differently)
    tol = 3,
    // floats taller than this % of the body take a page (<body data-pages-float-page="...">;
    // 100 for never)
    floatPage = parseFloat(d.body.dataset.pagesFloatPage) || 70,
    tb = ['top', 'bottom'].map(i =>
      num(style(d.documentElement).getPropertyValue(`--paper-margin-${i}`))
    ),  // top/bottom page margin
    tpl = make('div', 'pagesjs-page'),
    boxes = [],  // all pages
    wrapped = new WeakSet(),  // elements whose inline runs are wrapped (wrapRuns())
    guessed = new WeakSet(),  // pages whose number of physical pages is estimated (calcPages())
    floats = [],  // floats waiting for a page (putFloats())
    notes = new Map(),  // items of each note (footnote or citation), by its marker (detachNotes())
    probeY = new WeakMap(),  // bottoms of the blocks on the probe page (fitting())
    hold = make('div');  // hidden container for elements that need styles
  tpl.innerHTML = `<div class="pagesjs-header"></div>
<div class="pagesjs-body"></div>
<div class="pagesjs-footer"></div>`;
  hold.style.display = 'none';

  let
    box, box_body,  // the current page and its body
    box_ctx,  // where the content goes in the body (ctx())
    wrap = [],  // the ancestors of the content root (outermost first)
    H, B,  // the height of the current page and of its body
    portrait, landscape,  // [H, B] of a normal page and of a landscape page (takePage())
    H_min, H_line,  // the height of a single-line paragraph (with margins) and of a line
    used,  // the content height of the page when it was last measured (overflows())
    whole,  // the float that takes the page being filled (takePage())
    main_title,  // the title of the document
    probed,  // the content on the probe page (probe())
    pending,  // the rest of the pagination, waiting for the probe
    running,  // the generator that does the rest of the pagination (advance())
    progress, n_done = 0,  // the progress indicator and the number of finished pages
    finished,  // is the pagination finished?
    SP = new URLSearchParams(location.search);

  // Diagnosis (listed in a panel, see addTools()): pages that overflow, elements with
  // scrollbars, and unbreakable elements that stick out of the page
  const hit = 'pagesjs-hit', px = n => Math.round(n);
  function unhit() { $('.' + hit)?.classList.remove(hit); }
  function problems() {
    const out = [], sc = /auto|scroll/, scrolls = [];
    boxes.forEach((b, i) => {
      const body = b.children[1], r = rect(body), p = `p.${i + 1}`;
      has(b, 'page-multiple') && out.push([b, `${p} overflows`]);
      $$('*', body).forEach(el => {
        const cs = style(el), name = el.tagName.toLowerCase() + (el.className && '.' + el.classList[0]);
        // (read sizes only of scrolling elements: each read is a layout)
        if (sc.test(cs.overflowX) || sc.test(cs.overflowY)) {
          const {clientWidth: cw, clientHeight: ch, scrollWidth: sw, scrollHeight: sh} = el;
          if (sc.test(cs.overflowX) && sw > cw + 1 || sc.test(cs.overflowY) && sh > ch + 1)
            return scrolls.push(el), out.push([el, `${p} ${name} scrolls: ${sw}x${sh} in ${cw}x${ch}`]);
        }
        // (what sticks out of a scrolling element is reached by scrolling it)
        const e = el.matches(atomic) && !scrolls.some(s => s.contains(el)) && rect(el);
        e && (e.right > r.right + 1 || e.bottom > r.bottom + 1) &&
          out.push([el, `${p} ${name} sticks out: ${px(e.width)}x${px(e.height)} on ${px(r.width)}x${px(r.height)}`]);
      });
    });
    return out;
  }

  // --- Page boxes ----------------------------------------------------

  function newPage(el) {
    el && !$('.pagesjs-body', el) && el.insertAdjacentHTML('afterbegin', tpl.innerHTML);
    box = el || tpl.cloneNode(true); box_body = box.children[1]; box_ctx = null;
    portrait && ([H, B] = portrait);
    boxes.includes(box) || boxes.push(box);
    return box;
  }
  // The margin at the end of the content of a page is truncated at the page end (as in
  // CSS fragmentation), so it does not count in the fit test: the margin of the last
  // element and its last descendants, up to one with padding/border at the bottom.
  function trailingMargin(body = box_body) {
    let m = 0;
    for (let e = lastEl(body); e; e = lastEl(e)) {
      const cs = style(e);
      m = Math.max(m, num(cs.marginBottom));
      if (num(cs.paddingBottom) || num(cs.borderBottomWidth)) break;
    }
    return m;
  }
  // How far (px) the page, without the margin at the end of its content, goes beyond what
  // fits: it fits if its height rounds to H or less (< H + .5).
  function excess() { syncNotes(); return (crowded() ? Infinity : rect(box).height - trailingMargin()) - H - .5; }
  function overflows() { syncNotes(); return (used = box.scrollHeight - trailingMargin()) > H || crowded(); }
  // Does a float take the page, with something after it? Then nothing else fits.
  function taken() { return !!whole && box_body.contains(whole); }
  function crowded() { return taken() && hasAround(whole, 'next'); }
  // Notes are measured in a block after the page body, as in the end, not inline (where
  // they are floats next to their references): put the notes of the references on the
  // page there, and take off the others.
  function syncNotes(b = box) {
    const body = b.children[1], ms = [...$$('.pagesjs-note', body)], seen = new Set();
    // a note cited more than once on the page is shown once (with its first reference)
    const items = ms.flatMap(m => {
      const k = m.dataset.noteId;
      if (k && seen.has(k)) return [];
      k && seen.add(k);
      return notes.get(m);
    });
    let c = $(':scope > .footnotes', b);
    if (!items.length) return c?.remove();
    c || body.after(c = make('div'));
    c.className = 'footnotes';
    if (items.some((e, i) => c.children[i] !== e) || nChild(c) !== items.length) c.replaceChildren(...items);
  }
  function nextPage(el, callback) {
    const cur = box; cur.after(newPage(el)); callback && callback(); putFloats(); finish(cur);
  }
  // compute page numbers and remove the box from the DOM
  function finish(box) {
    syncNotes(box);
    const h = box.scrollHeight, wide = has(box, 'page-wide'), Hb = (wide ? landscape : portrait)[0];
    // tolerate a few pixels (and a last margin) hanging over the bottom; a landscape page is
    // not continued (what sticks out of it is reported, see problems())
    if (!wide && h - trailingMargin(box.children[1]) > Hb && !box.dataset.pagesOffset) {
      const n = calcPages(box, h, Hb);
      if (n > 1) box.dataset.pagesOffset = n, guessed.add(box);
    }
    box.remove();
    progress && (progress.textContent = `Paginating: ${++n_done} pages done`);
  }
  // A page in fill mode has its natural height, which includes space not needed in the end
  // (e.g., the last margin), so a page a few pixels too tall may be fine at its fixed height.
  // If the content does not reach the notes/footer and nothing hangs over the paper, the
  // estimated number of pages is wrong.
  function checkOffsets() {
    boxes.forEach(box => {
      if (!guessed.has(box)) return;
      const body = box.children[1], r = range();
      r.selectNodeContents(body);
      if (rect(r).bottom <= rect(body.nextElementSibling).top &&
        box.scrollHeight <= box.clientHeight + 1) delete box.dataset.pagesOffset;
    });
  }
  // number of pages for the overflow (an estimate; set data-pages-offset="N" to override)
  function calcPages(box, h, H) {
    let n = +box.dataset.pagesOffset;
    if (n) return n;
    n = Math.ceil(h/H);
    if (n <= 1) return n;
    // consider the top/bottom margins and table headers (repeated on each page)
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
  // an empty clone of el that keeps its context for CSS selectors but not its box
  function wrapper(el) {
    const c = el.cloneNode(); addCls(c, 'pagesjs-wrap'); unfrag(c);
    return c;
  }
  // The container for content on the current page: clones of the content root and its
  // ancestors, so selectors like `main h2` still apply on pages.
  function setRoot(el) { wrap = el ? ancestors(el) : []; box_ctx = null; }
  function ctx() {
    if (!wrap.length) return box_body;
    if (!box_ctx || !box_body.contains(box_ctx)) {
      box_ctx = wrap.reduce((p, el) => p.appendChild(wrapper(el)), box_body);
    }
    return box_ctx;
  }
  function removeBlank(el) {
    if (!el || el.tagName === 'BODY') return false;
    // (a <p> is empty only if its HTML is)
    const v = !(el.tagName === 'P' ? el.innerHTML : el.innerText).trim();
    v && el.remove();
    return v;
  }

  // --- Putting elements on pages -------------------------------------

  function* fill(el, more = true) {
    // a page element is used as the box
    if (has(el, 'pagesjs-page')) {
      nextPage(el, () => nChild(el) > 3 && (
        // (its content goes into the box; TODO: fragment it if it's too long)
        box_body.append(...kids(el).slice(3)),
        nextPage()
      ));
    } else {
      if (book && box.innerText !== '' && $('h1', el)) flush(), nextPage();
      if (el.innerText.trim() && (taken() || (syncNotes(), H - box.scrollHeight < H_min))) nextPage();
      yield* place(el, more);
    }
  }

  // append el to the page; if it overflows, put as much as possible on the page and
  // the rest on the next page(s)
  function* place(el, more) {
    for (;;) {
      const c = ctx(), big = isBigBlock(el);
      endFrag(el);
      // a big block is not attached to the page: styling and laying out all its content
      // just to find out that it does not fit takes time
      if (!big) {
        c.append(el);
        if (isFloat(el) && !stays(el, c)) return;
        if (!overflows()) return;
      }
      el = split(el, c, big ? 'block' : undefined, more);
      if (!el) return;
      nextPage();
      yield;  // (a chance to paint the progress)
      // TODO: remove possibly duplicated citations: .citation + div > [id^="ref-"]
    }
  }

  // Put as much of el (which just overflowed container) as possible into container, and
  // return the rest (detached), if any. Unless el is first on the page, it is left out
  // entirely if it can't be broken.
  function split(el, container, kind, more) {
    // (a block's prev is determined after it is cut, to avoid laying it out)
    const k = kind || kindOf(el), prev = k === 'block' ? undefined : hasPrev(el),
      first = !has(el, fr_cls), r = k && splitters[k](el, container, prev, first, more);
    if (!r) return prev && (el.remove(), isFloat(el) ? defer(el, container) : el);
    const [head, rest] = r;
    if (blank(head)) return head.remove(), rest;  // nothing fits
    if (rest) {
      addCls(rest, fr_cls); rmCls(rest, fr_1, fr_2);
    } else if (has(head, fr_1)) {
      unfrag(head);  // (not really split)
    } else {
      addCls(head, fr_2);  // the last piece
    }
    return rest;
  }
  function unfrag(el) { rmCls(el, fr_cls, fr_1, fr_2); }

  // Floats: captioned figures and .pagesjs-float elements. They keep their order (one waits
  // if an earlier one does), and wait at most until the end of the chapter (book) or the root.
  function isFloat(el) {
    return el.matches('.pagesjs-float, .pagesjs-wide') || el.matches('figure, .figure') && !!$('figcaption, .caption', el);
  }
  function isTall(f) { return has(f, 'pagesjs-wide') || rect(f).height > B * floatPage / 100; }
  // Let a float take the page: overflows() keeps everything else off it, and the class
  // centers the float (pages.css). A wide float gets a landscape page.
  function takePage(f) {
    whole = f; addCls(box, 'page-float');
    has(f, 'pagesjs-wide') && (addCls(box, 'page-wide'), [H, B] = landscape);
  }
  // Does a float (attached to container) stay? Not if floats wait before it, or if it takes
  // a page and there is content before it: then it goes to a page of its own.
  function stays(f, container) {
    const tall = isTall(f);
    if (floats.length || tall && hasPrev(f)) return defer(f, container, tall), false;
    tall && takePage(f);
    return true;
  }
  // (the waiting float keeps the wrappers of the elements it was in, e.g., a chapter, so
  // selectors that depend on them still work on the next page)
  function defer(el, container, tall) {
    const chain = [];
    for (let p = container, top = ctx(); p && p !== top; p = p.parentNode) chain.unshift(wrapper(p));
    el.remove(); floats.push([el, chain, tall]);
  }
  // Put the waiting floats at the top of the new page, in order, as many as fit. The first
  // stays even if too big, since it can't wait any longer.
  function putFloats() {
    while (floats.length) {
      const [f, chain] = floats[0], out = chain[0] || f;
      chain.reduce((p, c) => p.appendChild(c), ctx()).append(f);
      // the first float on the page stays (centered if it takes the page); the others
      // only if short and fitting
      if (hasPrev(out)) {
        if (isTall(f) || overflows()) return out.remove();
      } else isTall(f) && takePage(f);
      floats.shift(); addCls(f, 'pagesjs-waited');
    }
  }
  function flush() {
    putFloats();
    while (floats.length) nextPage();
  }

  function isBigBlock(el) {
    return !isFloat(el) && !['TABLE', 'PRE'].includes(el.tagName) && el.getElementsByTagName('*').length > 300;
  }
  function blank(el) { return !firstEl(el) && !el.textContent.trim(); }
  // is there anything before ('previous') or after ('next') el on the page?
  function hasAround(el, side) {
    const k = side + 'ElementSibling';
    for (; el && el !== box_body; el = el.parentNode)
      for (let p = el[k]; p; p = p[k])
        if (rect(p).height) return true;
    return false;
  }
  function hasPrev(el) { return hasAround(el, 'previous'); }
  function inFlow(cs) {
    return cs.float === 'none' && !['absolute', 'fixed'].includes(cs.position);
  }
  // text, inline and out-of-flow nodes go with the text around them
  function isInline(n) {
    if (n.nodeType !== 1) return true;
    const cs = style(n), v = cs.display;
    return v.startsWith('inline') || v === 'none' || v === 'contents' || !inFlow(cs);
  }
  function inTextFlow(el) {
    const cs = style(el);
    return (cs.display.startsWith('inline') || cs.display === 'contents') && inFlow(cs);
  }
  // lines of <pre><code>; a tag open at a line end (e.g., a multi-line comment) is closed
  // there and reopened on the next line, so each line is balanced
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
  // how the element can be broken: 'block' (child blocks), 'inline' (text lines), 'table'
  // (rows), 'code' (lines), or not at all (undefined)?
  function kindOf(el) {
    const cs = style(el), t = el.tagName;
    if (/avoid/.test(cs.breakInside) || el.matches(atomic)) return;
    if (t === 'TABLE') return el.tBodies[0] && 'table';
    if (!['block', 'list-item', 'flow-root'].includes(cs.display) || !inFlow(cs)) return;
    if (t === 'PRE') {
      if (firstEl(el)?.tagName === 'CODE' && codeLines(el).length > 1) return 'code';
      // wrapped long lines: move to the next page if it fits there, else break by lines
      if (el.offsetHeight <= B) return;
    }
    return kids(el).some(c => !isInline(c)) ? 'block' : 'inline';
  }
  function mark(el, first) {
    addCls(el, fr_cls); rmCls(el, fr_2); first && addCls(el, fr_1);
  }
  // The pieces that are put on a page as a whole are the last pieces. Mark them (and their
  // fragmented descendants) before measuring, since the last piece is styled differently
  // (pages.css). If it is split after all, the mark is removed.
  function endFrag(el) {
    if (el.nodeType === 1) [el, ...$$('.' + fr_cls, el)].forEach(e => has(e, fr_cls) && addCls(e, fr_2));
  }
  // shallow clone of el (as its first piece) in container
  function cut(el, container, first) {
    const head = el.cloneNode();
    el.remove(); container.append(head); mark(head, first);
    return head;
  }
  // wrap each run of inline nodes in a block (like an anonymous block box in CSS), so mixed
  // content (e.g., <li>text<ul>...</ul></li>) can be broken like paragraphs
  function wrapRuns(el) {
    // (a run is made of inline nodes already; wrapping it again would nest runs endlessly)
    if (wrapped.has(el) || has(el, 'pagesjs-run')) return;
    wrapped.add(el);
    // computed styles are only available in the DOM
    el.isConnected || hold.append(el);
    let run = [];
    function endRun() {
      if (run.some(n => n.nodeType === 1 || n.nodeType === 3 && n.nodeValue.trim())) {
        const s = make('span', 'pagesjs-run');
        run[0].before(s); s.append(...run);
      }
      run = [];
    }
    for (const n of [...el.childNodes]) isInline(n) ? run.push(n) : endRun();
    endRun();
    el.parentNode === hold && el.remove();
  }

  const splitters = {block: splitBlock, inline: splitInline, table: splitTable, code: splitCode};

  // --- Breaking elements ---------------------------------------------

  // Measuring after each child is slow (a forced layout), so put several children on the page
  // at once when they surely fit, by their probe positions from the last child on the page.
  // If they don't fit, they are taken back, so the estimate affects speed, not the result.
  // Children of the content root need the room fill() asks for (H_min, plus the margin).
  function fitting(head, nodes, root) {
    const prev = lastEl(head), y0 = prev && !has(prev, fr_cls) ? probeY.get(prev) : undefined, run = [];
    if (y0 === undefined || !used) return run;
    let y = y0, n = 0;
    for (const c of nodes) {
      if (c.nodeType === 1) {
        const y1 = probeY.get(c);
        if (!(y1 >= y) || c.matches(`.${fr_cls}, .pagesjs-page`) || isFloat(c) || isBigBlock(c) || $('.pagesjs-note', c) ||
          used + y1 - y0 + H_line > H || root && (used + y - y0 + 2 * H_min > H || book && $('h1', c))) break;
        y = y1;
      }
      run.push(c);
      c.nodeType === 1 && (n = run.length);
    }
    return run.slice(0, n);
  }
  function* siblings(n) { for (; n; n = n.nextSibling) yield n; }
  // move children to a clone of el one by one until the page is full; the child that
  // overflows is split recursively, so elements can be broken at any depth
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
        if (isFloat(item) && !stays(item, head)) continue;
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

  // A legend or caption should not end a piece that is continued (it is too tall for
  // moveShortHead() in a framed block or above a table): move it, and those before it, to el.
  function moveTrailingHeadings(head, el, prev) {
    for (let h; (h = lastEl(head))?.matches('legend, .caption') && (nChild(head) > 1 || prev);)
      el.prepend(h);
  }
  // If about one line (e.g., a legend or the first list item) is left and no child was split,
  // move it to the next page with the rest
  function moveShortHead(head, el) {
    if (!blank(el) && rect(head).height < 1.5 * H_line) {
      rejoin(lastEl(head), firstEl(el));
      el.prepend(...head.childNodes);
    }
  }
  // put the piece a (at the end of head) back into its rest b (at the start of el), so they
  // are one element again
  function rejoin(a, b) {
    if (!a || !b || !has(a, fr_cls) || !has(b, fr_cls) || a.tagName !== b.tagName) return;
    rejoin(lastEl(a), firstEl(b));
    b.prepend(...a.childNodes);
    // (b is not marked as the last piece; if a was the first piece, they are the original element)
    rmCls(b, ...has(a, fr_1) ? [fr_cls, fr_1, fr_2] : [fr_1]);
    a.remove();
  }
  // If all children fit, head is the last piece, whose bottom margin/border was hidden when it
  // was measured as a non-last piece. If it is too big now, break its last child (or push
  // that out entirely if it can't be broken).
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
  // update the start number of the rest of <ol> (a split item counts once)
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
      const last = el.lastChild;  // strip trailing empty tags left by the extraction
      last?.innerHTML === '' && last.remove();
    }
    mark(el, first);
    // remove lines from the end (keep the first line if el is first on the page)
    while (k > (prev ? 0 : 1)) {
      cutLine();
      if (k > 0 && !overflows()) break;
    }
    // avoid a widow only when it is the very last line of the content (alone on a page), or
    // when a tall float waits (then the paragraph moves entirely if it has 2 lines)
    if (n - k === 1 && (k > 1 && !more || (k > 1 || prev) && floats[0]?.[2])) cutLine();
    return [el, rest];
  }

  // find the break position of each line (blocks like footnotes are excluded)
  function lineStarts(el) {
    const r = range(), ends = [{node: el, i: 0}];
    const walker = d.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node, prev;
    // if the previous rect is at the top-right of the current one, a line ends before it
    // (TODO: how about RTL languages?)
    function newLine(rc) {
      return prev && prev.bottom <= rc.top && prev.right > rc.left;
    }
    while (node = walker.nextNode()) {
      const t = node.tagName;
      if (t) {
        if (t === 'MJX-CONTAINER' || (t === 'SPAN' && $('.katex', node)) || !inTextFlow(node)) {
          node = walker.nextSibling();  // skip blocks, floats (footnotes), and math
          if (!node) break;
        }
        if (node.firstChild) continue;  // element nodes: traverse to the bottom
      }
      if (node.tagName) {
        const rc = rect(node);
        newLine(rc) && ends.push({node, i: -1});
        prev = rc;
      } else if (node.textContent.trim()) {
        // a text node has one rect per line; a new line starts at the first character
        // that adds one rect to the range
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
  // the first i in [0, n) for which the monotone test is true (n if none)
  function bisect(n, test) {
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      test(mid) ? hi = mid : lo = mid + 1;
    }
    return lo;
  }
  // the offset of the first character on the k-th line of a text node
  function lineOffset(node, k, r) {
    // (the range ends after the first character of the line)
    return bisect(node.length, mid => (r.setStart(node, 0), r.setEnd(node, mid), r.getClientRects().length > k)) - 1;
  }
  // How many of n pieces (rows or lines) fit the page? All of them are on it, and laid out
  // once; the pieces whose bottoms are below (the bottom of the last one - the excess) do not
  // fit. show(i) puts only the first i pieces on the page, which is checked and fixed in the
  // end (a break may not be at the bottom of a piece). skip(i) may adjust the estimate.
  function fitCount(n, bottom, min, show, skip = i => i) {
    const over = excess();
    if (over < 0) return n;
    const limit = bottom(n - 1) - over;
    let i = skip(bisect(n, j => bottom(j) > limit));
    show(Math.max(i, min));
    while (i > min && excess() > 0) show(--i);
    return Math.max(i, min);
  }
  // A copy of a repeated table header/footer. Its notes appear once, on the first page: the
  // first copy takes the markers of the original, so later copies have none. undo puts the
  // markers back (if the copy is discarded).
  function cloneHold(el, undo) {
    const c = el.cloneNode(true), ms = $$('.pagesjs-note', c);
    $$('.pagesjs-note', el).forEach((m, i) => {
      const p = m.parentNode, next = m.nextSibling;
      notes.set(ms[i], notes.get(m)); m.remove();
      undo.push(() => p.insertBefore(m, next));
    });
    return c;
  }
  // split table rows
  function splitTable(el, container, prev, first) {
    const head = cut(el, container, first), tb = el.tBodies[0], tb2 = tb.cloneNode(),
      undo = [], rows = [...tb.rows], n = rows.length, min = prev ? 0 : 1;
    // the caption (not broken) goes with the first rows, unless it is below the table
    const cap = el.caption && style(el.caption).captionSide !== 'bottom' ? el.caption : null;
    function clear() { cap && el.prepend(cap); head.innerHTML = ''; undo.reverse().forEach(f => f()); }
    cap && head.append(cap);
    // copy the table header and footer (the header goes first, as in the original)
    [el.tHead, tb2, el.tFoot].forEach(t => t && head.append(t === tb2 ? t : cloneHold(t, undo)));
    tb2.append(...rows);
    fitCount(n, j => rect(rows[j]).bottom, min, k => tb.prepend(...rows.slice(k)));
    // clear the clone if the current page can't fit even one row
    tb2.rows.length || clear();
    // avoid a single row on either page
    const m = tb2.rows.length;
    if (tb.rows.length === 1 && m > 1 || m === 1 && prev && tb.rows.length) {
      tb.prepend(tb2.rows[m - 1]);
      if (m === 1) clear();
    }
    return [head, tb.rows.length ? el : null];
  }
  // split lines in <code>, moving as many lines into the clone as possible
  function splitCode(el, container, prev, first) {
    const code = firstEl(el), lines = codeLines(el);
    // other children go to the first piece, except those after <code> in the normal flow
    // (e.g., a link to the output), which go to the last piece
    const ch = kids(el), tail = ch.filter((c, j) => j > ch.indexOf(code) && inFlow(style(c)));
    const head = cut(el, container, first), code2 = code.cloneNode();
    head.append(code2, ...ch.filter(c => c !== code && !tail.includes(c)));
    let i = fitLines(code2, lines, prev);
    // avoid a single line on either page
    if (i > 1 && lines.length - i === 1) i--;
    if (i === 1 && prev) i = 0;
    // i == 0: not enough space on the current page
    if (i) code2.innerHTML = lines.slice(0, i).join('\n'); else head.innerHTML = '';
    code.innerHTML = lines.slice(i).join('\n');
    if (code.innerHTML.trim()) return [head, el];
    i && head.append(...tail);
    return [head, null];
  }
  // How many lines fit the box? The positions of the line breaks tell (lines are balanced,
  // so the breaks are in the text nodes that are children of <code>).
  function fitLines(code, lines, prev) {
    const show = i => code.innerHTML = lines.slice(0, i).join('\n');
    show(lines.length);
    return fitCount(lines.length, j => bottoms()[j], prev ? 0 : 1, show,
      // blank lines at the end take no space, so don't leave them to the next page
      i => { while (i && i < lines.length && !lines[i].trim()) i++; return i; });
    function bottoms() {  // the bottom of each line (cached)
      if (bottoms.v) return bottoms.v;
      const r = range(), v = bottoms.v = [];
      code.childNodes.forEach(node => {
        if (node.nodeType !== 3) return;
        for (let i = node.data.indexOf('\n'); i >= 0; i = node.data.indexOf('\n', i + 1)) {
          r.setStart(node, i); r.setEnd(node, i + 1);
          v.push(rect(r).bottom);
        }
      });
      // the last line has no line break
      r.selectNodeContents(code);
      const rects = r.getClientRects();
      v.push(rects[rects.length - 1].bottom);
      return v;
    }
  }

  // --- Letting content settle before measuring it --------------------

  // Let content that reacts to its container width (e.g., diagrams with a ResizeObserver)
  // settle at the page width before measuring: put all content on a probe page, and wait
  // for a few frames.
  function probe(roots, els) {
    addCls(box, 'pagesjs-settle');
    roots.forEach((el, i) => {
      setRoot(el); ctx().append(...els[i]);
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
    box_body.innerHTML = ''; setRoot();
    rmCls(box, 'pagesjs-settle');
    probed = null;
  }

  // --- Page numbers and titles ---------------------------------------

  // data-short-title of a header if it exists, else its text
  function shortTitle(h) {
    return h && (h.dataset.shortTitle || h.innerText);
  }
  const ps = (book ? 'h1' : 'h2') + ':not(.pagesjs-front *)';  // page title selector
  // add page number, title, etc. to data-* attributes of the page elements
  function numberPages() {
    let page_title, i = 0;
    const u = new URL(location.href);  // page URL without ?paged=1, shown on the last page
    u.searchParams.delete('paged');
    boxes.forEach(box => {
      if (book) {
        if ($('.pagesjs-front', box)) return;  // skip the frontmatter page
        $(ps, box) && (page_title = '');  // empty title for the first page of a chapter
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
      // the page title for the next page
      page_title = shortTitle([...$$(ps, box)].pop()) || page_title;
    });
  }

  // page numbers of the TOC entries, in data-page-number
  function numberToc() {
    $$('#TOC a[href^="#"]').forEach(a => {
      const p = d.getElementById(a.getAttribute('href').slice(1))?.closest('.pagesjs-page');
      a.dataset.pageNumber = p?.children[0].dataset.pageNumber ?? '';
    });
  }

  // The button that toggles the pagination (the paged state is the query param ?paged=1)
  const printer = '<svg viewBox="0 0 16 16" width="1.1em" height="1.1em" fill="none" stroke="currentColor" ' +
    'stroke-width="1.3" stroke-linejoin="round"><path d="M4.5 6V2h7v4M4.5 12h-2.5V6h12v6h-2.5"/><rect x="4.5" y="9" width="7" height="5"/></svg>';
  // (a link, not a <button>, so that it is styled like the other links and icons of a page)
  function toolButton(html, title, click) {
    const btn = make('a');
    btn.href = '#'; btn.setAttribute('role', 'button'); btn.innerHTML = html; btn.title = title;
    btn.onclick = e => { e.preventDefault(); click(); };
    return btn;
  }
  // opt out with <body data-pages-toggle="false"> (e.g., if the page has its own print button)
  function noToggle() { return d.body.dataset.pagesToggle === 'false'; }
  // The button of the unpaginated page. The paged view is a new history entry, so Back
  // returns to the unpaginated view (see the popstate handler).
  function pagedButton() {
    const btn = toolButton(printer, 'Paginate for printing', () => {
      paginate();
      SP.set('paged', 1); history.pushState({}, '', `${location.pathname}?${SP}`);
    });
    btn.className = 'pagesjs-print';
    return btn;
  }

  // Buttons (top left) of the paginated view that open panels: a clone of the TOC (collapsed,
  // so readers can get it any time), and the problems, if any, to click through. Last, a
  // button to print the paginated pages.
  function addTools() {
    const tools = make('div', 'pagesjs-tools'), toc = $('#TOC:not(.chapter-toc)'), bad = problems();
    const closeAll = () => {
      $$('.pagesjs-panel', tools).forEach(p => p.hidden = true);
      unhit();
    };
    function add(text, title, content) {
      const panel = make('div', 'pagesjs-panel');
      const btn = toolButton(text, title, () => { const was = panel.hidden; closeAll(); panel.hidden = !was; });
      panel.hidden = true; panel.append(content);
      tools.append(btn, panel);
      return panel;
    }
    if (toc) {
      const nav = toc.cloneNode(true);
      nav.removeAttribute('id'); nav.className = '';  // (not the TOC of the document, nor in the margin)
      add('☰', 'Contents', nav);
    }
    if (bad.length) {
      const ul = make('ul', 'pagesjs-problems');
      bad.forEach(([el, msg]) => {
        const li = make('li');
        li.textContent = msg;
        li.onclick = () => {
          unhit();
          addCls(el, hit);
          el.scrollIntoView({block: 'center'});
        };
        ul.append(li);
      });
      add('⚠', 'Problems (may be cut off or overflow)', ul);
    }
    const print = toolButton(printer, 'Print this page', () => { closeAll(); window.print(); });
    print.className = 'pagesjs-tool-print';
    tools.append(print);
    d.body.append(tools);
    on('keydown', e => e.key === 'Escape' && closeAll());
    on('click', e => tools.contains(e.target) || closeAll());
  }

  // --- Pagination ----------------------------------------------------

  function ownText(el) {
    return [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
  }
  function canBeRoot(el) { return !['PRE', 'TABLE'].includes(el.tagName) && !ownText(el); }
  // The content root: <body data-pages-root="selector">, else <main> (or role="main"), else
  // the top-level <article>s, else <body>. If <main> only has a child (e.g., <article>), that
  // child is the root (and so on). Everything else (e.g., navigation bars) is hidden.
  function findRoots() {
    const sel = d.body.dataset.pagesRoot, x = sel ? [...$$(sel)] : [];
    if (x.length) return x;
    let main = $('main, [role="main"]');
    // (not an element that is broken by its own, or has text, which would be lost)
    while (main && nChild(main) === 1 && !ownText(main) && canBeRoot(firstEl(main)))
      main = firstEl(main);
    if (main) return [main];
    const articles = [...$$('article')].filter(el => !el.parentNode.closest('article'));
    return articles.length ? articles : [d.body];
  }
  // The frontmatter (title, author, etc.) is <header> directly in <body>, or
  // <body data-pages-front="selector">; in a book it gets a page of its own.
  function markFrontmatter() {
    $$(d.body.dataset.pagesFront || 'body > header').forEach(el => addCls(el, 'pagesjs-front'));
  }
  // remove the classes that put the TOC, footnotes, etc. in the margin on screen (not for print)
  function removeSideClasses() {
    // a wide element has a page of its own, so it is not full width
    $$('.pagesjs-wide.fullwidth').forEach(el => rmCls(el, 'fullwidth'));
    $$(':is(#TOC, .footnotes, .chapter-before, .chapter-after):is(.side-left, .side-right).side').forEach(el => {
      rmCls(el, 'side', 'side-left', 'side-right');
    });
  }
  // Replace the notes (footnotes and citations that sidenotes.js put after their references)
  // with markers, which go with the references when the text is broken.
  function detachNotes() {
    // (sidenotes.js puts them in a layer: bring each back after its reference)
    $$('.footnotes[data-note-for]').forEach(el => d.getElementById(el.dataset.noteFor)?.after(el));
    $$('.sidenotes').forEach(el => el.remove());
    $$('.footnotes').forEach(el => {
      const p = el.previousElementSibling;
      if (!p || !has(p, 'note-ref')) return;
      const m = make('span', 'pagesjs-note');
      m.hidden = true; m.dataset.noteId = el.dataset.noteId ?? '';
      notes.set(m, kids(el)); el.replaceWith(m);
    });
  }
  // the space a single-line paragraph needs
  function measureMinHeight() {
    const p = make('p'), H0 = box.scrollHeight;
    p.innerText = 'A'; box_body.append(p);
    H_min = box.scrollHeight - H0; H_line = rect(p).height; p.remove();
  }
  // dot leaders for the TOC (page numbers are added when the pages are ready)
  function addTocLeaders() {
    $$('#TOC a[href^="#"]').forEach(a => {
      const s = make('span', 'toc-text');  // the item content goes into a span
      a.append(s);
      // (the section number stays out of the span)
      for (let c; (c = s.previousSibling) && !(c.nodeType === 1 && has(c, 'section-number'));) s.prepend(c);
      a.dataset.pageNumber = '000';  // placeholder for page numbers
    });
  }
  // take the children of the roots out of the DOM (to speed up rendering single pages), and return them
  function detachContent(roots) {
    return roots.map(el => {
      // move <style>/<link> into <head>, so styles apply globally, however deep they are
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
      // (class on the page, since :has() would be re-checked on every change)
      has(el, 'pagesjs-front') && box === boxes[0] && addCls(box, 'page-front');
      yield* fill(el);
      book && nextPage();
    }
    for (const [i, el] of roots.entries()) {
      setRoot(el);
      book && (box.innerText === '' ? newPage(box) : nextPage());
      const list = els[i];
      for (let j = 0; j < list.length; j++) {
        yield* fill(list[j], i < roots.length - 1 || j < list.length - 1);
        // put the next children on the page at once if they surely fit
        const run = fitting(ctx(), list.slice(j + 1), true);
        run.length && (ctx().append(...run), overflows() ? run.forEach(e => e.remove()) : j += run.length);
      }
      flush();
      // clean up the container and self if empty
      removeBlank(el.parentNode); removeBlank(el);
    }
    finish(box);  // finish the last box
    // unwrap the blocks made for runs of inline nodes
    $$('.pagesjs-run').forEach(el => el.replaceWith(...el.childNodes));
  }
  // Run the rest of the pagination. Unless sync, do it in slices of 0.5s, so the browser can
  // paint the progress in between.
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
    // all resources must be loaded before paginating
    if (d.readyState !== 'complete') return on('load', () => paginate(sync));

    const cls = d.body.classList;
    if (cls.contains('pagesjs')) return;  // already paginated
    fire('pagesjs:before');
    const t0 = performance.now();

    markFrontmatter();
    // (the title is read while the document is visible, so innerText works)
    main_title = shortTitle($('h1.title, .pagesjs-front h1, .title, h1'));

    cls.add('pagesjs');
    $$('.pagesjs-tools, .pagesjs-print').forEach(el => el.remove());  // (addTools() makes new tools)
    d.body.append(hold);
    if (!quiet) {
      progress = make('div', 'pagesjs-progress');
      progress.textContent = 'Paginating...';
      d.body.append(progress);
    }
    d.body.insertAdjacentElement('afterbegin', newPage());
    // (the window height if the box height is not set)
    const size = () => { const h = (box.clientHeight || window.innerHeight) + tol; return [h, box_body.clientHeight || h]; };
    portrait = size();
    addCls(box, 'page-wide'); landscape = size(); rmCls(box, 'page-wide');
    [H, B] = portrait;
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
      addTools();
      hold.remove(); progress?.remove();
      finished = true;
      const over = boxes.filter(b => b.classList.contains('page-multiple')).length;
      console.info(`pages.js: ${boxes.length} pages in ${Math.round(performance.now() - t0)} ms` +
        (over ? `; ${over} overflow their page` : ''));
      fire('pagesjs:after');
    }
    // Async unless it has to be sync (beforeprint). If printing starts while it is pending
    // (e.g., headless printing right after load), finish it right away.
    pending = sync => { pending = null; unprobe(); running = run(); return advance(sync || quiet); };
    sync ? pending(true) : probe(roots, els).then(() => pending?.());
  }
  on('beforeprint', () => {
    if (pending) pending(true);
    else if (running) while (!running.next().done);  // finish the pagination in progress
    else paginate(true);
  });
  // A script that controls the browser can dispatch pagesjs:paginate and wait for
  // pagesjs:after (also dispatched if the pagination was already finished)
  on('pagesjs:paginate', () => {
    finished ? fire('pagesjs:after') : paginate();
  });
  // ?paged=1 requests the pagination; an unpaginated page gets a button to start it
  SP.get('paged') && paginate();
  // Back/Forward between the unpaginated and paged views (entries of the same document)
  // need a reload, since the content has been moved onto pages
  on('popstate', () => new URLSearchParams(location.search).get('paged') != SP.get('paged') && location.reload());
  function addToggle() {
    if (finished || has(d.body, 'pagesjs') || noToggle()) return;
    // a page can reserve a place for the button with <span class="pagesjs-toggle"></span>;
    // otherwise it floats at the top left
    const slot = $('.pagesjs-toggle'), tools = slot || make('div', 'pagesjs-tools');
    tools.append(pagedButton());
    slot || d.body.append(tools);
  }
  if (!SP.get('paged')) d.readyState === 'loading' ? d.addEventListener('DOMContentLoaded', addToggle) : addToggle();
})(document);
