// Calendar label: the intervention name first, the work order number after it.
export function interventionLabel(iv: { title: string | null; work_order_number: string | null }) {
  const title = iv.title?.trim();
  const bon = iv.work_order_number?.trim();
  if (title && bon) return `${title} · ${bon}`;
  return title || bon || 'Intervention';
}
