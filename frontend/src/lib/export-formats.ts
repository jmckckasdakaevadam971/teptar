// Генераторы файлов для выгрузки древа БЕЗ внешних библиотек:
//  - PDF: одна страница-«постер» с JPEG-снимком древа (DCTDecode);
//  - XLSX: настоящий Excel-файл — минимальный ZIP (без сжатия) с XML-листом;
//  - VDX: схема Microsoft Visio (XML-формат 2003+, открывается и в новых
//    версиях Visio, и в LibreOffice Draw).

/** Экранирование спецсимволов XML. */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Скачивание готового файла в браузере. */
export function downloadBlob(
  filename: string,
  mime: string,
  data: Uint8Array | string,
): void {
  // копия в свежий Uint8Array — гарантирует ArrayBuffer-подложку для Blob
  const part: BlobPart = typeof data === "string" ? data : new Uint8Array(data);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.download = filename;
  a.href = url;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------------------------------------------------------------- ZIP (STORED)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Минимальный ZIP-архив: записи хранятся без сжатия (метод STORED). */
export function makeZip(
  files: { name: string; data: Uint8Array }[],
): Uint8Array {
  const te = new TextEncoder();
  const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1; // 01.01.2024
  const locals: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const f of files) {
    const name = te.encode(f.name);
    const crc = crc32(f.data);
    const head = [
      ...u32(0x04034b50),
      ...u16(20), // версия для распаковки
      ...u16(0), // флаги
      ...u16(0), // метод: STORED
      ...u16(0), // время
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(f.data.length),
      ...u32(f.data.length),
      ...u16(name.length),
      ...u16(0),
    ];
    const local = new Uint8Array(head.length + name.length + f.data.length);
    local.set(head, 0);
    local.set(name, head.length);
    local.set(f.data, head.length + name.length);
    locals.push(local);

    central.push(
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(DOS_DATE),
      ...u32(crc),
      ...u32(f.data.length),
      ...u32(f.data.length),
      ...u16(name.length),
      ...u16(0), // extra
      ...u16(0), // комментарий
      ...u16(0), // диск
      ...u16(0), // внутр. атрибуты
      ...u32(0), // внешн. атрибуты
      ...u32(offset),
      ...Array.from(name),
    );
    offset += local.length;
  }

  const eocd = [
    ...u32(0x06054b50),
    ...u16(0),
    ...u16(0),
    ...u16(files.length),
    ...u16(files.length),
    ...u32(central.length),
    ...u32(offset),
    ...u16(0),
  ];

  const out = new Uint8Array(offset + central.length + eocd.length);
  let o = 0;
  for (const l of locals) {
    out.set(l, o);
    o += l.length;
  }
  out.set(central, o);
  o += central.length;
  out.set(eocd, o);
  return out;
}

// --------------------------------------------------------------------- XLSX

/** Книга Excel с одним листом; все ячейки — текст (inline strings). */
export function buildXlsx(sheetName: string, rows: string[][]): Uint8Array {
  const rowsXml = rows
    .map(
      (cells, ri) =>
        `<row r="${ri + 1}">${cells
          .map(
            (v) =>
              `<c t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`,
          )
          .join("")}</row>`,
    )
    .join("");

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rowsXml}</sheetData></worksheet>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;

  const te = new TextEncoder();
  return makeZip([
    { name: "[Content_Types].xml", data: te.encode(contentTypes) },
    { name: "_rels/.rels", data: te.encode(rootRels) },
    { name: "xl/workbook.xml", data: te.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: te.encode(workbookRels) },
    { name: "xl/worksheets/sheet1.xml", data: te.encode(sheet) },
  ]);
}

// ---------------------------------------------------------------------- PDF

/** Одностраничный PDF-«постер» с JPEG-изображением на всю страницу.
 *  Размер страницы = размеру изображения (1px→1pt), с ограничением
 *  по максимуму формата PDF (14400pt). */
