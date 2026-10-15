// Eksport grafiku do PDF i Word .docx bez bibliotek. Wejście: { title, head: [...], rows: [{ cells: [...], we, mon }] },
// dwie pierwsze kolumny wąskie (dzień, dzień tygodnia), reszta równa. Jedna strona A4 pionowo, jak wydruk.

// PDF: standardowa Helvetica (bez osadzania) + własne kodowanie dla polskich znaków; plik czysto ASCII (ósemkowe \ooo)
const PL = { ą: 'aogonek', ć: 'cacute', ę: 'eogonek', ł: 'lslash', ń: 'nacute', ó: 'oacute', ś: 'sacute', ź: 'zacute', ż: 'zdotaccent',
  Ą: 'Aogonek', Ć: 'Cacute', Ę: 'Eogonek', Ł: 'Lslash', Ń: 'Nacute', Ó: 'Oacute', Ś: 'Sacute', Ź: 'Zacute', Ż: 'Zdotaccent', '—': 'emdash' };
const CODES = Object.keys(PL); // bajty 128, 129, …
const pdfText = (s) => [...s].map((c) => '()\\'.includes(c) ? '\\' + c : c >= ' ' && c <= '~' ? c :
  CODES.includes(c) ? '\\' + (128 + CODES.indexOf(c)).toString(8) : '?').join('');
// shortcut: szerokość tekstu szacowana na 0,55 em na znak (bez metryk fontu); przy bardzo długich nazwiskach przycina z zapasem
const fit = (s, width, size) => s.length * size * 0.55 <= width ? s : s.slice(0, Math.max(1, Math.floor(width / (size * 0.55)) - 1)) + '.';

export function pdf({ title, head, rows }) {
  const L = 40, W = 515, top = 767, n = rows.length + 1, h = Math.min(20, (top - 40) / n), narrow = 26;
  const xs = [L, L + narrow, ...head.slice(2).map((_, i) => L + 2 * narrow + i * (W - 2 * narrow) / (head.length - 2)), L + W];
  const line = (y, width, gray) => `${gray} G ${width} w ${L} ${y.toFixed(2)} m ${L + W} ${y.toFixed(2)} l S\n`;
  let fills = '', ink = `BT /F2 16 Tf ${L} 790 Td (${pdfText(title)}) Tj ET\n`;
  [{ cells: head, head: true }, ...rows].forEach((r, i) => {
    const y = top - (i + 1) * h, size = r.head ? 8 : 9.5;
    if (r.we) fills += `0.93 g ${L} ${y.toFixed(2)} ${W} ${h.toFixed(2)} re f\n`;
    if (r.mon) ink += line(y + h, 1, 0);
    ink += line(y, r.head ? 1.2 : 0.5, r.head ? 0 : 0.73);
    r.cells.forEach((c, j) => {
      if (!c) return;
      const bold = r.head || j === 0, w = xs[r.head && j === 0 ? 2 : j + 1] - xs[j] - 6; // „Dzień” na dwie kolumny
      ink += `BT /F${bold ? 2 : 1} ${size} Tf ${c === '—' ? '0.6' : '0'} g ${(xs[j] + 3).toFixed(2)} ${(y + h * 0.32).toFixed(2)} Td (${pdfText(fit(String(c), w, size))}) Tj ET\n`;
    });
  });
  const stream = fills + '0 g\n' + ink, font = (name) => `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding 7 0 R >>`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    font('Helvetica'), font('Helvetica-Bold'),
    `<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${CODES.map((c) => '/' + PL[c]).join(' ')}] >>`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  return out + `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}` +
    `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${out.length}\n%%EOF\n`;
}

// DOCX: trzy części w zipie bez kompresji (metoda 0), Word sam dobiera style domyślne
const xml = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
export function docx({ title, head, rows }) {
  const W = 10204, narrow = 600, wide = Math.floor((W - 2 * narrow) / (head.length - 2));
  const widths = [narrow, narrow, ...head.slice(2).map(() => wide)];
  const run = (t, b, sz, gray) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b ? '<w:b/>' : ''}${gray ? '<w:color w:val="999999"/>' : ''}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
  const tr = (r) => `<w:tr><w:trPr><w:trHeight w:val="${r.head ? 360 : 400}" w:hRule="exact"/>${r.head ? '<w:tblHeader/>' : ''}</w:trPr>${r.cells.map((c, j) => r.head && j === 1 ? '' : // „Dzień” scalone z kolumną dnia tygodnia
    `<w:tc><w:tcPr><w:tcW w:w="${r.head && j === 0 ? 2 * narrow : widths[j]}" w:type="dxa"/>${r.head && j === 0 ? '<w:gridSpan w:val="2"/>' : ''}` +
    (r.head ? '<w:tcBorders><w:bottom w:val="single" w:sz="12" w:color="000000"/></w:tcBorders>' : r.mon ? '<w:tcBorders><w:top w:val="single" w:sz="8" w:color="000000"/></w:tcBorders>' : '') +
    (r.we ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : '') + '<w:vAlign w:val="center"/></w:tcPr>' +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${j === 0 && !r.head ? '<w:jc w:val="right"/>' : ''}</w:pPr>${c ? run(c, r.head || j === 0, r.head ? 16 : 19, c === '—') : ''}</w:p></w:tc>`).join('')}</w:tr>`;
  const body = `<w:p><w:pPr><w:spacing w:before="0" w:after="200"/></w:pPr>${run(title, true, 32)}</w:p>` +
    `<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="BBBBBB"/><w:insideH w:val="single" w:sz="4" w:color="BBBBBB"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${[{ cells: head, head: true }, ...rows].map(tr).join('')}</w:tbl>` +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="851" w:right="851" w:bottom="851" w:left="851" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
  const decl = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip({
    '[Content_Types].xml': `${decl}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    '_rels/.rels': `${decl}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `${decl}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  });
}

const CRC = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export const crc32 = (bytes) => { let c = -1; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [...u16(v), ...u16(v >>> 16)];

// { 'ścieżka': 'tekst' } → bajty zipa (bez kompresji, data 1980-01-01, nazwy UTF-8)
export function zip(files) {
  const te = new TextEncoder(), local = [], central = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = te.encode(path), data = te.encode(text);
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
