// move footnotes (ids start with fn) and citations (ids start with ref-) to sidenotes
(d => {
  // A note goes to a zero-height layer after the child of the article (or main, .main) that has its
  // reference.
  // The layer has the content edges of the article, which positions the note horizontally;
  // place() puts it at the height of its reference. So a note is aligned wherever its reference
  // is (a table cell, a blockquote, a heading, ...), and it inherits the style of the article,
  // not of the parents of the reference. Without room for the margin (narrow screens), the notes
  // are blocks in the layers, right after the content that refers to them.
  const arts = new Set(), seen = new Set();
  let count = 0;
  const layerOf = el => {
    const art = el.closest('article, main, .main') || d.body;
    while (el.parentElement !== art) el = el.parentElement;
    if (!el.nextElementSibling?.matches('.sidenotes')) {
      el.insertAdjacentHTML('afterend', '<div class="sidenotes"></div>');
    }
    arts.add(art);
    return el.nextElementSibling;
  };
  d.querySelectorAll('.footnotes > ol > li[id^="fn"], #refs > [id^="ref-"]').forEach(el => {
    // find <a> that points to note id in body
    const h = `a[href="#${el.id}"]`;
    d.querySelectorAll(`${h} > sup, sup > ${h}, .citation > ${h}, ${h}.citation`).forEach(a => {
      const a2 = a.parentNode;
      (a.tagName === 'A' ? a : a2).removeAttribute('href');
      const s = d.createElement('div');
      s.className = 'side side-note footnotes';
      if (/^fn/.test(el.id)) {
        s.innerHTML = el.innerHTML;
        // add footnote number
        s.firstElementChild.insertAdjacentHTML('afterbegin', `<span class="bg-number">${a.innerText}</span> `);
        s.querySelector('a[href^="#fnref"]')?.remove();  // remove backreference
      } else {
        s.innerHTML = el.outerHTML;
      }
      while (s.lastChild?.nodeName === '#text' && !s.lastChild.textContent.trim()) {
        s.lastChild.remove();
      }
      // remove fullwidth classes if present (because they cannot be used in the margin)
      s.querySelectorAll('.fullwidth').forEach(el => el.classList.remove('fullwidth'));
      // the reference is the parent of <a> unless it contains class 'citation'
      const a3 = a.classList.contains('citation') ? a : a2;
      a3.id ||= 'sn-' + ++count;
      s.dataset.noteFor = a3.id;
      // a note that is cited again: show only the first copy when notes are blocks in the text
      if (seen.has(el.id)) s.dataset.dup = ''; else seen.add(el.id);
      layerOf(a3).append(s);
      a3.classList.add('note-ref');
      el.remove();
    });
  });
  // remove the footnote/citation section if it's empty now
  d.querySelectorAll('.footnotes, #refs').forEach(el => {
    el.innerText.trim() || el.remove();
  });
  // also add side classes to TOC, unless it has a `side` class already (e.g., from `toc: class`)
  const toc = d.getElementById('TOC');
  toc?.classList.contains('side') || toc?.classList.add('side', 'side-left');
  // put each note at the height of its reference, or below the previous note or the side element
  // (e.g., `::: side`) in the margin if they overlap
  const place = () => {
    const bars = [...d.querySelectorAll('.side-right:not(.side-note)')].map(e => e.getBoundingClientRect())
      .filter(r => r.height).sort((p, q) => p.top - q.top);
    const rows = [...arts].map(art => [...art.querySelectorAll(':scope > .sidenotes > .side-note')].map(s => {
      const a = d.getElementById(s.dataset.noteFor);
      return a && [s, a.getBoundingClientRect().top, s.offsetHeight, s.parentNode.getBoundingClientRect().top];
    }).filter(Boolean).sort((p, q) => p[1] - q[1]));
    rows.forEach(row => {
      let end = -Infinity;
      row.forEach(([s, top, h, y]) => {
        top = Math.max(top, end);
        bars.forEach(r => { if (top < r.bottom && top + h > r.top) top = r.bottom + 16; });
        s.style.top = (top - y) + 'px';
        end = top + h + 16;
      });
    });
  };
  place();
  if (arts.size) {
    const ro = new ResizeObserver(place);
    arts.forEach(art => ro.observe(art));
    d.fonts?.ready.then(place);
  }
  // if a sidenote collapses with an auto-added fullwidth element, remove its fullwidth class
  // (a user-specified .fullwidth is kept)
  const sides = d.querySelectorAll('.side'), fulls = [];
  d.querySelectorAll('[data-auto-fullwidth]').forEach(el => {
    fulls.push([el, el.getBoundingClientRect()]);
  });
  // add a class to document body if it has sidenotes
  sides.length && d.body.classList.add('has-sidenotes');
  sides.forEach(s => {
    const r1 = s.getBoundingClientRect();
    for (let f of fulls) {
      const r2 = f[1];
      if (!(r1.right < r2.left || r1.left > r2.right || r1.bottom < r2.top || r1.top > r2.bottom)) {
        f[0].classList.remove('fullwidth');
      }
    }
  });
})(document);
