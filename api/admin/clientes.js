import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAdmin } from "../_lib/auth.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function send(res, status, obj) {
  res.status(status).json(obj);
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .trim();
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const auth = await requireAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  const sb = supabaseAdmin();

  // GET: listar clientes
  if (req.method === "GET") {
    const { data, error } = await sb
      .from("clientes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { data });
  }

  const body = await readBody(req);

  // POST: criar cliente (+ opcional criar user auth e vincular)
  if (req.method === "POST") {
    const nome = String(body.nome || "").trim();
    const slug = slugify(body.slug || nome);
    const whatsapp = String(body.whatsapp || "").replace(/\D/g, "");
    const ativo = body.ativo !== false;

    const tipo_negocio = String(body.tipo_negocio || "").trim(); // ex: restaurante, mercado...
    const cidade = String(body.cidade || "").trim();            // opcional (se existir coluna)
    const logo_url = String(body.logo_url || "").trim();        // opcional (se existir coluna)

    const email = String(body.email || "").trim().toLowerCase();
    const senha = String(body.senha || "").trim();

    if (!nome) return send(res, 400, { error: "nome obrigatório" });
    if (!slug) return send(res, 400, { error: "slug obrigatório" });

    // cria cliente
    const insertPayload = {
      nome,
      slug,
      whatsapp: whatsapp || null,
      ativo,
      tipo_negocio: tipo_negocio || null,
      logo_url: logo_url || null
    };

    // se você NÃO tiver coluna cidade, isso aqui é ignorado ao remover abaixo
    // (se der erro, você remove a linha ou cria a coluna via SQL)
    if (cidade) insertPayload.cidade = cidade;

    const { data: created, error: e1 } = await sb
      .from("clientes")
      .insert(insertPayload)
      .select("*")
      .single();

    if (e1) return send(res, 400, { error: e1.message });

    // opcional: criar user do cliente e vincular em cliente_usuarios
    if (email && senha) {
      const { data: u, error: eU } = await sb.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true
      });

      if (eU) {
        // cliente foi criado, mas usuário não
        return send(res, 200, {
          data: created,
          warning: `Cliente criado, mas falhou criar usuário: ${eU.message}`
        });
      }

      const user_id = u?.user?.id;
      if (user_id) {
        const { error: eLink } = await sb
          .from("cliente_usuarios")
          .insert({
            cliente_slug: slug,
            user_id,
            role: "owner",
            ativo: true
          });

        if (eLink) {
          return send(res, 200, {
            data: created,
            warning: `Usuário criado, mas falhou vincular cliente_usuarios: ${eLink.message}`
          });
        }
      }
    }

    return send(res, 200, { data: created });
  }

  // PUT: atualizar cliente (por id ou slug)
  if (req.method === "PUT") {
    const id = body.id || null;
    const slug = body.slug ? slugify(body.slug) : null;
    if (!id && !slug) return send(res, 400, { error: "id ou slug obrigatório" });

    const patch = {};
    if (body.nome != null) patch.nome = String(body.nome).trim();
    if (body.whatsapp != null) patch.whatsapp = String(body.whatsapp).replace(/\D/g, "") || null;
    if (body.ativo != null) patch.ativo = !!body.ativo;
    if (body.tipo_negocio != null) patch.tipo_negocio = String(body.tipo_negocio).trim() || null;
    if (body.logo_url != null) patch.logo_url = String(body.logo_url).trim() || null;
    if (body.cidade != null) patch.cidade = String(body.cidade).trim() || null;

    let q = sb.from("clientes").update(patch).select("*").single();
    q = id ? q.eq("id", id) : q.eq("slug", slug);

    const { data, error } = await q;
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { data });
  }

  // DELETE: excluir cliente (slug via query ?slug=... OU body)
  if (req.method === "DELETE") {
    const url = new URL(req.url, "http://localhost");
    const slug = slugify(url.searchParams.get("slug") || body.slug || "");
    if (!slug) return send(res, 400, { error: "slug obrigatório" });

    // apaga dependências primeiro
    await sb.from("produtos").delete().eq("cliente_slug", slug);
    await sb.from("categorias").delete().eq("cliente_slug", slug);
    await sb.from("cliente_usuarios").delete().eq("cliente_slug", slug);

    const { error } = await sb.from("clientes").delete().eq("slug", slug);
    if (error) return send(res, 400, { error: error.message });

    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: "Method not allowed" });
}
