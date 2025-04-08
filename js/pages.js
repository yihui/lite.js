// move elements into page boxes such that each box contains as many elements as
// possible and will not exceed the given size (e.g. A4 paper)
(d => {
  function  $(s, el = d) { return el?.querySelector(s); }
  function $$(s, el = d) { return el ? el.querySelectorAll(s) : []; }
  function nChild(el) { return el.childElementCount; }

  const tpl = d.createElement('div'), book = $$('h1').length > 1, boxes = [],
    fr_tag = ['TABLE', 'UL', 'OL', 'BLOCKQUOTE'],
    fr_cls = 'pagesjs-fragmented', fr_1 = 'fragment-first', fr_2 = 'fragment-last',
    tb = ['top', 'bottom'].map(i =>
      parseFloat(getComputedStyle(d.documentElement).getPropertyValue(`--paper-margin-${i}`)) || 0
    );  // top/bottom page margin
  tpl.className = 'pagesjs-page';
  tpl.innerHTML = `<div class="pagesjs-header"></div>
<div class="pagesjs-body"></div>
<div class="pagesjs-footer"></div>`;
  let box, box_body, box_cls = [], H, H_min, h_code, l_code = [];
  function newPage(el) {
    el && !$('.pagesjs-body', el) && el.insertAdjacentHTML('afterbegin', tpl.innerHTML);
    box = el || tpl.cloneNode(true); box_body = box.children[1];
    box.classList.add(...box_cls);
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
    if (h > H && !box.dataset.pagesOffset) {
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
      if (el.innerText.trim() && H - box.scrollHeight < H_min) nextPage();
      box_body.append(el);
      if (box.scrollHeight > H) {
        // temporarily remove el from DOM if it can be fragmented, otherwise
        // simply move it to the next page
        breakable(el) ? (el.tagName !== 'P' && el.remove(), fragment(el)) :
          nextPage(0, () => box_body.append(el));
      } else {
        // TODO: remove possibly duplicated citations: .citation + div > [id^="ref-"]
      }
    }
  }
  let fill_num;  // record the number of lines filled last time
  function fillCode(el, i) {
    el.innerHTML = l_code.slice(0, i).join('\n');
    fill_num = i;
  }
  function breakable(el) {
    l_code = [];
    const t = el.tagName, c = el.firstElementChild;
    if (t === 'P' || fr_tag.includes(t)) return true;
    if (t === 'DIV') {
      const cs = el.children;
      return (cs.length === 1 && fr_tag.includes(c?.tagName)) ||
        [...cs].filter(c => c.tagName === 'TABLE').length;
    }
    if (t !== 'PRE') return false;
    if (c?.tagName !== 'CODE') return false;
    // store all lines in l_code (TODO: ensure complete tags on each line)
    l_code = c.innerHTML.replace(/\n$/, '').split('\n');
    const n_code = l_code.length;
    if (n_code < 2) return false;
    h_code = c.offsetHeight / n_code;  // approx line height
    c.innerHTML = '';  // temporarily empty <code>; will use l_code
    return true;
  }
  // break elements that are relatively easy to break (such as <ul>)
  function fragment(el, container, parent) {
    let cls = el.classList;
    const tag = el.tagName, frag = cls.contains(fr_cls);
    parent ? cls.add(fr_cls) : (frag ? cls.remove(fr_1) : cls.add(fr_cls, fr_1));
    let el2 = el.cloneNode();  // shallow clone (wrapper only)
    (container || box_body).append(el2);
    if (tag === 'P') {
      // fragmentation occurs in el instead of the clone el2, so swap them
      splitP(el, el2) || ([el, el2] = [el2, el], cls = el.classList);
    }
    const prev = el2.previousElementSibling || container?.previousElementSibling;
    function fragChildren(action) {
      for (let item of [...el.children]) {
        el2.append(item);
        if (box.scrollHeight > H) {
          action(item); break;
        }
      }
    }
    if (tag === 'DIV') {
      // fragment <div>'s children (e.g., #TOC > ul)
      fragChildren(item => {
        // fragment item if it can be further fragmented, otherwise put it back
        el.prepend(item);
        fr_tag.includes(item.tagName) ? fragment(item, el2, el) : nChild(el2) && nextPage();
      });
    } else if (tag === 'PRE') {
      fragment(el.firstElementChild, el2, el);
    } else if (tag === 'CODE') {
      // split lines in <code> and try to move as many lines into el2 as possible
      const i = splitCode(el2);
      // i == 0 means not enough space to split code on current page
      i === fill_num || fillCode(el2, i); l_code.splice(0, i);
      if (i > 0) {
        l_code.join('').trim() === '' ? (l_code = []) : nextPage();
      }
    } else if (tag === 'TABLE') {
      // when el has no rows left and el2 is not empty, clear el
      const has_rows = splitTable(el, el2, prev);
      el2.innerHTML && (has_rows ? nextPage() : (el.innerHTML = ''));
    } else {
      // keep moving el's first item to el2 until page height > H
      fr_tag.slice(1).includes(tag) && fragChildren(item => {
        // move item back to el if the clone el2 is not the only element on page or has more than one child
        (prev || nChild(el2) > 1) && el.prepend(item);
        // update the start number of <ol> on next page
        tag === 'OL' && (el.start += nChild(el2));
        // don't open new page if el2 is empty (will open one below when testing el2_empty)
        nChild(el2) && nextPage();
      });
    }
    const el_empty = !l_code.length && removeBlank(el), el2_empty = removeBlank(el2);
    // add/remove the fragment-* class and exit if el has become empty
    if (el_empty) {
      const cls2 = el2.classList;
      if (parent) {
        container.classList.contains(fr_1) && cls2.remove(fr_cls);
      } else {
        cls2.contains(fr_1) ? cls2.remove(fr_cls, fr_1) : cls2.add(fr_2);
      }
      return;
    }
    // if el2 is empty, it means nothing in el fits the box; we have to start a new box
    if (el2_empty) {
      cls.remove(fr_cls, fr_1); parent || nextPage();
    }
    // keep fragmenting the remaining top-level el when el2 is not empty or not first element
    if ((!el2_empty || prev) && !parent) fragment(el);
  }
  // split table rows
  function splitTable(el, el2, prev) {
    const tb = el.tBodies[0], tb2 = tb.cloneNode(), rows = [...tb.rows], th = el.tHead;
    el2.append(tb2);
    // copy table header and footer
    [th, el.tFoot].forEach(t => t && el2.append(t.cloneNode(true)));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      tb2.append(row);
      if (box.offsetHeight > H) {
        if (i > 0 || prev) tb.prepend(row);
        // clear the clone if current page can't fit even one row
        if (i === 0 && prev) el2.innerHTML = '';
        break;
      }
    }
    return tb.rows.length;
  }
  // figure out how many lines can fit the box via bisection
  function splitCode(el) {
    let i = i1 = 1, n = l_code.length, i2 = n + 2;
    const sols = [];  // solutions tried
    while (i2 > i1 + 1) {
      fillCode(el, i);
      const delta = H - box.offsetHeight;
      if (delta === 0) return i;
      if (delta < 0) {
        if (i <= 1) return 0;
        i2 = i;
      } else {
        if (i >= n) return i;
        i1 = i;
      }
      sols.push(i);
      // estimate the number of (more or less) lines needed
      const i3 = i + Math.round(delta / h_code);
      // if a solution has been tried, shorten step and (in/de)crement by 1
      i = sols.includes(i3) ? i + (delta > 0 ? 1 : -1) : i3;
      (delta > 0 && i >= n) && (i2 = n + 2, i = n);  // solution may be n
    }
    return i1;
  }
  // split <p> by testing if a range fits the current box
  function splitP(el, el2) {
    if (!el.parentNode) {
      box_body.append(el);  // move el into DOM to measure chars if removed
      // see if we don't need to split it now
      if (box.scrollHeight <= H) return;
    }
    const r = d.createRange(), ends = [{node: el, i: 0}];
    // find the break position of each line (exclude block elements like footnotes)
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
        if (['DIV', 'MJX-CONTAINER'].includes(t) || (t === 'SPAN' && $('.katex', node))) {
          node = walker.nextSibling();  // skip DIVs (footnotes) and math
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
    if (ends.length < 2) {
      el.remove(); return 1;  // single-line paragraph
    }
    el2.remove();
    // remove lines from the end of paragraph
    for (let i = ends.length - 1; i >= 0; i--) {
      const loc = ends[i];
      loc.i < 0 ? r.setStartBefore(loc.node) : r.setStart(loc.node, loc.i);
      r.setEnd(el, el.childNodes.length);
      el2.prepend(r.extractContents());
      removeBlank(el.lastChild);  // strip trailing empty tags left by range extraction
      if (i > 0 && box.scrollHeight <= H) {
        nextPage(); break;
      }
    }
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

  function paginate() {
    // we need to wait for all resources to be fully loaded before paginating
    if (d.readyState !== 'complete') return addEventListener('load', paginate);

    const cls = d.body.classList;
    if (cls.contains('pagesjs')) return;  // already paginated
    dispatchEvent(new Event('pagesjs:before'));

    cls.add('pagesjs');
    d.body.insertAdjacentElement('afterbegin', newPage());
    H = box.clientHeight || window.innerHeight;  // use window height if box height not specified

    // remove possible classes on TOC/footnotes that we don't need for printing
    $$(':is(#TOC, .footnotes, .chapter-before, .chapter-after):is(.side-left, .side-right).side').forEach(el => {
      el.classList.remove('side', 'side-left', 'side-right');
    });

    cls.add('pagesjs-filling');

    // test how much space a single-line paragraph needs
    const p = d.createElement('p'), H0 = box.scrollHeight;
    p.innerText = 'A'; box_body.append(p);
    H_min = box.scrollHeight - H0; p.remove();

    // add dot leaders to TOC
    $$('#TOC a[href^="#"]').forEach(a => {
      const s = d.createElement('span');  // move TOC item content into a span
      s.className = 'toc-text'; a.append(s);
      let c; while (c = s.previousSibling) {
        // exclude section number spans
        if (c.classList?.contains('section-number')) break; s.prepend(c);
      }
      a.dataset.pageNumber = '000';  // placeholder for page numbers
    });

    // temporarily move all elements out of DOM (to speed up rendering single pages)
    const els = [];
    $$('.body').forEach(el => {
      // move <style>/<link> into <head> so styles can be applied globally
      const ch = [...el.children]
        .filter(el => !['STYLE', 'LINK'].includes(el.tagName) || d.body.prepend(el));
      els.push(ch); ch.forEach(el => el.remove());
    });
    // iteratively add elements to pages
    $$('.frontmatter, .abstract, #TOC:not(.chapter-toc)').forEach(el => {
      (fill(el), book && nextPage());
    });
    $$('.body').forEach((el, i) => {
      // preserve book chapter classes if exist
      box_cls = ['chapter', 'appendix'].filter(i => el.classList.contains(i));
      book && (box.innerText === '' ? newPage(box) : nextPage());
      els[i].forEach(fill);
      // clean up container and self if empty
      removeBlank(el.parentNode); removeBlank(el);
    });
    finish(box);  // finish the last box
    cls.remove('pagesjs-filling');

    // add page number, title, etc. to data-* attributes of page elements
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

    // unhide all pages
    d.body.prepend(...boxes);

    // add page numbers to TOC with data-* attributes
    $$('#TOC a[href^="#"]').forEach(a => {
      const id = CSS.escape(a.getAttribute('href').replace(/^#/, '')),
        p = $(`.pagesjs-page:has(#${id}) .pagesjs-header`);
      a.dataset.pageNumber = p ? p.dataset.pageNumber : '';
    });
    dispatchEvent(new Event('pagesjs:after'));
  }
  addEventListener('beforeprint', paginate);
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
