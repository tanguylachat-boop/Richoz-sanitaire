const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, nodes, text, database } = require('./lot1-harness.cjs');
const statsPath = 'src/app/(dashboard)/admin/stats/page.tsx';
const reportPagePath = 'src/app/(dashboard)/technician/report/[interventionId]/page.tsx';
const dates = harness(database()).load('src/lib/intervention-dates.ts');
const json = v => JSON.parse(JSON.stringify(v));
const fixture = {
  id: 'iv1', technician_id: 'tech1', title: 'Intervention fictive', address: 'Adresse de test',
  description: 'Conserver cette description', date_planned: null, date_end: null,
  estimated_duration_minutes: 60, priority: 0, status: 'planifie', intervention_type: 'depannage', client_info: null,
};
const tech = { id: 'tech1', first_name: 'Test', last_name: 'Fictif', role: 'technician', is_active: true, annual_leave_weeks: 5 };
const feedback = '  Retour TEST-LOT1\nVérifier le raccord.\n' + 'Commentaire complet avec accents et détails. '.repeat(20);

test('BUG-01: mobile RH link is available to admin only', () => {
  const h = harness(database());
  const Nav = h.load('src/components/layout/MobileNav.tsx').MobileNav;
  for (const role of ['admin', 'secretary', 'technician']) {
    const tree = h.render(Nav, { role });
    assert.equal(nodes(tree).some(n => n.props?.href === '/admin/stats'), role === 'admin');
  }
});

for (const role of ['admin', 'secretary', 'technician', null]) {
  test(`BUG-01: server route access for ${role || 'missing profile'}`, async () => {
    const db = database({ users: role ? [{ id: 'account', role, is_active: true }] : [] }, 'account');
    const h = harness(db);
    const Layout = h.load('src/app/(dashboard)/admin/stats/layout.tsx').default;
    const tree = await Layout({ children: 'PRIVATE RH CONTENT' });
    assert.equal(text(tree).includes('PRIVATE RH CONTENT'), role === 'admin');
    if (role !== 'admin') assert.match(text(tree), /Accès réservé/);
  });
}
test('BUG-01: no session cannot access statistics', async () => {
  const h = harness(database({}, null));
  const Layout = h.load('src/app/(dashboard)/admin/stats/layout.tsx').default;
  assert.match(text(await Layout({ children: 'PRIVATE' })), /Non authentifié/);
});

test('BUG-01: auth outage gives an explicit error without exposing statistics', async () => {
  const db = database();
  db.auth.getUser = async () => { throw new Error('offline'); };
  const h = harness(db), Layout = h.load('src/app/(dashboard)/admin/stats/layout.tsx').default;
  const output = text(await Layout({ children: 'PRIVATE' }));
  assert.match(output, /Impossible de vérifier vos droits/);
  assert.doesNotMatch(output, /PRIVATE/);
});

for (const scenario of ['populated', 'empty', 'no leaves', 'sql error', 'offline']) {
  test(`BUG-01: explicit statistics state — ${scenario}`, async () => {
    const errors = scenario === 'sql error' ? { leave_requests: { message: 'permission denied' } } : scenario === 'offline' ? { users: 'reject' } : {};
    const year = new Date().getFullYear();
    const db = database({
      users: scenario === 'empty' ? [] : [tech],
      leave_requests: scenario === 'populated' ? [{ technician_id: tech.id, start_date: `${year}-06-01`, end_date: `${year}-06-01`, status: 'approved', leave_type: 'conge' }] : [],
    }, 'admin', errors);
    const h = harness(db), Page = h.load(statsPath).default;
    assert.match(text(h.render(Page)), /Chargement des statistiques/);
    await h.settle();
    const tree = h.render(Page), output = text(tree);
    if (scenario === 'sql error' || scenario === 'offline') {
      assert.match(output, /Impossible de charger/);
      assert.ok(nodes(tree).find(n => n.props?.role === 'alert'));
      assert.equal(nodes(tree).find(n => n.type === 'button' && text(n).includes('Export CSV')).props.disabled, true);
      delete errors.leave_requests; delete errors.users;
      await nodes(tree).find(n => n.type === 'button' && text(n) === 'Réessayer').props.onClick();
      assert.doesNotMatch(text(h.render(Page)), /Impossible de charger/);
    } else if (scenario === 'empty') assert.match(output, /Aucun employé trouvé/);
    else if (scenario === 'no leaves') assert.match(output, /Aucune absence approuvée/);
    else assert.match(output, /Test Fictif/);
  });
}

