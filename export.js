// Eksport grafiku do PDF i Word .docx bez bibliotek. Wejście: { title, head: [...], rows: [{ cells: [...], bad, mon }] },
// bad = gównianość dnia 0–3 → szare tło wiersza (SHADE, te same odcienie co w wydruku, style.css);
// dwie pierwsze kolumny wąskie (dzień, dzień tygodnia), reszta równa. Jedna strona A4 pionowo, jak wydruk.

// Krój jak w wydruku (Plus Jakarta Sans, fonts/*.ttf), osadzony w obu formatach; fonts = { regular, bold } jako Uint8Array.
// PDF: osadzony TrueType + własne kodowanie dla polskich znaków (ósemkowe \ooo); tekst ASCII, pliki fontów jako bajty 0–255
const PL = { ą: 'aogonek', ć: 'cacute', ę: 'eogonek', ł: 'lslash', ń: 'nacute', ó: 'oacute', ś: 'sacute', ź: 'zacute', ż: 'zdotaccent',
  Ą: 'Aogonek', Ć: 'Cacute', Ę: 'Eogonek', Ł: 'Lslash', Ń: 'Nacute', Ó: 'Oacute', Ś: 'Sacute', Ź: 'Zacute', Ż: 'Zdotaccent', '—': 'emdash' };
export const SHADE = [null, 0.93, 0.86, 0.78]; // szarość tła wg gównianości: Zwykły bez tła, Słaby (So/Nd), Gówniany, Tragiczny
const hex = (g) => Math.round(g * 255).toString(16).toUpperCase().padStart(2, '0').repeat(3);
const CODES = Object.keys(PL); // bajty 128, 129, …
const pdfText = (s) => [...s].map((c) => '()\\'.includes(c) ? '\\' + c : c >= ' ' && c <= '~' ? c :
  CODES.includes(c) ? '\\' + (128 + CODES.indexOf(c)).toString(8) : '?').join('');
// minimalny odczyt TTF: szerokości znaków (cmap 3,1 format 4 → hmtx) i metryki do FontDescriptor, w 1/1000 em
export function ttf(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), t = {};
  for (let i = 0; i < v.getUint16(4); i++) t[String.fromCharCode(...bytes.subarray(12 + 16 * i, 16 + 16 * i))] = v.getUint32(20 + 16 * i);
  const em = v.getUint16(t.head + 18), nh = v.getUint16(t.hhea + 34), s = (x) => Math.round(x * 1000 / em);
  let sub = 0;
  for (let i = 0; i < v.getUint16(t.cmap + 2); i++) { const r = t.cmap + 4 + 8 * i; if (v.getUint16(r) === 3 && v.getUint16(r + 2) === 1) sub = t.cmap + v.getUint32(r + 4); }
  const seg = v.getUint16(sub + 6) / 2, ends = sub + 14, starts = ends + 2 * seg + 2, deltas = starts + 2 * seg, ranges = deltas + 2 * seg;
  const glyph = (c) => {
    for (let i = 0; i < seg; i++) {
      if (v.getUint16(ends + 2 * i) < c) continue;
      const st = v.getUint16(starts + 2 * i), d = v.getInt16(deltas + 2 * i), ro = v.getUint16(ranges + 2 * i);
      if (st > c) return 0;
      if (!ro) return (c + d) & 0xffff;
      const g = v.getUint16(ranges + 2 * i + ro + 2 * (c - st));
      return g && (g + d) & 0xffff;
    }
    return 0;
  };
  return { width: (c) => s(v.getUint16(t.hmtx + 4 * Math.min(glyph(c), nh - 1))), bbox: [36, 38, 40, 42].map((o) => s(v.getInt16(t.head + o))),
    ascent: s(v.getInt16(t.hhea + 4)), descent: s(v.getInt16(t.hhea + 6)) };
}
const textWidth = (s, size, f) => [...s].reduce((a, c) => a + f.width(c.codePointAt(0)), 0) * size / 1000;
const fit = (s, width, size, f) => {
  if (textWidth(s, size, f) <= width) return s;
  while (s.length > 1 && textWidth(s + '.', size, f) > width) s = s.slice(0, -1);
  return s + '.';
};
const bin = (b) => { let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return s; };

