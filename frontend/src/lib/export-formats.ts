// Генераторы файлов для выгрузки древа БЕЗ внешних библиотек:
//  - PDF: одна страница-«постер» с JPEG-снимком древа (DCTDecode);
//  - XLSX: настоящий Excel-файл — минимальный ZIP (без сжатия) с XML-листом;
//  - VSDX: схема Microsoft Visio (современный формат 2013+, OPC-пакет).

/** Экранирование спецсимволов XML (+ удаление запрещённых управляющих). */
export function xmlEscape(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
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

// --------------------------------------------------------------------- VSDX

export type VsdxBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fill: string;
  line: string;
  textColor?: string;
};

export type VsdxLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
};

const PX_PER_IN = 96;

/** Число для XML Visio: до 6 знаков после точки, без хвостовых нулей. */
function vNum(v: number): string {
  const s = v.toFixed(6).replace(/\.?0+$/, "");
  return s === "" || s === "-" ? "0" : s;
}

/** Схема Microsoft Visio (.vsdx, формат 2013+): OPC-пакет (ZIP) со страницей,
 *  прямоугольниками-карточками и линиями связей. Координаты на входе — в
 *  пикселях макета (ось Y вниз); внутри переводятся в дюймы и переворачиваются
 *  (у Visio начало координат — левый нижний угол страницы). */
