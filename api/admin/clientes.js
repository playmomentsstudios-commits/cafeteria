import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAdmin } from "../_lib/auth.js";

function json(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    const sb = supabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await sb.from("clientes").select("*").order("created_at", { ascending: false });
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const payload = {
        nome: body.nome?.trim(),
        slug: body.slug?.trim(),
        whatsapp: body.whatsapp?.trim(),
        ativo: body.ativo ?? true,
        logo_url: body.logo_url ?? null,
      };

      if (!payload.nome || !payload.slug || !payload.whatsapp) {
        return json(res, 400, { error: "nome, slug, whatsapp são obrigatórios" });
      }

      const { data, error } = await sb.from("clientes").insert(payload).select("*").single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 201, { data });
    }

    if (req.method === "PATCH") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const slug = body.slug?.trim();
      const update = {};

      ["nome","whatsapp","logo_url"].forEach(k => {
        if (body[k] !== undefined) update[k] = body[k];
      });
      if (body.ativo !== undefined) update.ativo = !!body.ativo;

      if (!slug) return json(res, 400, { error: "slug é obrigatório" });

      const { data, error } = await sb.from("clientes").update(update).eq("slug", slug).select("*").single();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    if (req.method === "DELETE") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
      const slug = body.slug?.trim();
      if (!slug) return json(res, 400, { error: "slug é obrigatório" });

      const { error } = await sb.from("clientes").delete().eq("slug", slug);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: e.message || "Server error" });
  }
}
