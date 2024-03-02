This repo contains miscellaneous tools and utilities written in JavaScript. They
are published as an NPM package
[`@xiee/utils`](https://www.npmjs.com/package/@xiee/utils). You can load them
via [jsdelivr.com](https://www.jsdelivr.com), e.g.,

``` html
<script src="https://cdn.jsdelivr.net/npm/@xiee/utils/js/faq.min.js" defer></script>
<link href="https://cdn.jsdelivr.net/npm/@xiee/utils/css/faq.min.css" rel="stylesheet">
```

See the full documentation at <https://yihui.org/en/2018/11/md-js-tricks/>.

## alt-title.js

Add the `title` attribute to `<img>` if the attribute does not exist. The value
of the attribute is taken from the `alt` attribute. It modifies

``` html
<img src="foo.png" alt="an image" />
```

to

``` html
<img src="foo.png" alt="an image" title="an image" />
```

Then the image will have a tooltip on mouseover.

## center-img.js

Center `<img>`, `<video>`, and `<object>` on a page if they are the only child
of their parent element.

## code-lang.js

Add the `language-` prefix to the class name of `<code>` inside `<pre>` when
appropriate, so that syntax highlighters such as prism.js can work.

## copy-button.js

Add a copy button to any element (by default, `<pre>` code blocks) on a page.
See [this post](https://yihui.org/en/2023/09/copy-button/) for details.

## dl-fieldset.js

Convert definition lists `<dl>` to `<fieldset>`. See more information [in this
post](https://yihui.org/en/2023/11/dl-fieldset/).

## docco-classic.js

Find code blocks on a page and put them in the right column. Other elements will
be placed in the left column.

## external-link.js

If a link of `<a>` does not start with `http://` or `https://`, add the
attribute `target="_blank"` to `<a>` so it opens in a new tab/window.

## faq.js

Turn an ordered list on an HTML page into a collapsible FAQ list. Click on any
question to toggle the visibility of its answer. Or click on the button at the
top-right to expand or collapse all answers. Each FAQ item has an anchor (shown
as the `#` symbol at the end on mouseover) that provides the link to the
specific question.

Note that you will need to load `faq.css` accordingly. See [a more detailed
introduction here](https://yihui.org/en/2021/10/faq-list/).

## fix-footnote.js

Add `[ ]` to footnote numbers and move the return symbols in footnotes.

## fix-toc.js

Fix the table of contents generated by lower versions of Hugo.

## fold-details.js

Move elements into `<details>` so that they can be folded. By default, code
blocks (`<pre>`) are folded. Other elements can also be folded via custom
options. See [this post](https://yihui.org/en/2023/09/code-folding/) for more
information.

## fold-output.js

Click on a code block of the class `language-*` to toggle the visibility of its
siblings on the page before the next `language-*` block. Click while holding the
`Alt` key to toggle siblings of all `language-*` blocks on the page.

## fullwidth.js

Find `<pre>`, `<table>`, and TOC (with ID `TableOfContents`) elements and add
the `fullwidth` class to them if they are too wide, so they can be styled
differently (e.g., [full bleed](https://css-tricks.com/full-bleed/)).

## fuse-search.js

Perform client-side site searching via [Fuse.js](https://www.fusejs.io). See
[this post](https://yihui.org/en/2023/09/fuse-search/) for an application to
Hugo sites.

## hash-notes.js

Convert HTML comments of the form `<!--# comments -->` to
`<span class="hash-note">comments</span>`. If such comments are found, the
document body will gain classes `has-notes` and `hide-notes`. You can use CSS to
style the notes or hide/show them as you wish.

## heading-anchor.js

Add anchor links to all section headings (e.g., `<h2>`) that have nonempty `id`
attributes.

## key-buttons.js

Find keyboard keys in `<code></code>` and convert the tag to `<kbd></kbd>`,
e.g., convert `<code>Ctrl + C</code>` to `<kbd>Ctrl</kbd>` + `<kbd>C</kbd>`.
With `key-buttons.css`, the keys will be styled as boxes with shadows like
buttons. You can learn more details [in this
post](https://yihui.org/en/2023/02/key-buttons/).

## load-highlight.js

Disable highlight.js's auto language detection, and then apply highlighting.
This requires highlight.js to be loaded in advance.

## math-code.js

Write LaTeX math expressions (`$\alpha$`) in `<code></code>` in HTML or a pair of
backticks in Markdown (which will be rendered to `<code>` in HTML), and this
script will remove the `<code>` tag, so that MathJax can recognize the math
expressions (by default, MathJax ignores math in `<code>`).

## no-highlight.js

Add the `nohighlight` class to `<code>` in `<pre>` when it does not have a
class, so that highlight.js will not try to syntax highlight the code in it.

## number-captions.js

Number figure and table captions.

## number-sections.js

Find all section headings (`h1` - `h6`) and number them.

## ol-id.js

Add IDs of the form `li-N` to items in ordered lists, where `N` is the index of
a list item. This makes it possible to reference or locate a specific item on a
page by a hash in the URL. If you hold `Alt` and click on an item, you will get
the URL with the hash in the address bar of your browser.

## render-katex.js

Simply run `renderMathInElement(document.body)` to render math expression using
KaTeX's auto-render extension.

## right-quote.js

Right-align a `<blockquote>` footer if the footer is a `<p>` that starts with
the em-dash.

## tabsets.js

Create tabsets from section headings and their content. See [this
post](https://yihui.org/en/2023/10/section-tabsets/) for documentation.

## toc.js

Automatically build a table of contents (TOC) from all section headings.

## toc-highlight.js

Add a class `active` to the TOC item (`<a>`) corresponding to the section
heading that is currently being scrolled into view.
