-- Wings full schema consolidated migrations

-- =========================================================================
-- MIGRATION: 20260330122943_201ebd38-e8c5-4909-89fb-f681be3ab918.sql
-- =========================================================================

-- Create entries table
CREATE TABLE public.entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own entries" ON public.entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own entries" ON public.entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own entries" ON public.entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own entries" ON public.entries FOR DELETE USING (auth.uid() = user_id);

-- Create user preferences table
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  sidebar_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_entries_updated_at BEFORE UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_preferences_updated_at BEFORE UPDATE ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- MIGRATION: 20260331044741_a5544bdc-02c4-4bb0-8584-f8453ac26e41.sql
-- =========================================================================

ALTER TABLE public.entries ADD COLUMN pinned boolean NOT NULL DEFAULT false;

-- =========================================================================
-- MIGRATION: 20260401040507_39db8044-c5f0-461c-820d-126c192f97ef.sql
-- =========================================================================


-- Create storage bucket for journal images
INSERT INTO storage.buckets (id, name, public) VALUES ('journal-images', 'journal-images', true);

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'journal-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow anyone to view images (public bucket)
CREATE POLICY "Anyone can view journal images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'journal-images');

-- Allow users to delete their own images
CREATE POLICY "Users can delete their own images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'journal-images' AND (storage.foldername(name))[1] = auth.uid()::text);


-- =========================================================================
-- MIGRATION: 20260403051337_7d1b57b1-5379-41af-98e1-c8db641e9bee.sql
-- =========================================================================

ALTER TABLE public.entries ADD COLUMN parent_id uuid REFERENCES public.entries(id) ON DELETE CASCADE DEFAULT NULL;
ALTER TABLE public.entries ADD COLUMN title text NOT NULL DEFAULT '';
CREATE INDEX idx_entries_parent_id ON public.entries(parent_id);

-- =========================================================================
-- MIGRATION: 20260403051815_778eb24a-a4d8-4dd1-b262-dd329fb064ff.sql
-- =========================================================================

ALTER TABLE public.entries ADD COLUMN share_token text UNIQUE DEFAULT NULL;

CREATE POLICY "Anyone can view shared entries"
ON public.entries
FOR SELECT
TO anon, authenticated
USING (share_token IS NOT NULL);

-- =========================================================================
-- MIGRATION: 20260404065502_121bd546-5805-4744-b1c6-2510476d824c.sql
-- =========================================================================

ALTER TABLE public.user_preferences 
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '';

-- =========================================================================
-- MIGRATION: 20260404070218_81d0de4b-2140-491b-8e15-9a70fe6811ff.sql
-- =========================================================================

-- Create entry_shares table for granular sharing
CREATE TABLE public.entry_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  shared_with_email text NOT NULL,
  shared_with_user_id uuid,
  role text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  UNIQUE(entry_id, shared_with_email)
);

-- Add validation trigger for role values
CREATE OR REPLACE FUNCTION public.validate_share_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role NOT IN ('viewer', 'editor', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %. Must be viewer, editor, or admin', NEW.role;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_share_role_trigger
  BEFORE INSERT OR UPDATE ON public.entry_shares
  FOR EACH ROW EXECUTE FUNCTION public.validate_share_role();

ALTER TABLE public.entry_shares ENABLE ROW LEVEL SECURITY;

-- Entry owner can manage shares
CREATE POLICY "Entry owners can manage shares"
  ON public.entry_shares FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.entries WHERE id = entry_shares.entry_id AND user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.entries WHERE id = entry_shares.entry_id AND user_id = auth.uid())
  );

-- Users shared with can view their shares
CREATE POLICY "Shared users can view their shares"
  ON public.entry_shares FOR SELECT
  TO authenticated
  USING (
    shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR shared_with_user_id = auth.uid()
  );

-- Admins on shared entries can also manage shares
CREATE POLICY "Admins can manage sub-shares"
  ON public.entry_shares FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entry_shares es
      WHERE es.entry_id = entry_shares.entry_id
        AND es.role = 'admin'
        AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.entry_shares es
      WHERE es.entry_id = entry_shares.entry_id
        AND es.role = 'admin'
        AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );

-- Fix the shared entries RLS: require specific token match, not just IS NOT NULL
DROP POLICY IF EXISTS "Anyone can view shared entries" ON public.entries;

CREATE POLICY "Anyone can view entries by share token"
  ON public.entries FOR SELECT
  TO anon, authenticated
  USING (
    share_token IS NOT NULL 
    AND share_token = current_setting('request.headers', true)::json->>'x-share-token'
  );

-- Shared users can view entries shared with them
CREATE POLICY "Shared users can view shared entries"
  ON public.entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entry_shares es
      WHERE es.entry_id = entries.id
        AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );

-- Shared editors/admins can update entries
CREATE POLICY "Shared editors can update entries"
  ON public.entries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entry_shares es
      WHERE es.entry_id = entries.id
        AND es.role IN ('editor', 'admin')
        AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );

-- Shared admins can delete entries
CREATE POLICY "Shared admins can delete entries"
  ON public.entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.entry_shares es
      WHERE es.entry_id = entries.id
        AND es.role = 'admin'
        AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  );

