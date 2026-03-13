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
  Footer,
  PageNumber,
  Packer,
  ShadingType,
  TabStopPosition,
  TabStopType,
  ImageRun,
} from 'docx';

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
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const RED = 'C0392B';
const BLUE = '2C3E87';
const BLUE_LIGHT = 'D6E4F0';
const GRAY = '666666';
const WHITE = 'FFFFFF';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Blue banner with white text (like the Richoz PDF) */
function blueBanner(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: `  ${text}`,
        bold: true,
        size: 22,
        color: WHITE,
        font: 'Calibri',
      }),
    ],
    shading: { type: ShadingType.SOLID, color: BLUE },
    spacing: { before: 300, after: 150 },
  });
}

/** Red bold section title (Constat, Analyse...) */
function redSectionTitle(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22,
        color: RED,
        font: 'Calibri',
      }),
    ],
    spacing: { before: 200, after: 80 },
  });
}

/** Bold underlined sub-section title (Investigations, Conclusion...) */
function underlinedTitle(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        underline: {},
        size: 20,
        font: 'Calibri',
      }),
    ],
    spacing: { before: 200, after: 80 },
  });
}

/** Normal body text */
function bodyText(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text, size: 20, font: 'Calibri' }),
    ],
    spacing: { after: 60 },
  });
}

/** Gray italic placeholder */
function placeholder(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text, size: 20, font: 'Calibri', italics: true, color: '999999' }),
    ],
    spacing: { after: 60 },
  });
}

/** Info row inside a bordered table */
function infoRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true, size: 18, font: 'Calibri', color: GRAY })],
          }),
        ],
        width: { size: 30, type: WidthType.PERCENTAGE },
        borders: noBorders(),
        shading: { type: ShadingType.SOLID, color: 'F8F8F8' },
      }),
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: value, size: 20, font: 'Calibri' })],
          }),
        ],
        width: { size: 70, type: WidthType.PERCENTAGE },
        borders: noBorders(),
      }),
    ],
  });
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: WHITE };
  return { top: none, bottom: none, left: none, right: none };
}

/** Split textContent into structured sections if possible */
function parseStructuredContent(text: string): {
  constat: string;
  investigations: string;
  analyse: string;
  conclusion: string;
} | null {
  // Try to detect section markers in the text
  const lowerText = text.toLowerCase();
  if (
    lowerText.includes('constat') ||
    lowerText.includes('investigation') ||
    lowerText.includes('analyse') ||
    lowerText.includes('conclusion')
  ) {
    // Parse sections using regex
    const sections = { constat: '', investigations: '', analyse: '', conclusion: '' };
    const patterns = [
      { key: 'constat' as const, regex: /(?:constat[^\n]*?[:]\s*\n?)([\s\S]*?)(?=(?:investigation|analyse|conclusion)|$)/i },
      { key: 'investigations' as const, regex: /(?:investigation[^\n]*?[:]\s*\n?)([\s\S]*?)(?=(?:analyse|conclusion)|$)/i },
      { key: 'analyse' as const, regex: /(?:analyse[^\n]*?[:]\s*\n?)([\s\S]*?)(?=(?:conclusion)|$)/i },
      { key: 'conclusion' as const, regex: /(?:conclusion[^\n]*?[:]\s*\n?)([\s\S]*?)$/i },
    ];
    for (const { key, regex } of patterns) {
      const match = text.match(regex);
      if (match) sections[key] = match[1].trim();
    }
    if (sections.constat || sections.investigations || sections.analyse || sections.conclusion) {
      return sections;
    }
  }
  return null;
}

// ─── Main generator ──────────────────────────────────────────────────────────

