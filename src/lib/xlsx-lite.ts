// Lecteur XLSX minimal, côté serveur uniquement (Node zlib).
// Sécurité : lit exclusivement les VALEURS EN CACHE des cellules (<v>) et les
// chaînes partagées. Les formules, macros, liens externes et tout contenu
// actif sont ignorés — jamais évalués. Aucune dépendance ajoutée.

import { inflateRawSync } from 'node:zlib';

interface ZipEntry {
  name: string;
  data: Buffer;
}

// Parcourt le répertoire central d'un ZIP (fin de fichier) puis extrait les
// entrées (méthodes 0 = stocké, 8 = deflate). Refuse tout le reste.
function unzip(buffer: Buffer): ZipEntry[] {
  // End Of Central Directory : signature 0x06054b50, cherchée depuis la fin.
  let eocd = -1;
  const minEocd = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minEocd; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Fichier XLSX invalide (archive illisible)');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Répertoire ZIP corrompu');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');

    // En-tête local : recalcule le début réel des données
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.push({ name, data: Buffer.from(raw) });
    } else if (method === 8) {
      entries.push({ name, data: inflateRawSync(raw) });
    } else {
      throw new Error(`Méthode de compression non supportée (${method})`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

// Concatène les <t> d'un bloc (gère les runs <r><t>...</t></r>)
function textOf(block: string): string {
  const parts = Array.from(block.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g), (m) => decodeXmlEntities(m[1]));
  return parts.join('');
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si[ >]([\s\S]*?)<\/si>/g), (m) => textOf(m[1]));
}

function columnIndex(cellRef: string): number {
  const letters = cellRef.replace(/\d+$/, '');
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

/**
 * Retourne les lignes de la première feuille sous forme de tableaux de
 * chaînes. Les formules sont ignorées : seule la valeur en cache est lue.
 */
export function readFirstSheet(buffer: Buffer): string[][] {
  const entries = unzip(buffer);
  const byName = new Map(entries.map((e) => [e.name, e.data]));
  const shared = parseSharedStrings(byName.get('xl/sharedStrings.xml')?.toString('utf8'));
  // Première feuille : sheet1.xml par convention, sinon la première worksheets/*
  const sheetName = byName.has('xl/worksheets/sheet1.xml')
    ? 'xl/worksheets/sheet1.xml'
    : Array.from(byName.keys()).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!sheetName) throw new Error('Aucune feuille trouvée dans le classeur');
  const xml = byName.get(sheetName)!.toString('utf8');

  const rows: string[][] = [];
  for (const rowMatch of Array.from(xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g))) {
    const cells: string[] = [];
    for (const cellMatch of Array.from(rowMatch[1].matchAll(/<c ([^>]*?)\/>|<c ([^>]*?)>([\s\S]*?)<\/c>/g))) {
      const attrs = cellMatch[1] ?? cellMatch[2] ?? '';
      const inner = cellMatch[3] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const index = ref ? columnIndex(ref) : cells.length;
      let value = '';
      if (type === 'inlineStr') {
        value = textOf(inner);
      } else {
        // Valeur en cache uniquement ; la balise <f> (formule) est ignorée.
        const v = /<v[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) {
          value = type === 's' ? (shared[Number(v)] ?? '') : decodeXmlEntities(v);
        }
      }
      cells[index] = value;
    }
    // Normalise les trous en chaînes vides
    rows.push(Array.from(cells, (c) => c ?? ''));
  }
  return rows;
}

/** Analyse CSV simple (séparateur , ou ; auto-détecté, guillemets doubles). */
export function readCsv(buffer: Buffer): string[][] {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  const sep = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.length > 1 || row[0] !== '') rows.push(row); }
  return rows;
}
