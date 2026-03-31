// support columnar data format in G2
G2.register('data.column', (options) => {
  const { value } = options;
  return async () => {
    let d = value;
    // handle URL strings if necessary
    if (typeof value === 'string') {
      const resp = await fetch(value);
      d = await resp.json();
    }
    const keys = Object.keys(d);
    if (keys.length === 0) return [];
    // convert to row-based data
    return d[keys[0]].map((_, i) =>
      keys.reduce((row, key) => (row[key] = d[key][i], row), {})
    );
  };
});
