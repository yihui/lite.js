import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test, expect} from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');

// open a page at a file URL named `name` (so location.pathname is known) with the given <nav>
const open = async (page, name, nav) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nav-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<nav>${nav}</nav><h2 id="sec">Section</h2>
<script src="file://${root}/js/nav-highlight.js"></script></body></html>`);
  await page.goto('file://' + file + '#sec');
  return file;
};

// ids of the links marked as current
const current = (page) => page.evaluate(() =>
  [...document.querySelectorAll('nav a[aria-current="page"]')].map(a => a.getAttribute('href')));

test('a #hash link on the current page is not marked', async ({page}) => {
  await open(page, 'index.html', '<a href="#sec">Section</a>');
  expect(await current(page)).toEqual([]);
});

test('a #hash link on the current page is ignored even with a matching page link', async ({page}) => {
  await open(page, 'foo.html', '<a href="#sec">Here</a> <a href="foo.html">Page</a>');
  expect(await current(page)).toEqual(['foo.html']);
});

test('a #hash link to the current page does not make a section link current', async ({page}) => {
  await open(page, 'sub/bar.html', '<a href="#sec">Here</a> <a href="../sub/">Dir</a>');
  expect(await current(page)).toEqual(['../sub/']);
});

test('a page link with a hash still matches the page', async ({page}) => {
  await open(page, 'foo.html', '<a href="foo.html#x">Page</a>');
  expect(await current(page)).toEqual(['foo.html#x']);
});
