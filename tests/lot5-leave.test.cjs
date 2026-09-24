// LOT 5 — tests unitaires de la règle de durée partagée (aucun réseau).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./lot1-harness.cjs');

const lib = harness({}).load('src/lib/leave-duration.ts');

test('validateLeaveSpan: dates, ordre, heures uniquement sur un seul jour', () => {
  assert.equal(lib.validateLeaveSpan({ start_date: '2034-05-02', end_date: '2034-05-04' }), null);
  assert.equal(lib.validateLeaveSpan({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: '08:00', end_time: '11:30' }), null);
  assert.match(lib.validateLeaveSpan({ start_date: '2034-05-04', end_date: '2034-05-02' }), /fin/);
  assert.match(lib.validateLeaveSpan({ start_date: '2034-05-02', end_date: '2034-05-03', start_time: '08:00', end_time: '10:00' }), /seul jour/);
  assert.match(lib.validateLeaveSpan({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: '08:00' }), /deux heures/);
  assert.match(lib.validateLeaveSpan({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: '11:00', end_time: '09:00' }), /après/);
  assert.match(lib.validateLeaveSpan({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: '25:00', end_time: '26:00' }), /Heures invalides/);
  for (const bad of ['2034-02-30', '2034-13-01', '', 'x', '2034-05-02T00:00']) {
    assert.match(lib.validateLeaveSpan({ start_date: bad, end_date: '2034-05-02' }), /Dates invalides/);
  }
});

test('leaveCalendarDays: inclusif, clip annuel, fenêtres vides, bissextile', () => {
  assert.equal(lib.leaveCalendarDays({ start_date: '2034-05-02', end_date: '2034-05-02' }), 1);
  assert.equal(lib.leaveCalendarDays({ start_date: '2034-05-02', end_date: '2034-05-08' }), 7);
  assert.equal(lib.leaveCalendarDays({ start_date: '2028-02-28', end_date: '2028-03-01' }), 3); // 2028 bissextile
  assert.equal(lib.leaveCalendarDays(
    { start_date: '2033-12-28', end_date: '2034-01-03' },
    { clipStart: '2034-01-01', clipEnd: '2034-12-31' }
  ), 3);
  assert.equal(lib.leaveCalendarDays(
    { start_date: '2033-12-28', end_date: '2033-12-30' },
    { clipStart: '2034-01-01', clipEnd: '2034-12-31' }
  ), 0);
  assert.equal(lib.leaveCalendarDays({ start_date: '2034-05-08', end_date: '2034-05-02' }), 0);
  assert.equal(lib.leaveCalendarDays({ start_date: 'invalid', end_date: '2034-05-02' }), 0);
});

test('leaveHours: journées 8h, partiel en heures réelles plafonné, clip', () => {
  assert.equal(lib.leaveHours({ start_date: '2034-05-02', end_date: '2034-05-02' }), 8);
  assert.equal(lib.leaveHours({ start_date: '2034-05-02', end_date: '2034-05-04' }), 24);
  assert.equal(lib.leaveHours({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: '08:00', end_time: '10:30' }), 2.5);
  // Postgres renvoie HH:MM:SS
  assert.equal(lib.leaveHours({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: '08:00:00', end_time: '12:00:00' }), 4);
  // Plafonné à une journée (pas de sur-déduction)
  assert.equal(lib.leaveHours({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: '06:00', end_time: '20:00' }), 8);
  // Partiel hors fenêtre annuelle → 0 ; dedans → heures réelles
  const clip = { clipStart: '2034-01-01', clipEnd: '2034-12-31' };
  assert.equal(lib.leaveHours({ start_date: '2033-12-30', end_date: '2033-12-30', start_time: '08:00', end_time: '10:00' }, clip), 0);
  assert.equal(lib.leaveHours({ start_date: '2034-06-01', end_date: '2034-06-01', start_time: '08:00', end_time: '10:00' }, clip), 2);
  // Heures incohérentes → 0, jamais négatif
  assert.equal(lib.leaveHours({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: '12:00', end_time: '09:00' }), 0);
});

test('annualAllowanceHours: règle existante 5 sem. par défaut', () => {
  assert.equal(lib.annualAllowanceHours(5), 200);
  assert.equal(lib.annualAllowanceHours(null), 200);
  assert.equal(lib.annualAllowanceHours(undefined), 200);
  assert.equal(lib.annualAllowanceHours(4), 160);
});

test('formatLeaveDuration: jours et heures lisibles', () => {
  assert.equal(lib.formatLeaveDuration(0), '0 h');
  assert.equal(lib.formatLeaveDuration(2.5), '2 h 30');
  assert.equal(lib.formatLeaveDuration(8), '1 j');
  assert.equal(lib.formatLeaveDuration(12), '1 j 4 h');
  assert.equal(lib.formatLeaveDuration(24), '3 j');
  assert.equal(lib.formatLeaveDuration(0.5), '0 h 30');
});

test('isPartialDay: nécessite les deux heures et un seul jour', () => {
  assert.equal(lib.isPartialDay({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: '08:00', end_time: '10:00' }), true);
  assert.equal(lib.isPartialDay({ start_date: '2034-05-02', end_date: '2034-05-03', start_time: '08:00', end_time: '10:00' }), false);
  assert.equal(lib.isPartialDay({ start_date: '2034-05-02', end_date: '2034-05-02', start_time: null, end_time: null }), false);
});
