(d => {
  const cls_list = 'faq-list', cls_clicked = 'faq-clicked';
  function faq(el, id) {
    // each child of the list must have at least 2 child elements (one question
    // and one answer)
    const lis = el.children;
    if (lis.length === 0) return;
    for (let li of lis) {
      if (li.childElementCount < 2) return;
    }

    let ls = el.classList;
    if (ls.length > 0 && !ls.contains(cls_list)) return;
    ls.add(cls_list);

    // a button to collapse/expand all FAQs
    const btn = d.createElement('span');
    let status = false;
    btn.className = 'faq-button';
    btn.innerText = '⊕';
    btn.onclick = function() {
      status = !status;
      this.innerText = status ? '⊖' : '⊕';
      for (const li of el.children) {
        li.classList.toggle(cls_clicked, status);
      }
    };
    el.before(btn);

    // add anchor links after questions
    for (let i = 0; i < lis.length; i++) {
      let li = lis[i];
      li.id = 'faq-' + (id ? id + '-' : '') + (i + 1);
      let p = li.firstElementChild;
      p.insertAdjacentHTML('beforeend', ` <span class="anchor"><a href="#${li.id}"></a></span>`);
      if (location.hash === '#' + li.id) {
        li.scrollIntoView();
        li.classList.add(cls_clicked);
      }
      p.onclick = function(e) {
        li.classList.toggle(cls_clicked);
      };
    }
  }

  // ignore lists in footnotes, and lists must be direct child of some
  // block-level elements such as <div>
  const ols = d.querySelectorAll(['div', 'main', 'section', 'article'].map(
    (x) => x + ':not(.footnotes) > ol'
  ).join(','));
  for (let i = 0; i < ols.length; i++) {
    let ol = ols[i];
    faq(ol, ols.length > 1 ? i + 1 : 0);
  }
})(document);
