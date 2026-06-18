import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AdminClient = ReturnType<typeof createClient<Database>>;

let cachedAdminClient: AdminClient | null = null;

export function getSupabaseAdminClient() {
  if (cachedAdminClient) return cachedAdminClient;

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("Backend URL is unavailable in this deployment. Re-publish the app so backend settings refresh, then try again.");
  }

  if (!serviceRoleKey) {
    throw new Error("Secure admin access is unavailable in this deployment. Re-publish the app so backend secrets refresh, then try again.");
  }

  cachedAdminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedAdminClient;
}