// api/admin/clientes.js
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

/**
 * ENV obrigatórias na Vercel:
 * - SUPABASE_URL=https://rgsnmxspyywwouhcdwkj.supabase.co
 * - SUPABASE_SERVICE_ROLE_KEY=xxxxx (NUNCA no front)
 *
 * ENV opcional (RECOMENDADO):
 * - ADMIN_EMAILS=playmomentsstudios@gmail.com,outro@email.com
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED_ORIGINS = [
  "https://playmomentsstudios-commits.github.io",
  "https://playmomentsstudios-commits.github.io/cafeteria",
  "https://playmomentsstudios-commits.github.io/cafeteria/",
];

function setCors(req, res) {
  const origin = req.headers.origin || "";
  const isVercelPreview = origin.endsWith(".vercel.app");
  const isAllowed =
    ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o)) ||
    isVercelPreview;

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, x-requested-with"
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

  if (isAllowed) res.setHeader("Access-Control-Allow-Origin", origin);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.method === "GET") return {};
  return new Promise((resolve, reject) => {
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

// ===== JWT verify (RS256) using JWKS from Supabase =====

function b64urlToBuf(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  return Buffer.from(b64 + pad, "base64");
}

function parseJwt(token) {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("Malformed JWT");
  const header = JSON.parse(b64urlToBuf(h).toString("utf8"));
  const payload = JSON.parse(b64urlToBuf(p).toString("utf8"));
  const signature = b64urlToBuf(s);
  const signingInput = `${h}.${p}`;
  return { header, payload, signature, signingInput };
}

async function getJwks() {
  const url = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to fetch JWKS");
  return r.json();
}

function jwkToPem(jwk) {
  // Node crypto can import JWK directly in verify using createPublicKey
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

async function verifySupabaseAccessToken(token) {
  const { header, payload, signature, signingInput } = parseJwt(token);

  if (header.alg !== "RS256") throw new Error("Unexpected alg");
  if (!header.kid) throw new Error("Missing kid");

  // exp check
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) throw new Error("Token expired");

  // issuer check (Supabase)
  const expectedIss = `${SUPABASE_URL}/auth/v1`;
  if (payload.iss !== expectedIss) throw new Error("Invalid issuer");

  // fetch keys
  const jwks = await getJwks();
  const key = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!key) throw new Error("Unknown kid");

  const publicKey = jwkToPem(key);

  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    publicKey,
    signature
  );

  if (!ok) throw new Error("Bad signature");

  return payload;
}

function getBearer(req) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireAuth(req, res) {
  const token = getBearer(req);
  if (!token) {
    json(res, 401, { error: "Missing Bearer token" });
    return null;
  }

  try {
    const payload = await verifySupabaseAccessToken(token);

    // Optional allowlist by email (recommended)
    const email =
      payload.email ||
      payload.user_metadata?.email ||
      payload.user_metadata?.["email"];

    if (ADMIN_EMAILS.length) {
      const ok = (email || "").toLowerCase();
      if (!ADMIN_EMAILS.includes(ok)) {
        json(res, 403, { error: "Not allowed" });
        return null;
      }
    }

    return { tokenPayload: payload };
  } catch (e) {
    json(res, 401, { error: "Invalid token", details: String(e.message || e) });
    return null;
  }
}

// ===== CRUD: clientes =====
// Table expected: clientes { id, nome, slug, whatsapp, ativo, created_at }

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(res, 500, { error: "Missing SUPABASE_URL or SERVICE_ROLE env" });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  let body = {};
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: "Invalid JSON body" });
  }

  try {
    if (req.method === "GET") {
      // list
      const { data, error } = await sbAdmin
        .from("clientes")
        .select("*")
        .order("id", { ascending: false });

      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    if (req.method === "POST") {
      // create
      const { nome, slug, whatsapp, ativo = true } = body;
      if (!nome || !slug) return json(res, 400, { error: "nome e slug são obrigatórios" });

      const { data, error } = await sbAdmin
        .from("clientes")
        .insert([{ nome, slug, whatsapp: whatsapp || null, ativo }])
        .select("*")
        .single();

      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, { data });
    }

    if (req.method === "PUT") {
      // update
      const { id, nome, slug, whatsapp, ativo } = body;
      if (!id) return json(res, 400, { error: "id é obrigatório" });

      const patch = {};
      if (nome !== undefined) patch.nome = nome;
      if (slug !== undefined) patch.slug = slug;
      if (whatsapp !== undefined) patch.whatsapp = whatsapp || null;
      if (ativo !== undefined) patch.ativo = !!ativo;

      const { data, error } = await sbAdmin
        .from("clientes")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();

      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    if (req.method === "PATCH") {
      // actions: toggle | duplicate
      const { action, id } = body;
      if (!action || !id) return json(res, 400, { error: "action e id são obrigatórios" });

      if (action === "toggle") {
        const { data: row, error: e1 } = await sbAdmin
          .from("clientes")
          .select("*")
          .eq("id", id)
          .single();
        if (e1) return json(res, 400, { error: e1.message });

        const { data, error } = await sbAdmin
          .from("clientes")
          .update({ ativo: !row.ativo })
          .eq("id", id)
          .select("*")
          .single();

        if (error) return json(res, 400, { error: error.message });
        return json(res, 200, { data });
      }

      if (action === "duplicate") {
        const { data: row, error: e1 } = await sbAdmin
          .from("clientes")
          .select("*")
          .eq("id", id)
          .single();
        if (e1) return json(res, 400, { error: e1.message });

        // slug novo pra não bater unique (se existir)
        const newSlug = `${row.slug}-copia-${Date.now()}`;

        const { data, error } = await sbAdmin
          .from("clientes")
          .insert([
            {
              nome: `${row.nome} (cópia)`,
              slug: newSlug,
              whatsapp: row.whatsapp,
              ativo: row.ativo,
            },
          ])
          .select("*")
          .single();

        if (error) return json(res, 400, { error: error.message });
        return json(res, 201, { data });
      }

      return json(res, 400, { error: "action inválida" });
    }

    if (req.method === "DELETE") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "id é obrigatório" });

      // opcional: deletar dependências manualmente se não tiver FK cascade
      // await sbAdmin.from("produtos").delete().eq("cliente_slug", slugDoCliente)
      // await sbAdmin.from("categorias").delete().eq("cliente_slug", slugDoCliente)

      const { error } = await sbAdmin.from("clientes").delete().eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: "Server error", details: String(e.message || e) });
  }
}