export function pdf({ title, head, rows }, fonts) {
  const F = [ttf(fonts.regular), ttf(fonts.bold)];
  const L = 40, W = 515, top = 767, n = rows.length + 1, h = Math.min(20, (top - 40) / n), narrow = 26;
  const xs = [L, L + narrow, ...head.slice(2).map((_, i) => L + 2 * narrow + i * (W - 2 * narrow) / (head.length - 2)), L + W];
  const line = (y, width, gray) => `${gray} G ${width} w ${L} ${y.toFixed(2)} m ${L + W} ${y.toFixed(2)} l S\n`;
  let fills = '', ink = `BT /F2 16 Tf ${L} 790 Td (${pdfText(title)}) Tj ET\n`;
  [{ cells: head, head: true }, ...rows].forEach((r, i) => {
    const y = top - (i + 1) * h, size = r.head ? 8 : 9.5;
    if (SHADE[r.bad]) fills += `${SHADE[r.bad]} g ${L} ${y.toFixed(2)} ${W} ${h.toFixed(2)} re f\n`;
    if (r.mon) ink += line(y + h, 1, 0);
    ink += line(y, r.head ? 1.2 : 0.5, r.head ? 0 : 0.73);
    r.cells.forEach((c, j) => {
      if (!c) return;
      const bold = r.head || j === 0, w = xs[r.head && j === 0 ? 2 : j + 1] - xs[j] - 6; // „Dzień” na dwie kolumny
      ink += `BT /F${bold ? 2 : 1} ${size} Tf ${c === '—' ? '0.6' : '0'} g ${(xs[j] + 3).toFixed(2)} ${(y + h * 0.32).toFixed(2)} Td (${pdfText(fit(String(c), w, size, F[+bold]))}) Tj ET\n`;
    });
  });
  const stream = fills + '0 g\n' + ink, last = 127 + CODES.length;
  const charOf = (code) => code < 127 ? code : code > 127 ? CODES[code - 128].codePointAt(0) : 0;
  const font = (f, name, desc) => `<< /Type /Font /Subtype /TrueType /BaseFont /${name} /FirstChar 32 /LastChar ${last} ` +
    `/Widths [${Array.from({ length: last - 31 }, (_, i) => f.width(charOf(32 + i))).join(' ')}] /FontDescriptor ${desc} 0 R /Encoding 7 0 R >>`;
  const descriptor = (f, name, file) => `<< /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${f.bbox.join(' ')}] /ItalicAngle 0 ` +
    `/Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${f.ascent} /StemV 80 /FontFile2 ${file} 0 R >>`;
  const file = (b) => `<< /Length ${b.length} /Length1 ${b.length} >>\nstream\n${bin(b)}\nendstream`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    font(F[0], 'PlusJakartaSans-Regular', 8), font(F[1], 'PlusJakartaSans-Bold', 9),
    `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${CODES.map((c) => '/' + PL[c]).join(' ')}] >>`,
    descriptor(F[0], 'PlusJakartaSans-Regular', 10), descriptor(F[1], 'PlusJakartaSans-Bold', 11), file(fonts.regular), file(fonts.bold),
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}` +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${out.length}\n%%EOF\n`;
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}

