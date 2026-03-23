-- Enable Supabase Realtime on tables needed for technician live updates
ALTER PUBLICATION supabase_realtime ADD TABLE interventions;
ALTER PUBLICATION supabase_realtime ADD TABLE chantier_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chantier_photos;
ALTER PUBLICATION supabase_realtime ADD TABLE chantier_cutoff_notices;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE chantier_details;
ALTER PUBLICATION supabase_realtime ADD TABLE reports;
