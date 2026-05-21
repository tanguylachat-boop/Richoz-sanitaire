import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  Packer,
  ShadingType,
  ImageRun,
} from 'docx';
import { buildWatermarkParagraph } from './docx/watermark';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportData {
  // Header
  title: string;
  workOrderNumber?: string;
  // Propriétaire & Régie
  regieName?: string;
  regiePhone?: string;
  regieEmail?: string;
  ownerName?: string;
  ownerPhone?: string;
  // Locataire
  address?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  keysInfo?: string;
  // Technicien
  technicianName: string;
  technicianPhone?: string;
  // Intervention
  datePlanned?: string;
  createdAt: string;
  isCompleted: boolean;
  isBillable: boolean;
  billableReason?: string;
  workDurationMinutes?: number;
  // Description structurée
  textContent?: string;
  suppliesText?: string;
  // Photos (URLs)
  photosBefore?: { url: string; caption?: string }[];
  photosAfter?: { url: string; caption?: string }[];
  // Signature (data URL or public URL)
  clientSignature?: string | null;
}

// ─── Colors ──────────────────────────────────────────────────────────────────
// Matched against the Richoz reference PDF (1 823 591.pdf)

const BLUE = '1F4E9C';        // RICHOZ + section ribbons (royal blue)
const GREEN = '6FB23A';        // SANITAIRE (vivid leaf green)
const GRAY = '666666';
const WHITE = 'FFFFFF';

// A4 layout in twips (twentieths of a point).
const PAGE_WIDTH_DXA = 9600;
const COL_LABEL_DXA = 3200;
const COL_VALUE_DXA = 6400;

// Footer text reused on every page
const COMPANY_FOOTER =
  'RICHOZ SANITAIRE   50 Route de Chancy   1213 Petit-Lancy   info@richoz-sanitaire.ch   +41 22 313 00 27';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Centered blue section banner (white text on blue), matching the Richoz
 * PDF section headers like "Bon de travail numéro : 1 823 591".
 */
function blueBanner(text: string, valueSuffix?: string): Paragraph {
  const children = [
    new TextRun({ text, bold: true, size: 24, color: WHITE, font: 'Calibri' }),
  ];
  if (valueSuffix) {
    children.push(
      new TextRun({ text: '   ', size: 24, color: WHITE, font: 'Calibri' }),
      new TextRun({ text: valueSuffix, size: 22, color: WHITE, font: 'Calibri' })
    );
  }
  return new Paragraph({
    children,
    shading: { type: ShadingType.SOLID, color: BLUE },
    alignment: AlignmentType.CENTER,
    spacing: { before: 280, after: 140 },
  });
}

/** Blue sub-section header with optional emoji icon, like "🏠 Propriétaire & Régie" */
function sectionLabel(icon: string, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${icon} `, size: 22, font: 'Segoe UI Emoji' }),
      new TextRun({ text, bold: true, size: 22, color: BLUE, font: 'Calibri' }),
    ],
    spacing: { before: 120, after: 60 },
  });
}

/** Normal body text */
function bodyText(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: 'Calibri' })],
    spacing: { after: 60 },
  });
}

/** Gray italic placeholder */
function placeholder(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: 'Calibri', italics: true, color: '999999' })],
    spacing: { after: 60 },
  });
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: WHITE };
  return { top: none, bottom: none, left: none, right: none };
}

/** Label/value row used inside the info tables under each section */
function labelValueRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, size: 20, font: 'Calibri', color: GRAY })],
          }),
        ],
        width: { size: COL_LABEL_DXA, type: WidthType.DXA },
        borders: noBorders(),
      }),
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: value, size: 20, font: 'Calibri' })],
          }),
        ],
        width: { size: COL_VALUE_DXA, type: WidthType.DXA },
        borders: noBorders(),
      }),
    ],
  });
}

async function downloadImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

async function buildPhotoSection(
  photos: { url: string; caption?: string }[],
  emptyText: string,
): Promise<(Paragraph | Table)[]> {
  const result: (Paragraph | Table)[] = [];
  if (!photos || photos.length === 0) {
    result.push(placeholder(emptyText));
    return result;
  }
  const total = photos.length;
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const imageData = await downloadImage(photo.url);
    if (imageData) {
      result.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: imageData,
              transformation: { width: 450, height: 340 },
              type: 'jpg',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 40 },
        })
      );
      result.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Photo ${i + 1} / ${total}${photo.caption ? ' — ' + photo.caption : ''}`,
              size: 16,
              font: 'Calibri',
              italics: true,
              color: GRAY,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        })
      );
    } else {
      result.push(
        placeholder(`[Image non disponible: ${photo.url.split('/').pop() || 'photo'}]`)
      );
    }
  }
  return result;
}

// ─── Document assembly ───────────────────────────────────────────────────────

