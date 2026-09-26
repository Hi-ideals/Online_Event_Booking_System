/**
 * Builds a "col = $n" SET clause from the defined keys of `fields`.
 * `columnMap` maps API keys to column names, or to a function (paramIndex) => SQL fragment.
 */
export function buildSet(fields, columnMap, startIndex = 0) {
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(columnMap)) {
    if (fields[key] === undefined) continue;
    params.push(fields[key]);
    const n = startIndex + params.length;
    sets.push(typeof column === 'function' ? column(n) : `${column} = $${n}`);
  }
  return { sets, params };
}
