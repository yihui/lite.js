// number figure and table captions

// config options via data-foo attributes of this <script>:
//   * data-colon: the colon character (':' by default);
//   * data-fig-label: label for figure captions ('Figure ' by default)
//   * data-tab-label: label for table captions ('Table ' by default) 
(d => {
  const cfg = d.currentScript?.dataset, colon = cfg?.colon || ':';
  function NUM(target, label) {
    d.querySelectorAll(target).forEach((el, i) => {
      // do not number it again if already numbered
      el.querySelector('.cap-num') ||
        el.insertAdjacentHTML('afterbegin', `<span class="cap-num">${label}${i + 1}${colon}</span> `);
    });
  }
  NUM('figure > figcaption, .figure > p.caption, .pagesjs-float > .figcaption', cfg?.figLabel || 'Figure ');
  NUM('table > caption', cfg?.tabLabel || 'Table ');
})(document);