test('BUG-02: rejects incomplete/impossible dates without formatting exceptions', () => {
  for (const value of ['', '2026-', '2026-0', '2026-02-30', 'invalid']) {
    assert.equal(dates.calendarDate(value), null);
    if (value) assert.throws(() => dates.buildInterventionDates({ date_planned: value, date_end: '', time_planned: '09:00', intervention_type: 'depannage' }), /date de début/);
  }
  assert.equal(dates.isCalendarDate('2024-02-29'), true);
  assert.equal(dates.isCalendarDate('2026-02-29'), false);
  assert.deepEqual(json(dates.buildInterventionDates({ date_planned: '', time_planned: '', date_end: '', intervention_type: 'depannage' })), { date_planned: null, date_end: null });
});

test('BUG-02: Zurich winter/summer, midnight and clock changes round-trip', () => {
  for (const [date, time, expected] of [
    ['2026-01-15', '09:30', '2026-01-15T08:30:00.000Z'],
    ['2026-07-15', '09:30', '2026-07-15T07:30:00.000Z'],
    ['2026-07-15', '00:15', '2026-07-14T22:15:00.000Z'],
    ['2026-03-29', '03:30', '2026-03-29T01:30:00.000Z'],
  ]) {
    const saved = dates.buildInterventionDates({ date_planned: date, time_planned: time, date_end: '', intervention_type: 'depannage' });
    assert.equal(saved.date_planned, expected);
    assert.deepEqual(json(dates.interventionDateFields(expected)), { date, time });
  }
  assert.throws(() => dates.buildInterventionDates({ date_planned: '2026-03-29', time_planned: '02:30', date_end: '', intervention_type: 'depannage' }), /n’existe pas/);
  const ambiguous = '2026-10-25T01:30:00.000Z';
  assert.equal(dates.buildInterventionDates({ date_planned: '2026-10-25', time_planned: '02:30', date_end: '', intervention_type: 'depannage' }, { date_planned: ambiguous }).date_planned, ambiguous);
});

test('BUG-02: chantier end ordering and existing 07:00/18:00 defaults', () => {
  const form = { date_planned: '2026-07-15', date_end: '2026-07-15', time_planned: '', intervention_type: 'chantier' };
  assert.deepEqual(json(dates.buildInterventionDates(form)), { date_planned: '2026-07-15T05:00:00.000Z', date_end: '2026-07-15T16:00:00.000Z' });
  assert.throws(() => dates.buildInterventionDates({ ...form, date_end: '2026-07-14' }), /précéder/);
  assert.throws(() => dates.buildInterventionDates({ ...form, date_planned: '' }), /date de début/);
});

function input(tree, name) { return nodes(tree).find(n => n.props?.name === name); }
function change(h, Component, props, name, value) {
  const field = input(h.render(Component, props), name);
  assert.ok(field, `input ${name}`);
  field.props.onChange({ target: { name, value } });
}
async function submit(h, Component, props) {
  await nodes(h.render(Component, props)).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
}

