import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  VerticalAlign,
  ImageRun,
  Header,
  Footer,
  PageNumber,
  type ISectionOptions,
} from 'docx';
import { buildWatermarkParagraph } from './watermark';

// ─── Reference: Richoz PDF "2026 252 113" (6 pages, measured 21.10.2026) ────
// Colors come from the PDF itself (fill / font colors), not from a raster.
export const RED = 'C0392B';
export const BLUE = '047AB6';        // ribbons + "RICHOZ" title
export const TEXT_BLUE = '2E5395';   // every label, value and body line
export const GREEN = '3EA93B';       // "SANITAIRE" title
export const LIGHT_BLUE = '8EAADB';  // footer lines
export const GRAY = '666666';
export const WHITE = 'FFFFFF';

export const COMPANY_LINE =
  'RICHOZ SANITAIRE 50 Route de Chancy 1213 Petit-Lancy - email : info@richoz-sanitaire.ch téléphone : + 41 22 313 00 27';

// A4, margins 2.5 cm left/right, 1 cm top (the header pushes pages 2+ down),
// 2 cm bottom, header/footer at 1.27 cm from the edge. Values in twips.
export const PAGE_MARGINS = { top: 567, right: 1417, bottom: 1134, left: 1417, header: 720, footer: 720 };
export const PAGE_WIDTH_DXA = 11906 - PAGE_MARGINS.left - PAGE_MARGINS.right; // 9072

// Sizes in half-points. Body 12 pt, ribbons 16 pt, title 22 pt, header/footer 9 pt.
const BODY = 24;
const RIBBON = 32;
const TITLE = 44;
const SMALL = 18;
// Word's Normal line spacing (1.08 = 259/240).
const LINE = 259;

/**
 * styles.xml of every Richoz Word document, written by hand because Pages
 * ignores paragraph alignment (centered ribbons and title) unless the
 * "Normal" style is explicitly flagged as the default paragraph style, which
 * the docx library cannot emit. Defaults: Calibri 12 pt, blue, Word's Normal
 * line spacing (1.08), no space after.
 */
export function documentStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/><w:color w:val="${TEXT_BLUE}"/><w:sz w:val="${BODY}"/><w:szCs w:val="${BODY}"/><w:lang w:val="fr-CH"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${LINE}" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
  <w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
}

/**
 * Empty Normal line. Placed before every ribbon: even if the secretary deletes
 * a whole sentence (paragraph mark included), an editable line remains
 * between two ribbons. Also used where the reference leaves a blank line.
 */
export function blankLine(): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0, line: LINE } });
}

const noneBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
const NO_BORDERS = {
  top: noneBorder,
  bottom: noneBorder,
  left: noneBorder,
  right: noneBorder,
};
const NO_TABLE_BORDERS = { ...NO_BORDERS, insideHorizontal: noneBorder, insideVertical: noneBorder };

/** White 16 pt run for ribbon text (12 pt for the value next to it). */
export function bannerRun(text: string, size = RIBBON): TextRun {
  return new TextRun({ text, size, color: WHITE, font: 'Calibri' });
}

/**
 * Blue ribbon = a one-cell table with a blue background spanning the text
 * width. A table cell is the only background that Word, LibreOffice
 * (Gotenberg PDF) AND Pages all render the same way. The ribbon never
 * captures the paragraphs around it: the secretary can delete a sentence and
 * still type on the empty line left before the next ribbon (see blankLine).
 */
