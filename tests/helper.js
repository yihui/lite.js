import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// text of the text nodes under the selector without whitespace, ignoring
// <style>/<script> and <thead> (which is repeated on each page of a table); robust against
// where pages break lines
const text = (el) => {
  let out = '';
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n; n = w.nextNode();)
    if (!n.parentNode.closest('style, script, thead')) out += n.data.replace(/\s+/g, '');
  return out;
};

// Write an HTML page (body content + optional <body> attributes) that loads
// pages.css/pages.js from this repo, and return its file URL.
export function fixture(name, body, attrs = '', head = '') {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pagesjs-')), name + '.html');
  fs.writeFileSync(file, `<!DOCTYPE html>
<html><head><meta charset="utf-8">${head}
<link rel="stylesheet" href="file://${root}/css/pages.css">
</head><body ${attrs}>
${body}
<script src="file://${root}/js/pages.js"></script>
</body></html>`);
  return 'file://' + file;
}

// Open the page, paginate it, and return what the invariants need to check:
// the text before and after, and the height of each page body.
export async function paginate(page, url, sel = 'body') {
  await page.goto(url);
  const before = await page.evaluate(`(${text})(document.querySelector(${JSON.stringify(sel)}))`);
  await page.goto(url + '?paged=1');
  // a hang shows up as a timeout here
  await page.waitForFunction(() => {
    const c = document.body.classList;
    return c.contains('pagesjs') && !c.contains('pagesjs-filling');
  }, null, {timeout: 30000});
  const pages = await page.evaluate(`((text) => [...document.querySelectorAll('.pagesjs-page')].map(p => ({
    text: text(p.querySelector('.pagesjs-body')), overflow: p.scrollHeight - p.clientHeight
  })))(${text})`);
  // Pieces of a broken element (classes pagesjs-fragmented, fragment-first/last): a piece that
  // is not the last one is the last thing in its parent on the page, a piece that is not the
  // first one is the first thing, and nothing is both (that is a whole element).
  const bad = await page.evaluate(() => [...document.querySelectorAll('.pagesjs-body .pagesjs-fragmented')].flatMap(e => {
    const c = e.classList, first = c.contains('fragment-first'), last = c.contains('fragment-last');
    const vis = n => n && n.getBoundingClientRect().height > 0;
    return [first && last && 'both', !last && vis(e.nextElementSibling) && 'followed', !first && vis(e.previousElementSibling) && !e.previousElementSibling.matches('.pagesjs-float') && 'preceded']
      .filter(Boolean).map(w => `${w}: ${e.tagName}.${e.className}`);
  }));
  return {pages, before, bad};
}
