// support columnar data format in G2
G2.register("data.column", (options) => {
  const { value } = options;
  return async () => {
    let d = value;
    // handle URL strings if necessary
    if (typeof value === "string") {
      const resp = await fetch(value);
      d = await resp.json();
    }
    const keys = Object.keys(d);
    if (keys.length === 0) return [];
    // convert to row-based data
    return d[keys[0]].map((_, i) =>
      keys.reduce((row, key) => ((row[key] = d[key][i]), row), {}),
    );
  };
});

// modify G2 defaults: font sizes, grid opacity, point radius, shapes, and inset
(() => {
  const FONT_SCALE = 4 / 3,
    FONT_RE = /[fF]ontSize$/,
    POINT_RADIUS = 5;

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

  const scaleFontSizes = (obj) => {
    if (!isObj(obj)) return;
    for (const [key, value] of Object.entries(obj)) {
      if (isObj(value)) scaleFontSizes(value);
      else if (typeof value === "number" && FONT_RE.test(key))
        obj[key] = value * FONT_SCALE;
    }
  };

  const patchTheme = (theme) => {
    scaleFontSizes(theme);
    if (
      isObj(theme.legendCategory) &&
      typeof theme.legendCategory.itemMarkerSize === "number"
    )
      theme.legendCategory.itemMarkerSize *= FONT_SCALE;
    if (isObj(theme.point))
      for (const style of Object.values(theme.point))
        if (isObj(style) && typeof style.r === "number")
          style.r = POINT_RADIUS;
    if (isObj(theme.axis)) theme.axis.gridStrokeOpacity = 0.25;
    theme.inset = 16;
    return theme;
  };

  for (const name of ["Light", "Dark", "Classic", "ClassicDark", "Academy"]) {
    const original = G2[name];
    if (typeof original !== "function") continue;
    let cache;
    G2[name] = (...args) => (cache ??= patchTheme(original(...args)));
    // Re-register in G2's internal library so charts pick up the patched theme.
    // The registry key is 'theme.light', 'theme.classicDark', etc.
    const key = "theme." + name[0].toLowerCase() + name.slice(1);
    try {
      G2.register(key, G2[name]);
    } catch (_) {}
  }

  // Patch default point/symbol size. G2's MaybeSize transform hardcodes 3 as
  // the constant visual size for point marks when no explicit size encoding is
  // provided. The theme point.*.r values above are fallbacks that MaybeSize
  // shadows, so we must also replace MaybeSize in each mark's postInference.
  const CustomMaybeSize = () => (I, mark) => {
    if (mark.encode.size !== undefined) return [I, mark];
    const value = [];
    for (const i of I) value[i] = POINT_RADIUS;
    return [
      I,
      { ...mark, encode: { ...mark.encode, size: { type: "column", value, visual: true } } },
    ];
  };
  CustomMaybeSize.props = {};
  const lib = G2.corelib();
  for (const key of ["mark.point", "mark.beeswarm"])
    for (const [i, e] of (lib[key]?.props?.postInference ?? []).entries())
      if (e.type === G2.MaybeSize)
        lib[key].props.postInference[i] = { type: CustomMaybeSize };

  // Reorder point shapes: solid shapes first, then hollow ones.
  for (const key of ["mark.point", "mark.beeswarm"]) {
    const mark = lib[key];
    if (!mark?.props?.shape) continue;
    mark.props.defaultShape = "point";
    const newShape = Object.fromEntries(
      Object.entries(mark.props.shape).sort(([a], [b]) => /^hollow/.test(a) - /^hollow/.test(b))
    );
    mark.props.shape = newShape;
    for (const ch of mark.props.channels || [])
      if (ch.name === "shape") ch.range = Object.keys(newShape);
  }

  // Scale hardcoded label font sizes in composite marks.
  for (const key of ["mark.sankey", "mark.chord", "mark.treemap"]) {
    const orig = lib[key];
    if (typeof orig !== "function") continue;
    const wrapped = function (...args) {
      const result = orig.apply(this, args);
      for (const m of Array.isArray(result) ? result : [result]) {
        if (!Array.isArray(m?.labels)) continue;
        for (const l of m.labels)
          if (typeof l?.fontSize === "number") l.fontSize *= FONT_SCALE;
      }
      return result;
    };
    wrapped.props = orig.props;
    try {
      G2.register(key, wrapped);
    } catch (_) {}
  }
})();
