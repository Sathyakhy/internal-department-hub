CREATE TABLE public.workspace_state (id text PRIMARY KEY, data jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE ON public.workspace_state TO anon, authenticated;
GRANT ALL ON public.workspace_state TO service_role;
ALTER TABLE public.workspace_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read main" ON public.workspace_state FOR SELECT TO anon, authenticated USING (id = 'main');
CREATE POLICY "insert main" ON public.workspace_state FOR INSERT TO anon, authenticated WITH CHECK (id = 'main');
CREATE POLICY "update main" ON public.workspace_state FOR UPDATE TO anon, authenticated USING (id = 'main') WITH CHECK (id = 'main');