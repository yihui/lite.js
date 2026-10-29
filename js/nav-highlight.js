// mark <nav> links pointing to the current page with aria-current="page"
(d => {
  // foo.html and foo are the same page; so are dir/index.html and dir/
  const norm = p => p.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '').replace(/(.)\/$/, '$1'),
    l = location, p = norm(l.pathname);
  d.querySelectorAll('nav a[href]').forEach(a => {
    if (a.origin === l.origin && norm(a.pathname) === p) a.setAttribute('aria-current', 'page');
  });
})(document);
