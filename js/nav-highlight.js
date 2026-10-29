// mark <nav> links pointing to the current page with aria-current="page"
(d => {
  // foo.html and foo are the same page; so are dir/index.html and dir/
  const norm = p => p.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '').replace(/(.)\/$/, '$1'),
    l = location, p = norm(l.pathname),
    links = [...d.querySelectorAll('nav a[href]')].filter(a => a.origin === l.origin);
  let cur = links.filter(a => norm(a.pathname) === p);
  // no exact match: the deepest link (foo/ or foo.html) whose section contains this page is current
  if (!cur.length) {
    const dirs = links.map(a => [a, norm(a.pathname)]).filter(([, q]) => q !== '/' && p.startsWith(q + '/'));
    const n = Math.max(0, ...dirs.map(([, q]) => q.length));
    cur = dirs.filter(([, q]) => q.length === n).map(([a]) => a);
  }
  cur.forEach(a => a.setAttribute('aria-current', 'page'));
})(document);
