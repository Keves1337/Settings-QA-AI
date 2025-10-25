-- Fix Issue 1: PUBLIC_DATA_EXPOSURE - Remove public read access to integrations
DROP POLICY IF EXISTS "Anyone can view integrations" ON public.integrations;

-- Create proper ownership-based policies for integrations
CREATE POLICY "Users can view own integrations" 
ON public.integrations FOR SELECT 
USING (created_by IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "Users can insert own integrations" 
ON public.integrations FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own integrations" 
ON public.integrations FOR UPDATE 
USING (created_by IS NOT NULL AND auth.uid() = created_by);

CREATE POLICY "Users can delete own integrations" 
ON public.integrations FOR DELETE 
USING (created_by IS NOT NULL AND auth.uid() = created_by);

-- Fix Issue 3: CLIENT_SIDE_AUTH - Update existing NULL values first
-- Get the first user ID or use a system placeholder
DO $$
DECLARE
  first_user_id uuid;
BEGIN
  -- Try to get the first user
  SELECT id INTO first_user_id FROM auth.users LIMIT 1;
  
  -- Update existing NULL values in all tables
  IF first_user_id IS NOT NULL THEN
    UPDATE public.bugs SET created_by = first_user_id WHERE created_by IS NULL;
    UPDATE public.projects SET created_by = first_user_id WHERE created_by IS NULL;
    UPDATE public.test_cases SET created_by = first_user_id WHERE created_by IS NULL;
    UPDATE public.test_runs SET executed_by = first_user_id WHERE executed_by IS NULL;
    UPDATE public.integrations SET created_by = first_user_id WHERE created_by IS NULL;
  END IF;
END $$;

-- Now make columns NOT NULL with defaults
ALTER TABLE public.bugs ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.bugs ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.projects ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.projects ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.test_cases ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.test_cases ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.test_runs ALTER COLUMN executed_by SET DEFAULT auth.uid();
ALTER TABLE public.test_runs ALTER COLUMN executed_by SET NOT NULL;

ALTER TABLE public.integrations ALTER COLUMN created_by SET DEFAULT auth.uid();
ALTER TABLE public.integrations ALTER COLUMN created_by SET NOT NULL;

-- Update RLS policies to enforce ownership on bugs
DROP POLICY IF EXISTS "Authenticated users can update bugs" ON public.bugs;
DROP POLICY IF EXISTS "Authenticated users can delete bugs" ON public.bugs;
DROP POLICY IF EXISTS "Anyone can view bugs" ON public.bugs;

CREATE POLICY "Users can view own bugs" 
ON public.bugs FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Users can update own bugs" 
ON public.bugs FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own bugs" 
ON public.bugs FOR DELETE 
USING (auth.uid() = created_by);

-- Update RLS policies to enforce ownership on projects
DROP POLICY IF EXISTS "Authenticated users can update projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can view projects" ON public.projects;

CREATE POLICY "Users can view own projects" 
ON public.projects FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Users can update own projects" 
ON public.projects FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own projects" 
ON public.projects FOR DELETE 
USING (auth.uid() = created_by);

-- Update RLS policies to enforce ownership on test_cases
DROP POLICY IF EXISTS "Authenticated users can update test cases" ON public.test_cases;
DROP POLICY IF EXISTS "Authenticated users can delete test cases" ON public.test_cases;
DROP POLICY IF EXISTS "Anyone can view test cases" ON public.test_cases;

CREATE POLICY "Users can view own test cases" 
ON public.test_cases FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Users can update own test cases" 
ON public.test_cases FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own test cases" 
ON public.test_cases FOR DELETE 
USING (auth.uid() = created_by);

-- Update RLS policies to enforce ownership on test_runs
DROP POLICY IF EXISTS "Authenticated users can update test runs" ON public.test_runs;
DROP POLICY IF EXISTS "Authenticated users can delete test runs" ON public.test_runs;
DROP POLICY IF EXISTS "Anyone can view test runs" ON public.test_runs;

CREATE POLICY "Users can view own test runs" 
ON public.test_runs FOR SELECT 
USING (auth.uid() = executed_by);

CREATE POLICY "Users can update own test runs" 
ON public.test_runs FOR UPDATE 
USING (auth.uid() = executed_by);

CREATE POLICY "Users can delete own test runs" 
ON public.test_runs FOR DELETE 
USING (auth.uid() = executed_by);