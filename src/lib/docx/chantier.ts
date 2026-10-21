import { Document, Paragraph, TextRun, Table, Packer } from 'docx';
import {
  GRAY,
  TEXT_BLUE,
  brandHeader,
  blankLine,
  bodyParagraphs,
  documentStylesXml,
  pageSetup,
  photoTable,
  section,
  redTitle,
  bodyText,
  placeholder,
  infoLine,
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

  children.push(...brandHeader('Rapport de chantier'));

  if (data.workOrderNumber) {
    children.push(...section(`Bon de travail N° ${data.workOrderNumber}`));
  }

  children.push(...section('Chantier'));
  if (data.title) children.push(infoLine('Titre', data.title));
  if (data.address) children.push(infoLine('Adresse', data.address));
  if (data.regieName) children.push(infoLine('Régie', data.regieName));
  if (data.ownerName) children.push(infoLine('Propriétaire', data.ownerName));
  if (data.clientName) children.push(infoLine('Contact', data.clientName + (data.clientPhone ? ` · ${data.clientPhone}` : '')));

  children.push(...section('Suivi'));
  children.push(infoLine('Technicien', data.technicianName + (data.technicianPhone ? ` — ${data.technicianPhone}` : '')));
  if (data.dateStart) children.push(infoLine('Début de chantier', data.dateStart));
  if (data.datePlanned) children.push(infoLine('Dernière intervention', data.datePlanned));
  children.push(infoLine('Rapport généré le', data.createdAt));
  if (typeof data.progressPercent === 'number') {
    children.push(infoLine('Avancement', `${data.progressPercent} %`));
  }

  children.push(...section('Description des travaux'), blankLine());
  if (data.textContent && data.textContent.trim()) {
    children.push(...bodyParagraphs(data.textContent));
  } else {
    children.push(placeholder('(à compléter)'));
  }

  if (data.suppliesText && data.suppliesText.trim()) {
    children.push(...section('Fournitures et matériel'), blankLine());
    children.push(...bodyParagraphs(data.suppliesText));
  }

  if (data.cutoffs && data.cutoffs.length > 0) {
    children.push(...section('Coupures et avis'));
    for (const c of data.cutoffs) {
      children.push(redTitle(`${c.type} — ${c.start_date}${c.end_date ? ` → ${c.end_date}` : ''}`));
      if (c.floors) children.push(bodyText(`Étages concernés : ${c.floors}`));
      if (c.message) children.push(bodyText(c.message));
    }
  }

  if (data.journal && data.journal.length > 0) {
    children.push(...section('Journal de chantier'));
    for (const j of data.journal) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${j.created_at} — `, bold: true, size: 22, font: 'Calibri', color: GRAY }),
            new TextRun({ text: j.author, bold: true, size: 22, font: 'Calibri', color: TEXT_BLUE }),
          ],
          spacing: { before: 100, after: 40 },
        })
      );
      for (const line of (j.message || '').split('\n')) {
        if (line.trim()) children.push(bodyText(line));
      }
    }
  }

  if (data.photos && data.photos.length > 0) {
    children.push(...section('Photos du chantier'), blankLine());
    children.push(...(await photoTable(data.photos.slice(0, 30))));
  }

  return new Document({
    externalStyles: documentStylesXml(),
    sections: [{ ...pageSetup(), children }],
  });
}

export async function generateChantierDocxBuffer(data: ChantierReportData): Promise<Buffer> {
  const doc = await buildChantierDocument(data);
  return await Packer.toBuffer(doc);
}
