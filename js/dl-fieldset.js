// convert <dl><dt>Title</dt><dd>Content</dd></dl>
// to <fieldset><legend>Title</legend>Content</fieldset>;
// see documentation at: https://yihui.org/en/2023/11/dl-fieldset/
document.querySelectorAll('dl').forEach(dl => {
  if (dl.childElementCount !== 2) return;
  const dt = dl.children[0], dd = dl.children[1];
  if (dt.tagName !== 'DT' || dd.tagName !== 'DD') return;
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  while (dt.firstChild) {
    legend.appendChild(dt.firstChild);
  }
  while (dd.firstChild) {
    fieldset.appendChild(dd.firstChild);
  }
  fieldset.insertBefore(legend, fieldset.firstChild);
  dl.parentNode.replaceChild(fieldset, dl);
});