export function buildVsdx(
  widthPx: number,
  heightPx: number,
  boxes: VsdxBox[],
  lines: VsdxLine[],
): Uint8Array {
  const toIn = (px: number) => px / PX_PER_IN;
  const flipY = (px: number) => (heightPx - px) / PX_PER_IN;
  const pageW = vNum(toIn(widthPx));
  const pageH = vNum(toIn(heightPx));

  let id = 0;
  const shapes: string[] = [];

  // линии — первыми, чтобы карточки рисовались поверх них
  for (const l of lines) {
    id++;
    const ax = toIn(l.x1);
    const ay = flipY(l.y1);
    const bx = toIn(l.x2);
    const by = flipY(l.y2);
    const w = Math.max(Math.abs(bx - ax), 0.0001);
    const h = Math.max(Math.abs(by - ay), 0.0001);
    const minX = Math.min(ax, bx);
    const minY = Math.min(ay, by);
    // относительные координаты концов отрезка внутри рамки фигуры (0..1)
    const rx1 = vNum((ax - minX) / w);
    const ry1 = vNum((ay - minY) / h);
    const rx2 = vNum((bx - minX) / w);
    const ry2 = vNum((by - minY) / h);
    shapes.push(
      `<Shape ID="${id}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">` +
        `<Cell N="PinX" V="${vNum(minX + w / 2)}"/>` +
        `<Cell N="PinY" V="${vNum(minY + h / 2)}"/>` +
        `<Cell N="Width" V="${vNum(w)}"/>` +
        `<Cell N="Height" V="${vNum(h)}"/>` +
        `<Cell N="LocPinX" V="${vNum(w / 2)}" F="Width*0.5"/>` +
        `<Cell N="LocPinY" V="${vNum(h / 2)}" F="Height*0.5"/>` +
        `<Cell N="Angle" V="0"/>` +
        `<Cell N="LineColor" V="${l.color}"/>` +
        `<Cell N="LineWeight" V="0.02"/>` +
        `<Section N="Geometry" IX="0">` +
        `<Cell N="NoFill" V="1"/>` +
        `<Cell N="NoLine" V="0"/>` +
        `<Row T="RelMoveTo" IX="1"><Cell N="X" V="${rx1}"/><Cell N="Y" V="${ry1}"/></Row>` +
        `<Row T="RelLineTo" IX="2"><Cell N="X" V="${rx2}"/><Cell N="Y" V="${ry2}"/></Row>` +
        `</Section></Shape>`,
    );
  }

  for (const b of boxes) {
    id++;
    const w = toIn(b.w);
    const h = toIn(b.h);
    const cx = toIn(b.x) + w / 2;
    const cy = flipY(b.y) - h / 2;
    shapes.push(
      `<Shape ID="${id}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">` +
        `<Cell N="PinX" V="${vNum(cx)}"/>` +
        `<Cell N="PinY" V="${vNum(cy)}"/>` +
        `<Cell N="Width" V="${vNum(w)}"/>` +
        `<Cell N="Height" V="${vNum(h)}"/>` +
        `<Cell N="LocPinX" V="${vNum(w / 2)}" F="Width*0.5"/>` +
        `<Cell N="LocPinY" V="${vNum(h / 2)}" F="Height*0.5"/>` +
        `<Cell N="Angle" V="0"/>` +
        `<Cell N="FillForegnd" V="${b.fill}"/>` +
        `<Cell N="FillPattern" V="1"/>` +
        `<Cell N="LineColor" V="${b.line}"/>` +
        `<Cell N="LineWeight" V="0.0138889"/>` +
        `<Cell N="Rounding" V="0.05"/>` +
        `<Cell N="VerticalAlign" V="1"/>` +
        `<Section N="Character"><Row IX="0">` +
        `<Cell N="Color" V="${b.textColor ?? "#000000"}"/>` +
        `<Cell N="Size" V="0.222222"/>` +
        `</Row></Section>` +
        `<Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="1"/></Row></Section>` +
        `<Section N="Geometry" IX="0">` +
        `<Cell N="NoFill" V="0"/>` +
        `<Cell N="NoLine" V="0"/>` +
        `<Row T="RelMoveTo" IX="1"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>` +
        `<Row T="RelLineTo" IX="2"><Cell N="X" V="1"/><Cell N="Y" V="0"/></Row>` +
        `<Row T="RelLineTo" IX="3"><Cell N="X" V="1"/><Cell N="Y" V="1"/></Row>` +
        `<Row T="RelLineTo" IX="4"><Cell N="X" V="0"/><Cell N="Y" V="1"/></Row>` +
        `<Row T="RelLineTo" IX="5"><Cell N="X" V="0"/><Cell N="Y" V="0"/></Row>` +
        `</Section>` +
        `<Text>${xmlEscape(b.text)}</Text></Shape>`,
    );
  }

  const VISIO_NS = "http://schemas.microsoft.com/office/visio/2012/main";
  const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const XML_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;

  const contentTypes =
    XML_HEAD +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/>` +
    `<Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/>` +
    `<Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/>` +
    `<Override PartName="/visio/windows.xml" ContentType="application/vnd.ms-visio.windows+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;

  const rootRels =
    XML_HEAD +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/document" Target="visio/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`;

  const coreProps =
    XML_HEAD +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<dc:title>Родовое древо</dc:title><dc:creator>Vorhda</dc:creator>` +
    `</cp:coreProperties>`;

  const appProps =
    XML_HEAD +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
    `<Application>Microsoft Visio</Application>` +
    `</Properties>`;

  // Документ: базовый стиль ID=0 («No Style»), на него ссылаются все фигуры
  const documentXml =
    XML_HEAD +
    `<VisioDocument xmlns="${VISIO_NS}" xmlns:r="${R_NS}" xml:space="preserve">` +
    `<StyleSheets>` +
    `<StyleSheet ID="0" NameU="No Style" Name="No Style">` +
    `<Cell N="EnableLineProps" V="1"/>` +
    `<Cell N="EnableFillProps" V="1"/>` +
    `<Cell N="EnableTextProps" V="1"/>` +
    `<Cell N="LineWeight" V="0.01"/>` +
    `<Cell N="LineColor" V="#000000"/>` +
    `<Cell N="LinePattern" V="1"/>` +
    `<Cell N="FillForegnd" V="#ffffff"/>` +
    `<Cell N="FillBkgnd" V="#ffffff"/>` +
    `<Cell N="FillPattern" V="1"/>` +
    `<Cell N="VerticalAlign" V="1"/>` +
    `<Section N="Character"><Row IX="0">` +
    `<Cell N="Font" V="Calibri"/><Cell N="Color" V="#000000"/><Cell N="Size" V="0.25"/>` +
    `</Row></Section>` +
    `<Section N="Paragraph"><Row IX="0"><Cell N="HorzAlign" V="1"/></Row></Section>` +
    `</StyleSheet>` +
    `</StyleSheets>` +
    `</VisioDocument>`;

  const documentRels =
    XML_HEAD +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/pages" Target="pages/pages.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.microsoft.com/visio/2010/relationships/windows" Target="windows.xml"/>` +
    `</Relationships>`;

  // Без части windows.xml Visio отказывается открывать пакет
  // («части отсутствуют или являются недопустимыми») — проверено на Visio 16.
  const windowsXml =
    XML_HEAD +
    `<Windows ClientWidth="1600" ClientHeight="900" xmlns="${VISIO_NS}" xmlns:r="${R_NS}" xml:space="preserve">` +
    `<Window ID="0" WindowType="Drawing" WindowState="1073741824" ContainerType="Page" Page="0" ` +
    `ViewScale="-1" ViewCenterX="${vNum(toIn(widthPx) / 2)}" ViewCenterY="${vNum(toIn(heightPx) / 2)}"/>` +
    `</Windows>`;

  const pagesXml =
    XML_HEAD +
    `<Pages xmlns="${VISIO_NS}" xmlns:r="${R_NS}" xml:space="preserve">` +
    `<Page ID="0" NameU="Page-1" Name="Древо">` +
    `<PageSheet LineStyle="0" FillStyle="0" TextStyle="0">` +
    `<Cell N="PageWidth" V="${pageW}"/>` +
    `<Cell N="PageHeight" V="${pageH}"/>` +
    `<Cell N="DrawingSizeType" V="3"/>` +
    `</PageSheet>` +
    `<Rel r:id="rId1"/>` +
    `</Page></Pages>`;

  const pagesRels =
    XML_HEAD +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.microsoft.com/visio/2010/relationships/page" Target="page1.xml"/>` +
    `</Relationships>`;

  const pageContents =
    XML_HEAD +
    `<PageContents xmlns="${VISIO_NS}" xmlns:r="${R_NS}" xml:space="preserve">` +
    `<Shapes>${shapes.join("")}</Shapes>` +
    `</PageContents>`;

  const te = new TextEncoder();
  return makeZip([
    { name: "[Content_Types].xml", data: te.encode(contentTypes) },
    { name: "_rels/.rels", data: te.encode(rootRels) },
    { name: "docProps/core.xml", data: te.encode(coreProps) },
    { name: "docProps/app.xml", data: te.encode(appProps) },
    { name: "visio/document.xml", data: te.encode(documentXml) },
    { name: "visio/_rels/document.xml.rels", data: te.encode(documentRels) },
    { name: "visio/windows.xml", data: te.encode(windowsXml) },
    { name: "visio/pages/pages.xml", data: te.encode(pagesXml) },
    { name: "visio/pages/_rels/pages.xml.rels", data: te.encode(pagesRels) },
    { name: "visio/pages/page1.xml", data: te.encode(pageContents) },
  ]);
}
