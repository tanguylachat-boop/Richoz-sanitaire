import {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  ImageRun,
  type IStylesOptions,
} from 'docx';


// Colors measured on the Richoz reference PDF (bon 2026 252 113, 21.10.2026).
export const RED = 'C0392B';
export const BLUE = '3679B1';       // ribbons + "RICHOZ"
export const TEXT_BLUE = '385391';  // all body text, labels and values
export const GREEN = '5EA74B';      // "SANITAIRE"
export const GRAY = '666666';
export const WHITE = 'FFFFFF';

// A4 margins of the reference: ~2.5 cm left/right.
export const PAGE_MARGINS = { top: 1000, right: 1400, bottom: 900, left: 1400 };
// Usable text width in DXA (twentieths of a point): A4 = 11906 minus margins.
export const PAGE_WIDTH_DXA = 11906 - PAGE_MARGINS.left - PAGE_MARGINS.right;

/** Styles of every Richoz Word document: explicit Normal defaults (Calibri 11, blue). */
export function documentStyles(): IStylesOptions {
  return {
    default: {
      document: { run: { font: 'Calibri', size: 22, color: TEXT_BLUE } },
    },
  };
}

/**
 * Empty Normal paragraph placed before every ribbon. Even if the secretary
 * deletes a whole sentence (paragraph mark included), an editable line
 * remains between two ribbons.
 */
export function sectionSpacer(): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0 } });
}

const noneBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
export const NO_BORDERS = {
  top: noneBorder,
  bottom: noneBorder,
  left: noneBorder,
  right: noneBorder,
};

/** White 14 pt run for ribbon text. */
export function bannerRun(text: string, size = 28): TextRun {
  return new TextRun({ text, size, color: WHITE, font: 'Calibri' });
}

/**
 * Blue ribbon = a one-cell table with a blue background. A table cell is the
 * only background that Word, LibreOffice (Gotenberg PDF) AND Pages all render
 * the same way; paragraph shading was invisible in Pages or, through a style,
 * smeared over the whole document. The ribbon never captures the paragraphs
 * around it: the secretary can delete a sentence and still type on the empty
 * line left before the next ribbon (see sectionSpacer).
 */
export function bannerTable(runs: TextRun[]): Table {
  return new Table({
    width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths: [PAGE_WIDTH_DXA],
    borders: {
      top: noneBorder, bottom: noneBorder, left: noneBorder, right: noneBorder,
      insideHorizontal: noneBorder, insideVertical: noneBorder,
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: BLUE },
            margins: { top: 50, bottom: 50, left: 120, right: 120 },
            borders: NO_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: runs,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

export function blueBanner(text: string): Table {
  return bannerTable([bannerRun(text)]);
}

/** Spacer + ribbon, to spread into the document children. */
export function section(text: string): (Paragraph | Table)[] {
  return [sectionSpacer(), blueBanner(text)];
}

export function redTitle(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text, bold: true, size: 22, color: RED, font: 'Calibri' }),
    ],
    spacing: { before: 200, after: 80 },
  });
}

export function bodyText(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: 'Calibri', color: TEXT_BLUE })],
    spacing: { after: 120 },
  });
}

export function placeholder(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text, size: 20, font: 'Calibri', italics: true, color: '999999' }),
    ],
    spacing: { after: 60 },
  });
}

/**
 * "Label : value" on one line, the value right after the colon.
 * Replaces the former two-column invisible table whose fixed label column
 * left a large gap between "Régie :" and the name.
 */
export function infoLine(label: string, value: string): Paragraph {
  const trimmed = label.trim();
  const labelText = trimmed.endsWith(':') ? trimmed : `${trimmed} :`;
  return new Paragraph({
    children: [
      new TextRun({ text: `${labelText} `, size: 22, font: 'Calibri', color: TEXT_BLUE }),
      new TextRun({ text: value, size: 22, font: 'Calibri', color: TEXT_BLUE }),
    ],
    spacing: { after: 60 },
  });
}

export async function downloadImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function imageParagraph(url: string, caption?: string): Promise<Paragraph[]> {
  const data = await downloadImage(url);
  const out: Paragraph[] = [];
  if (data) {
    out.push(
      new Paragraph({
        children: [
          new ImageRun({
            data,
            transformation: { width: 450, height: 340 },
            type: 'jpg',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      })
    );
  }
  if (caption) {
    out.push(
      new Paragraph({
        children: [
          new TextRun({ text: caption, size: 18, font: 'Calibri', italics: true, color: GRAY }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      })
    );
  }
  return out;
}

export function brandHeader(): Paragraph[] {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: 'RICHOZ ', bold: true, size: 48, color: BLUE, font: 'Calibri' }),
        new TextRun({ text: 'SANITAIRE', bold: true, size: 48, color: GREEN, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
  ];
}
