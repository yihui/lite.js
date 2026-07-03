(d => {
  const a1 = ['Enter', 'Up', 'Down', 'Left', 'Right'];
  const a2 = ['&crarr;', '&uarr;', '&darr;', '&larr;', '&rarr;'];
  function drawArrows(x) {
    a1.map((v, i) => x = x.replace(new RegExp(`>${v}<`, 'g'), ` title="${v + (i ? ' Arrow' : '')}">${a2[i]}<`));
    return x;
  }
  // 1. individual keys; 2. modifiers; 3. normal keys
  const k1 = 'Esc|Tab|PageUp|PageDown|Space|Delete|Home|End|PrtScr?|PrintScreen|' +
              Array(12).fill().map((v, i) => 'F' + (i + 1)).concat(a1).join('|'),
        k2 = 'Ctrl|Control|Shift|Alt|Cmd|Command|fn',
        k3 = '[a-zA-Z0-9]|Double-Click|Click',
        r1 = new RegExp(`^(${k1}|${k2})$`),
        r2 = new RegExp(`^(${k2}) [/+] `),
        r3 = new RegExp(`^(${k1}|${k2}|${k3})( [/+] )(.*)`);
  d.querySelectorAll(':not(pre) > code').forEach(el => {
    if (el.childElementCount > 0) return;
    let t = el.innerText;
    if (r1.test(t)) {
      el.outerHTML = drawArrows(`<kbd>${t}</kbd>`);
      return;
    }
    if (!r2.test(t)) return;
    let t2 = ''; t += ' + ';
    while (r3.test(t)) {
      t2 += t.replace(r3, '<kbd>$1</kbd>$2');
      t = t.replace(r3, '$3');
    }
    if (t === '') el.outerHTML = drawArrows(t2.replace(/ \+ $/, ''));
  });
})(document);
