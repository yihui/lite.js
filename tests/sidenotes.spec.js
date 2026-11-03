import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test, expect} from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');

const open = async (page, toc, css = '') => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'side-')), 'index.html');
  fs.writeFileSync(file, `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${root}/css/default.css">
<style>${css}</style></head><body>
${toc}<article><h1 id="a">A</h1><p>text</p></article>
<script src="file://${root}/js/sidenotes.js"></script></body></html>`);
  await page.goto('file://' + file);
};

test('TOC gets side-left by default, but keeps a side class that is already set', async ({page}) => {
  await open(page, '<nav id="TOC"><ul><li>A</li></ul></nav>');
  expect(await page.evaluate(() => TOC.className)).toBe('side side-left');
  await open(page, '<nav id="TOC" class="side side-right"><ul><li>A</li></ul></nav>');
  expect(await page.evaluate(() => TOC.className)).toBe('side side-right');
});

test('--invert-filter disables the dark mode filter', async ({page}) => {
  await page.emulateMedia({colorScheme: 'dark'});
  await open(page, '');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).filter)).toContain('invert');
  await open(page, '', ':root { --invert-filter: none; }');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).filter)).toBe('none');
});
