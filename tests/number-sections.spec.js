import {test, expect} from '@playwright/test';
import {fixture} from './helper.js';

// parts (h1.part) have their own Roman numerals and do not take chapter numbers
test('number-sections.js numbers parts separately', async ({page}) => {
  const js = new URL('../js/number-sections.js', import.meta.url).href;
  const body = `<article><h1 class="part">A</h1><h1>B</h1><h2>C</h2><h1 class="part">D</h1><h1 class="part unnumbered">E</h1><h1>F</h1></article>
<script src="${js}"></script>`;
  await page.goto(fixture('number-sections', body));
  const nums = await page.evaluate(() => [...document.querySelectorAll('h1, h2')].map(h => h.firstElementChild?.innerText ?? ''));
  expect(nums).toEqual(['I', '1.', '1.1', 'II', '', '2.']);
});
