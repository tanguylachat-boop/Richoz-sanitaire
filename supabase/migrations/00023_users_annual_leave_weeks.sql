-- Annual leave allowance per user, in weeks. Used by RH stats to compute
-- remaining hours (annual_leave_weeks × 5 days × 8 hours = total annual hours).
ALTER TABLE users ADD COLUMN IF NOT EXISTS annual_leave_weeks integer NOT NULL DEFAULT 5;
COMMENT ON COLUMN users.annual_leave_weeks IS 'Annual leave allowance in weeks. Default 5 (Swiss standard).';
