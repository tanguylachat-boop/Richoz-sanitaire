-- Create chantier_photos table (was defined in prd-v2-migrations but may not have been applied)
CREATE TABLE IF NOT EXISTS chantier_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  photo_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chantier_photos_intervention ON chantier_photos(intervention_id);
CREATE INDEX IF NOT EXISTS idx_chantier_photos_created ON chantier_photos(created_at DESC);

ALTER TABLE chantier_photos ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to CRUD chantier photos
DROP POLICY IF EXISTS "chantier_photos_all" ON chantier_photos;
CREATE POLICY "chantier_photos_all" ON chantier_photos
  FOR ALL USING (true) WITH CHECK (true);
