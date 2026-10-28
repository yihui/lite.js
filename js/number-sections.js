// add section numbers to headings
(d => {
  // find the body of the article
  let b;
  ['.article', 'article', 'body'].forEach(s => {
    if (!b) b = d.querySelector(s);
  });
  const hs = b.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (hs.length === 0) return;
  // normalize Pandoc's .header-section-number class to .section-number
  b.querySelectorAll('span.header-section-number').forEach(el => {
    el.classList.add('section-number');
  });
  // already numbered?
  if (b.querySelector('span.section-number')) {
    // avoid Pandoc's numbering from 0 (e.g., 0.1, 0.1.1, 0.2, ...) when top-level heading is not h1
    b.querySelectorAll('span.section-number').forEach(s => {
      s.innerText = s.innerText.replace(/^(0\.)+/, '');
    });
    return;
  }
  let t0 = 0, t1, dict = [0, 0, 0, 0, 0, 0];
  // generate section numbers x.x.x
  function number_section(i) {
    dict[i]++;
    const n = dict.join('.').replace(/^(0\.)+|(\.0)+$/g, '').replace(/^([0-9]+)$/, '$1.');
    return `<span class="section-number">${n}</span> `;
  };
  hs.forEach(h => {
    // header level: <hN> -> N
    t1 = parseInt(h.tagName.replace(/^h/i, ''));
    // when moving to a higher-level heading, reset lower-level counters to 0
    if (t1 < t0) {
      for (let j = t1; j < dict.length; j++) {
        dict[j] = 0;
      }
    }
    h.insertAdjacentHTML('afterbegin', number_section(t1 - 1));
    t0 = t1;
  });
})(document);