for (const [file, exported, props] of [
  ['src/components/interventions/InterventionForm.tsx', 'InterventionForm', { onSuccess() {}, onCancel() {} }],
  ['src/components/interventions/PlanificationSplitView.tsx', 'PlanificationSplitView', { technicians: [], regies: [], onSuccess() {}, onCancel() {} }],
  ['src/app/(dashboard)/calendar/page.tsx', 'CreateInterventionSplitView', { onSuccess() {}, onCancel() {} }],
]) {
  test(`BUG-02: real ${exported} handlers preserve fields, reject partial date, create and reopen`, async () => {
    const db = database(), h = harness(db), Component = h.load(file)[exported];
    h.render(Component, props);
    change(h, Component, props, 'title', fixture.title);
    change(h, Component, props, 'description', fixture.description);
    change(h, Component, props, 'address', fixture.address);
    change(h, Component, props, 'date_planned', '2026-');
    assert.doesNotThrow(() => h.render(Component, props));
    await submit(h, Component, props);
    assert.equal(db.calls.filter(c => c.action === 'insert').length, 0);
    assert.match(h.notices.at(-1).message, /date de début/);
    change(h, Component, props, 'date_planned', '2026-07-15');
    change(h, Component, props, 'time_planned', '00:15');
    await submit(h, Component, props);
    const saved = db.tables.interventions[0];
    assert.equal(saved.date_planned, '2026-07-14T22:15:00.000Z');
    assert.equal(saved.description, fixture.description);
    assert.equal(saved.title, fixture.title);
    const editHarness = harness(db), Edit = editHarness.load('src/components/interventions/InterventionForm.tsx').InterventionForm;
    const editProps = { ...props, intervention: saved };
    const reopened = editHarness.render(Edit, editProps);
    assert.equal(input(reopened, 'date_planned').props.value, '2026-07-15');
    assert.equal(input(reopened, 'time_planned').props.value, '00:15');
    change(editHarness, Edit, editProps, 'date_planned', '2026-07-16');
    await submit(editHarness, Edit, editProps);
    assert.equal(saved.date_planned, '2026-07-15T22:15:00.000Z');
    assert.equal(saved.description, fixture.description);
  });
}

test('BUG-03: feedback is displayed fully and preserved on draft/resubmission', async () => {
  const report = { id: 'r1', intervention_id: 'iv1', technician_id: 'tech1', text_content: 'Texte test', photos: [], revision_message: feedback, revision_requested: true, status: 'rejected' };
  const db = database({ reports: [report], interventions: [{ ...fixture }] });
  const h = harness(db), Form = h.load('src/components/reports/ReportForm.tsx').ReportForm;
  const props = { intervention: fixture, existingReport: report, products: [], technicianId: 'tech1' };
  let tree = h.render(Form, props);
  const banner = nodes(tree).find(n => n.props?.['aria-label'] === 'Retour du secrétariat');
  assert.ok(text(banner).includes(feedback));
  assert.ok(nodes(banner).some(n => n.props?.className?.includes('whitespace-pre-wrap')));
  const save = nodes(tree).find(n => n.type === 'button' && /Brouillon|brouillon/.test(text(n)));
  assert.ok(save); await save.props.onClick();
  assert.equal(report.revision_message, feedback);
  tree = h.render(Form, props);
  const send = nodes(tree).find(n => n.type === 'button' && /Envoyer|Soumettre/.test(text(n)));
  assert.ok(send); await send.props.onClick();
  assert.equal(report.status, 'submitted');
  assert.equal(report.revision_requested, false);
  assert.equal(report.revision_message, feedback);
  assert.match(text(h.render(Form, props)), /commentaire du secrétariat \(historique\)/);
  assert.doesNotMatch(text(h.render(Form, props)), /correction demandée/);
  const reopened = harness(db);
  assert.match(text(reopened.render(reopened.load('src/components/reports/ReportForm.tsx').ReportForm, props)), /\(historique\)/);
});

test('BUG-03: new and legacy notification links target the report form, including chantier', () => {
  const { reportNotificationLink } = harness(database()).load('src/lib/report-feedback.ts');
  assert.equal(reportNotificationLink({ type: 'revision_requested', reference_id: 'r1', report_intervention_id: 'iv1', intervention_type: 'chantier' }), '/technician/report/iv1?report_id=r1');
  assert.equal(reportNotificationLink({ type: 'revision_requested', reference_id: 'iv1', intervention_type: 'chantier' }), '/technician/report/iv1');
  assert.equal(reportNotificationLink({ type: 'chantier_message', reference_id: 'iv1', intervention_type: 'chantier' }), '/technician/chantier/iv1');
});

