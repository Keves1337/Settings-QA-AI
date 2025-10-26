-- Fix security definer functions to add proper authorization checks
-- This prevents privilege escalation and unauthorized data access

-- Drop and recreate get_project_stats with user scoping
DROP FUNCTION IF EXISTS public.get_project_stats();

CREATE OR REPLACE FUNCTION public.get_project_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stats JSON;
  calling_user uuid;
BEGIN
  -- Get the calling user
  calling_user := auth.uid();
  
  -- Verify user is authenticated
  IF calling_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;
  
  -- Only return stats for user's own data
  SELECT json_build_object(
    'active_projects', (
      SELECT COUNT(*) FROM projects 
      WHERE status = 'active' AND created_by = calling_user
    ),
    'completed_tasks', (
      SELECT COUNT(*) FROM test_cases 
      WHERE status = 'approved' AND created_by = calling_user
    ),
    'in_progress', (
      SELECT COUNT(*) FROM test_cases 
      WHERE status = 'draft' AND created_by = calling_user
    ),
    'avg_test_coverage', (
      SELECT COALESCE(AVG(test_coverage), 0)::numeric(10,2) 
      FROM projects 
      WHERE status = 'active' AND created_by = calling_user
    ),
    'total_test_runs', (
      SELECT COUNT(*) FROM test_runs WHERE executed_by = calling_user
    ),
    'recent_bugs', (
      SELECT COUNT(*) FROM bugs 
      WHERE created_at > now() - interval '7 days' AND created_by = calling_user
    )
  ) INTO stats;
  
  RETURN stats;
END;
$$;

-- Drop and recreate get_phase_stats with user scoping
DROP FUNCTION IF EXISTS public.get_phase_stats();

CREATE OR REPLACE FUNCTION public.get_phase_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stats JSON;
  calling_user uuid;
BEGIN
  -- Get the calling user
  calling_user := auth.uid();
  
  -- Verify user is authenticated
  IF calling_user IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;
  
  -- Only return stats for user's own projects and test cases
  SELECT json_build_object(
    'planning', json_build_object(
      'projects', (
        SELECT COUNT(*) FROM projects 
        WHERE phase = 'planning' AND status = 'active' AND created_by = calling_user
      ),
      'tasks', (
        SELECT COUNT(*) FROM test_cases 
        WHERE phase = 'Planning' AND created_by = calling_user
      ),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases 
        WHERE phase = 'Planning' AND created_by = calling_user
      )
    ),
    'requirements', json_build_object(
      'projects', (
        SELECT COUNT(*) FROM projects 
        WHERE phase = 'requirements' AND status = 'active' AND created_by = calling_user
      ),
      'tasks', (
        SELECT COUNT(*) FROM test_cases 
        WHERE phase = 'Requirements' AND created_by = calling_user
      ),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases 
        WHERE phase = 'Requirements' AND created_by = calling_user
      )
    ),
    'design', json_build_object(
      'projects', (
        SELECT COUNT(*) FROM projects 
        WHERE phase = 'design' AND status = 'active' AND created_by = calling_user
      ),
      'tasks', (
        SELECT COUNT(*) FROM test_cases 
        WHERE phase = 'Design' AND created_by = calling_user
      ),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases 
        WHERE phase = 'Design' AND created_by = calling_user
      )
    ),
    'development', json_build_object(
      'projects', (
        SELECT COUNT(*) FROM projects 
        WHERE phase = 'development' AND status = 'active' AND created_by = calling_user
      ),
      'tasks', (
        SELECT COUNT(*) FROM test_cases 
        WHERE phase = 'Development' AND created_by = calling_user
      ),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases 
        WHERE phase = 'Development' AND created_by = calling_user
      )
    ),
    'testing', json_build_object(
      'projects', (
        SELECT COUNT(*) FROM projects 
        WHERE phase = 'testing' AND status = 'active' AND created_by = calling_user
      ),
      'tasks', (
        SELECT COUNT(*) FROM test_cases 
        WHERE phase = 'Testing' AND created_by = calling_user
      ),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases 
        WHERE phase = 'Testing' AND created_by = calling_user
      )
    ),
    'deployment', json_build_object(
      'projects', (
        SELECT COUNT(*) FROM projects 
        WHERE phase = 'deployment' AND status = 'active' AND created_by = calling_user
      ),
      'tasks', (
        SELECT COUNT(*) FROM test_cases 
        WHERE phase = 'Deployment' AND created_by = calling_user
      ),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases 
        WHERE phase = 'Deployment' AND created_by = calling_user
      )
    ),
    'maintenance', json_build_object(
      'projects', (
        SELECT COUNT(*) FROM projects 
        WHERE phase = 'maintenance' AND status = 'active' AND created_by = calling_user
      ),
      'tasks', (
        SELECT COUNT(*) FROM test_cases 
        WHERE phase = 'Maintenance' AND created_by = calling_user
      ),
      'progress', (
        SELECT CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE (COUNT(CASE WHEN status = 'approved' THEN 1 END)::float / COUNT(*)::float * 100)::int
        END
        FROM test_cases 
        WHERE phase = 'Maintenance' AND created_by = calling_user
      )
    )
  ) INTO stats;
  
  RETURN stats;
END;
$$;