-- Add UPDATE policy on journal-images storage
CREATE POLICY "Users can update their own images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'journal-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'journal-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Create a function to resolve share user IDs from email
CREATE OR REPLACE FUNCTION public.resolve_share_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT id INTO NEW.shared_with_user_id
  FROM auth.users
  WHERE email = NEW.shared_with_email;
  RETURN NEW;
END;
$$;

CREATE TRIGGER resolve_share_user_trigger
  BEFORE INSERT OR UPDATE ON public.entry_shares
  FOR EACH ROW EXECUTE FUNCTION public.resolve_share_user_id();

-- =========================================================================
-- MIGRATION: 20260405002356_220fae83-0d74-4b5c-bc8a-ed2a861b9875.sql
-- =========================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE entries;

-- =========================================================================
-- MIGRATION: 20260405002833_52e736df-7984-4875-ae7b-0dcfd1a10ea5.sql
-- =========================================================================

-- Make journal-images bucket private
UPDATE storage.buckets SET public = false WHERE id = 'journal-images';

-- Create restricted view for shared entries (no user_id/parent_id exposure)
CREATE OR REPLACE VIEW public.shared_entries_view AS
SELECT id, title, content, created_at, share_token
FROM entries
WHERE share_token IS NOT NULL;

GRANT SELECT ON public.shared_entries_view TO anon, authenticated;

-- =========================================================================
-- MIGRATION: 20260405002852_cfee1e43-a145-4ea6-a384-2c0277934aa7.sql
-- =========================================================================

ALTER VIEW public.shared_entries_view SET (security_invoker = on);

-- =========================================================================
-- MIGRATION: 20260405003348_7d963d7b-d09b-4bb1-873d-114272694464.sql
-- =========================================================================

-- 1. Drop the broad ALL policy for shared admins
DROP POLICY IF EXISTS "Admins can manage sub-shares" ON entry_shares;

-- Admins can view shares on their entries
CREATE POLICY "Shared admins can view shares"
ON entry_shares FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM entry_shares es
    WHERE es.entry_id = entry_shares.entry_id
    AND es.role = 'admin'
    AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text)
  )
);

-- Admins can only add viewer/editor shares (not admin)
CREATE POLICY "Shared admins can add viewer or editor shares"
ON entry_shares FOR INSERT TO authenticated
WITH CHECK (
  role IN ('viewer', 'editor')
  AND EXISTS (
    SELECT 1 FROM entry_shares es
    WHERE es.entry_id = entry_shares.entry_id
    AND es.role = 'admin'
    AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text)
  )
);

-- Admins can update shares but not escalate to admin
CREATE POLICY "Shared admins can update to viewer or editor"
ON entry_shares FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM entry_shares es
    WHERE es.entry_id = entry_shares.entry_id
    AND es.role = 'admin'
    AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text)
  )
)
WITH CHECK (role IN ('viewer', 'editor'));

-- Admins can remove shares
CREATE POLICY "Shared admins can remove shares"
ON entry_shares FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM entry_shares es
    WHERE es.entry_id = entry_shares.entry_id
    AND es.role = 'admin'
    AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text)
  )
);

-- 2. Drop permissive anon SELECT on journal-images, add owner-scoped policy
DROP POLICY IF EXISTS "Anyone can view journal images" ON storage.objects;

CREATE POLICY "Users can view their own images"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'journal-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- =========================================================================
-- MIGRATION: 20260405003751_94e915d0-86cf-4c20-81a8-2de4107cbed5.sql
-- =========================================================================

-- 1. Fix email exposure: admins should only see their own share record
DROP POLICY IF EXISTS "Shared admins can view shares" ON entry_shares;

-- No replacement needed — "Shared users can view their shares" already lets
-- any shared user (including admins) see their own record.

-- 2. Fix admin DELETE: prevent deleting shares created by the entry owner
DROP POLICY IF EXISTS "Shared admins can remove shares" ON entry_shares;

CREATE POLICY "Shared admins can remove non-owner shares"
ON entry_shares FOR DELETE TO authenticated
USING (
  -- The share being deleted must NOT have been created by the entry owner
  created_by != (SELECT e.user_id FROM entries e WHERE e.id = entry_shares.entry_id)
  AND EXISTS (
    SELECT 1 FROM entry_shares es
    WHERE es.entry_id = entry_shares.entry_id
    AND es.role = 'admin'
    AND (es.shared_with_user_id = auth.uid() OR es.shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text)
  )
);

-- 3. Fix realtime channel auth: remove entries from realtime publication
-- (solo-first app; realtime was added for live editing but exposes channel subscriptions)
ALTER PUBLICATION supabase_realtime DROP TABLE entries;

-- =========================================================================
-- MIGRATION: 20260405010309_8e8c52ec-61e7-45eb-9249-ed0c893a05c0.sql
-- =========================================================================

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', '');
$$;

