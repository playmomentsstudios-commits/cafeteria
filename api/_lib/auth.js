import { createClient } from "@supabase/supabase-js";

function parseAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMNT_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function setCors(req, res) {
  const origin = req.headers.origin || "";

  const allow =
    origin === "https://playmomentsstudios-commits.github.io" ||
    origin.endsWith(".vercel.app");

  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, x-requested-with"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.method === "GET") return {};
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export async function requireAdmin(req) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, error: "Missing Bearer token" };
  const token = match[1];

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || (!ANON && !SERVICE)) {
    return { ok: false, status: 500, error: "Missing Supabase env vars" };
  }

  // valida token de sessão do Supabase Auth
  const sb = createClient(SUPABASE_URL, ANON || SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Invalid token" };
  }

  const email = (data.user.email || "").toLowerCase();
  const allowed = parseAdminEmails();

  // se ADMIN_EMAILS não estiver configurado, deixa passar (pra não travar você)
  if (allowed.length > 0 && !allowed.includes(email)) {
    return { ok: false, status: 403, error: "Not an admin" };
  }

  return { ok: true, status: 200, user: data.user };
}
