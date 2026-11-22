UPDATE site_settings
SET value = to_jsonb('Radiadores Clau S.A.C.'::text), updated_at = now()
WHERE key = 'store_name';

UPDATE site_settings
SET value = value || jsonb_build_object(
  'phone', '+51919475144',
  'whatsapp', 'https://wa.me/51919475144',
  'address', 'Av. Arequipa 2491, Lima, Perú, 0600',
  'website', 'https://radiadoresclau.com'
), updated_at = now()
WHERE key = 'contact';
