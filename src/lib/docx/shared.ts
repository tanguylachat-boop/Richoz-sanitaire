import {
  Paragraph,
  TextRun,
  BorderStyle,
  ShadingType,
  AlignmentType,
  ImageRun,
  type IParagraphStyleOptions,
} from 'docx';

// Page width in DXA (twentieths of a point) for A4 minus our margins.
// A4 = 11907 dxa wide. Margins 900 dxa each side. Usable ≈ 10100.
export const PAGE_WIDTH_DXA = 9600;

export const RED = 'C0392B';
export const BLUE = '1F4E9C';
export const GREEN = '6FB23A';
export const GRAY = '666666';
export const WHITE = 'FFFFFF';

/**
 * Word paragraph style of the blue ribbons, shared by the three reports.
 * The blue background and the white bold text live in the STYLE, not as
 * direct formatting, and `next` is Normal: pressing Enter at the end of a
 * ribbon in Word gives a plain editable paragraph instead of a second blue
 * ribbon (reported by the Richoz secretary, 21.10.2026).
 */
export const BANNER_STYLE_ID = 'RichozBanner';

export function bannerParagraphStyle(): IParagraphStyleOptions {
  return {
    id: BANNER_STYLE_ID,
    name: 'Bandeau Richoz',
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    run: { bold: true, color: WHITE, font: 'Calibri', size: 22 },
    paragraph: {
      shading: { type: ShadingType.SOLID, color: BLUE },
      spacing: { before: 100, after: 150 },
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

export function blueBanner(text: string): Paragraph {
  return new Paragraph({
    style: BANNER_STYLE_ID,
    children: [new TextRun({ text: `  ${text}` })],
  });
}

/** Spacer + ribbon, to spread into the document children. */
export function section(text: string): Paragraph[] {
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
      new TextRun({ text: `${labelText} `, bold: true, size: 20, font: 'Calibri', color: GRAY }),
      new TextRun({ text: value, size: 20, font: 'Calibri' }),
    ],
    spacing: { after: 40 },
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
