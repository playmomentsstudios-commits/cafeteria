import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { applyCors, requireAdmin, readJson, send } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const sb = supabaseAdmin();

  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://x");
      const cliente_slug = url.searchParams.get("cliente_slug");

      let q = sb.from("categorias").select("*").order("ordem", { ascending: true });
      if (cliente_slug) q = q.eq("cliente_slug", cliente_slug);

      const { data, error } = await q;
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, data || []);
    }

    if (req.method === "POST") {
      const body = await readJson(req);
      const nome = (body.nome || "").trim();
      const cliente_slug = (body.cliente_slug || "").trim();
      const ordem = Number(body.ordem || 0);
      const ativo = body.ativo !== false;

      if (!nome || !cliente_slug) return send(res, 400, { error: "nome e cliente_slug obrigatórios" });

      const { data, error } = await sb
        .from("categorias")
        .insert([{ nome, cliente_slug, ordem, ativo }])
        .select("*")
        .single();

      if (error) return send(res, 400, { error: error.message });
      return send(res, 201, data);
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return send(res, 400, { error: "id é obrigatório" });

      const patch = {};
      ["nome", "ordem", "ativo"].forEach(k => {
        if (body[k] !== undefined) patch[k] = body[k];
      });

      const { data, error } = await sb
        .from("categorias")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();

      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, data);
    }

    if (req.method === "DELETE") {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return send(res, 400, { error: "id é obrigatório" });

      const { error } = await sb.from("categorias").delete().eq("id", id);
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { error: e?.message || "Server error" });
  }
}