CREATE OR REPLACE FUNCTION public.is_entry_owner(_entry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.entries e
    WHERE e.id = _entry_id
      AND e.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.entry_owner_id(_entry_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.user_id
  FROM public.entries e
  WHERE e.id = _entry_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_entry_share_role(_entry_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.entry_shares es
    WHERE es.entry_id = _entry_id
      AND es.role = ANY(_roles)
      AND (
        es.shared_with_user_id = auth.uid()
        OR es.shared_with_email = public.current_user_email()
      )
  );
$$;

DROP POLICY IF EXISTS "Shared users can view shared entries" ON public.entries;
CREATE POLICY "Shared users can view shared entries"
ON public.entries
FOR SELECT
TO authenticated
USING (public.has_entry_share_role(id, ARRAY['viewer','editor','admin']));

DROP POLICY IF EXISTS "Shared editors can update entries" ON public.entries;
CREATE POLICY "Shared editors can update entries"
ON public.entries
FOR UPDATE
TO authenticated
USING (public.has_entry_share_role(id, ARRAY['editor','admin']))
WITH CHECK (public.has_entry_share_role(id, ARRAY['editor','admin']));

DROP POLICY IF EXISTS "Shared admins can delete entries" ON public.entries;
CREATE POLICY "Shared admins can delete entries"
ON public.entries
FOR DELETE
TO authenticated
USING (public.has_entry_share_role(id, ARRAY['admin']));

DROP POLICY IF EXISTS "Entry owners can manage shares" ON public.entry_shares;
CREATE POLICY "Entry owners can manage shares"
ON public.entry_shares
FOR ALL
TO authenticated
USING (public.is_entry_owner(entry_id))
WITH CHECK (public.is_entry_owner(entry_id));

DROP POLICY IF EXISTS "Shared admins can add viewer or editor shares" ON public.entry_shares;
CREATE POLICY "Shared admins can add viewer or editor shares"
ON public.entry_shares
FOR INSERT
TO authenticated
WITH CHECK (
  role = ANY (ARRAY['viewer','editor'])
  AND public.has_entry_share_role(entry_id, ARRAY['admin'])
);

DROP POLICY IF EXISTS "Shared admins can update to viewer or editor" ON public.entry_shares;
CREATE POLICY "Shared admins can update to viewer or editor"
ON public.entry_shares
FOR UPDATE
TO authenticated
USING (
  created_by <> public.entry_owner_id(entry_id)
  AND public.has_entry_share_role(entry_id, ARRAY['admin'])
)
WITH CHECK (
  role = ANY (ARRAY['viewer','editor'])
  AND created_by <> public.entry_owner_id(entry_id)
);

DROP POLICY IF EXISTS "Shared admins can remove non-owner shares" ON public.entry_shares;
CREATE POLICY "Shared admins can remove non-owner shares"
ON public.entry_shares
FOR DELETE
TO authenticated
USING (
  created_by <> public.entry_owner_id(entry_id)
  AND public.has_entry_share_role(entry_id, ARRAY['admin'])
);

DROP POLICY IF EXISTS "Shared users can view their shares" ON public.entry_shares;
CREATE POLICY "Shared users can view their shares"
ON public.entry_shares
FOR SELECT
TO authenticated
USING (
  shared_with_user_id = auth.uid()
  OR shared_with_email = public.current_user_email()
);

ALTER VIEW public.shared_entries_view SET (security_invoker = on);

DROP TRIGGER IF EXISTS resolve_share_user_id_before_write ON public.entry_shares;
CREATE TRIGGER resolve_share_user_id_before_write
BEFORE INSERT OR UPDATE OF shared_with_email
ON public.entry_shares
FOR EACH ROW
EXECUTE FUNCTION public.resolve_share_user_id();

DROP TRIGGER IF EXISTS validate_share_role_before_write ON public.entry_shares;
CREATE TRIGGER validate_share_role_before_write
BEFORE INSERT OR UPDATE OF role
ON public.entry_shares
FOR EACH ROW
EXECUTE FUNCTION public.validate_share_role();

DROP TRIGGER IF EXISTS update_entries_updated_at ON public.entries;
CREATE TRIGGER update_entries_updated_at
BEFORE UPDATE ON public.entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- MIGRATION: 20260506084759_b1c572ca-1a22-494b-9b0b-4ece8805a99d.sql
-- =========================================================================

-- Add username to user_preferences for personalized dashboard URLs
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS username text;

-- Backfill existing rows with a unique username derived from user_id
UPDATE public.user_preferences
SET username = 'user_' || substr(replace(user_id::text, '-', ''), 1, 10)
WHERE username IS NULL OR username = '';

ALTER TABLE public.user_preferences
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_username_key
  ON public.user_preferences (lower(username));

-- Allow authenticated users to look up usernames (only username + user_id, no other prefs)
-- We rely on existing RLS — add a policy to allow reading the username column for any authenticated user
DROP POLICY IF EXISTS "Authenticated users can view usernames" ON public.user_preferences;
CREATE POLICY "Authenticated users can view usernames"
ON public.user_preferences
FOR SELECT
TO authenticated
USING (true);

-- Auto-create user_preferences row with a derived username on new signup
CREATE OR REPLACE FUNCTION public.handle_new_user_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username text;
  candidate text;
  suffix int := 0;
BEGIN
  base_username := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  IF base_username IS NULL OR length(base_username) < 3 THEN
    base_username := 'user' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;
  candidate := base_username;
  WHILE EXISTS (SELECT 1 FROM public.user_preferences WHERE lower(username) = candidate) LOOP
    suffix := suffix + 1;
    candidate := base_username || suffix::text;
  END LOOP;
  INSERT INTO public.user_preferences (user_id, username)
  VALUES (NEW.id, candidate)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_preferences();


-- =========================================================================
-- MIGRATION: 20260606000840_1a236782-2e8c-4bd9-b889-168a10936b8c.sql
-- =========================================================================

ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS layout JSONB NOT NULL DEFAULT '{}'::jsonb;

-- =========================================================================
-- MIGRATION: 20260713034637_537ec80e-054c-4929-b36f-cde3c341342b.sql
-- =========================================================================


-- Slice A foundation: content_json storage, trash, versions, comments, full-text search

-- 1) entries: content_json (structured source of truth) + deleted_at (soft delete)
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS content_json JSONB,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS entries_deleted_at_idx ON public.entries (deleted_at);
CREATE INDEX IF NOT EXISTS entries_parent_id_idx ON public.entries (parent_id);

-- 2) Full-text search over title + content
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS search_tsv TSVECTOR
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(content, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS entries_search_tsv_idx ON public.entries USING GIN (search_tsv);

-- 3) entry_versions: automatic snapshots for history/restore
CREATE TABLE IF NOT EXISTS public.entry_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL DEFAULT '',
  content_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entry_versions_entry_id_idx ON public.entry_versions (entry_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.entry_versions TO authenticated;
GRANT ALL ON public.entry_versions TO service_role;

ALTER TABLE public.entry_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "versions readable by entry viewers"
  ON public.entry_versions FOR SELECT
  TO authenticated
  USING (
    public.is_entry_owner(entry_id)
    OR public.has_entry_share_role(entry_id, ARRAY['viewer','editor','admin'])
  );

CREATE POLICY "versions insertable by editors"
  ON public.entry_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_entry_owner(entry_id)
    OR public.has_entry_share_role(entry_id, ARRAY['editor','admin'])
  );

