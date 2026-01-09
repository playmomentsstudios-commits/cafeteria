import { createClient } from "@supabase/supabase-js";

/**
 * Valida o token do usuário (Bearer) e confirma se é admin.
 * Aqui admin é por email (rápido). Dá pra trocar por tabela/role depois.
 */
export async function requireAdmin(req) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  if (!url || !anonKey) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return { ok: false, status: 401, error: "Missing Bearer token" };
  }

  // cria um client usando o token do usuário só para ler user info
  const sbUser = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Invalid token" };
  }

  const email = (data.user.email || "").toLowerCase();
  if (!adminEmails.includes(email)) {
    return { ok: false, status: 403, error: "Not an admin" };
  }

  return { ok: true, user: data.user };
}
