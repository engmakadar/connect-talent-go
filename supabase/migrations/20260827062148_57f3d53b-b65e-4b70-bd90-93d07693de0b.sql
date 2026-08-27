DROP POLICY IF EXISTS "Company members upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Company members update logos" ON storage.objects;
DROP POLICY IF EXISTS "Company members delete logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read company logos" ON storage.objects;

CREATE POLICY "Authenticated upload company logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Authenticated update company logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'company-logos')
WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Authenticated delete company logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-logos');

CREATE POLICY "Public read company logos"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'company-logos');