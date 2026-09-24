const TIME_ZONE = 'Europe/Zurich';

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Calendar-only values must not be parsed as UTC dates for display.
export function calendarDate(value: string): Date | null {
  return isCalendarDate(value) ? new Date(`${value}T12:00:00`) : null;
}

export function interventionDateFields(iso: string | null | undefined) {
  const instant = iso ? new Date(iso) : null;
  if (!instant || !Number.isFinite(instant.getTime())) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return { date: `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

function zurichInstant(date: string, time: string): string {
  if (!isCalendarDate(date) || !isClockTime(time)) {
    throw new Error('Saisissez une date complète et une heure valides.');
  }
  const wall = new Date(`${date}T${time}:00Z`).getTime();
  // Check offsets on both sides of a clock change. Reject nonexistent local times.
  const candidates = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const sample = wall + delta;
    const fields = interventionDateFields(new Date(sample).toISOString());
    const offset = new Date(`${fields.date}T${fields.time}:00Z`).getTime() - sample;
    const candidate = wall - offset;
    const roundTrip = interventionDateFields(new Date(candidate).toISOString());
    if (roundTrip.date === date && roundTrip.time === time) candidates.add(candidate);
  }
  if (!candidates.size) throw new Error('Cette heure n’existe pas en Europe/Zurich lors du changement d’heure. Choisissez une autre heure.');
  return new Date(Math.min(...Array.from(candidates))).toISOString();
}

export function buildInterventionDates(form: {
  date_planned: string; time_planned: string; date_end: string; intervention_type: string;
}, existing?: { date_planned?: string | null; date_end?: string | null } | null) {
  const isChantier = form.intervention_type === 'chantier';
  if (form.date_planned && !isCalendarDate(form.date_planned)) throw new Error('Saisissez une date de début complète et valide.');
  if (isChantier && form.date_end) {
    if (!isCalendarDate(form.date_end)) throw new Error('Saisissez une date de fin complète et valide.');
    if (!form.date_planned) throw new Error('Indiquez la date de début avant la date de fin.');
    if (form.date_end < form.date_planned) throw new Error('La date de fin ne peut pas précéder la date de début.');
  }
  const time = isChantier ? '07:00' : form.time_planned || '09:00';
  const previous = interventionDateFields(existing?.date_planned);
  return {
    // Preserve the exact instant when reopening an ambiguous autumn hour.
    date_planned: form.date_planned
      ? existing?.date_planned && previous.date === form.date_planned && previous.time === time
        ? existing.date_planned : zurichInstant(form.date_planned, time)
      : null,
    date_end: isChantier && form.date_end ? zurichInstant(form.date_end, '18:00') : null,
  };
}