async function buildReportDocument(data: ReportData): Promise<Document> {
  const children: (Paragraph | Table)[] = [];

  // ═══ 1. TITRE PRINCIPAL — RICHOZ (bleu) + SANITAIRE (vert) ═══
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'RICHOZ ', bold: true, size: 56, color: BLUE, font: 'Calibri' }),
        new TextRun({ text: 'SANITAIRE', bold: true, size: 56, color: GREEN, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 100 },
    })
  );

  // ═══ 2. SOUS-TITRE avec emojis sirène ═══
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: '🚨  ', size: 28, font: 'Segoe UI Emoji' }),
        new TextRun({ text: "Rapport d'intervention", bold: true, size: 28, color: BLUE, font: 'Calibri' }),
        new TextRun({ text: '  🚨', size: 28, font: 'Segoe UI Emoji' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    })
  );

  // ═══ 3. BANDEAU "Bon de travail numéro" — TOUT EN HAUT ═══
  children.push(blueBanner('Bon de travail numéro :', data.workOrderNumber || '—'));

  // ═══ 4. PROPRIÉTAIRE & RÉGIE ═══
  children.push(sectionLabel('🏠', 'Propriétaire & Régie'));
  children.push(
    new Table({
      rows: [
        labelValueRow('Propriétaire :', data.ownerName || ''),
        labelValueRow('Régie :', data.regieName || ''),
        labelValueRow('Téléphone de contact :', data.ownerPhone || data.regiePhone || ''),
        labelValueRow('Email de contact :', data.regieEmail || ''),
      ],
      width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
      columnWidths: [COL_LABEL_DXA, COL_VALUE_DXA],
    })
  );

  // ═══ 5. BANDEAU "Locataire" ═══
  children.push(blueBanner('Locataire'));
  children.push(sectionLabel('🏢', "Adresse de l'immeuble"));
  children.push(
    new Table({
      rows: [
        labelValueRow("Dans l'immeuble :", data.address || ''),
        labelValueRow('Chez :', data.clientName ? `Madame / Monsieur ${data.clientName}` : ''),
        labelValueRow('Téléphone :', data.clientPhone || ''),
        labelValueRow('Email :', data.clientEmail || ''),
        labelValueRow('Clés :', data.keysInfo || ''),
      ],
      width: { size: PAGE_WIDTH_DXA, type: WidthType.DXA },
      columnWidths: [COL_LABEL_DXA, COL_VALUE_DXA],
    })
  );

  // ═══ 6. DESCRIPTION DE L'INTERVENTION ═══
  children.push(blueBanner("Description de l'intervention"));
  if (data.textContent && data.textContent.trim()) {
    for (const line of data.textContent.split('\n')) {
      if (line.trim()) children.push(bodyText(line));
      else children.push(new Paragraph({ spacing: { after: 60 } }));
    }
  } else {
    children.push(placeholder('(à compléter)'));
  }

  // ═══ 6b. FOURNITURES (optionnel) ═══
  if (data.suppliesText && data.suppliesText.trim()) {
    children.push(blueBanner('Fournitures utilisées'));
    for (const line of data.suppliesText.split('\n')) {
      if (line.trim()) children.push(bodyText(line));
    }
  }

  // ═══ 7. DATE DE L'INTERVENTION ═══
  children.push(blueBanner("Date de l'intervention"));
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Le : ', bold: true, size: 22, font: 'Calibri', color: BLUE }),
        new TextRun({ text: data.datePlanned || data.createdAt, size: 22, font: 'Calibri' }),
      ],
      spacing: { before: 80, after: 40 },
    })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Terminée : ', bold: true, size: 22, font: 'Calibri', color: BLUE }),
        new TextRun({
          text: data.isCompleted ? 'Oui' : `Non${data.billableReason ? ` — ${data.billableReason}` : ''}`,
          size: 22,
          font: 'Calibri',
        }),
      ],
      spacing: { after: 40 },
    })
  );
  if (data.workDurationMinutes) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Durée : ', bold: true, size: 22, font: 'Calibri', color: BLUE }),
          new TextRun({
            text: `${data.workDurationMinutes} min (${(data.workDurationMinutes / 60).toFixed(1)} h)`,
            size: 22,
            font: 'Calibri',
          }),
        ],
        spacing: { after: 100 },
      })
    );
  }

  // ═══ 8. PHOTOS AVANT ═══
  children.push(blueBanner('Photos Avant'));
  const before = await buildPhotoSection(data.photosBefore || [], 'Aucune photo avant');
  children.push(...before);

  // ═══ 9. PHOTOS APRÈS ═══
  children.push(blueBanner('Photos Après'));
  const after = await buildPhotoSection(data.photosAfter || [], 'Aucune photo après');
  children.push(...after);

  // ═══ 10. SIGNATURE CLIENT ═══
  children.push(blueBanner('Signature Client'));
  if (data.clientSignature) {
    const sigData = await downloadImage(data.clientSignature);
    if (sigData) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: sigData,
              transformation: { width: 320, height: 120 },
              type: 'png',
            }),
          ],
          spacing: { before: 120, after: 100 },
        })
      );
    } else {
      children.push(placeholder('Signature non disponible'));
    }
  } else {
    children.push(placeholder('Non signé'));
  }

  // ═══ HEADER (watermark + bandeau adresse) ═══
  const headerChildren: Paragraph[] = [
    buildWatermarkParagraph(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: COMPANY_FOOTER, size: 14, font: 'Calibri', color: BLUE }),
      ],
    }),
  ];

  // ═══ FOOTER (Page X sur Y) ═══
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Page ', size: 14, font: 'Calibri', color: GRAY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 14, font: 'Calibri', color: GRAY }),
          new TextRun({ text: ' sur ', size: 14, font: 'Calibri', color: GRAY }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, font: 'Calibri', color: GRAY }),
        ],
      }),
    ],
  });

  return new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1200, right: 900, bottom: 800, left: 900 } },
        },
        children,
        headers: { default: new Header({ children: headerChildren }) },
        footers: { default: footer },
      },
    ],
  });
}

/** Browser variant: returns Blob */
export async function generateReportDocx(data: ReportData): Promise<Blob> {
  const doc = await buildReportDocument(data);
  return await Packer.toBlob(doc);
}

/** Server variant: returns Buffer for Node.js API routes */
export async function generateReportDocxBuffer(data: ReportData): Promise<Buffer> {
  const doc = await buildReportDocument(data);
  return await Packer.toBuffer(doc);
}
