-- 006_user_avatar.sql
-- Allow each user to upload an avatar image stored on Vercel Blob.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
