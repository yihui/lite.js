// build TOC using headings
(d => {
  // find the body of the article
  let b;
  ['.article', 'article', '.main', 'body'].forEach(s => {
    if (!b) b = d.querySelector(s);
  });
  const hs = b.querySelectorAll([1, 2, 3, 4, 5, 6].map(i => `:scope > h${i}`).join(','));
  if (hs.length === 0) return;

  let toc = d.getElementById('TOC') || d.getElementById('TableOfContents');
  if (toc) {
    toc.innerHTML = ''; // empty and rebuild TOC if it has been generated (e.g., by Pandoc)
  } else {
    toc = d.createElement('div');
    toc.id = 'TOC';
  }

  let li, ul;
  let p = toc;  // the current parent into which we insert child TOC items
  let t1, t0 = 0;  // pretend there is a top-level <h0> for the sake of convenience
  hs.forEach(h => {
    t1 = parseInt(h.tagName.replace(/^h/i, ''));
    li = d.createElement('li');
    if (t1 > t0) {
      // lower-level header: create a new ul
      ul = d.createElement('ul');
      ul.appendChild(li);
      p.appendChild(ul);
    } else if (t1 < t0) {
      // higher-level header: go back to upper-level ul
      for (let j = 0; j < t0 - t1; j++) {
        p = p.parentNode.parentNode;
      }
    }
    if (t1 <= t0) p.parentNode.appendChild(li);
    p = li;
    const a = d.createElement('a');
    a.innerHTML = h.innerHTML;
    if (h.id) {
      a.href = '#' + h.id;
    } else {
      // Pandoc's section divs
      const s = h.parentNode;
      if (s.classList.contains('section') && s.id) a.href = '#' + s.id;
    }
    p.appendChild(a);
    t0 = t1;
  });
  if (!toc.parentNode) {
    // if there is <header> in the article body, insert TOC after it
    const header = b.querySelector('header');
    header ? header.after(toc) : b.insertBefore(toc, b.firstChild);
  }

  // check if headings are numbered
  toc.querySelector('span.section-number') && toc.firstElementChild.classList.add('numbered');
})(document);
