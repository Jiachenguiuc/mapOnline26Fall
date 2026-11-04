/* Exact one-dimensional Jenks classification: minimum within-class squared error. */
window.naturalBreaks = function (input, classes = 3) {
  const values = input.filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return [];
  const n = values.length, k = Math.min(classes, new Set(values).size);
  const sums = [0], squares = [0];
  values.forEach((v, i) => { sums.push(sums[i] + v); squares.push(squares[i] + v * v); });
  const dp = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity));
  const split = Array.from({ length: k + 1 }, () => Array(n + 1).fill(0));
  dp[0][0] = 0;
  for (let c = 1; c <= k; c++) for (let end = c; end <= n; end++) {
    for (let start = c - 1; start < end; start++) {
      if (start > 0 && values[start] === values[start - 1]) continue;
      const count = end - start, sum = sums[end] - sums[start];
      const cost = dp[c - 1][start] + Math.max(0, squares[end] - squares[start] - sum * sum / count);
      if (cost < dp[c][end]) { dp[c][end] = cost; split[c][end] = start; }
    }
  }
  const breaks = [];
  let end = n;
  for (let c = k; c > 0; c--) { breaks.unshift(values[end - 1]); end = split[c][end]; }
  return breaks;
};
