-- admin_password has been stored and compared as plaintext since launch —
-- every other credential in this codebase (player passwords, in
-- auth-custom/index.ts) uses bcrypt. Hash the existing value in place so the
-- password Curt just set keeps working once game/index.ts switches to
-- bcrypt.compare(). The NOT LIKE '$2%' guard makes this safe to re-run: a
-- value that's already a bcrypt hash is left untouched instead of being
-- hashed a second time (which would permanently lock out the real password).
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

UPDATE game_configs
SET config_value = extensions.crypt(config_value, extensions.gen_salt('bf')), updated_at = NOW()
WHERE config_key = 'admin_password'
  AND config_value NOT LIKE '$2%';
