-- Add phase column to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'planning' 
  CHECK (phase IN ('planning', 'requirements', 'design', 'development', 'testing', 'deployment', 'maintenance'));

-- Create function to calculate phase stats
CREATE OR REPLACE FUNCTION public.get_phase_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stats JSON;
BEGIN
  SELECT json_build_object(
    'planning', json_build_object(
      'projects', (SELECT COUNT(*) FROM projects WHERE phase = 'planning' AND status = 'active'),
      'tasks', (SELECT COUNT(*) FROM test_cases WHERE phase = 'Planning'),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases WHERE phase = 'Planning'
      )
    ),
    'requirements', json_build_object(
      'projects', (SELECT COUNT(*) FROM projects WHERE phase = 'requirements' AND status = 'active'),
      'tasks', (SELECT COUNT(*) FROM test_cases WHERE phase = 'Requirements'),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases WHERE phase = 'Requirements'
      )
    ),
    'design', json_build_object(
      'projects', (SELECT COUNT(*) FROM projects WHERE phase = 'design' AND status = 'active'),
      'tasks', (SELECT COUNT(*) FROM test_cases WHERE phase = 'Design'),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases WHERE phase = 'Design'
      )
    ),
    'development', json_build_object(
      'projects', (SELECT COUNT(*) FROM projects WHERE phase = 'development' AND status = 'active'),
      'tasks', (SELECT COUNT(*) FROM test_cases WHERE phase = 'Development'),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases WHERE phase = 'Development'
      )
    ),
    'testing', json_build_object(
      'projects', (SELECT COUNT(*) FROM projects WHERE phase = 'testing' AND status = 'active'),
      'tasks', (SELECT COUNT(*) FROM test_cases WHERE phase = 'Testing'),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases WHERE phase = 'Testing'
      )
    ),
    'deployment', json_build_object(
      'projects', (SELECT COUNT(*) FROM projects WHERE phase = 'deployment' AND status = 'active'),
      'tasks', (SELECT COUNT(*) FROM test_cases WHERE phase = 'Deployment'),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases WHERE phase = 'Deployment'
      )
    ),
    'maintenance', json_build_object(
      'projects', (SELECT COUNT(*) FROM projects WHERE phase = 'maintenance' AND status = 'active'),
      'tasks', (SELECT COUNT(*) FROM test_cases WHERE phase = 'Maintenance'),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases WHERE phase = 'Maintenance'
      )
    )
  ) INTO stats;
  
  RETURN stats;
END;
$$;