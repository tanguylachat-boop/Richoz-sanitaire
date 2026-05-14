import {
  Paragraph,
  TextRun,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  AlignmentType,
  ImageRun,
} from 'docx';

// Page width in DXA (twentieths of a point) for A4 minus our margins.
// A4 = 11907 dxa wide. Margins 900 dxa each side. Usable ≈ 10100.
export const PAGE_WIDTH_DXA = 9600;
export const COL_LABEL_DXA = 2880; // ~30%
export const COL_VALUE_DXA = 6720; // ~70%

export const RED = 'C0392B';
export const BLUE = '2C3E87';
export const GRAY = '666666';
export const WHITE = 'FFFFFF';

export function blueBanner(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `  ${text}`, bold: true, size: 22, color: WHITE, font: 'Calibri' }),
    ],
    shading: { type: ShadingType.SOLID, color: BLUE },
    spacing: { before: 300, after: 150 },
  });
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
    children: [new TextRun({ text, size: 20, font: 'Calibri' })],
    spacing: { after: 60 },
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

const noneBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
export const NO_BORDERS = {
  top: noneBorder,
  bottom: noneBorder,
  left: noneBorder,
  right: noneBorder,
};

export function infoRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 18, font: 'Calibri', color: GRAY })],
          }),
        ],
        width: { size: COL_LABEL_DXA, type: WidthType.DXA },
        borders: NO_BORDERS,
        shading: { type: ShadingType.SOLID, color: 'F8F8F8' },
      }),
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: value, size: 20, font: 'Calibri' })],
          }),
        ],
        width: { size: COL_VALUE_DXA, type: WidthType.DXA },
        borders: NO_BORDERS,
      }),
    ],
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
        new TextRun({ text: 'RICHOZ ', bold: true, size: 36, color: RED, font: 'Calibri' }),
        new TextRun({ text: 'SANITAIRE', bold: true, size: 36, color: BLUE, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 50 },
    }),
  ];
}