export function buildPdfFromJpeg(
  jpeg: Uint8Array,
  imgW: number,
  imgH: number,
): Uint8Array {
  const MAX_PT = 14000;
  const k = Math.min(1, MAX_PT / imgW, MAX_PT / imgH);
  const pageW = Math.max(1, Math.round(imgW * k));
  const pageH = Math.max(1, Math.round(imgH * k));

  const te = new TextEncoder();
  const parts: Uint8Array[] = [];
  let pos = 0;
  const offsets: number[] = [];
  const push = (data: Uint8Array | string) => {
    const b = typeof data === "string" ? te.encode(data) : data;
    parts.push(b);
    pos += b.length;
  };
  const beginObj = (n: number) => {
    offsets[n] = pos;
  };

  push("%PDF-1.4\n");
  beginObj(1);
  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObj(2);
  push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  beginObj(3);
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Resources << /XObject << /Im1 5 0 R >> /ProcSet [/PDF /ImageC] >> ` +
      `/Contents 4 0 R >>\nendobj\n`,
  );
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im1 Do Q`;
  beginObj(4);
  push(
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  );
  beginObj(5);
  push(
    `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode ` +
      `/Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");

  const xrefPos = pos;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);

  const out = new Uint8Array(pos);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------- VDX

export type VdxBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fill: string;
  line: string;
  textColor?: string;
};

export type VdxLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
};

const PX_PER_IN = 96;

/** Схема Visio (VDX): страница с прямоугольниками-карточками и линиями.
 *  Координаты на входе — в пикселях макета (ось Y вниз); внутри переводятся
 *  в дюймы и переворачиваются (у Visio начало координат — левый нижний угол). */
export function buildVdx(
  widthPx: number,
  heightPx: number,
  boxes: VdxBox[],
  lines: VdxLine[],
): string {
  const f = (n: number) => n.toFixed(4);
  let id = 0;
  const shapes: string[] = [];

  for (const l of lines) {
    id++;
    const x1 = l.x1 / PX_PER_IN;
    const x2 = l.x2 / PX_PER_IN;
    const y1 = (heightPx - l.y1) / PX_PER_IN;
    const y2 = (heightPx - l.y2) / PX_PER_IN;
    const bx = Math.min(x1, x2);
    const by = Math.min(y1, y2);
    const w = Math.max(Math.abs(x2 - x1), 0.001);
    const h = Math.max(Math.abs(y2 - y1), 0.001);
    shapes.push(
      `<Shape ID="${id}" Type="Shape">` +
        `<XForm><PinX>${f(bx)}</PinX><PinY>${f(by)}</PinY>` +
        `<Width>${f(w)}</Width><Height>${f(h)}</Height>` +
        `<LocPinX>0</LocPinX><LocPinY>0</LocPinY></XForm>` +
        `<Line><LineWeight>0.014</LineWeight><LineColor>${l.color}</LineColor></Line>` +
        `<Geom IX="0"><NoFill>1</NoFill>` +
        `<MoveTo IX="1"><X>${f(x1 - bx)}</X><Y>${f(y1 - by)}</Y></MoveTo>` +
        `<LineTo IX="2"><X>${f(x2 - bx)}</X><Y>${f(y2 - by)}</Y></LineTo>` +
        `</Geom></Shape>`,
    );
  }

  for (const b of boxes) {
    id++;
    const w = b.w / PX_PER_IN;
    const h = b.h / PX_PER_IN;
    const bx = b.x / PX_PER_IN;
    const by = (heightPx - b.y - b.h) / PX_PER_IN;
    shapes.push(
      `<Shape ID="${id}" Type="Shape">` +
        `<XForm><PinX>${f(bx)}</PinX><PinY>${f(by)}</PinY>` +
        `<Width>${f(w)}</Width><Height>${f(h)}</Height>` +
        `<LocPinX>0</LocPinX><LocPinY>0</LocPinY></XForm>` +
        `<Line><LineWeight>0.014</LineWeight><LineColor>${b.line}</LineColor></Line>` +
        `<Fill><FillForegnd>${b.fill}</FillForegnd><FillPattern>1</FillPattern></Fill>` +
        `<Char IX="0"><Color>${b.textColor ?? "#000000"}</Color><Size>0.125</Size></Char>` +
        `<Geom IX="0">` +
        `<MoveTo IX="1"><X>0</X><Y>0</Y></MoveTo>` +
        `<LineTo IX="2"><X>${f(w)}</X><Y>0</Y></LineTo>` +
        `<LineTo IX="3"><X>${f(w)}</X><Y>${f(h)}</Y></LineTo>` +
        `<LineTo IX="4"><X>0</X><Y>${f(h)}</Y></LineTo>` +
        `<LineTo IX="5"><X>0</X><Y>0</Y></LineTo>` +
        `</Geom><Text>${xmlEscape(b.text)}</Text></Shape>`,
    );
  }

  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<VisioDocument xmlns="http://schemas.microsoft.com/visio/2003/core">` +
    `<Pages><Page ID="1" NameU="Древо" Name="Древо">` +
    `<PageSheet><PageProps>` +
    `<PageWidth>${f(widthPx / PX_PER_IN)}</PageWidth>` +
    `<PageHeight>${f(heightPx / PX_PER_IN)}</PageHeight>` +
    `</PageProps></PageSheet>` +
    `<Shapes>${shapes.join("")}</Shapes>` +
    `</Page></Pages></VisioDocument>`
  );
}
