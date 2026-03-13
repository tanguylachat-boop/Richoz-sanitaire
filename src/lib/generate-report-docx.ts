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
  HeadingLevel,
  ImageRun,
  Footer,
  PageNumber,
  NumberFormat,
  Packer,
  ShadingType,
} from 'docx';

interface ReportData {
  technicianName: string;
  technicianPhone?: string;
  regieName?: string;
  address?: string;
  clientName?: string;
  clientPhone?: string;
  datePlanned?: string;
  workOrderNumber?: string;
  title: string;
  textContent?: string;
  suppliesText?: string;
  workDurationMinutes?: number;
  isBillable: boolean;
  billableReason?: string;
  isCompleted: boolean;
  createdAt: string;
}

const RICHOZ_RED = 'C0392B';
const RICHOZ_BLUE = '2980B9';

function createSectionHeader(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24,
        color: RICHOZ_RED,
        font: 'Calibri',
      }),
    ],
    spacing: { before: 300, after: 100 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RICHOZ_RED },
    },
  });
}

function createInfoRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: label, bold: true, size: 20, font: 'Calibri', color: '333333' }),
            ],
          }),
        ],
        width: { size: 30, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        },
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
      }),
      new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({ text: value, size: 20, font: 'Calibri' }),
            ],
          }),
        ],
        width: { size: 70, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
        },
      }),
    ],
  });
}

export async function generateReportDocx(data: ReportData): Promise<Blob> {
  const infoRows: TableRow[] = [];

  if (data.workOrderNumber) infoRows.push(createInfoRow('N° Bon de travail', data.workOrderNumber));
  infoRows.push(createInfoRow('Technicien', data.technicianName));
  if (data.technicianPhone) infoRows.push(createInfoRow('Tél. technicien', data.technicianPhone));
  if (data.regieName) infoRows.push(createInfoRow('Régie', data.regieName));
  if (data.address) infoRows.push(createInfoRow('Adresse', data.address));
  if (data.clientName) infoRows.push(createInfoRow('Client / Locataire', data.clientName));
  if (data.clientPhone) infoRows.push(createInfoRow('Tél. client', data.clientPhone));
  if (data.datePlanned) infoRows.push(createInfoRow('Date intervention', data.datePlanned));
  infoRows.push(createInfoRow('Soumis le', data.createdAt));

  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'RICHOZ SANITAIRE',
          bold: true,
          size: 32,
          color: RICHOZ_RED,
          font: 'Calibri',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 50 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Rapport d'intervention",
          bold: true,
          size: 28,
          color: RICHOZ_BLUE,
          font: 'Calibri',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: data.title,
          bold: true,
          size: 24,
          font: 'Calibri',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  // Section: Informations
  children.push(createSectionHeader('Informations'));

  if (infoRows.length > 0) {
    children.push(
      new Table({
        rows: infoRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );
  }

  // Section: Statut
  children.push(createSectionHeader('Statut'));

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: data.isCompleted ? '✓ Intervention terminée' : '⚠ Intervention non terminée',
          size: 20,
          font: 'Calibri',
          bold: true,
          color: data.isCompleted ? '27AE60' : 'E67E22',
        }),
      ],
      spacing: { after: 100 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: data.isBillable ? '✓ Facturable' : '✗ Non facturable',
          size: 20,
          font: 'Calibri',
          bold: true,
          color: data.isBillable ? '27AE60' : 'E67E22',
        }),
        ...(data.billableReason
          ? [
              new TextRun({
                text: ` — ${data.billableReason}`,
                size: 20,
                font: 'Calibri',
                italics: true,
              }),
            ]
          : []),
      ],
      spacing: { after: 100 },
    })
  );

  if (data.workDurationMinutes) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Durée de travail : ${data.workDurationMinutes} minutes (${(data.workDurationMinutes / 60).toFixed(1)}h)`,
            size: 20,
            font: 'Calibri',
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  // Section: Description
  children.push(createSectionHeader('Description du travail'));

  if (data.textContent) {
    const lines = data.textContent.split('\n');
    for (const line of lines) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: line, size: 20, font: 'Calibri' }),
          ],
          spacing: { after: 80 },
        })
      );
    }
  } else {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Aucune description fournie.', size: 20, font: 'Calibri', italics: true, color: '999999' }),
        ],
      })
    );
  }

  // Section: Fournitures
  children.push(createSectionHeader('Fournitures utilisées'));

  if (data.suppliesText) {
    const lines = data.suppliesText.split('\n');
    for (const line of lines) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: line, size: 20, font: 'Calibri' }),
          ],
          spacing: { after: 80 },
        })
      );
    }
  } else {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Aucune fourniture notée.', size: 20, font: 'Calibri', italics: true, color: '999999' }),
        ],
      })
    );
  }

  // Footer note
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: '', size: 20 }),
      ],
      spacing: { before: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Richoz Sanitaire — Rapport généré automatiquement',
          size: 16,
          font: 'Calibri',
          italics: true,
          color: '999999',
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1000,
              right: 1000,
              bottom: 1000,
              left: 1000,
            },
          },
        },
        children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Richoz Sanitaire — Page ',
                    size: 16,
                    font: 'Calibri',
                    color: '999999',
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 16,
                    font: 'Calibri',
                    color: '999999',
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
