export function technicianReportLink(interventionId: string, reportId?: string) {
  return `/technician/report/${encodeURIComponent(interventionId)}${reportId ? `?report_id=${encodeURIComponent(reportId)}` : ''}`;
}

export function reportNotificationLink(notification: {
  type: string; reference_type?: string | null; reference_id: string | null; intervention_type?: string | null;
  report_intervention_id?: string | null;
}) {
  if (!notification.reference_id) return '#';
  if (notification.type === 'report_reminder') {
    return notification.report_intervention_id
      ? technicianReportLink(notification.report_intervention_id, notification.reference_id)
      : notification.reference_type === 'report' ? '#' : technicianReportLink(notification.reference_id);
  }
  if (notification.type === 'revision_requested') {
    // New notifications reference a report; older ones reference its intervention.
    return notification.report_intervention_id
      ? technicianReportLink(notification.report_intervention_id, notification.reference_id)
      : technicianReportLink(notification.reference_id);
  }
  return notification.intervention_type === 'chantier'
    ? `/technician/chantier/${encodeURIComponent(notification.reference_id)}`
    : technicianReportLink(notification.reference_id);
}