export function bannerTable(runs: TextRun[]): Table {
  return new Table({
    width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [PAGE_WIDTH_DXA],
    layout: TableLayoutType.FIXED,
    borders: NO_TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: BLUE },
            margins: { top: 0, bottom: 0, left: 100, right: 100 },
            borders: NO_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0, line: 240 },
                children: runs,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** Ribbon, optionally followed by a smaller value ("Bon de travail numéro :  2026 252 113"). */
export function blueBanner(text: string, valueSuffix?: string): Table {
  const runs = [bannerRun(text)];
  if (valueSuffix) runs.push(bannerRun('  '), bannerRun(valueSuffix, BODY));
  return bannerTable(runs);
}

/** Blank line + ribbon, to spread into the document children. */
export function section(text: string, valueSuffix?: string): (Paragraph | Table)[] {
  return [blankLine(), blueBanner(text, valueSuffix)];
}

/**
 * "RICHOZ SANITAIRE" in Arial bold 22 pt (blue + green) followed by the
 * report subtitle in bold 16 pt, both centered as on the reference. The
 * reference uses Arial Black and Calibri Light, but the production PDF
 * converter (Gotenberg/LibreOffice) only ships Liberation Sans (= Arial),
 * Carlito (= Calibri), DejaVu and Noto: any other font falls back to a serif.
 */
export function brandHeader(
  subtitle: string,
  options: { color?: string; sirens?: boolean } = {},
): Paragraph[] {
  const color = options.color ?? TEXT_BLUE;
  const subtitleRuns: TextRun[] = [];
  if (options.sirens) subtitleRuns.push(new TextRun({ text: '🚨 ', size: RIBBON, font: 'Segoe UI Emoji' }));
  subtitleRuns.push(new TextRun({ text: subtitle, bold: true, size: RIBBON, color, font: 'Calibri' }));
  if (options.sirens) subtitleRuns.push(new TextRun({ text: ' 🚨', size: RIBBON, font: 'Segoe UI Emoji' }));
  return [
    new Paragraph({
      children: [
        new TextRun({ text: 'RICHOZ ', bold: true, size: TITLE, color: BLUE, font: 'Arial' }),
        new TextRun({ text: 'SANITAIRE', bold: true, size: TITLE, color: GREEN, font: 'Arial' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200, line: 240 },
    }),
    new Paragraph({
      children: subtitleRuns,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120, line: 240 },
    }),
  ];
}

/** Bold 12 pt sub-section label with an emoji, like "🏠 Propriétaire & Régie". */
export function sectionLabel(icon: string, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${icon} `, size: BODY, font: 'Segoe UI Emoji' }),
      new TextRun({ text, bold: true, size: BODY, color: TEXT_BLUE, font: 'Calibri' }),
    ],
    spacing: { before: 40, after: 40, line: 264 },
  });
}

/**
 * "Label : value" on one line, the value right after the colon (the former
 * two-column invisible table left a large gap between "Régie :" and the
 * name). 12 pt, 18 pt line pitch like the reference.
 */
export function infoLine(label: string, value: string, options: { boldLabel?: boolean } = {}): Paragraph {
  const trimmed = label.trim();
  const labelText = trimmed.endsWith(':') ? trimmed : `${trimmed} :`;
  return new Paragraph({
    children: [
      new TextRun({ text: `${labelText} `, size: BODY, font: 'Calibri', color: TEXT_BLUE, bold: options.boldLabel }),
      new TextRun({ text: value, size: BODY, font: 'Calibri', color: TEXT_BLUE }),
    ],
    spacing: { after: 40, line: 264 },
  });
}

export function redTitle(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text, bold: true, size: BODY, color: RED, font: 'Calibri' }),
    ],
    spacing: { before: 200, after: 80, line: LINE },
  });
}

/** Body paragraph: Calibri 12 pt, Word's Normal spacing (1.08, 8 pt after). */
export function bodyText(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: BODY, font: 'Calibri', color: TEXT_BLUE })],
    spacing: { after: 160, line: LINE },
  });
}

/** Free text split into paragraphs; blank lines are kept as empty paragraphs. */
export function bodyParagraphs(text: string): Paragraph[] {
  return text.split('\n').map((line) =>
    line.trim() ? bodyText(line) : new Paragraph({ spacing: { after: 160, line: LINE } }),
  );
}

export function placeholder(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text, size: BODY, font: 'Calibri', italics: true, color: '999999' }),
    ],
    spacing: { after: 160, line: LINE },
  });
}

// ─── Images ───────────────────────────────────────────────────────────────────

export async function downloadImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

type ImageInfo = { type: 'jpg' | 'png'; width: number; height: number };

/** Pixel size and type from the file header (JPEG SOF / PNG IHDR). */
export function imageInfo(data: ArrayBuffer): ImageInfo | null {
  const b = new Uint8Array(data);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const view = new DataView(data);
    return { type: 'png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    const view = new DataView(data);
    let offset = 2;
    while (offset + 9 < b.length) {
      if (b[offset] !== 0xff) return null;
      const marker = b[offset + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
        offset += marker === 0xff ? 1 : 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { type: 'jpg', height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
    return { type: 'jpg', width: 0, height: 0 };
  }
  return null;
}

// Photo box of the reference: 6.9 x 9.3 cm portrait photos stacked at the left
// margin. Pixels at 96 dpi (docx ImageRun unit).
const PHOTO_BOX_PX = 350;
const PHOTO_COL_DXA = 5260; // 9.3 cm
const CAPTION_COL_DXA = PAGE_WIDTH_DXA - PHOTO_COL_DXA;

function fitInBox(info: ImageInfo | null): { width: number; height: number } {
  if (!info || !info.width || !info.height) return { width: 262, height: 350 };
  const scale = Math.min(PHOTO_BOX_PX / info.width, PHOTO_BOX_PX / info.height);
  return { width: Math.round(info.width * scale), height: Math.round(info.height * scale) };
}

function captionCell(text: string | undefined): TableCell {
  return new TableCell({
    width: { size: CAPTION_COL_DXA, type: WidthType.DXA },
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 120, left: 200, right: 0 },
    children: [
      new Paragraph({
        children: text ? [new TextRun({ text, size: BODY, font: 'Calibri', color: TEXT_BLUE })] : [],
        spacing: { before: 0, after: 0, line: LINE },
      }),
    ],
  });
}

/**
 * Photos as one borderless table: the photo at the left margin (proportions
 * kept, 9.3 cm box like the reference) and, to its right, the caption the
 * technician typed or an empty cell where the secretary can write a comment.
 * One row per photo; a row never splits across pages.
 */
export async function photoTable(
  photos: { url: string; caption?: string }[],
): Promise<(Table | Paragraph)[]> {
  const rows: TableRow[] = [];
  const missing: Paragraph[] = [];
  for (const photo of photos) {
    const data = await downloadImage(photo.url);
    const info = data ? imageInfo(data) : null;
    if (!data || !info) {
      missing.push(placeholder(`[Image non disponible: ${photo.url.split('/').pop()?.slice(0, 40) || 'photo'}]`));
      continue;
    }
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: PHOTO_COL_DXA, type: WidthType.DXA },
            borders: NO_BORDERS,
            margins: { top: 60, bottom: 120, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [new ImageRun({ data, transformation: fitInBox(info), type: info.type })],
                spacing: { before: 0, after: 0, line: 240 },
              }),
            ],
          }),
          captionCell(photo.caption),
        ],
      }),
    );
  }
  const out: (Table | Paragraph)[] = [];
  if (rows.length > 0) {
    out.push(
      new Table({
        width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
        columnWidths: [PHOTO_COL_DXA, CAPTION_COL_DXA],
        layout: TableLayoutType.FIXED,
        borders: NO_TABLE_BORDERS,
        rows,
      }),
    );
  }
  return [...out, ...missing];
}

/** Client signature image (or a placeholder) under its ribbon. */
export async function signatureBlock(signatureUrl: string | null | undefined): Promise<Paragraph[]> {
  if (!signatureUrl) return [placeholder('Non signé')];
  const data = await downloadImage(signatureUrl);
  const info = data ? imageInfo(data) : null;
  if (!data) return [placeholder('Signature non disponible')];
  return [
    new Paragraph({
      children: [new ImageRun({ data, transformation: { width: 320, height: 120 }, type: info?.type ?? 'png' })],
      spacing: { before: 0, after: 160, line: 240 },
    }),
  ];
}

// ─── Page setup ───────────────────────────────────────────────────────────────

function companyLine(color: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: 240 },
    children: [new TextRun({ text: COMPANY_LINE, bold: true, size: SMALL, font: 'Calibri', color })],
  });
}

/**
 * Section setup shared by every report: A4 margins of the reference, the
 * water-drop watermark on every page, and (from page 2 only, like the
 * reference) the company line in the header and the company line + "Page X
 * sur Y" in the footer. The first page keeps only the watermark.
 */
export function pageSetup(): Pick<ISectionOptions, 'properties' | 'headers' | 'footers'> {
  return {
    properties: { titlePage: true, page: { margin: PAGE_MARGINS } },
    headers: {
      first: new Header({ children: [buildWatermarkParagraph()] }),
      default: new Header({ children: [buildWatermarkParagraph(), companyLine(TEXT_BLUE)] }),
    },
    footers: {
      first: new Footer({ children: [new Paragraph({ spacing: { before: 0, after: 0 } })] }),
      default: new Footer({
        children: [
          companyLine(LIGHT_BLUE),
          new Paragraph({
            spacing: { before: 120, after: 0, line: 240 },
            children: [
              new TextRun({ text: 'Page ', bold: true, size: SMALL, font: 'Calibri', color: LIGHT_BLUE }),
              new TextRun({ children: [PageNumber.CURRENT], bold: true, size: SMALL, font: 'Calibri', color: LIGHT_BLUE }),
              new TextRun({ text: ' sur ', bold: true, size: SMALL, font: 'Calibri', color: LIGHT_BLUE }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], bold: true, size: SMALL, font: 'Calibri', color: LIGHT_BLUE }),
            ],
          }),
        ],
      }),
    },
  };
}
