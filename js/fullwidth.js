// look for overflowed <pre> and <table>, and assign .fullwidth class to them
document.querySelectorAll('pre,table,#TOC,#TableOfContents').forEach(node => {
  function fullwidth(el) {
    el.classList.add('fullwidth');
    el.dataset.autoFullwidth = '';  // so sidenotes.js only undoes what we added
  }
  // skip if already in .fullwidth container (or .tabset)
  if (node.closest('.fullwidth,.tabset')) return;
  switch (node.tagName) {
    case 'PRE':
      const el = node.firstElementChild;
      el?.tagName === 'CODE' && el.scrollWidth > el.offsetWidth && fullwidth(el.parentNode);
      break;
    case 'TABLE':
      const p = node.parentElement;
      p && p.offsetWidth < node.offsetWidth && fullwidth(node);
      break;
    default:
      // assume it's the TOC for now
      node.querySelectorAll('a').forEach(a => {
        // if a TOC line is wrapped, make TOC full-width
        !node.classList.contains('fullwidth') && a.getClientRects().length > 1 && fullwidth(node);
      });
  }
});

// pages.js doesn't use the auto fullwidth feature; undo what we added
addEventListener('pagesjs:before', () => {
  document.querySelectorAll('[data-auto-fullwidth]').forEach(el => {
    el.classList.remove('fullwidth');
    delete el.dataset.autoFullwidth;
  });
});
