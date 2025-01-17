// move elements into page boxes such that each box contains as many elements as
// possible and will not exceed the given size (e.g. A4 paper)
(d => {
  function  $(s, el = d) { return el?.querySelector(s); }
  function $$(s, el = d) { return el ? el.querySelectorAll(s) : []; }
  function nChild(el) { return el.childElementCount; }

  const tpl = d.createElement('div'), book = $$('h1').length > 1, boxes = [],
    cd_cls = String.fromCharCode(...Array(10).fill(0).map(x => 97 + Math.random() * 26)),
    fr_cls = 'pagesjs-fragmented', tb = ['top', 'bottom'].map(i => {
      const v = getComputedStyle(d.documentElement).getPropertyValue(`--paper-margin-${i}`);
      return +v.replace('px', '') || 0;
    });  // top/bottom page margin
  tpl.className = 'pagesjs-page';
  tpl.innerHTML = `<div class="pagesjs-header"></div>
<div class="pagesjs-body"></div>
<div class="pagesjs-footer"></div>`;
  let box, box_body, H, box_cls = [];
  function newPage(el) {
    el && !$('.pagesjs-body', el) && el.insertAdjacentHTML('afterbegin', tpl.innerHTML);
    box = el || tpl.cloneNode(true); box_body = box.children[1];
    box_cls.length && box.classList.add(...box_cls);
    boxes.push(box);  // store new pages in boxes
    return box;
  }
  function addOffset(box) {
    const h = box.scrollHeight;
    if (h > H && !box.dataset.pagesOffset) {
      const n = calcPages(box, h);
      if (n > 1) box.dataset.pagesOffset = n;
    }
    box.classList.add('pagesjs-done');
  }
  function removeBlank(el) {
    if (!el) return false;
    const v = el.innerText.trim() === '';
    v && el.remove();
    return v;
  }
  function fill(el) {
    const n1 = boxes.length;
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
      // create a new box when too much content (exceeding original height)
      if (box.scrollHeight > H) {
        const [box2, box_body2] = [box, box_body];  // store old box
        box2.after(newPage());
        // if there's more than one child in the box, move the last child to next box
        nChild(box_body2) > 1 && box_body.append(box_body2.lastChild);
      }
      box_body.append(el);
      fragment(el);
    }
    const n2 = boxes.length;
    // mark all boxes (except the last one) with class 'pagesjs-done'
    n2 > n1 && n2 > 1 && boxes.splice(0, n2 - 1).forEach(addOffset);
  }
  // break elements that are relatively easy to break (such as <ul>)
  function fragment(el, container, parent, page) {
    const tag = el.tagName, is_code = tag === 'CODE';
    // if <code>, keep fragmenting; otherwise exit when box fits
    if (!(is_code && container) && box.scrollHeight <= H) return;
    el.classList.add(fr_cls);
    const box_cur = page || box, el2 = el.cloneNode();  // shallow clone (wrapper only)
    // add the clone to current box, and move original el to next box
    container ? container.append(el2) : (
      box_body.append(el2), box_cur.after(newPage()), box_body.append(el)
    );
    // fragment <pre>'s <code> and <div>'s single child (e.g., #TOC > ul)
    if (tag === 'PRE') {
      const code = el.firstElementChild;
      if (code?.tagName === 'CODE') {
        const lines = code.innerHTML.replace(/\n$/, '').split('\n');
        if (lines.length > 1) {
          // add <i> to each line to measure the line heights
          code.innerHTML = lines.concat('').map(x => `<i class="${cd_cls}"></i>${x}`).join('\n');
          $$(`i.${cd_cls}`, code).forEach(i => i.dataset.top = i.offsetTop);
          fragment(code, el2, el, box_cur);
        }
      }
    } else if (tag === 'DIV' && nChild(el) === 1) {
      fragment(el.firstElementChild, el2, el, box_cur);
    }
    const prev = el2.previousElementSibling;
    // keep moving el's first item to el2 until page height > H
    if (['UL', 'OL', 'BLOCKQUOTE'].includes(tag) && nChild(el) > 1) while (true) {
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
    if (is_code) {
      const code = el.innerHTML.split('\n'), delta = H - box_cur.scrollHeight,
        tops = [...$$(`i.${cd_cls}`, el)].map(i => i.dataset.top);
      //if (el.innerHTML.match('Humpty')) debugger;
      let i = 0;
      function fillCode() {
        el2.innerHTML = code.slice(0, i).join('\n');
      }
      if (delta > 0) {
        for (i = 0; i < tops.length; i++) {
          if (tops[i + 1] - tops[0] > delta) break;
        }
        if (i > 0) fillCode();
      }
      // remove/add lines from el2 one by one if box is too long/short
      const dir = box_cur.scrollHeight > H ? -1 : 1;
      while (i > 0 && i <= code.length) {
        i += dir; fillCode();
        if (box_cur.scrollHeight > H) {
          i += -1; fillCode(); break;
        }
      }
      if (i > 0) {
        el.innerHTML = code.slice(i).join('\n');
        if (removeBlank(parent)) return;  // exit if <pre> is empty
      }
    }
    const el2_empty = removeBlank(el2);
    // if the clone is empty, remove it, otherwise keep fragmenting the remaining el
    el2_empty && el.classList.remove(fr_cls);
    if (!el2_empty || is_code || prev) fragment(container ? parent : el);
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

    // iteratively add elements to pages
    [$('.frontmatter'), $('#TOC'), $('.abstract')].forEach(el => {
      el && (fill(el), book && box.after(newPage()));
    });
    $$('.body').forEach(el => {
      // preserve book chapter classes if exist
      box_cls = ['chapter', 'appendix'].filter(i => el.classList.contains(i));
      book && (box.innerText === '' ? newPage(box) : box.after(newPage()));
      [...el.children].map(fill);
      // clean up container and self if empty
      removeBlank(el.parentNode); removeBlank(el);
    });
    boxes.forEach(addOffset);  // mark the rest of pages as done
    $$(`pre > code i.${cd_cls}`).forEach(el => el.remove());
    cls.remove('pagesjs-filling');

    // add page number, title, etc. to data-* attributes of page elements
    let page_title, i = 0;
    $$('.pagesjs-page').forEach(box => {
      if (removeBlank(box)) return;  // remove empty pages
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

    // add page numbers to TOC with data-* attributes
    $$('#TOC a[href^="#"]').forEach(a => {
      const id = CSS.escape(a.getAttribute('href').replace(/^#/, '')),
        p = $(`.pagesjs-page:has(#${id}) .pagesjs-header`);
      a.dataset.pageNumber = p ? p.dataset.pageNumber : '';
    });

    // unhide all pages
    $$('.pagesjs-done').forEach(box => box.classList.remove('pagesjs-done'));
  }
  addEventListener('beforeprint', paginate);
  // persistent pagination upon page reload (press p again to cancel it)
  let pg = sessionStorage.getItem('pagesjs');
  pg && paginate();
  addEventListener('keypress', e => e.key === 'p' && (
    paginate(), pg = pg ? '' : '1', sessionStorage.setItem('pagesjs', pg), pg || location.reload()
  ));
})(document);
