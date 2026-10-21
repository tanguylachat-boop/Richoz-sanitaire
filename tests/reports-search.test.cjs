// Recherche des rapports (« À valider » / « Historique ») — tests unitaires, aucun réseau.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./lot1-harness.cjs');

const { matchesReportSearch } = harness({}).load('src/lib/report-search.ts');

const report = {
  technician: { first_name: 'Jean', last_name: 'Dupont' },
  intervention: {
    title: 'Fuite cuisine',
    work_order_number: '2026287038',
    client_info: { name: 'Mme Favre' },
    client: { first_name: 'Luc', last_name: 'Rochat', company_name: null },
    regie: { name: 'Régie Brun' },
  },
};

test('requête vide ou espaces : tout passe', () => {
  assert.equal(matchesReportSearch(report, ''), true);
  assert.equal(matchesReportSearch(report, '   '), true);
});

test('N° de bon : exact, partiel, avec séparateurs tels qu’imprimés', () => {
  assert.equal(matchesReportSearch(report, '2026287038'), true);
  assert.equal(matchesReportSearch(report, '287038'), true);
  assert.equal(matchesReportSearch(report, '2026 287 038'), true);
  assert.equal(matchesReportSearch(report, '2026.287-038'), true);
  assert.equal(matchesReportSearch(report, '2026 999 000'), false);
});

test('client : client_info, client lié (prénom nom), société, régie', () => {
  assert.equal(matchesReportSearch(report, 'favre'), true);
  assert.equal(matchesReportSearch(report, 'luc rochat'), true);
  assert.equal(matchesReportSearch(report, 'ROCHAT'), true);
  assert.equal(matchesReportSearch(report, 'brun'), true);
  const company = { ...report, intervention: { ...report.intervention, client: { first_name: null, last_name: null, company_name: 'Oasis Drink SA' } } };
  assert.equal(matchesReportSearch(company, 'oasis'), true);
});

test('technicien : prénom, nom, prénom + nom', () => {
  assert.equal(matchesReportSearch(report, 'jean'), true);
  assert.equal(matchesReportSearch(report, 'dupont'), true);
  assert.equal(matchesReportSearch(report, 'jean dupont'), true);
  assert.equal(matchesReportSearch(report, 'martin'), false);
});

test('relations absentes : pas de crash, aucune correspondance', () => {
  assert.equal(matchesReportSearch({}, 'x'), false);
  assert.equal(matchesReportSearch({ technician: null, intervention: null }, 'dupont'), false);
  assert.equal(matchesReportSearch({ intervention: { title: 'Fuite', work_order_number: null, client: null, client_info: null, regie: null } }, 'fuite'), true);
});

test('ponctuation seule : jamais de faux positif via le N° compacté', () => {
  assert.equal(matchesReportSearch(report, '-'), false);
  assert.equal(matchesReportSearch(report, ' . / '), false);
});
