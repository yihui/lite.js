/* lt-plot.js — inline graphics cells for lt tables (error bars, sparklines,
 * dot plots, …).
 * Registers cell renderers on LT.cells; the core runtime (lt.js) consults them
 * while building the <table>, so a plot draws for every render path (static,
 * Node-baked, and the interactive per-page rebuild) with no plot code in core.
 * This file must run before lt.js: core reads LT.cells when it drains the queue
 * (linked <script defer> keeps document order; inline scripts run in order too).
 */
(root => {
  "use strict";
  const LT = root.LT || (root.LT = {}), cells = LT.cells || (LT.cells = {});
  if (cells.errorbar) return;  // duplicate inclusion is a no-op

  // Horizontal padding (px) left/right inside an error-bar SVG, so points,
  // bars, and axis ticks never sit flush against the cell edge.
  const EB_PAD = 4;
  // Axis tick-label font size (px); also drives how many ticks fit (see below)
  // and must match the font-size for `.lt-eb-axis text` in lt-plot.css.
  const EB_AXIS_FONT = 11;

  // Auto-fit: cfg.fit is a CSS width (--fw), cfg.floor the min px (--w). The
  // resizer (bottom) remeasures and redraws at the real px, so marks stay crisp.
  const fitCls = cfg => cfg.fit ? " lt-fit" : "",
        fitDecl = cfg => cfg.fit ? `--w:${cfg.floor}px;--fw:${cfg.fit}` : "",
        fitStyle = cfg => cfg.fit ? ` style="${fitDecl(cfg)}"` : "";
  // Shared cfg fields: coord width (op._w once the resizer measured it, else the
  // fixed/floor px `dflt`), the CSS width, and the floor.
  const fitCfg = (op, dflt) => {
    const floor = op.width || dflt;
    return { width: op._w || floor, fit: op.fit, floor };
  };

  // "Nice" axis ticks for [lo, hi] (~n of them), à la base R's pretty(): snap
  // the step to 1/2/5 × 10^k so labels are round numbers. Returns tick values
  // rounded to the step's own precision (so no float noise like 0.30000001).
  function niceTicks(lo, hi, n = 5) {
    if (!(hi > lo)) return [lo];
    const niceNum = (x, round) => {
      const e = Math.floor(Math.log10(x)), f = x / 10 ** e,
            nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10)
                       : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
      return nf * 10 ** e;
    };
    const d = niceNum(niceNum(hi - lo, false) / (n - 1), true),
          dec = Math.max(0, -Math.floor(Math.log10(d))), ticks = [];
    // stay within [lo, hi]: a tick past hi would be clamped onto the right edge
    // (see ebX), bunching the last gap. The small tolerance only absorbs the
    // float drift of landing exactly on hi.
    for (let v = Math.ceil(lo / d) * d; v <= hi + d * 1e-9; v += d)
      ticks.push(+v.toFixed(dec));
    return ticks;
  }

  // How many axis ticks fit without the labels crowding: budget each label at
  // ~0.6em per char (its widest value is at one of the ends) plus a one-em gap.
  function nAxisTicks(eb) {
    const inner = eb.width - 2 * EB_PAD,
          chars = Math.max(String(eb.min).length, String(eb.max).length),
          per = chars * EB_AXIS_FONT * 0.6 + EB_AXIS_FONT;
    return Math.max(2, Math.min(8, Math.floor(inner / per) + 1));
  }
  // Map a value to an x pixel on an error-bar's shared [min,max] scale: fit the
  // scale into [EB_PAD, W - EB_PAD], clamp into that range (a degenerate scale
  // centers), and round to 0.1px so coords stay short and free of float noise.
  const ebX = (eb, v) => {
    const inner = eb.width - 2 * EB_PAD, span = eb.max - eb.min,
          p = span > 0 ? EB_PAD + (v - eb.min) / span * inner : eb.width / 2;
    return Math.round(Math.max(EB_PAD, Math.min(eb.width - EB_PAD, p)) * 10) / 10;
  };

  // y pixel of series i of n within a cell of height H: a lone series on the
  // mid-line, else evenly spaced tracks so stacked points/bars do not overlap.
  // Shared by the stacked error bar and the staggered dot plot.
  const stackY = (i, n, H) => n <= 1 ? H / 2 : Math.round((i + 1) / (n + 1) * H);

  // Inline SVG for an error-bar cell: one series per triple (value, lower,
  // upper) — a point at the estimate and a horizontal bar (with end caps) from
  // the lower to the upper bound, on the column's shared [min,max] scale. A
  // single series sits on the mid-line; several series stack at evenly spaced
  // rows, each optionally colored (see the footer legend). Only the numbers are
  // shipped in the spec; the SVG is built here at render time, so an
  // interactive table (which rebuilds <tbody> from spec._viewRows) draws it
  // only for the rows on the current page. `u` carries the core helpers
  // (esc/isNum/str) passed in by lt.js.
  function svgErrorbar(eb, data, r, u) {
    const num = k => { const v = data[k]?.[r - 1]; return u.isNum(v) ? v : null; };
    const H = eb.height, n = eb.cols.length, x = v => ebX(eb, v),
          yOf = i => stackY(i, n, H),  // one track per series, stacked
          cap = Math.min(3, (H / n - 1) / 2);  // half-height of the end caps
    let s = `<svg class="lt-eb${fitCls(eb)}" width="${eb.width}" height="${H}"${fitStyle(eb)}>`;
    if (eb.ref != null)
      s += `<line class="lt-eb-ref" x1="${x(eb.ref)}" y1="0" x2="${x(eb.ref)}" y2="${H}"/>`;
    const titles = [];
    eb.cols.forEach((c, i) => {
      const est = num(c), lo = num(eb.los[i]), hi = num(eb.his[i]);
      if (est == null && lo == null && hi == null) return;
      const y = yOf(i), col = eb.colors?.[i],
            // per-series color via stroke=/fill= attributes; the stylesheet only
            // defaults series that lack them (:not([stroke])/:not([fill])), so a
            // color shows but a user CSS rule can still override it
            st = col ? ` stroke="${u.esc(col)}"` : "",
            fl = col ? ` fill="${u.esc(col)}"` : "";
      if (lo != null && hi != null) {
        // horizontal bar plus short vertical end caps at both ends
        const xl = x(lo), xh = x(hi);
        s += `<line${st} x1="${xl}" y1="${y}" x2="${xh}" y2="${y}"/>` +
             `<line${st} x1="${xl}" y1="${y - cap}" x2="${xl}" y2="${y + cap}"/>` +
             `<line${st} x1="${xh}" y1="${y - cap}" x2="${xh}" y2="${y + cap}"/>`;
      }
      if (est != null) s += `<circle${fl} cx="${x(est)}" cy="${y}" r="3"/>`;
      const ci = lo != null && hi != null ? ` (${u.str(lo)}, ${u.str(hi)})` : "";
      titles.push((eb.labels?.[i] ? eb.labels[i] + ": " : "") +
                  (est != null ? u.str(est) : "") + ci);
    });
    if (!titles.length) return "";
    return s + `<title>${u.esc(titles.join("\n"))}</title></svg>`;
  }

  // Full-cell background layer of faint vertical gridlines at the shared tick
  // positions. Its width is fixed in px (matching the plot SVG, so the lines
  // stay aligned with the bars), while height="100%" + preserveAspectRatio
  // "none" stretch it to fill the whole <td> vertically — so the lines run
  // continuously across the cell's (zeroed) padding and line up row-to-row. A
  // per-cell fixed-height SVG could not: the cell padding leaves a gap it can't
  // reach. Scaling only the vertical axis is harmless for vertical lines.
  function svgGrid(eb) {
    let s = `<svg class="lt-eb-grid-bg${fitCls(eb)}" width="${eb.width}" height="100%" ` +
            `viewBox="0 0 ${eb.width} 10" preserveAspectRatio="none">`;
    for (const t of eb.ticks)
      s += `<line x1="${ebX(eb, t)}" y1="0" x2="${ebX(eb, t)}" y2="10"/>`;
    return s + `</svg>`;
  }

  // A shared horizontal axis for an error-bar column, drawn once in the footer:
  // a baseline with a tick mark + label at each nice tick (eb.ticks), and an
  // optional caption (eb.axisLabel) centered below. `overflow="visible"` lets a
  // caption slightly wider than the narrow column spill rather than clip.
  function svgAxis(eb, u) {
    const W = eb.width, lbl = eb.axisLabel, H = lbl ? 32 : 18, x = v => ebX(eb, v);
    let s = `<svg class="lt-eb-axis${fitCls(eb)}" width="${W}" height="${H}" overflow="visible"${fitStyle(eb)}>` +
            `<line x1="${EB_PAD}" y1="1" x2="${W - EB_PAD}" y2="1"/>`;
    for (const t of (eb.ticks || [])) {
      const xt = x(t),
            anchor = xt <= EB_PAD ? "start" : xt >= W - EB_PAD ? "end" : "middle";
      s += `<line x1="${xt}" y1="0" x2="${xt}" y2="4"/>` +
           `<text x="${xt}" y="15" text-anchor="${anchor}">${u.esc(u.str(t))}</text>`;
    }
    if (lbl)
      s += `<text class="lt-eb-axis-label" x="${W / 2}" y="${H - 4}" text-anchor="middle">${u.esc(lbl)}</text>`;
    return s + `</svg>`;
  }

  // Build an axis-capable plot renderer (error bar, dot plot) from its per-cell
  // SVG drawer -- all they differ by. The plot draws into the `into` column (or
  // the first of `columns`), on a scale shared across the column; `extra(op)`
  // adds the renderer-specific config (bounds for the error bar, stagger for
  // the dot plot).
  const axisPlot = (extra, draw) => ({
    resolve(op) {
      const cols = op.columns || [], v = op.into || cols[0];
      if (!v || !cols.length) return {};
      const cfg = {
        col: v, cols, colors: op.colors, labels: op.labels,
        min: op.min, max: op.max, axisLabel: op.axis_label,
        height: op.height || 16, ...fitCfg(op, 160), ...extra(op)
      };
      // When an axis is requested, the same nice ticks drive both the footer
      // axis and the faint in-cell gridlines; their count is capped so the
      // labels do not crowd at the given width.
      if (op.axis) cfg.ticks = niceTicks(cfg.min, cfg.max, nAxisTicks(cfg));
      return { [v]: cfg };
    },
    // lt-eb-cell zeroes the cell's vertical padding so the stretched gridline
    // background can run unbroken from one row to the next.
    cellClass: cfg => cfg.ticks ? "lt-eb-cell" : "",
    cell: (cfg, data, r, u) => (cfg.ticks ? svgGrid(cfg) : "") + draw(cfg, data, r, u),
    foot: (cfg, u) => (cfg.ticks ? svgAxis(cfg, u) : "") + legend(cfg, u)
  });

  // Error-bar cell renderer. columns = [value, lower, upper] per series; the
  // plot draws a point-and-bar per series on the column's shared scale.
  cells.errorbar = axisPlot(
    op => ({ los: op.lowers || [], his: op.uppers || [], ref: op.ref }),
    svgErrorbar
  );

  // Padding (px) inside a sparkline SVG, so the line/bars never touch the edge.
  const SP_PAD = 2;
  const round1 = n => Math.round(n * 10) / 10;  // 0.1px, to keep coords short
  const q = v => `"${v}"`;  // double-quote an SVG attribute value

  // A row's series for a sparkline: when a single column is named and its cell
  // is an array (a list-column), that array is the series; otherwise each named
  // column contributes one point, read left to right across the row. Non-finite
  // entries become null (a gap in the line, a skipped bar). `u` carries the core
  // helpers (esc/isNum/str).
  function spSeries(sp, data, r, u) {
    const cell = data[sp.cols[0]]?.[r - 1],
          raw = sp.cols.length === 1 && Array.isArray(cell)
            ? cell : sp.cols.map(c => data[c]?.[r - 1]);
    return raw.map(v => u.isNum(v) ? +v : null);
  }

  // Inline SVG sparkline (line or bar) for a cell. The series is scaled to the
  // shared [min,max] when the spec gives one, else to the row's own finite
  // range; a flat series sits on the mid-line. Points are spaced evenly across
  // the width. Nulls break the line into separate subpaths (and drop bars).
  function svgSparkline(sp, data, r, u) {
    const vals = spSeries(sp, data, r, u), fin = vals.filter(v => v != null);
    if (!fin.length) return "";
    const W = sp.width, H = sp.height, n = vals.length,
          lo = sp.min != null ? sp.min : Math.min(...fin),
          hi = sp.max != null ? sp.max : Math.max(...fin);
    const xAt = i => round1(n > 1 ? SP_PAD + i / (n - 1) * (W - 2 * SP_PAD) : W / 2),
          yAt = v => round1(hi > lo
            ? H - SP_PAD - (v - lo) / (hi - lo) * (H - 2 * SP_PAD) : H / 2);
    // line/bars inherit `currentColor`, so one color prop styles either
    const sv = [fitDecl(sp), sp.color && `color:${u.esc(sp.color)}`]
      .filter(Boolean).join(";");
    const style = sv ? ` style="${sv}"` : "";
    let body;
    if (sp.kind === "bar") {
      // one equal-width slot per value; each bar is centered in its slot and
      // grows from a zero baseline when the scale straddles 0, else the bottom.
      const slot = (W - 2 * SP_PAD) / n, bw = round1(Math.max(1, slot * 0.8)),
            base = yAt(lo < 0 && hi > 0 ? 0 : lo);
      body = vals.map((v, i) => {
        if (v == null) return "";
        const yv = yAt(v), x = round1(SP_PAD + i * slot + (slot - bw) / 2);
        return `<rect class="lt-spark-bar" x=${q(x)} y=${q(Math.min(yv, base))} ` +
               `width=${q(bw)} height=${q(Math.max(1, Math.abs(base - yv)))}/>`;
      }).join("");
    } else {
      let d = "", pen = false;
      vals.forEach((v, i) => {
        if (v == null) { pen = false; return; }
        d += `${pen ? "L" : "M"}${xAt(i)} ${yAt(v)}`;
        pen = true;
      });
      body = `<path class="lt-spark-line" d="${d}"/>`;
    }
    return `<svg class="lt-spark${fitCls(sp)}" width="${W}" height="${H}"${style}>${body}` +
           `<title>${u.esc(fin.map(u.str).join(", "))}</title></svg>`;
  }

  // Sparkline cell renderer. columns = one list-column, or several numeric
  // columns read across the row; the plot is drawn in the first column's cells.
  cells.sparkline = {
    resolve(op) {
      const cols = op.columns || [], v = cols[0];
      if (!v) return {};
      return { [v]: {
        col: v, cols, kind: op.kind, min: op.min, max: op.max, color: op.color,
        height: op.height || 20, ...fitCfg(op, 120)
      } };
    },
    cell: (sp, data, r, u) => svgSparkline(sp, data, r, u)
  };

  // Inline SVG dot plot for a cell: one dot per column, each at its value on the
  // column group's shared [min,max] scale, so a row with N columns shows N dots
  // laid out horizontally on one baseline. When colors are given, each dot takes
  // its column's color (see legend() for the key). Non-finite values draw no
  // dot. Reuses the error-bar scale (ebX) and padding.
  function svgDotplot(dp, data, r, u) {
    const H = dp.height, n = dp.cols.length, x = v => ebX(dp, v),
          // all dots on the mid-line by default; stagger puts each column on its
          // own track (like the stacked error bar) so near-equal values do not
          // overlap — the vertical position is cosmetic, only x carries a value
          yOf = i => dp.stagger ? stackY(i, n, H) : H / 2;
    let s = `<svg class="lt-dot${fitCls(dp)}" width="${dp.width}" height="${H}"${fitStyle(dp)}>`;
    const titles = [];
    dp.cols.forEach((c, i) => {
      const v = data[c]?.[r - 1];
      if (!u.isNum(v)) return;
      // the per-column color is a fill= presentation attribute; the stylesheet
      // only defaults dots that lack it (:not([fill])), so this color shows but
      // user CSS (a stylesheet rule) can still override it
      const col = dp.colors?.[i], fl = col ? ` fill="${u.esc(col)}"` : "";
      s += `<circle${fl} cx="${x(v)}" cy="${yOf(i)}" r="3"/>`;
      titles.push((dp.labels?.[i] ? dp.labels[i] + ": " : "") + u.str(v));
    });
    return s + `<title>${u.esc(titles.join("\n"))}</title></svg>`;
  }

  // Color key for a colored dot/error-bar plot, drawn once in the footer under
  // the axis: a swatch + label per series. "" when the plot is monochrome (no
  // colors). Shared by the dot-plot and error-bar renderers (cfg.cols/colors/
  // labels have the same shape in both).
  function legend(cfg, u) {
    if (!cfg.colors) return "";
    const items = cfg.cols.map((c, i) =>
      `<span><i style="background:${u.esc(cfg.colors[i])}"></i>` +
      `${u.esc(cfg.labels?.[i] ?? c)}</span>`).join("");
    return `<div class="lt-plot-legend">${items}</div>`;
  }

  // Dot-plot cell renderer. columns = the value columns (one dot each); the
  // plot draws on a scale shared across them. Shares the error-bar axis/gridline
  // machinery via axisPlot (ticks, svgGrid, svgAxis, lt-eb-cell, legend).
  cells.dotplot = axisPlot(op => ({ stagger: op.stagger }), svgDotplot);

  // Resizer for fit plots: on each change of a fit column's width, store the new
  // px on the op (op._w) and redraw. We observe the column's header cell (core
  // hands us one per column in tbl._ltHead) -- <thead> survives the <tbody> swaps
  // of sort/filter/paging, and it changes exactly when the column does (resize
  // drag, hidden column, reflow), unlike the wrapper. We draw at the plot SVG's
  // own width: width:100%, so it reports the px it fills and carries no intrinsic
  // width, so a redraw never resizes the column just measured (no loop). Redraws
  // coalesce into one frame; refresh(false) keeps the current view and page.
  (LT.onMount || (LT.onMount = [])).push((tbl, spec) => {
    const fitOps = (spec.ops || []).filter(o => cells[o.type] && o.fit);
    if (!fitOps.length || !root.ResizeObserver || !tbl._ltHead) return;
    const redraw = () => (tbl._lt ? tbl._lt.refresh(false) : LT.refresh(tbl));
    let raf;
    const probes = fitOps  // [op, header cell], fit columns core knows
      .map(op => [op, tbl._ltHead[op.into || op.columns?.[0]]])
      .filter(([, th]) => th);
    const measure = () => {
      let changed = false;
      for (const [op, th] of probes) {
        const svg = tbl.querySelector("tbody tr:not(.lt-row-group)")
          ?.cells[th.cellIndex]?.querySelector("svg");
        if (!svg) continue;
        const w = Math.round(svg.getBoundingClientRect().width);
        if (w > 0 && w !== op._w) { op._w = w; changed = true; }
      }
      if (changed) { cancelAnimationFrame(raf); raf = requestAnimationFrame(redraw); }
    };
    const ro = new ResizeObserver(measure);
    for (const [, th] of probes) ro.observe(th);
    measure();  // deterministic initial fit; observer handles later changes
  });

  // If core already built a table before this module loaded (a doc where an
  // earlier plain table pulled in lt.js first, so its renderer was missing),
  // re-render any mounted table that uses a renderer we just registered. Tables
  // mounted after us need no help — the renderer is already in place. No-op
  // when nothing is mounted yet (we loaded first) or outside a browser (the
  // Node bake controls load order).
  const doc = root.document;
  if (doc) for (const tbl of doc.querySelectorAll(".lt-table")) {
    if ((tbl._ltSpec?.ops || []).some(o => cells[o.type])) LT.refresh?.(tbl);
  }
})(window);
