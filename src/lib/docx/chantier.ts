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
} from 'docx';
import {
  BLUE,
  GRAY,
  brandHeader,
  blueBanner,
  redTitle,
  bodyText,
  placeholder,
  infoRow,
  imageParagraph,
} from './shared';

export interface ChantierReportData {
  title: string;
  workOrderNumber?: string;
  regieName?: string;
  ownerName?: string;
  address?: string;
  clientName?: string;
  clientPhone?: string;
  technicianName: string;
  technicianPhone?: string;
  dateStart?: string;
  datePlanned?: string;
  createdAt: string;
  progressPercent?: number;
  textContent?: string;
  suppliesText?: string;
  photos?: { url: string; caption?: string }[];
  journal?: { author: string; created_at: string; message: string }[];
  cutoffs?: {
    type: string;
    start_date: string;
    end_date?: string | null;
    floors?: string | null;
    message?: string | null;
  }[];
}

async function buildChantierDocument(data: ChantierReportData): Promise<Document> {
  const children: (Paragraph | Table)[] = [];

  children.push(...brandHeader());
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Rapport de chantier', bold: true, size: 28, color: BLUE, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  if (data.workOrderNumber) {
    children.push(blueBanner(`Bon de travail N° ${data.workOrderNumber}`));
  }

  children.push(blueBanner('Chantier'));
  const ch: TableRow[] = [];
  if (data.title) ch.push(infoRow('Titre', data.title));
  if (data.address) ch.push(infoRow('Adresse', data.address));
  if (data.regieName) ch.push(infoRow('Régie', data.regieName));
  if (data.ownerName) ch.push(infoRow('Propriétaire', data.ownerName));
  if (data.clientName) ch.push(infoRow('Contact', data.clientName + (data.clientPhone ? ` · ${data.clientPhone}` : '')));
  if (ch.length > 0) {
    children.push(new Table({ rows: ch, width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  children.push(blueBanner('Suivi'));
  const su: TableRow[] = [];
  su.push(infoRow('Technicien', data.technicianName + (data.technicianPhone ? ` — ${data.technicianPhone}` : '')));
  if (data.dateStart) su.push(infoRow('Début de chantier', data.dateStart));
  if (data.datePlanned) su.push(infoRow('Dernière intervention', data.datePlanned));
  su.push(infoRow('Rapport généré le', data.createdAt));
  if (typeof data.progressPercent === 'number') {
    su.push(infoRow('Avancement', `${data.progressPercent} %`));
  }
  children.push(new Table({ rows: su, width: { size: 100, type: WidthType.PERCENTAGE } }));

  children.push(blueBanner('Description des travaux'));
  if (data.textContent && data.textContent.trim()) {
    for (const line of data.textContent.split('\n')) {
      if (line.trim()) children.push(bodyText(line));
    }
  } else {
    children.push(placeholder('(à compléter)'));
  }

  if (data.suppliesText && data.suppliesText.trim()) {
    children.push(blueBanner('Fournitures et matériel'));
    for (const line of data.suppliesText.split('\n')) {
      if (line.trim()) children.push(bodyText(line));
    }
  }

  if (data.cutoffs && data.cutoffs.length > 0) {
    children.push(blueBanner('Coupures et avis'));
    for (const c of data.cutoffs) {
      children.push(redTitle(`${c.type} — ${c.start_date}${c.end_date ? ` → ${c.end_date}` : ''}`));
      if (c.floors) children.push(bodyText(`Étages concernés : ${c.floors}`));
      if (c.message) children.push(bodyText(c.message));
    }
  }

  if (data.journal && data.journal.length > 0) {
    children.push(blueBanner('Journal de chantier'));
    for (const j of data.journal) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${j.created_at} — `, bold: true, size: 18, font: 'Calibri', color: GRAY }),
            new TextRun({ text: j.author, bold: true, size: 18, font: 'Calibri' }),
          ],
          spacing: { before: 100, after: 30 },
        })
      );
      for (const line of (j.message || '').split('\n')) {
        if (line.trim()) children.push(bodyText(line));
      }
    }
  }

  if (data.photos && data.photos.length > 0) {
    children.push(blueBanner('Photos du chantier'));
    for (const p of data.photos.slice(0, 30)) {
      const paras = await imageParagraph(p.url, p.caption);
      children.push(...paras);
    }
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

export async function generateChantierDocxBuffer(data: ChantierReportData): Promise<Buffer> {
  const doc = await buildChantierDocument(data);
  return await Packer.toBuffer(doc);
}
