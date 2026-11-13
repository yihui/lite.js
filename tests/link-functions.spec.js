import fs from 'node:fs';
import path from 'node:path';
import {test, expect} from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');

// open a page with the body `html` and a function index (function -> URL); both
// are served from memory under a fake origin since file:// pages cannot fetch()
const open = async (page, html) => {
  const files = {
    '/idx.json': [JSON.stringify({package: 'litedown', functions: {fuse: 'manual/mark.html', roam: 'manual/roam.html'}}), 'application/json'],
    '/link-functions.js': [fs.readFileSync(path.join(root, 'js/link-functions.js'), 'utf8'), 'text/javascript'],
    '/page.html': [`<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="function-index" content="idx.json"></head><body>${html}
<script src="link-functions.js"></script></body></html>`, 'text/html']
  };
  await page.route('http://x.test/**', r => {
    const f = files[new URL(r.request().url()).pathname];
    return f ? r.fulfill({body: f[0], contentType: f[1]}) : r.abort();
  });
  await page.goto('http://x.test/page.html');
  await page.waitForTimeout(300);
};

// "text>page" for each link in the element
const links = (page, id) => page.$eval('#' + id, el =>
  [...el.querySelectorAll('a')].map(a => a.textContent + '>' + a.href.split('/').pop()));

test('links calls in inline code, but not names without ( or after $', async ({page}) => {
  await open(page, '<p><code id="a">roam()</code> <code id="b">roam</code> <code id="c">x$roam(1)</code> <code id="d">foo()</code></p>');
  expect(await links(page, 'a')).toEqual(['roam>roam.html']);
  for (const id of 'bcd') expect(await links(page, id)).toEqual([]);
});

test('links pkg::fn() in code blocks, also when highlighted into several nodes', async ({page}) => {
  await open(page, `<pre><code id="a" class="language-r">litedown::roam()</code></pre>
<pre><code id="b" class="language-r"><span class="token namespace">litedown::</span>fuse<span class="token punctuation">(</span>x<span class="token punctuation">)</span></code></pre>`);
  expect(await links(page, 'a')).toEqual(['roam>roam.html']);
  // only the function name is linked, and the links open in a new tab
  expect(await links(page, 'b')).toEqual(['fuse>mark.html']);
  expect(await page.$eval('#b a', a => a.target)).toBe('_blank');
  // highlighting spans are intact
  expect(await page.$$eval('#b span.token', s => s.length)).toBe(3);
});

test('pkg:: must be the current package', async ({page}) => {
  await open(page, '<pre><code id="a" class="language-r">other::roam()\nlitedown::roam()</code></pre>');
  expect(await links(page, 'a')).toEqual(['roam>roam.html']);
  expect(await page.$eval('#a', el => el.textContent)).toBe('other::roam()\nlitedown::roam()');
});

test('only R code in <pre> is linked, and existing links are kept', async ({page}) => {
  await open(page, `<pre><code id="a" class="language-sh">roam()</code></pre>
<pre><code id="b"><span class="language-r"></span>roam()</code></pre>
<a href="#x"><code id="c">roam()</code></a>`);
  expect(await links(page, 'a')).toEqual([]);
  expect(await links(page, 'b')).toEqual(['roam>roam.html']);
  expect(await links(page, 'c')).toEqual([]);
});

test('with prism.js, links code blocks after they are highlighted', async ({page}) => {
  // a stub that keeps the hook, to call it as prism.js does after highlighting
  await page.addInitScript(() => {
    window.Prism = {hooks: {add: (name, fn) => window.hook = fn}};
  });
  await open(page, '<p><code id="i">roam()</code></p><pre><code id="a" class="language-r">roam()</code></pre>');
  expect(await links(page, 'i')).toEqual(['roam>roam.html']);
  // not linked before prism.js highlights it
  expect(await links(page, 'a')).toEqual([]);
  await page.$eval('#a', el => {
    el.innerHTML = '<span class="token function">roam</span><span class="token punctuation">(</span>)';
    window.hook({element: el});
  });
  await page.waitForTimeout(200);
  expect(await links(page, 'a')).toEqual(['roam>roam.html']);
  expect(await page.$$eval('#a span.token', s => s.length)).toBe(2);
});
