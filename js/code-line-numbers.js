// add line numbers to code blocks for <code class="line-numbers" [data-start=*]>
(() => {
  function addNum(el) {
    const s = '<span data-line-number=""></span>', sel = 'span[data-line-number]';
    if (!el.classList.contains('line-numbers') || el.parentNode.tagName !== 'PRE'
        || el.querySelector(sel)) return;
    el.innerHTML = s + el.innerHTML.replace(/(\n)(.|\s)/g, '$1' + s + '$2');
    let n1 = +el.dataset.start; if (isNaN(n1)) n1 = 1;
    const spans = el.querySelectorAll(sel), w = ('' + (n1 - 1 + spans.length)).length;
    spans.forEach(sp => {
      let n = '' + (n1++), d = w - n.length;
      if (d > 0) n = '0'.repeat(d) + n;
      sp.dataset.lineNumber = n;
    });
  }
  function addAll(e) {
    e ? (e.grammar && addNum(e.element)) :
      document.querySelectorAll('pre > code.line-numbers:first-child').forEach(addNum);
  }
  Prism?.hooks ? Prism.hooks.add('complete', addAll) : addAll();
})();