for (const scenario of ['owner', 'reload', 'other technician', 'wrong report', 'no session', 'report error']) {
  test(`BUG-03: report scoped loading — ${scenario}`, async () => {
    const db = database({ interventions: [{ ...fixture }], reports: [
      { id: 'r0', intervention_id: 'iv1', technician_id: 'tech1', created_at: '2026-09-10', revision_message: 'Other report' },
      { id: 'r1', intervention_id: 'iv1', technician_id: 'tech1', created_at: '2026-09-09', revision_message: feedback, revision_requested: true },
      { id: 'r2', intervention_id: 'iv2', technician_id: 'tech2', revision_message: 'PRIVATE OTHER' },
    ] }, scenario === 'other technician' ? 'tech2' : scenario === 'no session' ? null : 'tech1', scenario === 'report error' ? { reports: { message: 'denied' } } : {});
    const h = harness(db), Page = h.load(reportPagePath).default;
    const props = { searchParams: { report_id: scenario === 'wrong report' ? 'r2' : 'r1' } };
    h.render(Page, props); await h.settle();
    const tree = h.render(Page, props);
    const form = nodes(tree).find(n => n.props?.existingReport);
    if (['owner', 'reload'].includes(scenario)) {
      assert.equal(form.props.existingReport.id, 'r1');
      assert.equal(form.props.existingReport.revision_message, feedback);
      assert.ok(db.calls.some(c => c.table === 'reports' && c.filter === 'technician_id' && c.value === 'tech1'));
    } else assert.equal(form, undefined);
  });
}

for (const file of ['src/app/(dashboard)/reports/validate/[id]/page.tsx', 'src/app/(dashboard)/reports/validate/page.tsx']) {
  test(`BUG-03: secretary return → notification → exact report, from ${file}`, async () => {
    const report = { id: 'r1', intervention_id: 'iv1', technician_id: 'tech1',
      technician: { id: 'tech1', first_name: 'Test', last_name: 'Fictif' },
      intervention: { ...fixture }, status: 'submitted', text_content: 'Texte test',
      created_at: '2026-09-09T09:00:00Z', updated_at: '2026-09-09T09:00:00Z', photos: [], materials_used: [] };
    const tables = { reports: [report], interventions: [{ ...fixture }], notifications: [], users: [tech] };
    const h = harness(database(tables, 'secretary')), Page = h.load(file).default;
    h.render(Page); await h.settle();
    let tree = h.render(Page);
    const open = nodes(tree).find(n => n.type === 'button' && /Demander|Rejeter/.test(text(n)));
    assert.ok(open, 'return action exists'); open.props.onClick();
    tree = h.render(Page);
    const reason = nodes(tree).find(n => n.type === 'textarea' && /^(Ex:|Expliquez)/.test(n.props.placeholder || ''));
    assert.ok(reason); reason.props.onChange({ target: { value: feedback } });
    tree = h.render(Page);
    const send = nodes(tree).filter(n => n.type === 'button' && /Envoyer|Rejeter/.test(text(n))).at(-1);
    assert.ok(send); await send.props.onClick();
    assert.equal(report.revision_message, feedback);
    assert.equal(report.status, 'rejected');
    assert.equal(tables.notifications.length, 1);
    assert.equal(tables.notifications[0].reference_id, 'r1');
    assert.equal(tables.notifications[0].recipient_id, 'tech1');
    assert.equal(h.pushes[0].url, '/technician/report/iv1?report_id=r1');
    tables.notifications[0].created_at = '2026-09-09T09:00:00Z';
    const n = harness(database(tables, 'tech1'));
    const Notifications = n.load('src/app/(dashboard)/technician/notifications/page.tsx').default;
    n.render(Notifications); await n.settle();
    const notificationTree = n.render(Notifications);
    assert.ok(text(notificationTree).includes(feedback));
    const link = nodes(notificationTree).find(e => e.props?.href === '/technician/report/iv1?report_id=r1');
    assert.ok(link, 'notification selects the exact report');
    const r = harness(database(tables, 'tech1')), ReportPage = r.load(reportPagePath).default;
    r.render(ReportPage, { searchParams: { report_id: 'r1' } }); await r.settle();
    const form = nodes(r.render(ReportPage, { searchParams: { report_id: 'r1' } })).find(e => e.props?.existingReport);
    assert.equal(form.props.existingReport.revision_message, feedback);
  });
}
