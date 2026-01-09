import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAdmin } from "../_lib/auth.js";

function json(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function applyCors(req, res) {
  const allowed = new Set([
    "https://playmomentsstudios-commits.github.io",
    "https://cafeteria-gamma-orpin.vercel.app",
    "https://cafeteria-jq10uha2x-felipes-projects-7335b3b6.vercel.app"
  ]);

  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export default async function handler(req, res) {
  try {
    if (applyCors(req, res)) return;

    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    const sb = supabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await sb
        .from("categorias")
        .select("*")
        .order("cliente_slug", { ascending: true })
        .order("ordem", { ascending: true })
        .order("id", { ascending: true });

      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const payload = {
        cliente_slug: body.cliente_slug?.trim(),
        nome: body.nome?.trim(),
        ordem: Number(body.ordem ?? 0),
        ativo: body.ativo ?? true
      };

      if (!payload.cliente_slug || !payload.nome) {
        return json(res, 400, { error: "cliente_slug e nome são obrigatórios" });
      }

      const { data, error } = await sb
        .from("categorias")
        .insert(payload)
        .select("*")
        .single();

      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, { data });
    }

    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const id = Number(body.id);
      if (!id) return json(res, 400, { error: "id é obrigatório" });

      const update = {};
      if (body.cliente_slug !== undefined) update.cliente_slug = String(body.cliente_slug).trim();
      if (body.nome !== undefined) update.nome = String(body.nome).trim();
      if (body.ordem !== undefined) update.ordem = Number(body.ordem);
      if (body.ativo !== undefined) update.ativo = !!body.ativo;

      const { data, error } = await sb
        .from("categorias")
        .update(update)
        .eq("id", id)
        .select("*")
        .single();

      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    if (req.method === "DELETE") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const id = Number(body.id);
      if (!id) return json(res, 400, { error: "id é obrigatório" });

      const { error } = await sb.from("categorias").delete().eq("id", id);
      if (error) return json(res, 400, { error: error.message });

      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: e?.message || "Server error" });
  }
}
