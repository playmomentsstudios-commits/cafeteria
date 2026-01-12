import { supabaseAdmin } from "./supabaseAdmin.js";

function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAdmin(req) {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) return { ok: false, status: 401, error: "Missing Bearer token" };

    const token = match[1].trim();
    if (!token) return { ok: false, status: 401, error: "Missing Bearer token" };

    const sb = supabaseAdmin();
    const { data, error } = await sb.auth.getUser(token);

    if (error || !data?.user) return { ok: false, status: 401, error: "Invalid token" };

    const email = (data.user.email || "").toLowerCase();
    const allowed = parseAdminEmails();

    if (!email || !allowed.includes(email)) {
      return { ok: false, status: 403, error: "Not an admin" };
    }

    return { ok: true, status: 200, user: data.user };
  } catch (e) {
    return { ok: false, status: 500, error: e?.message || "Auth error" };
  }
}
