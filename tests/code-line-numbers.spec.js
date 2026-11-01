import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test, expect} from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');

test('wrapped lines start to the right of the line number gutter', async ({page}) => {
  const long = 'x = c(' + Array.from({length: 60}, (_, i) => i).join(', ') + ')';
  const lines = [long, ...Array.from({length: 11}, (_, i) => `y${i} = ${i}`)];
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lineno-')), 'index.html');
  fs.writeFileSync(file, `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${root}/css/code-line-numbers.css">
<style>body{width:400px} code{white-space:pre-wrap}</style></head><body>
<pre><code class="line-numbers">${lines.join('\n')}</code></pre>
<script src="file://${root}/js/code-line-numbers.js"></script></body></html>`);
  await page.goto('file://' + file);
  await page.waitForSelector('span[data-line-number]');
  const r = await page.evaluate(() => {
    const code = document.querySelector('code'), spans = [...code.querySelectorAll('span[data-line-number]')];
    const range = document.createRange(), left = (n, o) => {
      range.setStart(n, o); range.setEnd(n, o + 1); return range.getBoundingClientRect().left;
    };
    // x of the first character of each text line (the first line wraps)
    const first = left(spans[0].nextSibling, 0), tn = spans[0].nextSibling;
    let wrapped = null;
    for (let i = 1; i < tn.data.length; i++)
      if (range.setStart(tn, i), range.setEnd(tn, i + 1), range.getBoundingClientRect().top > spans[0].getBoundingClientRect().top + 5) {
        wrapped = left(tn, i); break;
      }
    return {
      first, wrapped, pad: parseFloat(getComputedStyle(code).paddingLeft), codeLeft: code.getBoundingClientRect().left,
      second: left(spans[1].nextSibling, 0), digits: code.style.getPropertyValue('--ln-w')
    };
  });
  expect(r.digits).toBe('2');
  expect(r.wrapped).not.toBeNull();
  // all lines of text, wrapped or not, start at the left padding edge (the gutter)
  expect(Math.abs(r.first - r.codeLeft - r.pad)).toBeLessThan(1);
  expect(Math.abs(r.wrapped - r.first)).toBeLessThan(1);
  expect(Math.abs(r.second - r.first)).toBeLessThan(1);
  expect(r.pad).toBeGreaterThan(10);
});
