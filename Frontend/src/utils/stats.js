// Thấp nhất / trung bình / cao nhất của một chỉ số trong danh sách mẫu
export function summarize(rows, key) {
  if (!rows.length) return { min: 0, avg: 0, max: 0 };
  const values = rows.map((r) => r[key]);
  const sum = values.reduce((a, b) => a + b, 0);
  return { min: Math.min(...values), avg: sum / values.length, max: Math.max(...values) };
}
