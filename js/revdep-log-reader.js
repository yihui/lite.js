// the CRAN revdep check log can be extremely lengthy, so I wrote this script to
// make the log easier to read (using one tab for one package/problem)
(d => {
  const entries = d.body.innerText
    .replace(/^(.|\n)*?(?=Package:)/, '')
    .split(/(^|\n)Package: /)
    .filter(x => x.trim())
    .map(x => `<div class="tab-link">${x.replace(/(.*?)\n/, '$1 <a href="https://cran.r-project.org/web/checks/check_results_$1.html" style="text-decoration: none;" target="_blank">&#8605;</a></div><div class="tab-pane"><pre style="white-space: pre-wrap;">')}</pre></div>`)
    .join('\n');
  d.body.innerHTML = `<div class="tabset">${entries}</div>`;
  d.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xiee/utils/css/tabsets.min.css">');
  const s = d.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@xiee/utils/js/tabsets.min.js';
  d.body.insertAdjacentElement('beforeend', s);
})(document);
