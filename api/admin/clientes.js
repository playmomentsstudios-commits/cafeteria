import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { applyCors, requireAdmin, readJson, send } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const sb = supabaseAdmin();

  try {
    // LISTAR
    if (req.method === "GET") {
      const { data, error } = await sb
        .from("clientes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, data || []);
    }

    // CRIAR
    if (req.method === "POST") {
      const body = await readJson(req);

      const nome = (body.nome || "").trim();
      const slug = (body.slug || "").trim();
      const whatsapp = (body.whatsapp || "").trim();
      const tipo_negocio = (body.tipo_negocio || "").trim(); // NOVO
      const ativo = body.ativo !== false;

      // credenciais do cliente (opcional, mas você pediu)
      const email = (body.email || "").trim().toLowerCase();
      const senha = (body.senha || "").trim();

      if (!nome || !slug) return send(res, 400, { error: "nome e slug são obrigatórios" });

      // 1) cria/insere cliente
      const { data: cli, error: eCli } = await sb
        .from("clientes")
        .insert([{ nome, slug, whatsapp, tipo_negocio, ativo }])
        .select("*")
        .single();

      if (eCli) return send(res, 400, { error: eCli.message });

      // 2) se veio email/senha, cria usuário no Auth e vincula
      let createdUserId = null;

      if (email && senha) {
        const { data: created, error: eUser } = await sb.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
        });

        if (eUser) {
          // se falhar, desfaz o cliente para não ficar “meio criado”
          await sb.from("clientes").delete().eq("id", cli.id);
          return send(res, 400, { error: `Falha ao criar usuário: ${eUser.message}` });
        }

        createdUserId = created.user?.id || null;

        const { error: eLink } = await sb
          .from("cliente_usuarios")
          .insert([{
            cliente_slug: slug,
            user_id: createdUserId,
            role: "owner",
            ativo: true
          }]);

        if (eLink) {
          await sb.from("clientes").delete().eq("id", cli.id);
          return send(res, 400, { error: `Falha ao vincular usuário: ${eLink.message}` });
        }
      }

      return send(res, 201, { ...cli, created_user_id: createdUserId });
    }

    // ATUALIZAR
    if (req.method === "PUT" || req.method === "PATCH") {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return send(res, 400, { error: "id é obrigatório" });

      const patch = {};
      ["nome", "slug", "whatsapp", "tipo_negocio", "ativo"].forEach(k => {
        if (body[k] !== undefined) patch[k] = body[k];
      });

      const { data, error } = await sb
        .from("clientes")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();

      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, data);
    }

    // EXCLUIR
    if (req.method === "DELETE") {
      const body = await readJson(req);
      const id = body.id;
      if (!id) return send(res, 400, { error: "id é obrigatório" });

      const { error } = await sb.from("clientes").delete().eq("id", id);
      if (error) return send(res, 400, { error: error.message });
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return send(res, 500, { error: e?.message || "Server error" });
  }
}
