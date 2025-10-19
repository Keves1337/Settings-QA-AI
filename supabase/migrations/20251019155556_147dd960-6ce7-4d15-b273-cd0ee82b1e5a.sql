-- Add methodology column to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS methodology TEXT DEFAULT 'waterfall' 
CHECK (methodology IN ('waterfall', 'agile'));

-- Add sprint tracking for Agile projects
ALTER TABLE public.test_cases 
ADD COLUMN IF NOT EXISTS sprint TEXT,
ADD COLUMN IF NOT EXISTS story_points INTEGER;