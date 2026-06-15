// convert <dl><dt>Title</dt><dd>Content</dd></dl>
// to <fieldset><legend>Title</legend>Content</fieldset>;
// see documentation at: https://yihui.org/en/2023/11/dl-fieldset/
document.querySelectorAll('dl').forEach(dl => {
  if (dl.childElementCount !== 2) return;
  const [dt, dd] = dl.children;
  if (dt.tagName !== 'DT' || dd.tagName !== 'DD') return;
  const fieldset = document.createElement('fieldset'),
    legend = document.createElement('legend');
  legend.append(...dt.childNodes);
  fieldset.append(legend, ...dd.childNodes);
  dl.after(fieldset); dl.remove();
});
