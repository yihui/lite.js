// <code>$math$</code> to \(math\), and <code>$$math$$</code> to $$math$$:
// https://yihui.org/en/2018/07/latex-math-markdown/
document.querySelectorAll(':not(pre) > code:not(.nolatex)').forEach(code => {
  // skip <pre> tags and <code> that has children or the nolatex class
  if (code.childElementCount > 0) return;
  let text = code.textContent;
  if (/^\$[^$]/.test(text) && /[^$]\$$/.test(text)) {
    text = text.replace(/^\$/, '\\(').replace(/\$$/, '\\)');
    code.textContent = text;
  }
  if (/^\\\((.|\s)+\\\)$/.test(text) || /^\\\[(.|\s)+\\\]$/.test(text) ||
      /^\$(.|\s)+\$$/.test(text) ||
      /^\\begin\{([^}]+)\}(.|\s)+\\end\{[^}]+\}$/.test(text)) {
    code.outerHTML = code.innerHTML;  // remove <code></code>
  }
});
