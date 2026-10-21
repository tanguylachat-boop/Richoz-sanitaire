import { Document, Paragraph, TextRun, Table, AlignmentType, Packer } from 'docx';
import {
  RED,
  GRAY,
  brandHeader,
  blankLine,
  bodyParagraphs,
  documentStylesXml,
  pageSetup,
  photoTable,
  section,
  infoLine,
  signatureBlock,
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

  children.push(...brandHeader('Rapport de piquet', { color: RED }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'Urgence nocturne', italics: true, size: 22, color: GRAY, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    })
  );

  children.push(...section(`N° ${data.id.slice(0, 8).toUpperCase()} — Émis le ${data.createdAt}`));

  children.push(...section('Intervention'));
  children.push(infoLine('Technicien', data.technicianName + (data.technicianPhone ? ` — ${data.technicianPhone}` : '')));
  children.push(infoLine('Adresse', data.address));
  if (data.clientName) {
    children.push(infoLine('Client', data.clientName + (data.clientPhone ? ` · ${data.clientPhone}` : '')));
  }

  children.push(...section('Horaires'));
  children.push(infoLine('Appel reçu', data.callReceivedAt));
  if (data.interventionStartedAt) children.push(infoLine('Début intervention', data.interventionStartedAt));
  if (data.interventionEndedAt) children.push(infoLine('Fin intervention', data.interventionEndedAt));

  if (data.problemDescription) {
    children.push(...section("Constat à l'arrivée"), blankLine());
    children.push(...bodyParagraphs(data.problemDescription));
  }

  if (data.actionsTaken) {
    children.push(...section('Actions réalisées'), blankLine());
    children.push(...bodyParagraphs(data.actionsTaken));
  }

  if (data.suppliesUsed) {
    children.push(...section('Matériel utilisé'), blankLine());
    children.push(...bodyParagraphs(data.suppliesUsed));
  }

  if (data.photos && data.photos.length > 0) {
    children.push(...section('Photos'), blankLine());
    children.push(...(await photoTable(data.photos.slice(0, 30).map((url) => ({ url })))));
  }

  children.push(...section('Signature du client'), blankLine());
  children.push(...(await signatureBlock(data.clientSignature)));

  return new Document({
    externalStyles: documentStylesXml(),
    sections: [{ ...pageSetup(), children }],
  });
}

export async function generatePiquetDocxBuffer(data: PiquetReportData): Promise<Buffer> {
  const doc = await buildPiquetDocument(data);
  return await Packer.toBuffer(doc);
}
