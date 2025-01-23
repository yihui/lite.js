// move elements into page boxes such that each box contains as many elements as
// possible and will not exceed the given size (e.g. A4 paper)
(d => {
  function  $(s, el = d) { return el?.querySelector(s); }
  function $$(s, el = d) { return el ? el.querySelectorAll(s) : []; }
  function nChild(el) { return el.childElementCount; }

  const tpl = d.createElement('div'), book = $$('h1').length > 1, boxes = [],
    fr_tag = ['UL', 'OL', 'BLOCKQUOTE'],
    fr_cls = 'pagesjs-fragmented', fr_1 = 'fragment-first', fr_2 = 'fragment-last',
    tb = ['top', 'bottom'].map(i => {
      const v = getComputedStyle(d.documentElement).getPropertyValue(`--paper-margin-${i}`);
      return +v.replace('px', '') || 0;
    });  // top/bottom page margin
  tpl.className = 'pagesjs-page';
  tpl.innerHTML = `<div class="pagesjs-header"></div>
<div class="pagesjs-body"></div>
<div class="pagesjs-footer"></div>`;
  let box, box_body, box_cls = [], box_n = 0, H, h_code, l_code = [];
  function newPage(el) {
    const n = boxes.length;
    // finish previous n - 1 boxes
    if (n - box_n > 1) {
      boxes.slice(box_n, n - 1).forEach(finish);
      box_n = n - 1;
    }
    el && !$('.pagesjs-body', el) && el.insertAdjacentHTML('afterbegin', tpl.innerHTML);
    box = el || tpl.cloneNode(true); box_body = box.children[1];
    box_cls.length && box.classList.add(...box_cls);
    boxes.includes(box) || boxes.push(box);  // store new pages in boxes
    return box;
  }
  // place an element to the next page
  function nextPage(el, cur = box) {
    cur.after(newPage()); box_body.append(el);
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
  function removeBlank(el, html = false) {
    if (!el) return false;
    const v = (html ? el.innerHTML : el.innerText).trim() === '';
    v && el.remove();
    return v;
  }
  function fill(el) {
    // if the element is already a page, just use it as the box
    if (el.classList.contains('pagesjs-page')) {
      box.after(newPage(el));
      // if current element is not empty, fill its content into the box
      if (nChild(el) > 3) {
        box_body.append(...[...el.children].slice(3));
        // TODO: should we fragment this page if it's too long?
        box.after(newPage());  // create a new empty page
      }
    } else {
      box_body.append(el);
      if (box.scrollHeight <= H) return;
      if (!breakable(el)) return nextPage(el);
      const cls = el.classList, h0 = el.innerHTML, n0 = boxes.length;
      fragment(el);
      // remove empty pages
      if (el.tagName === 'PRE') for (let i = boxes.length - 1; i >= n0; i--) {
        removeBlank(boxes[i]) && boxes.splice(i, 1);
      }
      // if el can be fragmented, add class *-last, otherwise remove class (e.g.,
      // current box can't even hold el's first child so move whole el to new box)
      (cls.contains(fr_cls) && el.innerHTML !== h0) ? cls.add(fr_2) :
        [el].concat(...$$(`.${fr_cls}`, el)).forEach(el => el.classList.remove(fr_cls, fr_1));
      l_code = [];  // clean up code lines
    }
  }
  function fillCode(el, i1, i2) {
    el.innerHTML = l_code.slice(i1, i2).join('\n');
  }
  function breakable(el) {
    const t = el.tagName, c = el.firstElementChild;
    if (fr_tag.includes(t) ||
      (t === 'DIV' && nChild(el) === 1 && fr_tag.includes(c?.tagName))) return true;
    if (t !== 'PRE') return false;
    if (c?.tagName !== 'CODE') return false;
    // store all lines in l_code
    l_code = c.innerHTML.replace(/\n$/, '').split('\n');
    const n_code = l_code.length;
    if (n_code < 2) return false;
    h_code = c.offsetHeight / n_code;  // approx line height
    c.innerHTML = '';  // temporarily empty <code>; will use l_code
    return true;
  }
  // break elements that are relatively easy to break (such as <ul>)
  function fragment(el, container, parent, page) {
    const tag = el.tagName, cls = el.classList, frag = cls.contains(fr_cls);
    parent || frag && cls.remove(fr_1);
    // if <code>, keep fragmenting; otherwise exit when box fits
    if (!l_code.length && box.scrollHeight <= H) return;
    parent ? cls.add(fr_cls) : (frag || cls.add(fr_cls, fr_1));
    const box_cur = page || box, el2 = el.cloneNode();  // shallow clone (wrapper only)
    // add the clone to current box, and move original el to next box
    container ? container.append(el2) : (box_body.append(el2), nextPage(el, box_cur));
    // fragment <pre>'s <code> and <div>'s single child (e.g., #TOC > ul)
    if (tag === 'DIV') {
      fragment(el.firstElementChild, el2, el, box_cur);
    } else if (tag === 'PRE') {
      const code = el.firstElementChild;
      if (fragment(code, el2, el, box_cur)) {
        // stop when the rest of lines are empty
        if (l_code.join('').trim() === '') {
          el2.before(el); el.innerHTML = el2.innerHTML; el2.remove();
          boxes.pop().remove(); newPage(boxes[boxes.length - 1]); l_code = [];
        }
      } else {
        // the current page can't hold the block; fragment it on next page
        el2.remove(); [code, el].forEach(el => el.classList.remove(fr_cls, fr_1));
      }
      fragment(el);
      return removeBlank(el2);
    }
    const prev = el2.previousElementSibling;
    // keep moving el's first item to el2 until page height > H
    if (fr_tag.includes(tag)) while (true) {
      const item = el.firstChild;
      if (!item) break;
      el2.append(item);
      // usually there's no need to re-calculate size if item is not element (e.g., white space)
      if (item.nodeName.startsWith('#')) continue;
      if (box_cur.scrollHeight > H) {
        // move item back to el if the clone el2 is not the only element on page or has more than one child
        (prev || nChild(el2) > 1) && el.insertBefore(item, el.firstChild);
        // update the start number of <ol> on next page
        tag === 'OL' && (el.start += nChild(el2));
        break;
      }
    }
    // split lines in <code> and try to move as many lines into el2 as possible
    if (tag === 'CODE') {
      const i = splitCode(el2, box_cur);
      // i == 0 means not enough space to split code on current page
      if (i > 0) {
        fillCode(el2, 0, i); l_code.splice(0, i);
      }
      return i > 0;
    }
    const el2_empty = removeBlank(el2, true);
    el2_empty && cls.remove(fr_cls, fr_1);
    // if the clone is empty, remove it, otherwise keep fragmenting the remaining el
    if (!el2_empty || prev) fragment(container ? parent : el);
  }
  // figure out how many lines can fit the box via bisection
  function splitCode(el, box) {
    let i = i1 = 1, n = l_code.length, i2 = n + 2;
    const sols = [];  // solutions tried
    while (i2 > i1 + 1) {
      fillCode(el, 0, i);
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
    function newPages() { return Math.ceil((h + (n - 1) * m)/H); }
    let n2 = newPages();
    while (n2 > n) {
      n = n2; n2 = newPages();
    }
    return n;
  }

  function paginate() {
    // we need to wait for all resources to be fully loaded before paginating
    if (d.readyState !== 'complete') return setTimeout(paginate, 10);

    const cls = d.body.classList;
    if (cls.contains('pagesjs')) return;  // already paginated

    cls.add('pagesjs');
    d.body.insertAdjacentElement('afterbegin', newPage());
    H = box.clientHeight || window.innerHeight;  // use window height if box height not specified

    // remove possible classes on TOC/footnotes that we don't need for printing
    $$(':is(#TOC, .footnotes, .chapter-before, .chapter-after):is(.side-left, .side-right).side').forEach(el => {
      el.classList.remove('side', 'side-left', 'side-right');
    });

    cls.add('pagesjs-filling');

    // add dot leaders to TOC
    $$('#TOC a[href^="#"]').forEach(a => {
      const s = d.createElement('span'),  // move TOC item content into a span
        n = a.firstElementChild;  // if first child is section number, exclude it
      n?.classList.contains('section-number') ? n.after(s) : a.insertAdjacentElement('afterbegin', s);
      while (s.nextSibling) s.append(s.nextSibling);
      a.insertAdjacentHTML('beforeend', '<span class="dot-leader"></span>');
      a.dataset.pageNumber = '000';  // placeholder for page numbers
    });

    const els = [];
    $$('.body').forEach(el => {
      const ch = [...el.children];
      els.push(ch); ch.forEach(el => el.remove());
    });
    // iteratively add elements to pages
    $$('.frontmatter, .abstract, #TOC:not(.chapter-toc)').forEach(el => {
      (fill(el), book && box.after(newPage()));
    });
    $$('.body').forEach((el, i) => {
      // preserve book chapter classes if exist
      box_cls = ['chapter', 'appendix'].filter(i => el.classList.contains(i));
      book && (box.innerText === '' ? newPage(box) : box.after(newPage()));
      els[i].forEach(fill);
      // clean up container and self if empty
      removeBlank(el.parentNode); removeBlank(el);
    });
    boxes.slice(box_n).forEach(finish);  // finish the rest of pages
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
  }
  addEventListener('beforeprint', paginate);
  // persistent pagination upon page reload (press p again to cancel it)
  let pg = sessionStorage.getItem('pagesjs');
  pg && paginate();
  addEventListener('keypress', e => e.key === 'p' && (
    paginate(), pg = pg ? '' : '1', sessionStorage.setItem('pagesjs', pg), pg || location.reload()
  ));
})(document);
