import { createClient } from "@supabase/supabase-js";
import { requireAdmin, setCors, json, readBody } from "../_lib/auth.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normSlug(s = "") {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json(res, 500, { error: "Missing SUPABASE_URL or SERVICE_ROLE env" });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.error });

  try {
    // LISTAR
    if (req.method === "GET") {
      const { data, error } = await sbAdmin
        .from("clientes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    const body = await readBody(req);

    // CRIAR
    if (req.method === "POST") {
      const nome = String(body.nome || "").trim();
      const slug = normSlug(body.slug || nome);
      const whatsapp = String(body.whatsapp || "").trim();
      const ativo = body.ativo !== false;

      const email = String(body.email || "").trim().toLowerCase();
      const senha = String(body.senha || "").trim();

      if (!nome || !slug) return json(res, 400, { error: "nome/slug obrigatórios" });

      // 1) cria/atualiza cliente
      const { data: cliente, error: e1 } = await sbAdmin
        .from("clientes")
        .upsert({ nome, slug, whatsapp, ativo }, { onConflict: "slug" })
        .select("*")
        .single();

      if (e1) return json(res, 400, { error: e1.message });

      // 2) se veio email/senha: cria usuário Auth + vincula
      let createdUser = null;

      if (email && senha) {
        const { data: userRes, error: eU } = await sbAdmin.auth.admin.createUser({
          email,
          password: senha,
          email_confirm: true,
        });

        if (eU) return json(res, 400, { error: `Auth createUser: ${eU.message}` });

        createdUser = userRes.user;

        // vínculo (RLS multi-tenant)
        const { error: eLink } = await sbAdmin
          .from("cliente_usuarios")
          .upsert(
            {
              cliente_slug: slug,
              user_id: createdUser.id,
              role: "owner",
              ativo: true,
            },
            { onConflict: "cliente_slug,user_id" }
          );

        if (eLink) return json(res, 400, { error: `Link user: ${eLink.message}` });
      }

      return json(res, 200, { data: cliente, user: createdUser });
    }

    // ATUALIZAR
    if (req.method === "PATCH" || req.method === "PUT") {
      const slug = normSlug(body.slug);
      if (!slug) return json(res, 400, { error: "slug obrigatório" });

      const patch = {};
      if (body.nome != null) patch.nome = String(body.nome).trim();
      if (body.whatsapp != null) patch.whatsapp = String(body.whatsapp).trim();
      if (body.ativo != null) patch.ativo = !!body.ativo;

      const { data, error } = await sbAdmin
        .from("clientes")
        .update(patch)
        .eq("slug", slug)
        .select("*")
        .single();

      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { data });
    }

    // EXCLUIR
    if (req.method === "DELETE") {
      const slug = normSlug(req.query?.slug || "");
      if (!slug) return json(res, 400, { error: "slug obrigatório" });

      // apaga primeiro filhos
      await sbAdmin.from("produtos").delete().eq("cliente_slug", slug);
      await sbAdmin.from("categorias").delete().eq("cliente_slug", slug);
      await sbAdmin.from("cliente_usuarios").delete().eq("cliente_slug", slug);

      const { error } = await sbAdmin.from("clientes").delete().eq("slug", slug);
      if (error) return json(res, 400, { error: error.message });

      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: String(e?.message || e) });
  }
}
