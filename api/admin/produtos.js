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

      let q = sb.from("produtos").select("*").order("created_at", { ascending: false });
      if (cliente_slug) q = q.eq("cliente_slug", cliente_slug);

      const { data, error } = await q;
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, data || []);
    }

    if (req.method === "POST") {
      const body = await readJson(req);

      const payload = {
        cliente_slug: (body.cliente_slug || "").trim(),
        categoria_id: body.categoria_id,
        nome: (body.nome || "").trim(),
        descricao: (body.descricao || "").trim(),
        preco: Number(body.preco || 0),
        imagem_url: (body.imagem_url || "").trim(), // PADRÃO
        ativo: body.ativo !== false,
      };

      if (!payload.cliente_slug || !payload.nome) {
        return send(res, 400, { error: "cliente_slug e nome são obrigatórios" });
      }

      const { data, error } = await sb
        .from("produtos")
        .insert([payload])
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
      ["categoria_id","nome","descricao","preco","imagem_url","ativo"].forEach(k => {
        if (body[k] !== undefined) patch[k] = body[k];
      });

      const { data, error } = await sb
        .from("produtos")
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

      const { error } = await sb.from("produtos").delete().eq("id", id);
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { error: e?.message || "Server error" });
  }
}
