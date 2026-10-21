import {
  Document,
  Paragraph,
  TextRun,
  Table,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  Packer,
  ImageRun,
} from 'docx';
import { buildWatermarkParagraph } from './docx/watermark';
import { bannerTable, bannerRun, documentStyles, sectionSpacer, PAGE_MARGINS, BLUE, GREEN, TEXT_BLUE, GRAY } from './docx/shared';

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

// Colors and margins: shared with the chantier/piquet reports, measured on the
// Richoz reference PDF (bon 2026 252 113).


// Footer text reused on every page
const COMPANY_FOOTER =
  'RICHOZ SANITAIRE   50 Route de Chancy   1213 Petit-Lancy   info@richoz-sanitaire.ch   +41 22 313 00 27';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Centered blue section banner (white text on blue), matching the Richoz
 * PDF section headers like "Bon de travail numéro : 2026 252 113".
 * One-cell table shared with the other reports (see docx/shared.ts).
 */
function blueBanner(text: string, valueSuffix?: string): Table {
  const runs = [bannerRun(text)];
  if (valueSuffix) runs.push(bannerRun('  '), bannerRun(valueSuffix, 24));
  return bannerTable(runs);
}

/** Spacer + banner: an editable Normal line always exists before each ribbon. */
function section(text: string, valueSuffix?: string): (Paragraph | Table)[] {
  return [sectionSpacer(), blueBanner(text, valueSuffix)];
}

/** Blue sub-section header with optional emoji icon, like "🏠 Propriétaire & Régie" */
function sectionLabel(icon: string, text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${icon} `, size: 22, font: 'Segoe UI Emoji' }),
      new TextRun({ text, bold: true, size: 22, color: TEXT_BLUE, font: 'Calibri' }),
    ],
    spacing: { before: 120, after: 60 },
  });
}

/** Normal body text */
function bodyText(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: 'Calibri', color: TEXT_BLUE })],
    spacing: { after: 120 },
  });
}

/** Gray italic placeholder */
function placeholder(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: 'Calibri', italics: true, color: '999999' })],
    spacing: { after: 60 },
  });
}

/**
 * "Label : value" on one line, value right after the colon (the former
 * two-column table left a wide gap between "Régie :" and the name).
 */
function labelValue(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label} `, size: 22, font: 'Calibri', color: TEXT_BLUE }),
      new TextRun({ text: value, size: 22, font: 'Calibri', color: TEXT_BLUE }),
    ],
    spacing: { after: 60 },
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
): Promise<Paragraph[]> {
  const result: Paragraph[] = [];
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
  children.push(...section('Bon de travail numéro :', data.workOrderNumber || '—'));

  // ═══ 4. PROPRIÉTAIRE & RÉGIE ═══
  children.push(sectionLabel('🏠', 'Propriétaire & Régie'));
  children.push(
    labelValue('Propriétaire :', data.ownerName || ''),
    labelValue('Régie :', data.regieName || ''),
    labelValue('Téléphone de contact :', data.ownerPhone || data.regiePhone || ''),
    labelValue('Email de contact :', data.regieEmail || '')
  );

  // ═══ 5. BANDEAU "Locataire" ═══
  children.push(...section('Locataire'));
  children.push(sectionLabel('🏢', "Adresse de l'immeuble"));
  children.push(
    labelValue("Dans l'immeuble :", data.address || ''),
    labelValue('Chez :', data.clientName ? `Madame / Monsieur ${data.clientName}` : ''),
    labelValue('Téléphone :', data.clientPhone || ''),
    labelValue('Email :', data.clientEmail || ''),
    labelValue('Clés :', data.keysInfo || '')
  );

  // ═══ 6. DESCRIPTION DE L'INTERVENTION ═══
  children.push(...section("Description de l'intervention"));
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
    children.push(...section('Fournitures utilisées'));
    for (const line of data.suppliesText.split('\n')) {
      if (line.trim()) children.push(bodyText(line));
    }
  }

  // ═══ 7. DATE DE L'INTERVENTION ═══
  children.push(...section("Date de l'intervention"));
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Le : ', bold: true, size: 22, font: 'Calibri', color: TEXT_BLUE }),
        new TextRun({ text: data.datePlanned || data.createdAt, size: 22, font: 'Calibri', color: TEXT_BLUE }),
      ],
      spacing: { before: 80, after: 40 },
    })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Terminée : ', bold: true, size: 22, font: 'Calibri', color: TEXT_BLUE }),
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
          new TextRun({ text: 'Durée : ', bold: true, size: 22, font: 'Calibri', color: TEXT_BLUE }),
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
  children.push(...section('Photos Avant'));
  const before = await buildPhotoSection(data.photosBefore || [], 'Aucune photo avant');
  children.push(...before);

  // ═══ 9. PHOTOS APRÈS ═══
  children.push(...section('Photos Après'));
  const after = await buildPhotoSection(data.photosAfter || [], 'Aucune photo après');
  children.push(...after);

  // ═══ 10. SIGNATURE CLIENT ═══
  children.push(...section('Signature Client'));
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
    styles: documentStyles(),
    sections: [
      {
        properties: { page: { margin: PAGE_MARGINS } },
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
