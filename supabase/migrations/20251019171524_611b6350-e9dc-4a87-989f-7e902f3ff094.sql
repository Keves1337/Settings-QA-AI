-- Add screenshots column to bugs table for storing bug screenshot URLs
ALTER TABLE bugs ADD COLUMN IF NOT EXISTS screenshots TEXT[] DEFAULT '{}';

COMMENT ON COLUMN bugs.screenshots IS 'Array of URLs pointing to bug screenshots stored in Supabase storage';