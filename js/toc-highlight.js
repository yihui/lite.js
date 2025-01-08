// highlight a TOC item when scrolling to a corresponding section heading
(d => {
  // assume TOC has these possible IDs (we can also consider other selectors)
  const s = 'a[href^="#"]', toc = d.querySelector(`:is(#TableOfContents, #TOC):has(${s})`);
  if (!toc) return;
  const links = toc.querySelectorAll(s), dict = {};
  links.forEach(a => dict[a.getAttribute('href').replace('#', '')] = a);
  const ids = Object.keys(dict);

  // status: 1 if an id is currently in the viewport, otherwise 0
  const status = Array(ids.length).fill(0);
  // create a new Intersection Observer instance
  const observer = new IntersectionObserver(els => els.forEach(el => {
    const id = el.target.id, i = ids.indexOf(id);
    if (i < 0) return;
    status[i] = +el.isIntersecting;
    let id_active;
    const n = status.indexOf(1);  // the first id in view
    if (n > -1) {
      id_active = ids[n];
    } else {
      if (el.target.getBoundingClientRect().top < 0) return;
      // if a heading exits from bottom and no heading is in view, activate previous ID
      const k = ids.indexOf(id) - 1;
      if (k >= 0) id_active = ids[k];
    }
    for (const i in dict) {
      dict[i].classList.toggle('active', i === id_active);
    }
  }));

  // observe all section headings associated with TOC links
  d.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
    h.nodeType === 1 && dict.hasOwnProperty(h.id) && observer.observe(h);
  });
})(document);
