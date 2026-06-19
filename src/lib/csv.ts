function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",;\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv<T>(rows: T[], columns: Array<{ label: string; value: (row: T) => unknown }>): string {
  const header = columns.map((col) => escapeCell(col.label)).join(";");
  const lines = rows.map((row) =>
    columns.map((col) => escapeCell(col.value(row))).join(";"),
  );
  return [header, ...lines].join("\r\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
