// minimal regex-based syntax highlighter for <pre><code class="language-*">, emitting the
// Prism token classes that css/prism-xcode.css styles. One alternation regex per language,
// one pass, no nested grammars (except HTML/Markdown embedding other languages). Unknown
// languages get generic highlighting: comments, strings, numbers, operators, punctuation.
(d => {
  const S = String.raw;
  const esc = s => s.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
  const span = (cls, s) => `<span class="token ${cls}">${esc(s)}</span>`;
  // whole words that are not part of a name, a property (x.if) or a slot (x@if)
  const words = s => S`(?<![\w.$@])(?:${s.replace(/ /g, '|')})(?![\w.])`;

  const STR = S`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'`;
  const STRM = S`"(?:\\[^]|[^"\\])*"|'(?:\\[^]|[^'\\])*'`; // multi-line
  const NUM = S`(?<![\w.])(?:0[xX][\da-fA-F]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)[Li]?(?![\w.])`;
  const COMMON = [
    ['string', STR], ['number', NUM],
    ['operator', S`[-+*/%^=<>!&|~?:]+`], ['punctuation', S`[()[\]{},;]`]
  ];
  const c = (...own) => [...own, ...COMMON];
  const CC = ['comment', S`//.*|/\*[^]*?\*/`], HC = ['comment', '#.*'];

  // HTML: a tag as a whole, then split into name, attributes, and punctuation
  const tag = t => t.replace(
    /(<\/?)([^\s>\/]+)|("[^"]*"|'[^']*')|(\/?>|=)|([^\s=<>"'\/]+)/g,
    (_, a, b, s, p, n) => a ? span('punctuation', a) + span('tag', b) :
      s ? span('attr-value', s) : p ? span('punctuation', p) : span('attr-name', n)
  );
  const TAG = S`<\/?[A-Za-z][\w:-]*(?:"[^"]*"|'[^']*'|[^>"'])*>`;
  // <script>/<style>: highlight the body in that language
  const embed = lang => t => {
    const m = /^(<[^>]*>)([^]*?)(<\/[^>]*>)$/.exec(t);
    return tag(m[1]) + hl(m[2], lang) + tag(m[3]);
  };

  // Markdown fenced code: the language is the first word of the info string
  const FENCE = S`(?:\x60{3,}|~{3,})`;
  const fence = t => {
    const m = /^([^\n]*)(?:\n([^]*?))?(\n[ \t]*(?:`{3,}|~{3,})[ \t]*)?$/.exec(t);
    const lang = /^[ \t]*(?:`{3,}|~{3,})[ \t]*\{?\.?([\w+-]+)/.exec(m[1])?.[1];
    return span('punctuation', m[1]) + (m[2] !== undefined ? '\n' + hl(m[2], lang) : '') +
      (m[3] ? span('punctuation', m[3]) : '');
  };

  // f-strings: {expressions} as Python, the rest as string ({{ and single { stay string)
  const pystr = t => !/^[a-zA-Z]*[fF]/.test(t) ? span('string', t) :
    t.replace(/\{\{|\{[^{}]*\}|\{|[^{]+/g, m => m.length > 2 && m[0] == '{' ?
      span('punctuation', '{') + hl(m.slice(1, -1), 'python') + span('punctuation', '}') :
      span('string', m));

  const langs = {
    r: c(HC,
      // raw strings r"(...)", then ordinary strings, which may span lines
      ['string', S`(?<![\w.])[rR]"\([^]*?\)"|(?<![\w.])[rR]'\([^]*?\)'|` + STRM],
      ['variable', S`\x60[^\x60\n]*\x60`],
      ['keyword', words('if else repeat while function for next break in')],
      ['boolean', words('TRUE FALSE')],
      ['constant', words('NULL NA NA_integer_ NA_real_ NA_character_ Inf NaN')],
      ['function', S`(?<![\w.])[A-Za-z.][\w.]*(?=\()`],
      ['operator', S`%[^%\n]*%|[-+*/^=<>!&|~?:@$\\]+`]),
    js: c(CC,
      ['string', S`\x60(?:\\[^]|[^\x60\\])*\x60|` + STR],
      ['regex', S`(?<=(?:^|[=(,:;!&|?{}\[]|\breturn)[ \t]*)/(?![/*])(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\n\\[])+/[a-z]*`],
      ['keyword', words('const let var function return if else for while do switch case break continue new delete typeof instanceof in of class extends import export from default async await try catch finally throw yield this super void with')],
      ['boolean', words('true false')],
      ['constant', words('null undefined NaN Infinity')],
      ['function', S`(?<![\w$])[A-Za-z_$][\w$]*(?=[ \t]*\()`]),
    python: c(HC,
      ['string', S`(?<![\w])[rRbBfFuU]{0,2}(?:"""[^]*?"""|'''[^]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')`, pystr],
      ['atrule', S`@[\w.]+`],
      ['keyword', words('def class return if elif else for while in not and or is import from as with try except finally raise pass break continue lambda yield global nonlocal del assert async await')],
      ['boolean', words('True False')], ['constant', words('None')],
      ['function', S`(?<![\w.])[A-Za-z_]\w*(?=\()`]),
    json: [
      ['property', S`"(?:\\.|[^"\\\n])*"(?=\s*:)`], ['boolean', words('true false')],
      ['constant', words('null')], ['punctuation', S`[:,{}\[\]]`], ['string', STR], ['number', NUM]
    ],
    css: [
      ['comment', S`/\*[^]*?\*/`], ['atrule', S`@[\w-]+`], ['important', S`!\s*important`],
      ['selector', S`[^{}\s;@/(][^{};]*(?=\{)`],
      ['property', S`-{0,2}[a-zA-Z][\w-]*(?=\s*:)`], ['variable', S`--[\w-]+`],
      ['string', STR],
      ['number', S`#[\da-fA-F]{3,8}\b|(?<![\w-])-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?`],
      ['function', S`[\w-]+(?=\()`], ['punctuation', S`[{}():;,]`]
    ],
    html: [
      ['comment', S`<!--[^]*?-->`],
      ['script', S`<script\b[^>]*>[^]*?<\/script>`, embed('js')],
      ['style', S`<style\b[^>]*>[^]*?<\/style>`, embed('css')],
      ['tag', S`<![^>]*>`], ['tag', TAG, tag],
      ['entity', S`&(?:#\d+|#[xX][\da-fA-F]+|[A-Za-z][A-Za-z\d]*);`]
    ],
    yaml: [
      HC, ['punctuation', S`^(?:---|\.\.\.)[ \t]*$|(?<=^[ \t]*)-(?=\s)|[:,\[\]{}]|[|>][+-]?(?=[ \t]*$)`],
      ['atrule', S`(?<=^[ \t-]*)(?:"[^"\n]*"|'[^'\n]*'|[^\s#:'"{}\[\],&*!|>%@\x60-][^\n#:]*?)(?=:(?:\s|$))`],
      ['variable', S`[&*][\w-]+`], ['string', STR],
      ['boolean', words('true false')], ['constant', S`(?<![\w.])(?:null|~)(?![\w.])`],
      ['number', NUM]
    ],
    bash: c(['comment', S`(?<=^|\s)#.*`],
      ['variable', S`\$(?:\w+|\{[^}]*\}|[@*#?$!-])`],
      ['keyword', words('if then else elif fi for in do done while until case esac function return exit local export')],
      ['builtin', words('echo cd pwd source set unset read printf test eval exec alias shift trap')]),
    tex: [
      ['keyword', S`\\(?:[a-zA-Z@]+\*?|[^a-zA-Z])`], ['comment', '%.*'],
      ['variable', S`\$\$[^]*?\$\$|\$[^$\n]*\$`],
      ['builtin', S`(?<=\\(?:begin|end)\{)[^}]+`], ['punctuation', S`[{}\[\]&]`]
    ],
    md: [
      ['yaml', S`(?<![^])---\n[^]*?\n---(?=\n|$)`, t => hl(t, 'yaml')],
      ['fence', S`^[ \t]*${FENCE}[^\n]*[^]*?(?:\n[ \t]*${FENCE}[ \t]*$|(?![^]))`, fence],
      ['important', S`^#{1,6}[ \t].*`], ['comment', S`<!--[^]*?-->`],
      ['string', S`\x60[^\x60\n]+\x60`],
      ['url', S`<[a-z][a-z+.-]*:[^>\s]+>|https?://[^\s)>\]]+`],
      ['tag', S`<\/?[A-Za-z][^>\n]*>`, tag],
      ['url', S`!?\[[^\]\n]*\]\([^)\n]*\)|\[[^\]\n]*\]\[[^\]\n]*\]|^[ \t]*\[[^\]\n]+\]:.*`],
      ['bold', S`\*\*[^*\n]+\*\*|__[^_\n]+__`],
      ['italic', S`\*[^*\s][^*\n]*\*|(?<!\w)_[^_\s][^_\n]*_(?!\w)`],
      ['punctuation', S`^[ \t]*(?:[-*+]|\d+[.)])(?=[ \t])|^[ \t]*>+`]
    ],
    // case-insensitive (see hl())
    sql: [
      ['comment', S`--.*|/\*[^]*?\*/`],
      ['string', S`'(?:''|[^'])*'|"(?:""|[^"])*"`],
      ['variable', S`\x60[^\x60\n]*\x60`], ['number', NUM],
      ['keyword', words('select from where and or not in is like between exists as on join inner outer left right full cross union all distinct group by order having limit offset with case when then else end insert into values update set delete create alter drop table view index if primary key foreign references unique default asc desc')],
      ['builtin', words('int integer bigint real float double decimal numeric char varchar text boolean date time timestamp')],
      ['boolean', words('true false')], ['constant', words('null')],
      ['function', S`(?<![\w.$@])[A-Za-z_]\w*(?=[ \t]*\()`],
      ['operator', S`[-+*/%^=<>!&|~:]+`], ['punctuation', S`[()[\]{},;.]`]
    ],
    diff: [
      ['comment', S`^(?:diff|index|\+\+\+|---) .*`], ['inserted', S`^\+.*`],
      ['deleted', S`^-.*`], ['selector', S`^@@.*`]
    ]
  };
  // unknown languages: also treat //, /* */, and # (SQL: --) comments as comments
  const generic = c(['comment', S`//.*|/\*[^]*?\*/|(?<=^|\s)#.*|(?<=^|\s)--\s.*`]);

  const alias = {
    javascript: 'js', mjs: 'js', ts: 'js', typescript: 'js', markdown: 'md', rmd: 'md',
    qmd: 'md', yml: 'yaml', latex: 'tex', sh: 'bash', zsh: 'bash', py: 'python', xml: 'html', svg: 'html'
  };
  // plain output, and languages with their own renderer
  const none = new Set(['', 'text', 'plain', 'txt', 'output', 'none', 'pele']);

  const cache = new Map();
  const hl = (code, lang = '') => {
    lang = lang.toLowerCase();
    lang = alias[lang] || lang;
    if (none.has(lang)) return esc(code);
    const rules = langs[lang] || generic;
    let re = cache.get(rules);
    if (!re) cache.set(rules, re = new RegExp(
      rules.map(r => `(${r[1]})`).join('|'), lang === 'sql' ? 'gmi' : 'gm'
    ));
    let out = '', pos = 0, m;
    // lastIndex is reset every time, as a handler may use the regex again (md in md)
    for (; re.lastIndex = pos, m = re.exec(code);) {
      if (!m[0]) { out += esc(code.slice(pos, m.index + 1)); pos = m.index + 1; continue; }
      let i = 1;
      while (m[i] === undefined) i++;
      const [cls, , fn] = rules[i - 1];
      out += esc(code.slice(pos, m.index)) + (fn ? fn(m[0]) : span(cls, m[0]));
      pos = m.index + m[0].length;
    }
    return out + esc(code.slice(pos));
  };

  const re = /(?:^|\s)lang(?:uage)?-([\w+-]+)/;
  d.querySelectorAll('pre > code').forEach(code => {
    const m = re.exec(code.className + ' ' + code.parentElement.className);
    // no language, or already highlighted
    if (!m || code.querySelector('.token')) return;
    code.classList.add('language-' + m[1]);
    code.innerHTML = hl(code.textContent, m[1]);
  });
})(document);
