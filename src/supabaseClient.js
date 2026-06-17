import { createClient } from "@supabase/supabase-js";

// De valè sa yo soti nan paramèt Vercel ou yo (Environment Variables).
// Ou pa bezwen ekri yo isit la — ou mete yo sou Vercel.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key);
