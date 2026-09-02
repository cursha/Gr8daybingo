-- Prize image hosting via Supabase Storage (admin upload button).
-- Public-read bucket: prize_image_url is already shown to every player
-- unauthenticated (homepage, game board, celebration overlay, voucher
-- emails) with no auth gate today, so this changes nothing about who can
-- view it. No write policy is granted to anon/authenticated — uploads only
-- ever go through the admin-gated edge function route, which uses the
-- service-role key and bypasses storage RLS entirely.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prize-images', 'prize-images', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
