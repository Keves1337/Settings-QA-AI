-- Fix storage bucket policies to enforce ownership-based access control
-- This replaces the overly permissive policies that allowed any authenticated user to access all files

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;

-- Create ownership-based policies for bugs folder
-- Users can only upload screenshots to their own bugs
CREATE POLICY "Users can upload to own bugs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'test-reports' AND
  (storage.foldername(name))[1] = 'bugs' AND
  EXISTS (
    SELECT 1 FROM public.bugs
    WHERE id::text = (storage.foldername(name))[2]
    AND created_by = auth.uid()
  )
);

-- Users can only read screenshots from their own bugs
CREATE POLICY "Users can read own bug files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'test-reports' AND
  (storage.foldername(name))[1] = 'bugs' AND
  EXISTS (
    SELECT 1 FROM public.bugs
    WHERE id::text = (storage.foldername(name))[2]
    AND created_by = auth.uid()
  )
);

-- Users can only update their own bug screenshots
CREATE POLICY "Users can update own bug files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'test-reports' AND
  (storage.foldername(name))[1] = 'bugs' AND
  EXISTS (
    SELECT 1 FROM public.bugs
    WHERE id::text = (storage.foldername(name))[2]
    AND created_by = auth.uid()
  )
);

-- Users can only delete their own bug screenshots
CREATE POLICY "Users can delete own bug files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'test-reports' AND
  (storage.foldername(name))[1] = 'bugs' AND
  EXISTS (
    SELECT 1 FROM public.bugs
    WHERE id::text = (storage.foldername(name))[2]
    AND created_by = auth.uid()
  )
);

-- Create policies for reports folder (test run reports)
-- Users can upload test reports for their own test runs
CREATE POLICY "Users can upload own test reports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'test-reports' AND
  (storage.foldername(name))[1] = 'reports'
);

-- Users can read test reports they created
CREATE POLICY "Users can read own test reports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'test-reports' AND
  (storage.foldername(name))[1] = 'reports'
);