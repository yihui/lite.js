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

const article = async (page, body) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'side-')), 'index.html');
  fs.writeFileSync(file, `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${root}/css/default.css">
<link rel="stylesheet" href="file://${root}/css/article.css"></head><body>
<article>${body}</article>
<script src="file://${root}/js/sidenotes.js"></script></body></html>`);
  await page.setViewportSize({width: 1600, height: 900});
  await page.goto('file://' + file);
};
const cite = id => `<a href="#ref-${id}" class="citation">${id}</a>`;
const refs = ids => `<div id="refs">${ids.map(i => `<div id="ref-${i}">Ref ${i}</div>`).join('')}</div>`;

test('notes are aligned with the article margin and their references, wherever the references are', async ({page}) => {
  const fn = n => `<sup><a href="#fn${n}">${n}</a></sup>`;
  const gap = '<p style="height:150px">gap</p>';
  await article(page, `<h3>Head ${cite('a')}</h3>${gap}<table><tr><td>${cite('b')}</td></tr></table>${gap}
<div style="display:flex"><p>${cite('c')}</p></div>${gap}<p>Para ${cite('d')}</p>${gap}
<blockquote><p>Q ${cite('e')}</p><blockquote><p>QQ${fn(1)}</p></blockquote></blockquote>${gap}<ul><li>L ${cite('f')}</li></ul>
${refs(['a', 'b', 'c', 'd', 'e', 'f'])}<div class="footnotes"><ol><li id="fn1"><p>One</p></li></ol></div>`);
  const r = await page.evaluate(() => {
    const art = document.querySelector('article'), ar = art.getBoundingClientRect();
    const sides = [...document.querySelectorAll('.side')];
    return {
      n: sides.length, left: document.querySelectorAll('#refs, .footnotes:not(.side)').length,
      // the layer of a note follows the child of the article that has the reference
      inside: sides.filter(s => !s.parentElement.previousElementSibling?.contains(document.getElementById(s.dataset.noteFor))).length,
      right: sides.map(s => s.getBoundingClientRect().right),
      outside: sides.every(s => s.getBoundingClientRect().left >= ar.right),
      dy: sides.map(s => s.getBoundingClientRect().top - document.getElementById(s.dataset.noteFor).getBoundingClientRect().top),
      font: [...new Set(sides.map(s => getComputedStyle(s).fontSize))],
    };
  });
  expect(r.n).toBe(7);
  expect(r.left).toBe(0);
  expect(r.inside).toBe(0);
  expect(r.outside).toBe(true);
  r.right.forEach(x => expect(Math.abs(x - r.right[0])).toBeLessThan(1));
  r.dy.forEach(y => expect(Math.abs(y)).toBeLessThan(2));
  expect(r.font.length).toBe(1);
});

test('overlapping notes are stacked, in the order of their references', async ({page}) => {
  await article(page, `<p>${cite('a')} ${cite('b')}</p>${refs(['a', 'b'])}`);
  const t = await page.evaluate(() => [...document.querySelectorAll('.side')].map(s => s.getBoundingClientRect()));
  expect(t[1].top).toBeGreaterThanOrEqual(t[0].bottom);
});

test('on narrow screens, notes follow their blocks', async ({page}) => {
  await article(page, `<p>A ${cite('a')}</p><p>B ${cite('b')}</p><p>C ${cite('a')}</p>${refs(['a', 'b'])}`);
  await page.setViewportSize({width: 600, height: 900});
  const r = await page.evaluate(() => {
    const vis = [...document.querySelectorAll('.side')].filter(s => s.offsetParent);
    return vis.map(s => [s.textContent.trim(), s.parentElement.previousElementSibling.textContent.slice(0, 1)]);
  });
  expect(r).toEqual([['Ref a', 'A'], ['Ref b', 'B']]);
});

test('notes do not overlap a side element in the margin, nor change it', async ({page}) => {
  await article(page, `<div class="side side-right" style="height:100px">Box</div><p>A ${cite('a')}</p><p style="height:300px">gap</p>
<div class="side side-right" style="height:40px">Box2</div><p>B ${cite('b')}</p>${refs(['a', 'b'])}`);
  const r = await page.evaluate(() => {
    const [b1, b2] = [...document.querySelectorAll('.side:not(.footnotes)')].map(e => e.getBoundingClientRect());
    const [n1, n2] = [...document.querySelectorAll('.side.footnotes')].map(e => e.getBoundingClientRect());
    return {first: n1.top >= b1.bottom, second: n2.top >= b2.bottom || n2.bottom <= b2.top,
      float: getComputedStyle(document.querySelector('.side:not(.footnotes)')).float};
  });
  expect(r).toEqual({first: true, second: true, float: 'right'});
});

test('the content can be <main> or .main instead of <article>', async ({page}) => {
  for (const tag of ['<main>', '<div class="main">']) {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'side-')), 'index.html');
    fs.writeFileSync(file, `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://${root}/css/default.css">
<link rel="stylesheet" href="file://${root}/css/article.css"></head><body>${tag}<p>A ${cite('a')}</p><blockquote><p>B ${cite('b')}</p></blockquote>${refs(['a', 'b'])}</${tag.match(/\w+/)[0]}>
<script src="file://${root}/js/sidenotes.js"></script></body></html>`);
    await page.goto('file://' + file);
    const r = await page.evaluate(() => {
      const m = document.querySelector('main, .main'), cs = getComputedStyle(m);
      const edge = m.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
      const sides = [...document.querySelectorAll('.side-note')];
      return {layers: m.querySelectorAll(':scope > .sidenotes').length, inside: m.querySelectorAll('blockquote .side-note').length,
        rights: sides.map(s => Math.round(s.getBoundingClientRect().right - edge))};
    });
    expect(r.layers).toBe(2);
    expect(r.inside).toBe(0);
    expect(r.rights).toEqual([r.rights[0], r.rights[0]]);
  }
});

test('a repeated reference does not repeat the note in the margin, but shows it on hover', async ({page}) => {
  await article(page, `<p>A ${cite('a')}</p><p style="height:400px">gap</p><p>C <span id="r2">${cite('a')}</span></p>${refs(['a'])}`);
  const info = () => page.evaluate(() => {
    const [m, p] = [document.querySelector('.side-note'), document.querySelector('.note-pop')];
    return {margin: document.querySelectorAll('.side-note').length, hidden: p.offsetParent === null,
      popTop: p.offsetParent && Math.round(p.getBoundingClientRect().top - document.getElementById('r2').getBoundingClientRect().top),
      text: p.textContent.trim() === m.textContent.trim()};
  });
  expect(await info()).toMatchObject({margin: 1, hidden: true, text: true});
  await page.hover('#r2 a');
  const h = await info();
  expect(h.hidden).toBe(false);
  expect(Math.abs(h.popTop)).toBeLessThan(30);
  await page.mouse.move(0, 0);
  expect((await info()).hidden).toBe(true);
});
