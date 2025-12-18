// find <h[1-6] class="appendix"> and either add the class 'appendix' to
// wrappers of appendix elements or create a new <div> next to the parent
// element to hold all appendix elements
(d => {
  const h = d.querySelector([1, 2, 3, 4, 5, 6].map(i => `h${i}.appendix`).join(','));
  if (!h) return;
  h.classList.remove('appendix');
  // test if two elements have same tag and class
  function sameClass(e1, e2) {
    return e1 && e2 && e1.tagName === e2.tagName && e1.className === e2.className;
  }
  // if h is in a wrapper whose prev/next sibling has the same class, simply add class to wrappers
  const p1 = h.parentNode, p0 = p1.previousElementSibling;
  let wrapper = sameClass(p1, p0), p2 = p1;
  while (p1) {
    p2 = p2.nextElementSibling;
    if (!sameClass(p1, p2)) break;
    p2.classList.add('appendix');
    wrapper = true;
  }
  if (wrapper) {
    p1.classList.add('appendix');
    return;
  }
  // create a new div instead
  const a = d.createElement('div');
  a.className = 'appendix';
  a.append(h.cloneNode(true));
  while(h.nextSibling) {
    a.append(h.nextSibling);
  }
  h.parentNode.tagName === 'BODY' ? d.body.append(a) : h.parentNode.after(a);
  h.remove();
})(document);
