// LOT 4 — tests unitaires de l'import Bexio : lecteur XLSX/CSV maison (aucune
// formule exécutée), mapping, validation, plan sans doublon. Données fictives.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTs(relative) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: 'commonjs', target: 'es2020' } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports);
  return mod.exports;
}

const xlsx = loadTs('src/lib/xlsx-lite.ts');
const imp = loadTs('src/lib/client-import.ts');

// Mini-ZIP méthode 0 (stocké) : suffisant pour un XLSX de test.
function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuffer.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, nameBuffer]));
    chunks.push(local, nameBuffer, data);
    offset += 30 + nameBuffer.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, directory, end]);
}

const shared = ['Nr.', 'Firma', 'Name', 'Vorname', 'E-Mail', 'Fiduciaire &amp; Co'];
const sheetXml = `<?xml version="1.0"?><worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>
<row r="2"><c r="A2"><v>1001</v></c><c r="B2" t="s"><v>5</v></c><c r="E2" t="inlineStr"><is><t>fictif@example.invalid</t></is></c></row>
<row r="3"><c r="A3"><f>SUM(1,1)</f><v>1002</v></c><c r="C3" t="inlineStr"><is><t>Fictif</t></is></c><c r="D3" t="inlineStr"><is><t>Jean</t></is></c></row>
</sheetData></worksheet>`;
const sharedXml = `<?xml version="1.0"?><sst>${shared.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`;
const fixture = zip([
  ['[Content_Types].xml', '<Types/>'],
  ['xl/workbook.xml', '<workbook/>'],
  ['xl/sharedStrings.xml', sharedXml],
  ['xl/worksheets/sheet1.xml', sheetXml],
]);

test('xlsx-lite : en-têtes, chaînes partagées, cellules absentes, formules jamais exécutées', () => {
  const rows = xlsx.readFirstSheet(fixture);
  assert.deepEqual(rows[0], ['Nr.', 'Firma', 'Name', 'Vorname', 'E-Mail']);
  assert.equal(rows[1][0], '1001');
  assert.equal(rows[1][1], 'Fiduciaire & Co'); // entité XML décodée
  assert.equal(rows[1][2], ''); // cellule absente → vide
  assert.equal(rows[1][4], 'fictif@example.invalid'); // inlineStr
  // La cellule A3 contient une formule : seule la VALEUR EN CACHE est lue.
  assert.equal(rows[2][0], '1002');
  assert.equal(rows[2][2], 'Fictif');
});

test('csv : séparateur ; auto-détecté, guillemets et retours ligne', () => {
  const rows = xlsx.readCsv(Buffer.from('Nr.;Nom;Adresse\n1;"Fictif; Jean";"Rue du Test 1\n1200 Fictiville"\n2;Autre;'));
  assert.deepEqual(rows[0], ['Nr.', 'Nom', 'Adresse']);
  assert.equal(rows[1][1], 'Fictif; Jean');
  assert.match(rows[1][2], /Rue du Test 1\n1200 Fictiville/);
  assert.equal(rows.length, 3);
});

test('suggestMapping : en-têtes Bexio DE/FR reconnus', () => {
  const mapping = imp.suggestMapping(['Nr.', 'Firma', 'Name', 'Vorname', 'E-Mail', 'Telefon Fixe', 'Mobile', 'Adresse', 'PLZ', 'Ort']);
  assert.equal(mapping.bexio_nr, 0);
  assert.equal(mapping.company_name, 1);
  assert.equal(mapping.last_name, 2);
  assert.equal(mapping.first_name, 3);
  assert.equal(mapping.email, 4);
  assert.equal(mapping.phone, 5);
  assert.equal(mapping.mobile, 6);
  assert.equal(mapping.address, 7);
  assert.equal(mapping.postal_code, 8);
  assert.equal(mapping.city, 9);
});

test('buildCandidates : validation, type déduit des seules données présentes', () => {
  const rows = [
    ['Nr.', 'Firma', 'Name', 'Vorname', 'E-Mail'],
    ['1', 'Entreprise Fictive SA', '', '', ''],
    ['2', '', 'Fictif', 'Jean', 'jean@example.invalid'],
    ['3', '', '', 'SansNom', ''],
    ['4', '', 'MauvaisMail', '', 'pas-un-email'],
    ['', '', '', '', ''],
  ];
  const mapping = { bexio_nr: 0, company_name: 1, last_name: 2, first_name: 3, email: 4 };
  const { candidates, rejected } = imp.buildCandidates(rows, mapping);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].client_type, 'entreprise');
  assert.equal(candidates[1].client_type, 'particulier');
  assert.deepEqual(rejected.map((r) => [r.row, r.reason]), [[4, 'Ni nom ni raison sociale'], [5, 'E-mail invalide']]);
});

test('planImport : réimport sans doublon, homonymes jamais fusionnés', () => {
  const base = { company_name: null, first_name: null, phone: null, address: null, mobile: null, postal_code: null, city: null, notes: null, email: null, bexio_nr: null, client_type: 'particulier' };
  const candidates = [
    { ...base, row: 2, bexio_nr: 'B1', last_name: 'Un' },
    { ...base, row: 3, bexio_nr: 'B1', last_name: 'DoublonFichier' },
    { ...base, row: 4, bexio_nr: 'B2', last_name: 'DejaEnBase' },
    { ...base, row: 5, last_name: 'ParEmail', email: 'Connu@Example.invalid' },
    { ...base, row: 6, last_name: 'Homonyme', phone: '021 000 00 01', address: 'Rue A 1' },
    { ...base, row: 7, last_name: 'Homonyme', phone: '021 000 00 02', address: 'Rue B 2' },
    { ...base, row: 8, last_name: 'Identique', phone: '021 000 00 03', address: 'Rue C 3' },
  ];
  const existing = {
    bexioNrs: new Set(['B2']),
    emails: new Set(['connu@example.invalid']),
    exactTriples: new Set([imp.exactTriple({ ...base, last_name: 'Identique', phone: '021 000 00 03', address: 'Rue C 3' })]),
  };
  const { toInsert, skipped } = imp.planImport(candidates, existing);
  assert.deepEqual(toInsert.map((c) => c.row), [2, 6, 7]); // les 2 homonymes distincts passent tous les deux
  assert.deepEqual(skipped.map((s) => s.row), [3, 4, 5, 8]);
});