CREATE POLICY "versions deletable by owner"
  ON public.entry_versions FOR DELETE
  TO authenticated
  USING (public.is_entry_owner(entry_id));

-- 4) entry_comments: inline block-level comments
CREATE TABLE IF NOT EXISTS public.entry_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_id TEXT,
  body TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entry_comments_entry_id_idx ON public.entry_comments (entry_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_comments TO authenticated;
GRANT ALL ON public.entry_comments TO service_role;

ALTER TABLE public.entry_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments readable by entry viewers"
  ON public.entry_comments FOR SELECT
  TO authenticated
  USING (
    public.is_entry_owner(entry_id)
    OR public.has_entry_share_role(entry_id, ARRAY['viewer','editor','admin'])
  );

CREATE POLICY "comments insertable by viewers+"
  ON public.entry_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      public.is_entry_owner(entry_id)
      OR public.has_entry_share_role(entry_id, ARRAY['viewer','editor','admin'])
    )
  );

CREATE POLICY "comments updatable by author"
  ON public.entry_comments FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "comments deletable by author or owner"
  ON public.entry_comments FOR DELETE
  TO authenticated
  USING (author_id = auth.uid() OR public.is_entry_owner(entry_id));

CREATE TRIGGER update_entry_comments_updated_at
  BEFORE UPDATE ON public.entry_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =========================================================================
-- MIGRATION: 20260715021800_grant_table_privileges.sql
-- =========================================================================

-- Early migrations enabled RLS but never granted table privileges to API roles.
-- Without these, PostgREST returns "permission denied for table …".

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT SELECT ON public.entries TO anon;
GRANT ALL ON public.entries TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entry_shares TO authenticated;
GRANT ALL ON public.entry_shares TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT SELECT ON public.user_preferences TO anon;
GRANT ALL ON public.user_preferences TO service_role;


-- =========================================================================
-- MIGRATION: 20260715025000_backfill_user_preferences.sql
-- =========================================================================

-- Backfill user_preferences for auth users missing a row (e.g. signed up before trigger).
INSERT INTO public.user_preferences (user_id, username)
SELECT
  u.id,
  'user_' || substr(replace(u.id::text, '-', ''), 1, 10)
FROM auth.users u
LEFT JOIN public.user_preferences p ON p.user_id = u.id
WHERE p.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Resolve any duplicate usernames from the simple backfill above.
DO $$
DECLARE
  r RECORD;
  new_name text;
  n int;
BEGIN
  FOR r IN
    SELECT user_id, username
    FROM public.user_preferences
    WHERE lower(username) IN (
      SELECT lower(username) FROM public.user_preferences GROUP BY lower(username) HAVING count(*) > 1
    )
  LOOP
    n := 1;
    LOOP
      new_name := r.username || n::text;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.user_preferences WHERE lower(username) = lower(new_name)
      );
      n := n + 1;
    END LOOP;
    UPDATE public.user_preferences SET username = new_name WHERE user_id = r.user_id;
  END LOOP;
END $$;


-- =========================================================================
-- MIGRATION: 20260715030000_protect_entry_columns.sql
-- =========================================================================

-- Security hardening: freeze sensitive entry columns for non-owners and soften
-- the parent_id cascade so a hostile reparent can't nuke another user's tree.

-- 1) parent_id FK: CASCADE -> SET NULL (defense-in-depth vs cascade delete).
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.entries'::regclass
    AND contype = 'f'
    AND conkey = (
      SELECT array_agg(attnum)
      FROM pg_attribute
      WHERE attrelid = 'public.entries'::regclass
        AND attname = 'parent_id'
    );

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.entries DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE public.entries
    ADD CONSTRAINT entries_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES public.entries(id) ON DELETE SET NULL;
END $$;

