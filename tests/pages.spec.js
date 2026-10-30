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
  // the estimate of what fits is too optimistic: blocks are shorter on the probe page than on the pages
  'blocks taller than on the probe page': {
    head: '<style>.pagesjs-settle p {max-height: 6px; overflow: hidden}</style>',
    body: `<main><section>${para(40)}</section><p>end</p></main>`
  },
  'root children taller than on the probe page': {
    head: '<style>.pagesjs-settle p {max-height: 6px; overflow: hidden}</style>',
    body: `<main>${para(40)}</main>`
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
    // the pieces of broken elements are consistent
    expect(r.bad).toEqual([]);
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
    document.querySelector('.pagesjs-body > * > :nth-child(2)')?.offsetHeight
  ]);
  const out = [];
  for (const f of free(h)) {
    const r = await paginate(page, fixture(name, `<main><div style="height: ${B - f}px"></div>${block}</main>`, '', head));
    expect(r.bad, `free ${f}`).toEqual([]);
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

test('table caption is not left alone at the bottom of a page', async ({page}) => {
  const rows = Array.from({length: 6}, (_, i) => `<tr><td>a${i}</td><td>b${i}</td></tr>`).join('');
  const block = `<div class="table"><div class="caption"><p>CAPTION ${'long caption text '.repeat(25)}</p></div>
<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  const pages = await firstPages(page, 'fill-caption', block, () => range(40, 200, 6));
  pages.forEach(p => expect(!p.text.includes('CAPTION') || p.text.includes('a0b0')).toBe(true));
});

test('native table caption stays with the first rows', async ({page}) => {
  const rows = Array.from({length: 12}, (_, i) => `<tr><td>a${i}</td><td>b${i}</td></tr>`).join('');
  const block = `<table><caption>CAPTION ${'long caption text '.repeat(25)}</caption>
<thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table>`;
  const pages = await firstPages(page, 'fill-native-caption', block, () => range(40, 260, 6));
  // the caption and the first row are on the same page, and the caption is never alone
  pages.forEach(p => expect(p.text.includes('CAPTION'), p.text.slice(0, 60)).toBe(p.text.includes('a0b0')));
});

test('a broken paragraph that is put back is one element again', async ({page}) => {
  // two lines are split between the pages, but the one line left on the page is moved back
  const pages = await firstPages(page, 'fill-rejoin', '<ul><li><p>line one<br>line two</p></li><li><p>next item</p></li></ul>', () => range(20, 140, 2));
  expect(pages.length).toBeGreaterThan(0);
});

test('list item of a few lines is not pushed to the next page', async ({page}) => {
  // there is room for the first item (3 lines) but not for the list
  const items = Array.from({length: 4}, (_, i) => `<li>item${i}<br>line<br>line</li>`).join('');
  const pages = await firstPages(page, 'fill-list', `<ul>${items}</ul>`, h => range(90, 110, 5));
  pages.forEach(p => expect(p.text).toContain('item0'));
});

test('code that fits only without the bottom border and margin is broken', async ({page}) => {
  // a page that is too tall to fit gets a second (blank) page when printed (page-multiple)
  const head = '<style>pre {padding: 10px; border: 3px solid; margin: 13px 0}</style>';
  const block = `<pre><code>${Array.from({length: 12}, (_, i) => 'line ' + i).join('\n')}</code></pre>`;
  for (const free of range(100, 300, 4)) {
    await firstPages(page, 'fill-code', block, () => [free], head);
    expect(await page.evaluate(() => document.querySelectorAll('.page-multiple').length), `free ${free}`).toBe(0);
  }
});

// Notes (footnotes and citations put after their references by sidenotes.js) are measured
// in a block after the page body, as in the end: the content must not run into the notes,
// and must fill the page up to them.
test('notes are measured at the bottom of the page', async ({page}) => {
  const para = (i) => `<p>Text ${i}<sup class="note-ref" data-note="${i}">${i}</sup> ${words}</p>`;
  // (a <div> in a <p> is possible only in the DOM)
  const body = `<main><div style="height: BFILLpx"></div>${para(1)}${para(2)}${para(3)}</main>
<script>document.querySelectorAll('sup').forEach(a => {
  const n = document.createElement('div');
  n.className = 'footnotes'; n.innerHTML = '<p>note ' + a.dataset.note + ' ${words.slice(0, 60)}</p>'; a.after(n);
})</script>`;
  const head = '<style>p {margin: 0 0 10px; line-height: 20px; font-size: 14px}</style>';
  await paginate(page, fixture('notes-probe', '<main><p>x</p></main>', '', head));
  const B = await page.evaluate(() => document.querySelector('.pagesjs-body').getBoundingClientRect().height);
  for (const f of range(150, 400, 10)) {
    await paginate(page, fixture('notes', body.replace('BFILL', B - f), '', head));
    const r = await page.evaluate(() => [...document.querySelectorAll('.pagesjs-page')].map(pg => {
      const body = pg.querySelector('.pagesjs-body'), br = body.getBoundingClientRect();
      let bottom = br.top;
      for (let e = body; e.lastElementChild;) { e = e.lastElementChild; bottom = Math.max(bottom, e.getBoundingClientRect().bottom); }
      const fn = pg.querySelector('.footnotes');  // (the last margin of the content may reach into the space above the notes)
      return {
        free: br.bottom - bottom, gap: (fn ? fn.getBoundingClientRect().top : br.bottom) - bottom,
        notes: pg.querySelectorAll('.footnotes > p').length, refs: pg.querySelectorAll('sup').length
      };
    }));
    r.forEach((p, i) => {
      expect(p.notes, `free ${f}, page ${i + 1}: every reference has its note`).toBe(p.refs);
      expect(p.gap, `free ${f}, page ${i + 1} runs into the notes`).toBeGreaterThanOrEqual(0);
    });
    // a paragraph is broken to fill the page (less than a widow and an orphan are left)
    r.slice(0, -1).forEach((p, i) => expect(p.free, `free ${f}, page ${i + 1}`).toBeLessThan(65));
  }
});

// A page that is a few pixels too tall in fill mode is fine if the extra space is only white
// space in the end (nothing reaches the footer); otherwise the page needs more physical pages.
test('page-multiple only for content that really overflows', async ({page}) => {
  await paginate(page, fixture('multi-probe', '<main><p>x</p></main>'));
  const B = await page.evaluate(() => document.querySelector('.pagesjs-body').getBoundingClientRect().height);
  const multi = async (over) => {
    await paginate(page, fixture('multi', `<main><div style="height: ${B + over}px"></div><p>x</p></main>`));
    return page.evaluate(() => document.querySelectorAll(".page-multiple").length);
  };
  expect(await multi(5)).toBe(0);  // hangs over the body into the space above the footer
  expect(await multi(80)).toBe(1);  // runs into the footer
});

test('only the last page has data-page-url, without ?paged=1', async ({page}) => {
  const body = '<main>' + '<p style="height: 600px">x</p>'.repeat(4) + '</main>';
  await paginate(page, fixture('page-url', body));
  const r = await page.evaluate(() => ({
    n: document.querySelectorAll('.pagesjs-page').length,
    urls: [...document.querySelectorAll('[data-page-url]')].map(e => e.dataset.pageUrl),
    last: [...document.querySelectorAll('.pagesjs-page')].at(-1).querySelectorAll('[data-page-url]').length
  }));
  expect(r.n).toBeGreaterThan(1);
  expect(r.last).toBe(r.urls.length);
  expect(r.urls.length).toBeGreaterThan(0);
  expect(r.urls.every(u => u.endsWith('page-url.html'))).toBe(true);
});

test('TOC links get the page numbers of their targets', async ({page}) => {
  const ids = [0, 1, 2, 3];
  const body = `<main><nav id="TOC"><ul>${ids.map(i => `<li><a href="#s${i}">S${i}</a></li>`).join('')}</ul></nav>` +
    ids.map(i => `<h2 id="s${i}">S${i}</h2>${para(12)}`).join('') + '</main>';
  await paginate(page, fixture('toc-numbers', body));
  const r = await page.evaluate(() => [...document.querySelectorAll('#TOC a')].map(a => [
    a.dataset.pageNumber, document.getElementById(a.hash.slice(1)).closest('.pagesjs-page').children[0].dataset.pageNumber
  ]));
  expect(r.length).toBe(ids.length);
  r.forEach(([got, want]) => expect(got).toBe(want));
  expect(new Set(r.map(x => x[0])).size).toBeGreaterThan(1);
});

// Blocks that surely fit the page (going by their positions on the probe page) are put there
// together, instead of being measured (via scrollHeight) one by one.
test('short blocks are not measured one by one', async ({page}) => {
  await page.addInitScript(() => {
    const get = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight').get;
    window.reads = 0;
    Object.defineProperty(Element.prototype, 'scrollHeight', {get() { window.reads++; return get.call(this); }});
  });
  const blocks = Array.from({length: 300}, (_, i) => `<p>Short ${i}.</p>`).join('');
  const bodies = {flat: `<main>${blocks}</main>`, nested: `<main><section>${blocks}</section><p>end</p></main>`};
  for (const [name, body] of Object.entries(bodies)) {
    const r = await paginate(page, fixture('short-' + name, body));
    expect(r.pages.length).toBeGreaterThan(1);
    expect(r.pages.map(p => p.text).join(''), name).toBe(r.before);
    const n = await page.evaluate(() => window.reads);
    expect(n, `${name}: scrollHeight reads`).toBeLessThan(120);
  }
});

// book.css styles the first page if it has the frontmatter via the class page-front (not :has(),
// which is re-checked on every change in the page and makes pagination slower)
test('the first page is marked if it has the frontmatter', async ({page}) => {
  const book = `<link rel="stylesheet" href="${new URL('../css/book.css', import.meta.url).href}">`;
  const header = async (n) => page.evaluate((n) => getComputedStyle(document.querySelectorAll('.pagesjs-page')[n].querySelector('.pagesjs-header')).display, n);
  await paginate(page, fixture('front-page', `<header><h1 class="title">Doc</h1></header><main>${para(30)}</main>`, '', book));
  expect(await page.evaluate(() => [...document.querySelectorAll('.pagesjs-page')].map(p => p.classList.contains('page-front')))
    .then(a => a.indexOf(true) + ':' + a.filter(Boolean).length)).toBe('0:1');
  expect(await header(0)).toBe('none');
  expect(await header(1)).not.toBe('none');
  await paginate(page, fixture('no-front-page', `<main>${para(30)}</main>`, '', book));
  expect(await page.evaluate(() => document.querySelectorAll('.page-front').length)).toBe(0);
  expect(await header(0)).not.toBe('none');
});

// A float (captioned figure, or an element with the class "float") that does not fit waits
// for the next page, where it comes first, and the text after it fills the page.
test('floats wait for the next page and the text fills the gap', async ({page}) => {
  const fig = (id, h, cls = 'figure') => `<div class="${cls}" id="${id}"><div style="height: ${h}px">FIG${id}</div><div class="caption">cap ${id}</div></div>`;
  const run = async (blocks) => {
    await paginate(page, fixture('float-probe', '<main><p>x</p></main>'));
    const B = await page.evaluate(() => document.querySelector('.pagesjs-body').getBoundingClientRect().height);
    const url = fixture('float', `<main><div style="height: ${B - 200}px"></div>${blocks}${para(6)}</main>`);
    const r = await paginate(page, url);
    expect(r.bad).toEqual([]);
    // nothing lost or duplicated (the order changes: floats move)
    expect([...r.pages.map(p => p.text).join('')].sort().join('')).toBe([...r.before].sort().join(''));
    const tops = await page.evaluate(() => [...document.querySelectorAll('.pagesjs-body')].map(b =>
      [...b.querySelectorAll('.pagesjs-float')].map(e => e.id)));
    return {r, tops};
  };
  for (const cls of ['figure', 'float']) {
    const {r, tops} = await run(fig('a', 300, cls));
    expect(r.pages[0].text, `${cls}: the text fills page 1`).toContain('Paragraph0');
    expect(r.pages[0].text).not.toContain('FIGa');
    expect(tops[1]).toEqual(['a']);
  }
  // order: the small figure waits for the big one
  const {tops} = await run(fig('a', 300) + fig('b', 20));
  expect(tops[1]).toEqual(['a', 'b']);
  // not floats: figures without a caption, and a figure that fits stays in place
  const plain = await run('<div class="figure"><div style="height: 300px">FIGc</div></div>');
  expect(plain.r.pages[0].text).not.toContain('Paragraph0');
  const fits = await run(fig('d', 100));
  expect(fits.r.pages[0].text).toContain('FIGd');
});

// A float that waits for the next page keeps the wrappers of the elements that it was in
// (e.g., a chapter), so CSS selectors that depend on them still apply, and the wrappers
// take no space.
test('floats keep their wrappers', async ({page}) => {
  await paginate(page, fixture('float-wrap-probe', '<main><p>x</p></main>'));
  const B = await page.evaluate(() => document.querySelector('.pagesjs-body').getBoundingClientRect().height);
  const head = '<style>.chapter {padding: 30px; border: 3px solid} .chapter .figure {color: rgb(1, 2, 3)}</style>';
  const body = `<main><section class="chapter" id="ch"><div style="height: ${B - 250}px"></div>
<div class="figure"><div style="height: 300px">FIG</div><div class="caption">cap</div></div>${para(6)}</section></main>`;
  const r = await paginate(page, fixture('float-wrap', body, '', head));
  expect(r.bad).toEqual([]);
  const f = await page.evaluate(() => {
    const e = document.querySelector('.pagesjs-float'), w = e.parentNode, cs = getComputedStyle(w);
    return {
      page: [...document.querySelectorAll('.pagesjs-page')].indexOf(e.closest('.pagesjs-page')),
      tag: w.tagName, cls: w.className, color: getComputedStyle(e).color, pad: cs.paddingTop, border: cs.borderTopWidth
    };
  });
  expect(f.page).toBe(1);
  expect(f.tag + '.' + f.cls).toMatch(/^SECTION\..*pagesjs-wrap/);
  expect(f.color).toBe('rgb(1, 2, 3)');
  expect([f.pad, f.border]).toEqual(['0px', '0px']);
});

// A float taller than the threshold (70% of the page body by default, or
// <body data-pages-float-page="N">) takes a whole page, vertically centered.
test('a tall float takes a page of its own', async ({page}) => {
  await paginate(page, fixture('float-page-probe', '<main><p>x</p></main>'));
  const B = await page.evaluate(() => document.querySelector('.pagesjs-body').getBoundingClientRect().height);
  const fig = `<div class="figure" id="f"><div style="height: ${Math.round(B * .75)}px">FIG</div><div class="caption">cap</div></div>`;
  const run = async (body, attrs = '') => {
    const r = await paginate(page, fixture('float-page', `<main>${body}</main>`, attrs));
    expect(r.bad).toEqual([]);
    const f = await page.evaluate(() => {
      const e = document.getElementById('f'), pg = e.closest('.pagesjs-page'), b = pg.querySelector('.pagesjs-body').getBoundingClientRect();
      const rc = e.getBoundingClientRect();
      return {page: [...document.querySelectorAll('.pagesjs-page')].indexOf(pg), above: rc.top - b.top, below: b.bottom - rc.bottom,
        others: [...pg.querySelectorAll('.pagesjs-body p, .pagesjs-body pre, .pagesjs-body table')].length};
    });
    return {r, f};
  };
  // after some text, the figure is alone on page 2 (the text after it fills page 1); at the
  // start, it is alone on page 1
  for (const [body, n] of [[`${para(1)}${fig}${para(4)}`, 1], [`${fig}${para(4)}`, 0],
    [`<section>${fig}${para(4)}</section><section>${para(1)}</section>`, 0]]) {
    const {r, f} = await run(body);
    expect(f.others, 'nothing else on the page of the figure').toBe(0);
    expect(Math.abs(f.above - f.below), 'centered').toBeLessThan(3);
    expect(r.pages[f.page].text).not.toContain('Paragraph');
    expect(f.page).toBe(n);
    expect(r.pages.map(p => p.text.includes('Paragraph'))).toEqual(n ? [true, false] : [false, true]);
  }
  // code and tables (broken by the free space) of the element that the float was in come after its page
  for (const block of [code(40), table(40)]) {
    const {f} = await run(`<div style="height: ${Math.round(B - 200)}px"></div><section>${fig}${block}</section>`);
    expect(f.others, 'nothing else on the page of the figure').toBe(0);
  }
  // with a higher threshold, it is just a float that fits where it is
  const {r, f} = await run(`${para(1)}${fig}${para(4)}`, 'data-pages-float-page="90"');
  expect(f.page).toBe(0);
  expect(r.pages[0].text).toContain('Paragraph0');
});

// A float that takes a page comes between the pieces of a broken paragraph, so the piece after
// it is not a lone line (a 2-line paragraph moves entirely).
test('no lone line after a page of a float', async ({page}) => {
  await paginate(page, fixture('float-widow-probe', '<main><p>x</p></main>'));
  const B = await page.evaluate(() => document.querySelector('.pagesjs-body').getBoundingClientRect().height);
  const fig = `<div class="figure" id="f"><div style="height: ${Math.round(B * .75)}px">FIG</div><div class="caption">cap</div></div>`;
  const two = '<p>' + 'lorem ipsum dolor sit amet '.repeat(8) + '</p>';
  const blocks = {paragraph: para(2), 'callout': `<fieldset class="callout"><legend>Tip</legend>${two}</fieldset>`,
    'two lines': two + '<p>' + 'lorem ipsum dolor sit amet '.repeat(8) + '</p>'};
  for (const [name, block] of Object.entries(blocks)) {
    for (const free of range(30, 200, 7)) {
      const r = await paginate(page, fixture('float-widow', `<main><div style="height: ${B - free}px"></div>${fig}${block}${para(3)}</main>`));
      expect(r.bad, `${name}, free ${free}`).toEqual([]);
      const lines = await page.evaluate(() => {
        const pages = [...document.querySelectorAll('.pagesjs-page')], k = pages.findIndex(p => p.querySelector('#f'));
        const e = pages[k + 1]?.querySelector('.pagesjs-body .pagesjs-fragmented.fragment-last');
        const first = pages[k + 1]?.querySelector('.pagesjs-body p');
        if (!e || e !== first) return null;
        const r = document.createRange(); r.selectNodeContents(e);
        return new Set([...r.getClientRects()].map(c => Math.round(c.top))).size;
      });
      lines === null || expect(lines, `${name}, free ${free}: lines of the piece after the float`).toBeGreaterThan(1);
    }
  }
});
