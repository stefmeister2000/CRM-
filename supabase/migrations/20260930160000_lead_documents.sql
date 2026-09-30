-- Private attachments visible only to their uploader on an accessible lead.
BEGIN;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lead-documents', 'lead-documents', false, 20971520,
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "crm_documents_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'lead-documents'
  AND owner_id = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.leads WHERE id::text = (storage.foldername(name))[1])
);

CREATE POLICY "crm_documents_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'lead-documents'
  AND owner_id = auth.uid()::text
  AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.leads WHERE id::text = (storage.foldername(name))[1])
  AND (storage.foldername(name))[2] IN ('contract', 'quote')
);
COMMIT;