-- 2) Guard trigger: user_id is immutable for everyone; only the owner may change
-- share_token or parent_id. Shared editors (who have UPDATE via RLS) therefore
-- cannot steal ownership, hijack the public link, or move the page out of the
-- owner's tree. service_role (trusted backend) is exempt.
CREATE OR REPLACE FUNCTION public.protect_entry_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Ownership can never be reassigned through the API.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'user_id cannot be modified';
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    IF NEW.share_token IS DISTINCT FROM OLD.share_token THEN
      RAISE EXCEPTION 'only the owner can change the share token';
    END IF;
    IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
      RAISE EXCEPTION 'only the owner can move this entry';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_entry_sensitive_columns ON public.entries;
CREATE TRIGGER protect_entry_sensitive_columns
BEFORE UPDATE ON public.entries
FOR EACH ROW
EXECUTE FUNCTION public.protect_entry_sensitive_columns();


-- =========================================================================
-- MIGRATION: 20260715030100_lock_anon_entries.sql
-- =========================================================================

-- Security hardening: stop anon from reading the entries table (and the wide
-- shared_entries_view) directly. Public share pages now go through a narrow
-- SECURITY DEFINER RPC that returns a single row for an exact token match.

-- 1) Narrow RPC for public share pages. Returns only display fields, never
-- user_id / share_token / parent_id, and only for a live (non-deleted) entry.
CREATE OR REPLACE FUNCTION public.get_shared_entry(_token text)
RETURNS TABLE (id uuid, title text, content text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.title, e.content, e.created_at
  FROM public.entries e
  WHERE e.share_token IS NOT NULL
    AND e.share_token = _token
    AND e.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_entry(text) TO anon, authenticated;

-- 2) Remove the direct anon read paths.
DROP POLICY IF EXISTS "Anyone can view entries by share token" ON public.entries;
DROP POLICY IF EXISTS "Anyone can view shared entries" ON public.entries;

-- The wide view leaked every shared entry to anyone who queried it without a
-- token filter (security_invoker still relied on the dropped header policy).
DROP VIEW IF EXISTS public.shared_entries_view;

REVOKE SELECT ON public.entries FROM anon;


-- =========================================================================
-- MIGRATION: 20260715030200_userprefs_rpc.sql
-- =========================================================================

-- Security hardening: user_preferences leaked every row (incl. sidebar state and
-- any future prefs) to any authenticated user via a USING(true) SELECT policy,
-- and to anon via table grant. Replace broad reads with narrow SECURITY DEFINER
-- RPCs; keep full-row SELECT owner-only.

DROP POLICY IF EXISTS "Authenticated users can view usernames" ON public.user_preferences;

REVOKE SELECT ON public.user_preferences FROM anon;

-- Case-insensitive availability check across all users. Excludes the caller's
-- own row so they can "re-save" their current name.
CREATE OR REPLACE FUNCTION public.is_username_available(_username text, _exclude_user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.user_preferences
    WHERE lower(username) = lower(_username)
      AND (_exclude_user_id IS NULL OR user_id <> _exclude_user_id)
  );
$$;

