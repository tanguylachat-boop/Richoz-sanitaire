import { Document, Paragraph, Table, Packer } from 'docx';
import {
  brandHeader,
  blankLine,
  bodyParagraphs,
  documentStylesXml,
  infoLine,
  pageSetup,
  photoTable,
  placeholder,
  section,
  sectionLabel,
  signatureBlock,
} from './docx/shared';

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

// Layout, colors, sizes and page setup: src/lib/docx/shared.ts, measured on
// the Richoz reference PDF (bon 2026 252 113).

// ─── Document assembly ───────────────────────────────────────────────────────

async function buildReportDocument(data: ReportData): Promise<Document> {
  const children: (Paragraph | Table)[] = [];

  // ═══ 1. TITRE — RICHOZ SANITAIRE + 🚨 Rapport d'intervention 🚨 ═══
  children.push(...brandHeader("Rapport d'intervention", { sirens: true }));

  // ═══ 2. BANDEAU "Bon de travail numéro" ═══
  children.push(...section('Bon de travail numéro :', data.workOrderNumber || '—'));

  // ═══ 3. PROPRIÉTAIRE & RÉGIE ═══
  children.push(sectionLabel('🏠', 'Propriétaire & Régie'));
  children.push(
    infoLine('Propriétaire', data.ownerName || ''),
    infoLine('Régie', data.regieName || ''),
    infoLine('Téléphone de contact', data.ownerPhone || data.regiePhone || ''),
    infoLine('Email de contact', data.regieEmail || '')
  );

  // ═══ 4. LOCATAIRE ═══
  children.push(...section('Locataire'));
  children.push(sectionLabel('🏢', "Adresse de l'immeuble"));
  children.push(
    infoLine("Dans l'immeuble", data.address || ''),
    infoLine('Chez', data.clientName ? `Madame / Monsieur ${data.clientName}` : ''),
    infoLine('Téléphone', data.clientPhone || ''),
    infoLine('Email', data.clientEmail || ''),
    infoLine('Clés', data.keysInfo || '')
  );

  // ═══ 5. DESCRIPTION DE L'INTERVENTION ═══
  children.push(...section("Description de l'intervention"), blankLine());
  if (data.textContent && data.textContent.trim()) {
    children.push(...bodyParagraphs(data.textContent));
  } else {
    children.push(placeholder('(à compléter)'));
  }

  // ═══ 5b. FOURNITURES (optionnel) ═══
  if (data.suppliesText && data.suppliesText.trim()) {
    children.push(...section('Fournitures utilisées'), blankLine());
    children.push(...bodyParagraphs(data.suppliesText));
  }

  // ═══ 6. DATE DE L'INTERVENTION ═══
  children.push(...section("Date de l'intervention"), blankLine());
  children.push(infoLine('Le', data.datePlanned || data.createdAt, { boldLabel: true }));
  children.push(
    infoLine(
      'Terminée',
      data.isCompleted ? 'Oui' : `Non${data.billableReason ? ` — ${data.billableReason}` : ''}`,
      { boldLabel: true },
    )
  );
  if (data.workDurationMinutes) {
    children.push(
      infoLine('Durée', `${data.workDurationMinutes} min (${(data.workDurationMinutes / 60).toFixed(1)} h)`, { boldLabel: true })
    );
  }

  // ═══ 7. PHOTOS AVANT ═══
  children.push(...section('Photos Avant'), blankLine());
  if (data.photosBefore && data.photosBefore.length > 0) {
    children.push(...(await photoTable(data.photosBefore)));
  } else {
    children.push(placeholder('Aucune photo avant'));
  }

  // ═══ 8. PHOTOS APRÈS ═══
  children.push(...section('Photos Après'), blankLine());
  if (data.photosAfter && data.photosAfter.length > 0) {
    children.push(...(await photoTable(data.photosAfter)));
  } else {
    children.push(placeholder('Aucune photo après'));
  }

  // ═══ 9. SIGNATURE CLIENT ═══
  children.push(...section('Signature Client'), blankLine());
  children.push(...(await signatureBlock(data.clientSignature)));

  return new Document({
    externalStyles: documentStylesXml(),
    sections: [{ ...pageSetup(), children }],
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
