import assert from "node:assert/strict";
import test from "node:test";
import { buildCsv } from "../src/lib/csv.ts";

test("buildCsv writes header and row data separated by ;", () => {
  const rows = [
    { name: "Acme", city: "Paris", revenue: 1000 },
    { name: "Foo", city: "Lyon", revenue: 500 },
  ];
  const csv = buildCsv(rows, [
    { label: "Nom", value: (r) => r.name },
    { label: "Ville", value: (r) => r.city },
    { label: "CA", value: (r) => r.revenue },
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Nom;Ville;CA");
  assert.equal(lines[1], "Acme;Paris;1000");
  assert.equal(lines[2], "Foo;Lyon;500");
});

test("buildCsv escapes commas, quotes and newlines", () => {
  const rows = [
    { note: 'Contient ; et "quotes"\nsur 2 lignes', plain: "ok" },
  ];
  const csv = buildCsv(rows, [
    { label: "Note", value: (r) => r.note },
    { label: "Plain", value: (r) => r.plain },
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Note;Plain");
  assert.match(lines[1], /^"Contient ; et ""quotes""/);
  assert.ok(lines[1].endsWith(';ok'));
});

test("buildCsv handles null and undefined values as empty strings", () => {
  const rows: Array<{ x: unknown; y: unknown }> = [
    { x: null, y: undefined },
  ];
  const csv = buildCsv(rows, [
    { label: "X", value: (r) => r.x },
    { label: "Y", value: (r) => r.y },
  ]);
  const lines = csv.split("\r\n");
  assert.equal(lines[1], ";");
});