-- Resolve a public username to its owning user id (for /:username pages).
CREATE OR REPLACE FUNCTION public.get_user_id_by_username(_username text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.user_preferences
  WHERE lower(username) = lower(_username)
  LIMIT 1;
$$;

-- Reverse: username for a given user id (usernames are already public via URLs).
CREATE OR REPLACE FUNCTION public.lookup_username(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT username
  FROM public.user_preferences
  WHERE user_id = _user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.is_username_available(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_username(uuid) TO authenticated;


-- =========================================================================
-- MIGRATION: 20260715030300_lock_shares_and_username.sql
-- =========================================================================

-- Security hardening: bind ownership/author columns on writes, tighten
-- helper-function privileges, drop duplicated legacy triggers, and enforce
-- username rules (charset/length + reserved names + race-safe signup).

-- ---------------------------------------------------------------------------
-- entry_shares: force created_by = caller; freeze created_by / entry_id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_share_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'created_by cannot be changed';
    END IF;
    IF NEW.entry_id IS DISTINCT FROM OLD.entry_id THEN
      RAISE EXCEPTION 'entry_id cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_share_created_by ON public.entry_shares;
CREATE TRIGGER enforce_share_created_by
BEFORE INSERT OR UPDATE ON public.entry_shares
FOR EACH ROW
EXECUTE FUNCTION public.enforce_share_created_by();

-- Drop duplicated legacy triggers (superseded by the *_before_write versions).
DROP TRIGGER IF EXISTS validate_share_role_trigger ON public.entry_shares;
DROP TRIGGER IF EXISTS resolve_share_user_trigger ON public.entry_shares;

-- ---------------------------------------------------------------------------
-- entry_versions: author_id must be the caller (or null).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "versions insertable by editors" ON public.entry_versions;
CREATE POLICY "versions insertable by editors"
  ON public.entry_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    (author_id IS NULL OR author_id = auth.uid())
    AND (
      public.is_entry_owner(entry_id)
      OR public.has_entry_share_role(entry_id, ARRAY['editor','admin'])
    )
  );

-- ---------------------------------------------------------------------------
-- entry_comments: freeze entry_id / author_id on update so an author can't
-- relocate or reattribute a comment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_comment_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.entry_id IS DISTINCT FROM OLD.entry_id THEN
    RAISE EXCEPTION 'entry_id cannot be changed';
  END IF;
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'author_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_comment_columns ON public.entry_comments;
CREATE TRIGGER protect_comment_columns
BEFORE UPDATE ON public.entry_comments
FOR EACH ROW
EXECUTE FUNCTION public.protect_comment_columns();

-- ---------------------------------------------------------------------------
-- Restrict helper function execution to authenticated (they expose owner ids).
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.entry_owner_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entry_owner_id(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Username rules: charset/length CHECK + reserved-name enforcement.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_username_format;
ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_username_format
  CHECK (username ~ '^[a-z0-9][a-z0-9_-]{1,29}$') NOT VALID;

CREATE OR REPLACE FUNCTION public.is_reserved_username(_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(_username) = ANY (ARRAY[
    'admin','root','auth','login','logout','signup','signin',
    'api','app','n','s','pricing','about','careers','blog',
    'contact','changelog','roadmap','docs','support','status',
    'press','legal','privacy','terms','security','cookies',
    'settings','account','profile','user','users','team',
    'dashboard','home','help','sitemap','robots','well-known',
    'billing','checkout','pay','payments','404','500'
  ]);
$$;

-- Reject reserved names on user-initiated writes. The signup trigger below
-- runs as service_role and is exempt (it already avoids reserved names).
CREATE OR REPLACE FUNCTION public.validate_username_reserved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_reserved_username(NEW.username) THEN
    RAISE EXCEPTION 'username "%" is reserved', NEW.username;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_username_reserved ON public.user_preferences;
CREATE TRIGGER validate_username_reserved
BEFORE INSERT OR UPDATE OF username ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.validate_username_reserved();

-- ---------------------------------------------------------------------------
-- Race-safe signup username assignment: retry on unique_violation and skip
-- reserved candidates.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username text;
  candidate text;
  suffix int := 0;
  attempts int := 0;
BEGIN
  base_username := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  IF base_username IS NULL OR length(base_username) < 3 THEN
    base_username := 'user' || substr(replace(NEW.id::text, '-', ''), 1, 6);
  END IF;

  candidate := base_username;

  LOOP
    attempts := attempts + 1;

    -- Skip taken or reserved candidates before attempting the insert.
    IF public.is_reserved_username(candidate)
       OR EXISTS (SELECT 1 FROM public.user_preferences WHERE lower(username) = candidate) THEN
      suffix := suffix + 1;
      candidate := base_username || suffix::text;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.user_preferences (user_id, username)
      VALUES (NEW.id, candidate)
      ON CONFLICT (user_id) DO NOTHING;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Lost a race for this username; fall back to a random suffix.
      candidate := base_username || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    END;

    IF attempts >= 50 THEN
      candidate := 'user' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
      INSERT INTO public.user_preferences (user_id, username)
      VALUES (NEW.id, candidate)
      ON CONFLICT (user_id) DO NOTHING;
      EXIT;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;


-- =========================================================================
-- MIGRATION: 20260715030400_email_send_log.sql
-- =========================================================================

-- Per-user email send log, used by the send-email edge function to rate limit
-- share invites. Only the service role touches it (no anon/authenticated grants).
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_send_log_user_time_idx
  ON public.email_send_log (user_id, created_at DESC);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.email_send_log TO service_role;


-- =========================================================================
-- MIGRATION: 20260716100000_content_yjs.sql
-- =========================================================================

-- Yjs binary persistence for realtime collaboration (Hocuspocus source of truth).
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS content_yjs bytea;


-- =========================================================================
-- MIGRATION: 20260729120000_entry_properties.sql
-- =========================================================================

-- Page properties (status, date, tags) shown above the editor.
--
-- One JSONB column rather than a table per property type: the set is small and
-- fixed, and every read of a page already fetches the row.
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS properties jsonb NOT NULL DEFAULT '{}'::jsonb;


-- =========================================================================
-- MIGRATION: 20260729121000_entry_sort_order.sql
-- =========================================================================

-- Manual sidebar ordering.
--
-- NULL means "never dragged", which sorts as 0 so newly created pages keep
-- appearing at the top of their group instead of falling to the bottom.
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS sort_order double precision;


-- =========================================================================
-- MIGRATION: 20260731130000_share_privacy_hardening.sql
-- =========================================================================

-- Privacy hardening: narrow public share RPC, add list_my_shares() so clients
-- don't need an unfiltered REST scan of entry_shares.
-- Data-safe: function-only changes; no table/column updates or row mutations.

-- 1) Public share pages: display fields only (no entry id).
-- Postgres rejects CREATE OR REPLACE when OUT parameters change — drop first.
DROP FUNCTION IF EXISTS public.get_shared_entry(text);

CREATE FUNCTION public.get_shared_entry(_token text)
RETURNS TABLE (title text, content text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.title, e.content, e.created_at
  FROM public.entries e
  WHERE e.share_token IS NOT NULL
    AND e.share_token = _token
    AND e.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_entry(text) TO anon, authenticated;

-- 2) Sidebar/collab bootstrap: rows the caller may see (mirrors entry_shares SELECT RLS).
CREATE OR REPLACE FUNCTION public.list_my_shares()
RETURNS TABLE (entry_id uuid, role text, shared_with_user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT es.entry_id, es.role, es.shared_with_user_id
  FROM public.entry_shares es
  WHERE public.is_entry_owner(es.entry_id)
    OR es.shared_with_user_id = auth.uid()
    OR es.shared_with_email = public.current_user_email()
    OR EXISTS (
      SELECT 1
      FROM public.entry_shares admin_es
      WHERE admin_es.entry_id = es.entry_id
        AND admin_es.role = 'admin'
        AND (
          admin_es.shared_with_user_id = auth.uid()
          OR admin_es.shared_with_email = public.current_user_email()
        )
    );
$$;

REVOKE ALL ON FUNCTION public.list_my_shares() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_shares() TO authenticated;


-- =========================================================================
-- MIGRATION: 20260731140000_hide_share_token_from_collaborators.sql
-- =========================================================================

-- Block collaborators from reading share_token via PostgREST on entries.
-- Owners keep full SELECT on entries; invite-based reads go through RPC only.

DROP POLICY IF EXISTS "Shared users can view shared entries" ON public.entries;

CREATE OR REPLACE FUNCTION public.fetch_collaborator_entries(
  _ids uuid[],
  _include_deleted boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  content text,
  content_json jsonb,
  created_at timestamptz,
  user_id uuid,
  pinned boolean,
  parent_id uuid,
  title text,
  layout jsonb,
  deleted_at timestamptz,
  properties jsonb,
  sort_order double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.content,
    e.content_json,
    e.created_at,
    e.user_id,
    e.pinned,
    e.parent_id,
    e.title,
    e.layout,
    e.deleted_at,
    e.properties,
    e.sort_order
  FROM public.entries e
  WHERE e.id = ANY(_ids)
    AND public.has_entry_share_role(e.id, ARRAY['viewer', 'editor', 'admin'])
    AND (_include_deleted OR e.deleted_at IS NULL);
$$;

REVOKE ALL ON FUNCTION public.fetch_collaborator_entries(uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_collaborator_entries(uuid[], boolean) TO authenticated;


-- =========================================================================
-- MIGRATION: 20260801120000_fetch_share_workspace.sql
-- =========================================================================

-- Server-owned "Shared with me" bootstrap: claim pending email invites, return
-- collaborator entries + roles and owned pages that have outbound shares.
-- Data-safe: function + indexes + realtime publication only; no row deletes.

CREATE INDEX IF NOT EXISTS entry_shares_shared_with_user_id_idx
  ON public.entry_shares (shared_with_user_id)
  WHERE shared_with_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS entry_shares_shared_with_email_lower_idx
  ON public.entry_shares (lower(shared_with_email));

CREATE OR REPLACE FUNCTION public.fetch_share_workspace(
  _include_deleted boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  uid uuid := auth.uid();
  email text := lower(public.current_user_email());
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object(
      'collaborators', '[]'::json,
      'owned_shared_ids', '[]'::json
    );
  END IF;

  -- Bind pending invites (created before the account existed) to this user.
  IF email <> '' THEN
    UPDATE public.entry_shares
    SET shared_with_user_id = uid
    WHERE shared_with_user_id IS NULL
      AND lower(shared_with_email) = email;
  END IF;

  SELECT json_build_object(
    'collaborators', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          e.id,
          e.content,
          e.content_json,
          e.created_at,
          e.user_id,
          e.pinned,
          e.parent_id,
          e.title,
          e.layout,
          e.deleted_at,
          e.properties,
          e.sort_order,
          es.role
        FROM public.entry_shares es
        INNER JOIN public.entries e ON e.id = es.entry_id
        WHERE es.shared_with_user_id = uid
          AND e.user_id IS DISTINCT FROM uid
          AND (_include_deleted OR e.deleted_at IS NULL)
      ) x
    ), '[]'::json),
    'owned_shared_ids', COALESCE((
      SELECT json_agg(DISTINCT es.entry_id)
      FROM public.entry_shares es
      INNER JOIN public.entries e ON e.id = es.entry_id
      WHERE e.user_id = uid
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_share_workspace(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_share_workspace(boolean) TO authenticated;

-- Realtime: invitees receive INSERT/UPDATE/DELETE on rows their RLS allows.
ALTER TABLE public.entry_shares REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.entry_shares;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- =========================================================================
-- MIGRATION: 20260802120000_surface_brightness_preferences.sql
-- =========================================================================

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS dark_surface_shift smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS light_surface_shift smallint NOT NULL DEFAULT 0;


-- =========================================================================
-- MIGRATION: 20260808120000_content_storage.sql
-- =========================================================================

-- Local vault mode: per-page storage flag + user default preference.
-- Additive only — no UPDATE/DELETE on existing body columns.

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS content_storage text NOT NULL DEFAULT 'cloud'
  CHECK (content_storage IN ('cloud', 'local'));

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS default_content_storage text NOT NULL DEFAULT 'cloud'
  CHECK (default_content_storage IN ('cloud', 'local', 'ask'));


-- =========================================================================
-- MIGRATION: 20260808120100_content_storage_rpc.sql
-- =========================================================================

-- Add content_storage to share RPC projections (SELECT-only change).
-- Must drop first: PostgreSQL rejects CREATE OR REPLACE when OUT columns change.

DROP FUNCTION IF EXISTS public.fetch_collaborator_entries(uuid[], boolean);

CREATE FUNCTION public.fetch_collaborator_entries(
  _ids uuid[],
  _include_deleted boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  content text,
  content_json jsonb,
  created_at timestamptz,
  user_id uuid,
  pinned boolean,
  parent_id uuid,
  title text,
  layout jsonb,
  deleted_at timestamptz,
  properties jsonb,
  sort_order double precision,
  content_storage text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.content,
    e.content_json,
    e.created_at,
    e.user_id,
    e.pinned,
    e.parent_id,
    e.title,
    e.layout,
    e.deleted_at,
    e.properties,
    e.sort_order,
    e.content_storage
  FROM public.entries e
  WHERE e.id = ANY(_ids)
    AND public.has_entry_share_role(e.id, ARRAY['viewer', 'editor', 'admin'])
    AND (_include_deleted OR e.deleted_at IS NULL);
$$;

CREATE OR REPLACE FUNCTION public.fetch_share_workspace(
  _include_deleted boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  uid uuid := auth.uid();
  email text := lower(public.current_user_email());
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object(
      'collaborators', '[]'::json,
      'owned_shared_ids', '[]'::json
    );
  END IF;

  IF email <> '' THEN
    UPDATE public.entry_shares
    SET shared_with_user_id = uid
    WHERE shared_with_user_id IS NULL
      AND lower(shared_with_email) = email;
  END IF;

  SELECT json_build_object(
    'collaborators', COALESCE((
      SELECT json_agg(row_to_json(x) ORDER BY x.created_at DESC)
      FROM (
        SELECT
          e.id,
          e.content,
          e.content_json,
          e.created_at,
          e.user_id,
          e.pinned,
          e.parent_id,
          e.title,
          e.layout,
          e.deleted_at,
          e.properties,
          e.sort_order,
          e.content_storage,
          es.role
        FROM public.entry_shares es
        INNER JOIN public.entries e ON e.id = es.entry_id
        WHERE es.shared_with_user_id = uid
          AND e.user_id IS DISTINCT FROM uid
          AND (_include_deleted OR e.deleted_at IS NULL)
      ) x
    ), '[]'::json),
    'owned_shared_ids', COALESCE((
      SELECT json_agg(DISTINCT es.entry_id)
      FROM public.entry_shares es
      INNER JOIN public.entries e ON e.id = es.entry_id
      WHERE e.user_id = uid
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.fetch_collaborator_entries(uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_collaborator_entries(uuid[], boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.fetch_share_workspace(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_share_workspace(boolean) TO authenticated;


-- =========================================================================
-- MIGRATION: 20260808120200_protect_local_content_storage.sql
-- =========================================================================

-- Server-side guards for local vault mode.

CREATE OR REPLACE FUNCTION public.protect_local_content_storage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.content_storage IS DISTINCT FROM NEW.content_storage
     AND auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'only the owner can change content storage mode';
  END IF;

  IF NEW.content_storage = 'local' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.content := '';
      NEW.content_json := NULL;
    ELSE
      NEW.content := OLD.content;
      NEW.content_json := OLD.content_json;
    END IF;
  END IF;

  IF NEW.content_storage = 'local' AND NEW.share_token IS NOT NULL THEN
    NEW.share_token := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_local_content_storage ON public.entries;
CREATE TRIGGER protect_local_content_storage
  BEFORE INSERT OR UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.protect_local_content_storage();

CREATE OR REPLACE FUNCTION public.block_share_local_entries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.entries e
    WHERE e.id = NEW.entry_id AND e.content_storage = 'local'
  ) THEN
    RAISE EXCEPTION 'local entries cannot be shared';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_share_local_entries ON public.entry_shares;
CREATE TRIGGER block_share_local_entries
  BEFORE INSERT ON public.entry_shares
  FOR EACH ROW EXECUTE FUNCTION public.block_share_local_entries();


-- =========================================================================
-- MIGRATION: 20260823010000_collections.sql
-- =========================================================================

-- Saved page queries. Membership is evaluated on the client (filters ∩ then ∪ allow_list).
-- Owner-only. Never touches entries content.

CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  rules jsonb NOT NULL DEFAULT '{"filters":[]}'::jsonb,
  allow_list uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX collections_user_id_idx ON public.collections (user_id);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own collections"
  ON public.collections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own collections"
  ON public.collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collections"
  ON public.collections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own collections"
  ON public.collections FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;

CREATE OR REPLACE FUNCTION public.is_reserved_username(_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(_username) = ANY (ARRAY[
    'admin','root','auth','login','logout','signup','signin',
    'api','app','n','s','c','trash','pricing','about','careers','blog',
    'contact','changelog','roadmap','docs','support','status',
    'press','legal','privacy','terms','security','cookies',
    'settings','account','profile','user','users','team',
    'dashboard','home','help','sitemap','robots','well-known',
    'billing','checkout','pay','payments','404','500'
  ]);
$$;


-- =========================================================================
-- MIGRATION: 20260902120000_shared_entry_content_json.sql
-- =========================================================================

-- Public share pages: same document the owner sees (markdown + JSON).
-- Display fields only — no entry id, user_id, share_token, or parent_id.
-- Postgres rejects CREATE OR REPLACE when OUT parameters change — drop first.

DROP FUNCTION IF EXISTS public.get_shared_entry(text);

CREATE FUNCTION public.get_shared_entry(_token text)
RETURNS TABLE (title text, content text, content_json jsonb, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.title, e.content, e.content_json, e.created_at
  FROM public.entries e
  WHERE e.share_token IS NOT NULL
    AND e.share_token = _token
    AND e.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_entry(text) TO anon, authenticated;


