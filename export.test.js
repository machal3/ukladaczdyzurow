import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdf, docx, crc32 } from './export.js';

const table = { title: 'Grafik dyżurów — Październik 2026', head: ['Dzień', '', 'OITN', 'PN2', 'PN1'],
  rows: [{ cells: ['1', 'Cz', 'Łucja Żółć', '—', 'Jan (Nowak)'], we: false, mon: false }, { cells: ['5', 'Pn', '', 'Ąę', 'X'], we: true, mon: true }] };

test('PDF: czysty ASCII, xref wskazuje na obiekty, polskie znaki i nawiasy zakodowane', () => {
  const out = pdf(table);
  assert.match(out, /^%PDF-1\.4\n/);
  assert.ok(/^[\x20-\x7e\n]*$/.test(out), 'tylko ASCII, więc offsety = długość tekstu');
  const at = out.indexOf('\nxref\n') + 1, xref = out.slice(at).split('\n').slice(3, 10);
  xref.forEach((l, i) => assert.equal(out.slice(+l.slice(0, 10)).split('\n')[0], `${i + 1} 0 obj`));
  assert.equal(+out.match(/startxref\n(\d+)/)[1], at);
  assert.match(out, /\(\\214ucja \\221\\205\\203\\201\) Tj/); // Ł = bajt 128+12 = \214 …
  assert.match(out, /\(Jan \\\(Nowak\\\)\) Tj/);
  const len = +out.match(/\/Length (\d+)/)[1], s = out.indexOf('stream\n') + 7;
  assert.equal(out.slice(s + len, s + len + 10), '\nendstream');
});

test('DOCX: poprawny zip z trzema częściami i tabelą w kolejności kolumn', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = docx(table), v = new DataView(z.buffer), e = z.length - 22;
  assert.equal(v.getUint32(e, true), 0x06054b50);
  assert.equal(v.getUint16(e + 10, true), 3);
  const doc = new TextDecoder().decode(z);
  assert.ok(doc.indexOf('>OITN<') < doc.indexOf('>PN2<') && doc.indexOf('>PN2<') < doc.indexOf('>PN1<'));
  assert.match(doc, />Łucja Żółć</);
  assert.match(doc, /<w:gridSpan w:val="2"\/>/);
});
