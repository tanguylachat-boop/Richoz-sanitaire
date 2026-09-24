// Durées de congés — règle unique partagée par la gestion des congés, les
// statistiques RH et (à venir) la préparation de la paie.
//
// Règle existante du dépôt, conservée telle quelle : un congé plein compte
// tous les jours calendaires (les techniciens travaillent parfois 6j/7) à
// 8 heures par jour, et le droit annuel vaut annual_leave_weeks × 5 jours ×
// 8 heures. Aucun planning contractuel individuel n'existe dans le dépôt :
// tant que ces horaires ne sont pas fournis par le client, ces constantes
// restent la seule base validée. Une absence partielle (même jour, heures
// renseignées) compte ses heures réelles, plafonnées à une journée.

export const LEAVE_DAYS_PER_WEEK = 5;
export const LEAVE_HOURS_PER_DAY = 8;

export interface LeaveSpan {
  start_date: string; // 'YYYY-MM-DD'
  end_date: string; // 'YYYY-MM-DD'
  start_time?: string | null; // 'HH:MM' ou 'HH:MM:SS' (absence partielle)
  end_time?: string | null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function dateToUtcMs(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) return NaN;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  // Rejette les dates invalides (2030-02-30, mois 13...)
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() !== Number(mo) - 1 ||
    check.getUTCDate() !== Number(d)
  ) {
    return NaN;
  }
  return ms;
}

function timeToMinutes(time: string): number {
  const m = TIME_RE.exec(time);
  if (!m) return NaN;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}

export function isPartialDay(leave: LeaveSpan): boolean {
  return Boolean(leave.start_time && leave.end_time && leave.start_date === leave.end_date);
}

/**
 * Valide un intervalle de congé. Retourne un message d'erreur en français,
 * ou null si l'intervalle est acceptable. Règles : dates valides, fin >=
 * début, heures uniquement sur un même jour, heure de fin > heure de début.
 */
export function validateLeaveSpan(leave: LeaveSpan): string | null {
  const start = dateToUtcMs(leave.start_date);
  const end = dateToUtcMs(leave.end_date);
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Dates invalides';
  if (end < start) return 'La date de fin doit être après la date de début';
  const hasStart = Boolean(leave.start_time);
  const hasEnd = Boolean(leave.end_time);
  if (hasStart !== hasEnd) return 'Renseigner les deux heures ou aucune';
  if (hasStart && hasEnd) {
    if (leave.start_date !== leave.end_date) {
      return 'Les heures ne sont possibles que pour une absence sur un seul jour';
    }
    const startMinutes = timeToMinutes(leave.start_time as string);
    const endMinutes = timeToMinutes(leave.end_time as string);
    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return 'Heures invalides';
    if (endMinutes <= startMinutes) return "L'heure de fin doit être après l'heure de début";
  }
  return null;
}

/**
 * Nombre de jours calendaires du congé, clippé à [clipStart, clipEnd]
 * inclus si fournis. 0 si l'intervalle est invalide ou hors de la fenêtre.
 */
export function leaveCalendarDays(
  leave: LeaveSpan,
  clip?: { clipStart?: string; clipEnd?: string }
): number {
  let start = dateToUtcMs(leave.start_date);
  let end = dateToUtcMs(leave.end_date);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  if (clip?.clipStart) {
    const c = dateToUtcMs(clip.clipStart);
    if (!Number.isNaN(c) && c > start) start = c;
  }
  if (clip?.clipEnd) {
    const c = dateToUtcMs(clip.clipEnd);
    if (!Number.isNaN(c) && c < end) end = c;
  }
  if (end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

/**
 * Durée du congé en heures selon la règle existante. Absence partielle :
 * heures réelles plafonnées à LEAVE_HOURS_PER_DAY ; sinon jours calendaires
 * × LEAVE_HOURS_PER_DAY. Le clip annuel exclut une absence partielle dont le
 * jour est hors fenêtre.
 */
export function leaveHours(
  leave: LeaveSpan,
  clip?: { clipStart?: string; clipEnd?: string }
): number {
  if (isPartialDay(leave)) {
    if (leaveCalendarDays(leave, clip) === 0) return 0;
    const startMinutes = timeToMinutes(leave.start_time as string);
    const endMinutes = timeToMinutes(leave.end_time as string);
    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) return 0;
    const hours = (endMinutes - startMinutes) / 60;
    return Math.min(hours, LEAVE_HOURS_PER_DAY);
  }
  return leaveCalendarDays(leave, clip) * LEAVE_HOURS_PER_DAY;
}

/** Droit annuel en heures selon la règle existante du dépôt. */
export function annualAllowanceHours(annualLeaveWeeks: number | null | undefined): number {
  const weeks = annualLeaveWeeks ?? 5;
  return weeks * LEAVE_DAYS_PER_WEEK * LEAVE_HOURS_PER_DAY;
}

/** Formatage court : "3 j", "2 h 30", "1 j 4 h". */
export function formatLeaveDuration(hours: number): string {
  if (hours <= 0) return '0 h';
  const days = Math.floor(hours / LEAVE_HOURS_PER_DAY);
  const rest = hours - days * LEAVE_HOURS_PER_DAY;
  const restHours = Math.floor(rest);
  const minutes = Math.round((rest - restHours) * 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} j`);
  if (restHours > 0 || minutes > 0) {
    parts.push(minutes > 0 ? `${restHours} h ${String(minutes).padStart(2, '0')}` : `${restHours} h`);
  }
  return parts.join(' ') || '0 h';
}
