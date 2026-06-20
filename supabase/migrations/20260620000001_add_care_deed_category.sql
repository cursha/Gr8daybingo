-- Add CARE deed category (Curt). All-caps to match the taxonomy + the [A-Z]+ admin route.
INSERT INTO deed_categories (name, description, is_active) VALUES
  ('CARE', 'Show compassion and look after the wellbeing of others.', TRUE)
ON CONFLICT (name) DO NOTHING;
