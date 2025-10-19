-- Create storage bucket for test reports
INSERT INTO storage.buckets (id, name, public)
VALUES ('test-reports', 'test-reports', false);

-- RLS policies for test reports bucket
CREATE POLICY "Authenticated users can view test reports"
ON storage.objects FOR SELECT
USING (bucket_id = 'test-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can upload test reports"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'test-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update test reports"
ON storage.objects FOR UPDATE
USING (bucket_id = 'test-reports' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete test reports"
ON storage.objects FOR DELETE
USING (bucket_id = 'test-reports' AND auth.uid() IS NOT NULL);

-- Add report_url column to test_runs table
ALTER TABLE test_runs ADD COLUMN report_url TEXT;

-- Add synced flags for tracking integration sync status
ALTER TABLE test_runs ADD COLUMN synced_to_jira BOOLEAN DEFAULT false;
ALTER TABLE test_runs ADD COLUMN synced_to_github BOOLEAN DEFAULT false;
ALTER TABLE test_runs ADD COLUMN jira_attachment_id TEXT;
ALTER TABLE test_runs ADD COLUMN github_artifact_url TEXT;