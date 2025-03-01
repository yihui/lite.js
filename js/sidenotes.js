// move footnotes (ids start with fn) and citations (ids start with ref-) to sidenotes
(d => {
  d.querySelectorAll('.footnotes > ol > li[id^="fn"], #refs > [id^="ref-"]').forEach(el => {
    // find <a> that points to note id in body
    const h = `a[href="#${el.id}"]`;
    d.querySelectorAll(`${h} > sup, sup > ${h}, .citation > ${h}, ${h}.citation`).forEach(a => {
      const a2 = a.parentNode;
      (a.tagName === 'A' ? a : a2).removeAttribute('href');
      const s = d.createElement('div');  // insert a side div next to a2 in body
      s.className = 'side side-right footnotes';
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
      // insert note after the parent of <a> unless it contains class 'citation'
      const a3 = a.classList.contains('citation') ? a : a2;
      a3.after(s);
      a3.classList.add('note-ref');
      el.remove();
    });
  });
  // remove the footnote/citation section if it's empty now
  d.querySelectorAll('.footnotes, #refs').forEach(el => {
    el.innerText.trim() || el.remove();
  });
  // also add side classes to TOC
  d.getElementById('TOC')?.classList.add('side', 'side-left');
  // if a sidenote collapses with any fullwidth element, remove the side class
  const sides = d.querySelectorAll('.side.side-right, .side.side-left'), fulls = [];
  d.querySelectorAll('.fullwidth').forEach(el => {
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
