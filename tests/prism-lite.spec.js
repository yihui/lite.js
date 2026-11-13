import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test, expect} from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');

// highlight `code` as `lang`; return [text, html] of the <code>
const run = async (page, lang, code) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hl-')), 'x.html');
  const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  fs.writeFileSync(file, `<!DOCTYPE html><meta charset="utf-8">
<pre><code id="c" class="language-${lang}">${esc}</code></pre>
<script src="file://${root}/js/prism-lite.js"></script>`);
  await page.goto('file://' + file);
  return page.$eval('#c', el => [el.textContent, el.innerHTML]);
};

// tokens as "class:text"
const toks = async (page, lang, code) => {
  await run(page, lang, code);
  return page.$$eval('#c .token', els => els.map(e => e.className.replace('token ', '') + ':' + e.textContent));
};

const samples = {
  r: 'x <- c(1, 2L, "a#b") # note\nf <- function(a = TRUE) if (a) NULL else `my var` |> sum()\nr"(raw "q")"; x %in% y',
  js: 'const re = /a[/]b/g; let s = `t ${1}`; // c\n/* x\ny */ function f(a) { return a / 2 / 3 }',
  css: '/* c */ a:hover > b, .c { color: #fff !important; margin: -1.5em 0; --x: 1px; content: "a" } @media (x) {}',
  html: '<!-- c --><div class="a" id=b>x &amp; y</div><style>p { color: red }</style><script>let a = 1 < 2</script>',
  md: '---\ntitle: "x"\n---\n\n# Head\n\n**b** and *i* and `c` [l](u)\n\n```r\nx <- 1\n```\n\n- item\n',
  yaml: '# c\nkey: value\nlist:\n  - "a"\n  - 1\n  - true\nnull_key: ~',
  tex: '\\begin{document} % c\n$x^2$ \\section{A}\n\\end{document}',
  bash: 'if [ -f "$x" ]; then echo ${y} # c\nfi',
  json: '{"a": [1, 2.5e3, true, null], "b": "c"}',
  diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n ctx',
  sql: "-- c\nSELECT u.id, count(*) AS n, 'it''s' FROM users u WHERE u.age >= 18 /* x */ AND x IS NULL;\nselect 1 from t where a in (1, 2)",
  zzz: 'foo = "str" + 42 // c\nbar(1.5, x) # d'
};

for (const [lang, code] of Object.entries(samples)) {
  test(`${lang}: text is unchanged, markup is balanced`, async ({page}) => {
    const [text, html] = await run(page, lang, code);
    expect(text).toBe(code);
    expect(html).toContain('class="token');
  });
}

test('r: strings hide comments, calls are functions, raw strings', async ({page}) => {
  const t = await toks(page, 'r', samples.r);
  expect(t).toContain('string:"a#b"');
  expect(t).toContain('comment:# note');
  expect(t).toContain('function:c');
  expect(t).toContain('function:sum');
  expect(t).toContain('keyword:function');
  expect(t).toContain('boolean:TRUE');
  expect(t).toContain('constant:NULL');
  expect(t).toContain('variable:`my var`');
  expect(t).toContain('string:r"(raw "q")"');
  expect(t).toContain('operator:%in%');
  expect(t).toContain('number:2L');
});

test('js: regex versus division, template string', async ({page}) => {
  const t = await toks(page, 'js', samples.js);
  expect(t).toContain('regex:/a[/]b/g');
  expect(t).toContain('string:`t ${1}`');
  expect(t).toContain('comment:// c');
  expect(t.filter(x => x.startsWith('regex')).length).toBe(1);
});

test('css: selectors, properties, !important', async ({page}) => {
  const t = await toks(page, 'css', samples.css);
  expect(t).toContain('important:!important');
  expect(t).toContain('property:color');
  expect(t).toContain('atrule:@media');
  expect(t).toContain('number:#fff');
  expect(t).toContain('number:-1.5em');
});

test('html: tags, attributes, embedded css and js', async ({page}) => {
  const t = await toks(page, 'html', samples.html);
  expect(t).toContain('tag:div');
  expect(t).toContain('attr-name:class');
  expect(t).toContain('attr-value:"a"');
  expect(t).toContain('property:color');
  expect(t).toContain('keyword:let');
});

test('html: character references are entities', async ({page}) => {
  const t = await toks(page, 'html', '<p>a &amp; b &#169; &#xA9; &copy; & c; &x</p>');
  expect(t.filter(x => x.startsWith('entity'))).toEqual(
    ['entity:&amp;', 'entity:&#169;', 'entity:&#xA9;', 'entity:&copy;']);
});