// DOCX: zip bez kompresji (metoda 0), Word sam dobiera style domyślne; font osadzony jako .odttf
// (pierwsze 32 bajty XOR z kluczem z fontKey, bajty GUID w odwrotnej kolejności — ECMA-376 cz. 1, 17.8.1)
const xml = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const FONT_KEY = '{6B1E2A4F-3C5D-4E7A-9B8C-0D1E2F3A4B5C}', KEY = FONT_KEY.replace(/[{}-]/g, '').match(/../g).map((h) => parseInt(h, 16)).reverse();
const odttf = (b) => { const o = b.slice(); for (let i = 0; i < 32; i++) o[i] ^= KEY[i % 16]; return o; };
export function docx({ title, head, rows }, fonts) {
  const W = 10204, narrow = 600, wide = Math.floor((W - 2 * narrow) / (head.length - 2));
  const widths = [narrow, narrow, ...head.slice(2).map(() => wide)];
  const run = (t, b, sz, gray) => `<w:r><w:rPr><w:rFonts w:ascii="Plus Jakarta Sans" w:hAnsi="Plus Jakarta Sans" w:cs="Plus Jakarta Sans"/>${b ? '<w:b/>' : ''}${gray ? '<w:color w:val="999999"/>' : ''}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
  const tr = (r) => `<w:tr><w:trPr><w:trHeight w:val="${r.head ? 360 : 400}" w:hRule="exact"/>${r.head ? '<w:tblHeader/>' : ''}</w:trPr>${r.cells.map((c, j) => r.head && j === 1 ? '' : // „Dzień” scalone z kolumną dnia tygodnia
    `<w:tc><w:tcPr><w:tcW w:w="${r.head && j === 0 ? 2 * narrow : widths[j]}" w:type="dxa"/>${r.head && j === 0 ? '<w:gridSpan w:val="2"/>' : ''}` +
    (r.head ? '<w:tcBorders><w:bottom w:val="single" w:sz="12" w:color="000000"/></w:tcBorders>' : r.mon ? '<w:tcBorders><w:top w:val="single" w:sz="8" w:color="000000"/></w:tcBorders>' : '') +
    (SHADE[r.bad] ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(SHADE[r.bad])}"/>` : '') + '<w:vAlign w:val="center"/></w:tcPr>' +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${j === 0 && !r.head ? '<w:jc w:val="right"/>' : ''}</w:pPr>${c ? run(c, r.head || j === 0, r.head ? 16 : 19, c === '—') : ''}</w:p></w:tc>`).join('')}</w:tr>`;
  const body = `<w:p><w:pPr><w:spacing w:before="0" w:after="200"/></w:pPr>${run(title, true, 32)}</w:p>` +
    `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="BBBBBB"/><w:insideH w:val="single" w:sz="4" w:color="BBBBBB"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${[{ cells: head, head: true }, ...rows].map(tr).join('')}</w:tbl>` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="851" w:right="851" w:bottom="851" w:left="851" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
  const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const ct = 'application/vnd.openxmlformats-officedocument.wordprocessingml', rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rels = (list) => `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([type, target], i) => `<Relationship Id="rId${i + 1}" Type="${rel}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
  return zip({
    '[Content_Types].xml': `${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>` +
      `<Override PartName="/word/document.xml" ContentType="${ct}.document.main+xml"/><Override PartName="/word/fontTable.xml" ContentType="${ct}.fontTable+xml"/><Override PartName="/word/settings.xml" ContentType="${ct}.settings+xml"/></Types>`,
    '_rels/.rels': rels([['officeDocument', 'word/document.xml']]),
    'word/document.xml': `${decl}<w:document ${W_NS}><w:body>${body}</w:body></w:document>`,
    'word/_rels/document.xml.rels': rels([['fontTable', 'fontTable.xml'], ['settings', 'settings.xml']]),
    'word/settings.xml': `${decl}<w:settings ${W_NS}><w:embedTrueTypeFonts/></w:settings>`,
    'word/fontTable.xml': `${decl}<w:fonts ${W_NS} xmlns:r="${rel}"><w:font w:name="Plus Jakarta Sans"><w:embedRegular r:id="rId1" w:fontKey="${FONT_KEY}"/><w:embedBold r:id="rId2" w:fontKey="${FONT_KEY}"/></w:font></w:fonts>`,
    'word/_rels/fontTable.xml.rels': rels([['font', 'fonts/font1.odttf'], ['font', 'fonts/font2.odttf']]),
    'word/fonts/font1.odttf': odttf(fonts.regular),
    'word/fonts/font2.odttf': odttf(fonts.bold),
  });
}

const CRC = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export const crc32 = (bytes) => { let c = -1; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [...u16(v), ...u16(v >>> 16)];

// { 'ścieżka': 'tekst' | Uint8Array } → bajty zipa (bez kompresji, data 1980-01-01, nazwy UTF-8)
export function zip(files) {
  const te = new TextEncoder(), local = [], central = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = te.encode(path), data = typeof text === 'string' ? te.encode(text) : text;
    const common = [...u16(20), ...u16(0x800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc32(data)), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    local.push(Uint8Array.from([...u32(0x04034b50), ...common]), name, data);
    central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0), count = Object.keys(files).length;
  const parts = [...local, ...central, Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(count), ...u16(count), ...u32(size), ...u32(offset), ...u16(0)])];
  const out = new Uint8Array(parts.reduce((s, b) => s + b.length, 0));
  parts.reduce((at, b) => (out.set(b, at), at + b.length), 0);
  return out;
}
