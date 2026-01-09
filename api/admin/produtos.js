import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAdmin } from "../_lib/auth.js";

function json(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    const allowed = new Set([
  "https://playmomentsstudios-commits.github.io",
  "https://cafeteria-gamma-orpin.vercel.app"
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
  return;
}

    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    const sb = supabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await sb.from("produtos").select("*").order("cliente_slug").order("ordem").order("nome");
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const payload = {
        cliente_slug: body.cliente_slug?.trim(),
        categoria_id: Number(body.categoria_id),
        nome: body.nome?.trim(),
        descricao: (body.descricao ?? "").trim(),
        preco: Number(body.preco ?? 0),
        imagem: body.imagem ?? null,
        ativo: body.ativo ?? true,
        ordem: Number(body.ordem ?? 0),
      };

      if (!payload.cliente_slug || !payload.categoria_id || !payload.nome) {
        return json(res, 400, { error: "cliente_slug, categoria_id, nome são obrigatórios" });
      }

      const { data, error } = await sb.from("produtos").insert(payload).select("*").single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, { data });
    }

    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const id = Number(body.id);
      if (!id) return json(res, 400, { error: "id é obrigatório" });

      const update = {};
      ["cliente_slug","nome","descricao","imagem"].forEach(k => { if (body[k] !== undefined) update[k] = body[k]; });
      if (body.categoria_id !== undefined) update.categoria_id = Number(body.categoria_id);
      if (body.preco !== undefined) update.preco = Number(body.preco);
      if (body.ativo !== undefined) update.ativo = !!body.ativo;
      if (body.ordem !== undefined) update.ordem = Number(body.ordem);

      const { data, error } = await sb.from("produtos").update(update).eq("id", id).select("*").single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    if (req.method === "DELETE") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const id = Number(body.id);
      if (!id) return json(res, 400, { error: "id é obrigatório" });

      const { error } = await sb.from("produtos").delete().eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: e.message || "Server error" });
  }
}

