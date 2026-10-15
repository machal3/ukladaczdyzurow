import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pdf, docx, crc32, ttf } from './export.js';

const table = { title: 'Grafik dyżurów — Październik 2026', head: ['Dzień', '', 'OITN', 'PN2', 'PN1'],
  rows: [{ cells: ['1', 'Cz', 'Łucja Żółć', '—', 'Jan (Nowak)'], we: false, mon: false }, { cells: ['5', 'Pn', '', 'Ąę', 'X'], we: true, mon: true }] };
const fonts = { regular: new Uint8Array(readFileSync('fonts/PlusJakartaSans-Regular.ttf')), bold: new Uint8Array(readFileSync('fonts/PlusJakartaSans-Bold.ttf')) };

test('TTF: szerokości z cmap/hmtx, spacja węższa niż M, polskie litery mają glify', () => {
  const f = ttf(fonts.regular);
  assert.ok(f.width(32) > 100 && f.width(32) < f.width(77));
  assert.ok(f.width(0x142) > 100, 'ł'); // nie glif .notdef / zero
  assert.equal(f.width(0x10ffff & 0xffff), f.width(0xffff));
});

test('PDF: xref wskazuje na obiekty, osadzony Plus Jakarta Sans, polskie znaki i nawiasy zakodowane', () => {
  const out = Buffer.from(pdf(table, fonts)).toString('latin1');
  assert.match(out, /^%PDF-1\.4\n/);
  const at = out.indexOf('\nxref\n') + 1, xref = out.slice(at).split('\n').slice(3, 14);
  assert.equal(xref.length, 11);
  xref.forEach((l, i) => assert.equal(out.slice(+l.slice(0, 10)).split('\n')[0], `${i + 1} 0 obj`));
  assert.equal(+out.match(/startxref\n(\d+)/)[1], at);
  assert.match(out, /\/BaseFont \/PlusJakartaSans-Bold/);
  assert.match(out, /\(\\214ucja \\221\\205\\203\\201\) Tj/); // Ł = bajt 128+12 = \214 …
  assert.match(out, /\(Jan \\\(Nowak\\\)\) Tj/);
  for (const m of out.matchAll(/\/Length (\d+)[^>]*>>\nstream\n/g)) assert.equal(out.slice(m.index + m[0].length + +m[1], m.index + m[0].length + +m[1] + 10), '\nendstream');
  assert.ok(out.includes(Buffer.from(fonts.bold).toString('latin1')), 'font osadzony bajt w bajt');
});

test('DOCX: poprawny zip z osadzonym fontem i tabelą w kolejności kolumn', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = docx(table, fonts), v = new DataView(z.buffer), e = z.length - 22;
  assert.equal(v.getUint32(e, true), 0x06054b50);
  assert.equal(v.getUint16(e + 10, true), 9);
  const doc = new TextDecoder().decode(z);
  assert.ok(doc.indexOf('>OITN<') < doc.indexOf('>PN2<') && doc.indexOf('>PN2<') < doc.indexOf('>PN1<'));
  assert.match(doc, />Łucja Żółć</);
  assert.match(doc, /<w:gridSpan w:val="2"\/>/);
  assert.match(doc, /w:ascii="Plus Jakarta Sans"/);
  // odttf: XOR pierwszych 32 bajtów z kluczem przywraca nagłówek TrueType (0x00010000)
  const at = Buffer.from(z).indexOf('word/fonts/font1.odttf') + 'word/fonts/font1.odttf'.length, key = doc.match(/w:fontKey="\{([^}]+)\}"/)[1].replace(/-/g, '');
  const k = key.match(/../g).map((h) => parseInt(h, 16)).reverse();
  assert.deepEqual([...z.subarray(at, at + 4)].map((b, i) => b ^ k[i]), [0, 1, 0, 0]);
});