test('sql: keywords in any case, strings with doubled quotes, comments', async ({page}) => {
  const t = await toks(page, 'sql', samples.sql);
  for (const k of ['SELECT', 'AS', 'FROM', 'WHERE', 'AND', 'IS', 'select', 'from', 'where', 'in'])
    expect(t).toContain('keyword:' + k);
  expect(t).toContain("string:'it''s'");
  expect(t).toContain('comment:-- c');
  expect(t).toContain('comment:/* x */');
  expect(t).toContain('function:count');
  expect(t).toContain('constant:NULL');
  expect(t).toContain('number:18');
  // names such as u.id and `in (` are not calls or keywords by accident
  expect(t).not.toContain('function:in');
  expect(t).not.toContain('keyword:id');
});

test('removed aliases fall back to generic highlighting', async ({page}) => {
  for (const lang of ['rscript', 'shell', 'htm', 'rmarkdown'])
    expect(await toks(page, lang, 'if (x) y <- "a"')).toEqual(
      ['punctuation:(', 'punctuation:)', 'operator:<-', 'string:"a"']);
});

test('md: headings, emphasis, fenced code in its language, front matter', async ({page}) => {
  const t = await toks(page, 'md', samples.md);
  expect(t).toContain('important:# Head');
  expect(t).toContain('bold:**b**');
  expect(t).toContain('italic:*i*');
  expect(t).toContain('string:`c`');
  expect(t).toContain('operator:<-');
  expect(t).toContain('atrule:title');
});

test('md: text is kept for a fence closed by a longer one at the end', async ({page}) => {
  const code = '````\n```{r}\n1 + 1\n```\n````\n';
  expect((await run(page, 'md', code))[0]).toBe(code);
});

test('unknown language: strings, numbers, operators, comments only', async ({page}) => {
  const t = await toks(page, 'zzz', samples.zzz);
  expect(t).toContain('string:"str"');
  expect(t).toContain('number:42');
  expect(t).toContain('number:1.5');
  expect(t).toContain('operator:+');
  expect(t).toContain('comment:// c');
  expect(t).toContain('comment:# d');
  expect(t.some(x => x.startsWith('keyword'))).toBe(false);
});

test('plain text and already highlighted blocks are left alone', async ({page}) => {
  const [, h1] = await run(page, 'text', 'a "b" 1');
  expect(h1).not.toContain('token');
  // markup-like code is text, not elements
  const [text] = await run(page, 'r', '<b>x</b> <- 1');
  expect(text).toBe('<b>x</b> <- 1');
  expect(await page.$$('#c b')).toHaveLength(0);
});

// extension API
const withExt = async (page, body, scripts) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hl-')), 'x.html');
  fs.writeFileSync(file, `<!DOCTYPE html><meta charset="utf-8">${body}
<script src="file://${root}/js/prism-lite.js"></script>${scripts}`);
  await page.goto('file://' + file);
};
const tokensOf = (page, id) => page.$$eval(`#${id} .token`, els => els.map(e => e.className.replace('token ', '') + ':' + e.textContent));

test('register(): new language and alias, rules with their own capture groups, flags', async ({page}) => {
  await withExt(page, '<pre><code id="a" class="language-foo">Let x = "s" ;; 12</code></pre><pre><code id="b" class="language-fo">let y</code></pre>', `<script>
PrismLite.register('foo', [
  ['keyword', '\\\\b(let|var)\\\\b'],             // a capture group of its own
  ['string', '(["\\'])(?:\\\\\\\\.|(?!\\\\1).)*\\\\1'],  // and a backreference
  ['number', PrismLite.util.NUM],
  ['punctuation', ';+']
], {alias: ['fo'], flags: 'i'});
</script>`);
  expect(await tokensOf(page, 'a')).toEqual(['keyword:Let', 'string:"s"', 'punctuation:;;', 'number:12']);
  expect(await tokensOf(page, 'b')).toEqual(['keyword:let']);
  expect(await page.$eval('#a', e => e.textContent)).toBe('Let x = "s" ;; 12');
});

test('register(): a late registration redoes blocks that got generic highlighting', async ({page}) => {
  await withExt(page, '<pre><code id="a" class="language-foo">let x</code></pre>', '');
  expect(await tokensOf(page, 'a')).toEqual([]);
  await page.evaluate(() => PrismLite.register('foo', [['keyword', '\\blet\\b']]));
  expect(await tokensOf(page, 'a')).toEqual(['keyword:let']);
  // and it does not touch other languages or plain blocks
  expect(await page.$eval('#a', e => e.textContent)).toBe('let x');
});

test('register(): a bad regex is skipped with a warning, not thrown', async ({page}) => {
  const warns = [];
  page.on('console', m => m.type() === 'warning' && warns.push(m.text()));
  await withExt(page, '<pre><code id="a" class="language-foo">let "x"</code></pre>',
    `<script>PrismLite.register('foo', [['keyword', '(unclosed']]);</script>`);
  expect(await tokensOf(page, 'a')).toEqual(['string:"x"']);
  expect(warns.join()).toContain('PrismLite');
});