export async function generateReportDocx(data: ReportData): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];

  // ═══ 1. HEADER ═══
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'RICHOZ ', bold: true, size: 36, color: RED, font: 'Calibri' }),
        new TextRun({ text: 'SANITAIRE', bold: true, size: 36, color: BLUE, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 50 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Rapport d'intervention", bold: true, size: 28, color: BLUE, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  // ═══ 2. BON DE TRAVAIL ═══
  if (data.workOrderNumber) {
    children.push(blueBanner(`Bon de travail N° ${data.workOrderNumber}`));
  }

  // ═══ 3. PROPRIÉTAIRE & RÉGIE ═══
  children.push(blueBanner('Propriétaire & Régie'));

  const regieRows: TableRow[] = [];
  if (data.ownerName) regieRows.push(infoRow('Propriétaire', data.ownerName));
  if (data.regieName) regieRows.push(infoRow('Régie', data.regieName));
  if (data.regiePhone) regieRows.push(infoRow('Téléphone', data.regiePhone));
  if (data.regieEmail) regieRows.push(infoRow('Email', data.regieEmail));
  if (regieRows.length === 0) regieRows.push(infoRow('Régie', data.regieName || '—'));

  children.push(
    new Table({
      rows: regieRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    })
  );

  // ═══ 4. LOCATAIRE ═══
  children.push(blueBanner('Locataire'));

  const locataireRows: TableRow[] = [];
  if (data.address) locataireRows.push(infoRow('Adresse', data.address));
  if (data.clientName) locataireRows.push(infoRow('Locataire', data.clientName));
  if (data.clientPhone) locataireRows.push(infoRow('Téléphone', data.clientPhone));
  if (data.clientEmail) locataireRows.push(infoRow('Email', data.clientEmail));
  if (data.keysInfo) locataireRows.push(infoRow('Clés', data.keysInfo));
  if (locataireRows.length === 0) locataireRows.push(infoRow('Adresse', data.address || '—'));

  children.push(
    new Table({
      rows: locataireRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    })
  );

  // ═══ 5. DESCRIPTION DE L'INTERVENTION ═══
  children.push(blueBanner("Description de l'intervention"));

  // Technicien info
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Technicien : ', bold: true, size: 20, font: 'Calibri', color: GRAY }),
        new TextRun({ text: data.technicianName, size: 20, font: 'Calibri' }),
        ...(data.technicianPhone
          ? [
              new TextRun({ text: ` — ${data.technicianPhone}`, size: 20, font: 'Calibri', color: GRAY }),
            ]
          : []),
      ],
      spacing: { after: 150 },
    })
  );

  // Try structured content parsing
  const structured = data.textContent ? parseStructuredContent(data.textContent) : null;

  if (structured) {
    // Structured sections matching Richoz PDF format
    redSectionTitle("Constat à l'arrivée") && children.push(redSectionTitle("Constat à l'arrivée"));
    if (structured.constat) {
      for (const line of structured.constat.split('\n')) {
        if (line.trim()) children.push(bodyText(line));
      }
    } else {
      children.push(placeholder('(à compléter)'));
    }

    children.push(underlinedTitle('Investigations réalisées'));
    if (structured.investigations) {
      for (const line of structured.investigations.split('\n')) {
        if (line.trim()) children.push(bodyText(line));
      }
    } else {
      children.push(placeholder('(à compléter)'));
    }

    children.push(redSectionTitle('Analyse de la situation'));
    if (structured.analyse) {
      for (const line of structured.analyse.split('\n')) {
        if (line.trim()) children.push(bodyText(line));
      }
    } else {
      children.push(placeholder('(à compléter)'));
    }

    children.push(underlinedTitle('Conclusion'));
    if (structured.conclusion) {
      for (const line of structured.conclusion.split('\n')) {
        if (line.trim()) children.push(bodyText(line));
      }
    } else {
      children.push(placeholder('(à compléter)'));
    }
  } else {
    // Unstructured: create all 4 sections with content in "Constat" and placeholders for the rest
    children.push(redSectionTitle("Constat à l'arrivée"));
    if (data.textContent) {
      for (const line of data.textContent.split('\n')) {
        if (line.trim()) children.push(bodyText(line));
      }
    } else {
      children.push(placeholder('(à compléter)'));
    }

    children.push(underlinedTitle('Investigations réalisées'));
    children.push(placeholder('(à compléter)'));

    children.push(redSectionTitle('Analyse de la situation'));
    children.push(placeholder('(à compléter)'));

    children.push(underlinedTitle('Conclusion'));
    children.push(placeholder('(à compléter)'));
  }

  // ═══ 5b. FOURNITURES ═══
  if (data.suppliesText) {
    children.push(blueBanner('Fournitures utilisées'));
    for (const line of data.suppliesText.split('\n')) {
      if (line.trim()) children.push(bodyText(line));
    }
  }

  // ═══ 6. DATE DE L'INTERVENTION ═══
  children.push(blueBanner("Date de l'intervention"));

  const dateRows: TableRow[] = [];
  if (data.datePlanned) dateRows.push(infoRow('Date planifiée', data.datePlanned));
  dateRows.push(infoRow('Rapport soumis le', data.createdAt));
  dateRows.push(infoRow('Terminée', data.isCompleted ? 'Oui' : 'Non'));
  if (data.workDurationMinutes) {
    dateRows.push(infoRow('Durée de travail', `${data.workDurationMinutes} min (${(data.workDurationMinutes / 60).toFixed(1)}h)`));
  }
  dateRows.push(infoRow('Facturable', data.isBillable ? 'Oui' : `Non${data.billableReason ? ` — ${data.billableReason}` : ''}`));

  children.push(
    new Table({
      rows: dateRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    })
  );

  // ═══ 7. PHOTOS AVANT ═══
  children.push(blueBanner('Photos Avant'));

  if (data.photosBefore && data.photosBefore.length > 0) {
    for (const photo of data.photosBefore) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: photo.caption || `[Photo: ${photo.url.split('/').pop() || 'image'}]`,
              size: 18,
              font: 'Calibri',
              color: BLUE,
            }),
          ],
          spacing: { after: 40 },
        })
      );
    }
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `(${data.photosBefore.length} photo${data.photosBefore.length > 1 ? 's' : ''} — les images sont visibles dans l'application)`,
            size: 18,
            font: 'Calibri',
            italics: true,
            color: '999999',
          }),
        ],
        spacing: { after: 100 },
      })
    );
  } else {
    children.push(placeholder('Aucune photo avant'));
  }

  // ═══ 8. PHOTOS APRÈS ═══
  children.push(blueBanner('Photos Après'));

  if (data.photosAfter && data.photosAfter.length > 0) {
    for (const photo of data.photosAfter) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: photo.caption || `[Photo: ${photo.url.split('/').pop() || 'image'}]`,
              size: 18,
              font: 'Calibri',
              color: BLUE,
            }),
          ],
          spacing: { after: 40 },
        })
      );
    }
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `(${data.photosAfter.length} photo${data.photosAfter.length > 1 ? 's' : ''} — les images sont visibles dans l'application)`,
            size: 18,
            font: 'Calibri',
            italics: true,
            color: '999999',
          }),
        ],
        spacing: { after: 100 },
      })
    );
  } else {
    children.push(placeholder('Aucune photo après'));
  }

  // ═══ DOCUMENT ═══
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 800, right: 900, bottom: 800, left: 900 },
          },
        },
        children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'RICHOZ SANITAIRE — 50 Route de Chancy, 1213 Petit-Lancy — info@richoz-sanitaire.ch — 022 792 10 63 — Page ',
                    size: 14,
                    font: 'Calibri',
                    color: GRAY,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 14,
                    font: 'Calibri',
                    color: GRAY,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
      },
    ],
  });

  return await Packer.toBlob(doc);
}
