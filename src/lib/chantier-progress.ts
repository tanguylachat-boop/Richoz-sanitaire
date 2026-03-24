/**
 * Calculate chantier progress based on elapsed days between start and end dates.
 * progress = (days elapsed since start) / (total days) * 100, clamped to [0, 100]
 */
export function computeChantierProgress(
  datePlanned: string | null | undefined,
  dateEnd: string | null | undefined
): number {
  if (!datePlanned) return 0;

  const start = new Date(datePlanned);
  const end = dateEnd ? new Date(dateEnd) : start;
  const now = new Date();

  const totalMs = end.getTime() - start.getTime();
  const totalDays = Math.max(1, Math.ceil(totalMs / (1000 * 60 * 60 * 24)));
  const elapsedMs = now.getTime() - start.getTime();
  const elapsedDays = Math.max(0, Math.ceil(elapsedMs / (1000 * 60 * 60 * 24)));

  return Math.min(100, Math.round((elapsedDays / totalDays) * 100));
}
