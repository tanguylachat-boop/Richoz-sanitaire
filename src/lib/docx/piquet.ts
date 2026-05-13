import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  WidthType,
  AlignmentType,
  Footer,
  PageNumber,
  Packer,
  ImageRun,
} from 'docx';
import {
  RED,
  BLUE,
  GRAY,
  brandHeader,
  blueBanner,
  bodyText,
  placeholder,
  infoRow,
  imageParagraph,
  downloadImage,
} from './shared';

export interface PiquetReportData {
  id: string;
  technicianName: string;
  technicianPhone?: string | null;
  address: string;
  clientName?: string | null;
  clientPhone?: string | null;
  callReceivedAt: string;
  interventionStartedAt?: string | null;
  interventionEndedAt?: string | null;
  problemDescription?: string | null;
  actionsTaken?: string | null;
  suppliesUsed?: string | null;
  photos?: string[];
  clientSignature?: string | null;
  createdAt: string;
}

async function buildPiquetDocument(data: PiquetReportData): Promise<Document> {
  const children: (Paragraph | Table)[] = [];

  children.push(...brandHeader());
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Rapport de piquet', bold: true, size: 28, color: RED, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Urgence nocturne', italics: true, size: 18, color: GRAY, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  children.push(blueBanner(`N° ${data.id.slice(0, 8).toUpperCase()} — Émis le ${data.createdAt}`));

  children.push(blueBanner('Intervention'));
  const ir: TableRow[] = [];
  ir.push(infoRow('Technicien', data.technicianName + (data.technicianPhone ? ` — ${data.technicianPhone}` : '')));
  ir.push(infoRow('Adresse', data.address));
  if (data.clientName) {
    ir.push(infoRow('Client', data.clientName + (data.clientPhone ? ` · ${data.clientPhone}` : '')));
  }
  children.push(new Table({ rows: ir, width: { size: 100, type: WidthType.PERCENTAGE } }));

  children.push(blueBanner('Horaires'));
  const hr: TableRow[] = [];
  hr.push(infoRow('Appel reçu', data.callReceivedAt));
  if (data.interventionStartedAt) hr.push(infoRow('Début intervention', data.interventionStartedAt));
  if (data.interventionEndedAt) hr.push(infoRow('Fin intervention', data.interventionEndedAt));
  children.push(new Table({ rows: hr, width: { size: 100, type: WidthType.PERCENTAGE } }));

  if (data.problemDescription) {
    children.push(blueBanner("Constat à l'arrivée"));
    for (const line of data.problemDescription.split('\n')) {
      if (line.trim()) children.push(bodyText(line));
    }
  }

  if (data.actionsTaken) {
    children.push(blueBanner('Actions réalisées'));
    for (const line of data.actionsTaken.split('\n')) {
      if (line.trim()) children.push(bodyText(line));
    }
  }

  if (data.suppliesUsed) {
    children.push(blueBanner('Matériel utilisé'));
    for (const line of data.suppliesUsed.split('\n')) {
      if (line.trim()) children.push(bodyText(line));
    }
  }

  if (data.photos && data.photos.length > 0) {
    children.push(blueBanner('Photos'));
    for (const url of data.photos.slice(0, 30)) {
      const paras = await imageParagraph(url);
      children.push(...paras);
    }
  }

  children.push(blueBanner('Signature du client'));
  if (data.clientSignature) {
    const sig = await downloadImage(data.clientSignature);
    if (sig) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({ data: sig, transformation: { width: 280, height: 100 }, type: 'png' }),
          ],
          spacing: { after: 100 },
        })
      );
    } else {
      children.push(placeholder('Signature non disponible'));
    }
  } else {
    children.push(placeholder('Non signé'));
  }

  return new Document({
    sections: [
      {
        properties: { page: { margin: { top: 800, right: 900, bottom: 800, left: 900 } } },
        children,
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
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
              }),
            ],
          }),
        },
      },
    ],
  });
}

export async function generatePiquetDocxBuffer(data: PiquetReportData): Promise<Buffer> {
  const doc = await buildPiquetDocument(data);
  return await Packer.toBuffer(doc);
}
