-- Create test_cases table
CREATE TABLE public.test_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  steps TEXT[] NOT NULL DEFAULT '{}',
  expected_result TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'active', 'deprecated')),
  phase TEXT NOT NULL CHECK (phase IN ('Planning', 'Requirements', 'Design', 'Development', 'Testing', 'Deployment', 'Maintenance')),
  tags TEXT[] DEFAULT '{}',
  automated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  last_executed_at TIMESTAMP WITH TIME ZONE
);

-- Create test_runs table
CREATE TABLE public.test_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_case_id UUID NOT NULL REFERENCES public.test_cases(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'passed', 'failed', 'blocked', 'skipped')),
  result TEXT,
  notes TEXT,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  executed_by UUID REFERENCES auth.users(id),
  duration_ms INTEGER,
  screenshots TEXT[] DEFAULT '{}'
);

-- Create bugs table
CREATE TABLE public.bugs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix')),
  test_case_id UUID REFERENCES public.test_cases(id) ON DELETE SET NULL,
  test_run_id UUID REFERENCES public.test_runs(id) ON DELETE SET NULL,
  jira_issue_key TEXT,
  github_issue_number INTEGER,
  assignee TEXT,
  steps_to_reproduce TEXT,
  environment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create integrations table
CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('jira', 'github')),
  config JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Create policies for test_cases
CREATE POLICY "Anyone can view test cases" ON public.test_cases FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create test cases" ON public.test_cases FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update test cases" ON public.test_cases FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete test cases" ON public.test_cases FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create policies for test_runs
CREATE POLICY "Anyone can view test runs" ON public.test_runs FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create test runs" ON public.test_runs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update test runs" ON public.test_runs FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete test runs" ON public.test_runs FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create policies for bugs
CREATE POLICY "Anyone can view bugs" ON public.bugs FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create bugs" ON public.bugs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can update bugs" ON public.bugs FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete bugs" ON public.bugs FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create policies for integrations
CREATE POLICY "Anyone can view integrations" ON public.integrations FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage integrations" ON public.integrations FOR ALL USING (auth.uid() IS NOT NULL);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_test_cases_updated_at
BEFORE UPDATE ON public.test_cases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bugs_updated_at
BEFORE UPDATE ON public.bugs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at
BEFORE UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();