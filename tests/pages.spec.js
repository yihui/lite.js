import {test, expect} from '@playwright/test';
import {fixture, paginate} from './helper.js';

const para = (n, tag = 'p') => Array.from({length: n}, (_, i) =>
  `<${tag}>Paragraph ${i}: ` + 'lorem ipsum dolor sit amet '.repeat(30) + `end${i}.</${tag}>`).join('\n');
const list = (n, deep) => '<ul>' + Array.from({length: n}, (_, i) =>
  `<li>item ${i} ${'word '.repeat(20)}` + (deep ? list(3, deep - 1) : '') + '</li>').join('') + '</ul>';
const table = (n) => '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>' +
  Array.from({length: n}, (_, i) => `<tr><td>a${i}</td><td>b${i}</td></tr>`).join('') + '</tbody></table>';
const code = (n) => '<pre><code>' + Array.from({length: n}, (_, i) => `line_${i} <span>x</span>`).join('\n') + '</code></pre>';

// (<main> with a single child would make the child the content root, so every case has an intro)
const cases = {
  paragraphs: {body: `<main><h1>Title</h1><h2>S1</h2>${para(40)}<h2>S2</h2>${para(20)}</main>`},
  'nested lists': {body: `<main><p>Intro</p>${list(15, 2)}</main>`},
  table: {body: `<main><p>Intro</p>${table(200)}</main>`},
  code: {body: `<main><p>Intro</p>${code(300)}</main>`},
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
