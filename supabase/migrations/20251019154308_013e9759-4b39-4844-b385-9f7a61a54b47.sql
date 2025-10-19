-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  test_coverage NUMERIC DEFAULT 0 CHECK (test_coverage >= 0 AND test_coverage <= 100)
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view projects"
ON public.projects FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create projects"
ON public.projects FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update projects"
ON public.projects FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete projects"
ON public.projects FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Update tasks table to link to projects
ALTER TABLE public.test_cases ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id);

-- Create function to calculate project stats
CREATE OR REPLACE FUNCTION public.get_project_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stats JSON;
BEGIN
  SELECT json_build_object(
    'active_projects', (
      SELECT COUNT(*) FROM projects WHERE status = 'active'
    ),
    'completed_tasks', (
      SELECT COUNT(*) FROM test_cases WHERE status = 'approved'
    ),
    'in_progress', (
      SELECT COUNT(*) FROM test_cases WHERE status = 'draft'
    ),
    'avg_test_coverage', (
      SELECT COALESCE(AVG(test_coverage), 0)::numeric(10,2) FROM projects WHERE status = 'active'
    ),
    'total_test_runs', (
      SELECT COUNT(*) FROM test_runs
    ),
    'recent_bugs', (
      SELECT COUNT(*) FROM bugs WHERE created_at > now() - interval '7 days'
    )
  ) INTO stats;
  
  RETURN stats;
END;
$$;

-- Trigger for updating updated_at
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for projects
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;