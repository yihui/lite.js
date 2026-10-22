// render <pre class="pele"> with Pele (https://pele.run), which must be loaded first
document.querySelectorAll('pre.pele').forEach(el => pele.mount(el, el.textContent));
