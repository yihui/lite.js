import {test, expect} from '@playwright/test';
import {fixture, paginate} from './helper.js';

const para = (n, tag = 'p') => Array.from({length: n}, (_, i) =>
  `<${tag}>Paragraph ${i}: ` + 'lorem ipsum dolor sit amet '.repeat(30) + `end${i}.</${tag}>`).join('\n');
const list = (n, deep) => '<ul>' + Array.from({length: n}, (_, i) =>
  `<li>item ${i} ${'word '.repeat(20)}` + (deep ? list(3, deep - 1) : '') + '</li>').join('') + '</ul>';
const table = (n) => '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>' +
  Array.from({length: n}, (_, i) => `<tr><td>a${i}</td><td>b${i}</td></tr>`).join('') + '</tbody></table>';
const code = (n) => '<pre><code>' + Array.from({length: n}, (_, i) => `line_${i} <span>x</span>`).join('\n') + '</code></pre>';

const cases = {
  paragraphs: {body: `<main><h1>Title</h1><h2>S1</h2>${para(40)}<h2>S2</h2>${para(20)}</main>`},
  'nested lists': {body: `<main>${list(15, 2)}</main>`},
  table: {body: `<main>${table(200)}</main>`},
  // the only child of <main> is not the content root if it has text or is a table/pre
  'single paragraph': {body: `<main>${para(1).replace('</p>', ' <em>x</em></p>')}</main>`},
  code: {body: `<main>${code(300)}</main>`},
  // regression: a big block of hidden panes was wrapped in nested runs endlessly
  'big hidden tabset': {
    head: '<style>.tab-pane:not(.active) {display: none}</style>',
    body: `<main><p>Intro</p><div class="tabset">${
      Array.from({length: 4}, (_, i) =>
        `<div class="tab-pane${i ? '' : ' active'}">${list(200)}</div>`).join('')
    }</div></main>`
  },
  'root and front by selector': {
    attrs: 'data-pages-root="div.main" data-pages-front="div.meta"',
    body: `<div class="meta"><h1 class="title">Doc</h1></div><div class="main"><nav id="TOC"><ul><li><a href="#a">A</a></li></ul></nav>${para(30).replace('<p>', '<h2 id="a">A</h2><p>')}</div>`
  },
};

for (const [name, {body, attrs, head}] of Object.entries(cases)) {
  test(name, async ({page}) => {
    const r = await paginate(page, fixture(name.replace(/\W+/g, '-'), body, attrs, head));
    expect(r.pages.length).toBeGreaterThan(0);
    // pages fit (a few pixels of tolerance)
    r.pages.forEach((p, i) => expect(p.overflow, `page ${i + 1} overflows`).toBeLessThanOrEqual(5));
    // no blank pages
    r.pages.forEach((p, i) => expect(p.text, `page ${i + 1} is blank`).not.toBe(''));
    // nothing lost, duplicated, or reordered
    expect(r.pages.map(p => p.text).join('')).toBe(r.before);
  });
}

// Pieces fill pages: when the free space at the bottom of a page is enough for
// the start of a block, the block is broken there instead of moving entirely to
// the next page. The first page is filled up with a div such that `free(h)` pixels
// are left (h is the height of the block), and the first page is returned. (The
// capacity of a page is not exactly its body height, so the free space is swept.)
async function firstPages(page, name, block, free, head = '') {
  await paginate(page, fixture(name + '-probe', `<main><p>x</p>${block}</main>`, '', head));
  const [B, h] = await page.evaluate(() => [
    document.querySelector('.pagesjs-body').getBoundingClientRect().height,
    document.querySelector('.pagesjs-body > * > :nth-child(2)').offsetHeight
  ]);
  const out = [];
  for (const f of free(h)) {
    const r = await paginate(page, fixture(name, `<main><div style="height: ${B - f}px"></div>${block}</main>`, '', head));
    out.push(r.pages[0]);
  }
  return out;
}
const words = 'lorem ipsum dolor sit amet '.repeat(40);
const range = (from, to, by) => Array.from({length: Math.ceil((to - from) / by)}, (_, i) => from + i * by);

test('callout is broken to fill the page', async ({page}) => {
  const tight = '<style>p {margin: 0; line-height: 20px} fieldset {margin: 0; padding: 4px} legend {padding: 0}</style>';
  // the callout fits only if the border and padding at the bottom are hidden, which is
  // the case when it is broken; there is room for the legend and a few lines of text
  const pages = await firstPages(page, 'fill-callout', `<fieldset><legend>Tip</legend><p>${words}</p></fieldset>`,
    h => range(h - 30, h, 2), tight);
  pages.forEach(p => expect(p.text).toContain('Tip'));
});

test('list item of a few lines is not pushed to the next page', async ({page}) => {
  // there is room for the first item (3 lines) but not for the list
  const items = Array.from({length: 4}, (_, i) => `<li>item${i}<br>line<br>line</li>`).join('');
  const pages = await firstPages(page, 'fill-list', `<ul>${items}</ul>`, h => range(90, 110, 5));
  pages.forEach(p => expect(p.text).toContain('item0'));
});
