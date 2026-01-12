import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { requireAdmin } from "../_lib/auth.js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
const send = (res, status, obj) => res.status(status).json(obj);

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

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const auth = await requireAdmin(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  const sb = supabaseAdmin();

  if (req.method === "GET") {
    const url = new URL(req.url, "http://localhost");
    const cliente_slug = url.searchParams.get("cliente_slug");
    const categoria_id = url.searchParams.get("categoria_id");

    let q = sb.from("produtos").select("*").order("created_at", { ascending: false });
    if (cliente_slug) q = q.eq("cliente_slug", cliente_slug);
    if (categoria_id) q = q.eq("categoria_id", categoria_id);

    const { data, error } = await q;
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { data });
  }

  const body = await readBody(req);

  if (req.method === "POST") {
    const cliente_slug = String(body.cliente_slug || "").trim();
    const categoria_id = body.categoria_id;
    const nome = String(body.nome || "").trim();
    const descricao = String(body.descricao || "").trim();
    const preco = Number(body.preco || 0);
    const ativo = body.ativo !== false;
    const ordem = Number(body.ordem || 0);

    // imagem_url (se existir na sua tabela)
    const imagem_url = String(body.imagem_url || "").trim() || null;

    if (!cliente_slug) return send(res, 400, { error: "cliente_slug obrigatório" });
    if (!categoria_id) return send(res, 400, { error: "categoria_id obrigatório" });
    if (!nome) return send(res, 400, { error: "nome obrigatório" });

    // ✅ valida categoria existe e é do mesmo cliente
    const { data: cat, error: eCat } = await sb
      .from("categorias")
      .select("id,cliente_slug")
      .eq("id", categoria_id)
      .single();

    if (eCat || !cat) return send(res, 400, { error: "categoria_id inválido" });
    if (String(cat.cliente_slug) !== String(cliente_slug)) {
      return send(res, 400, { error: "categoria não pertence ao cliente_slug" });
    }

    const payload = {
      cliente_slug,
      categoria_id,
      nome,
      descricao: descricao || null,
      preco,
      ativo,
      ordem,
      imagem_url
    };

    const { data, error } = await sb
      .from("produtos")
      .insert(payload)
      .select("*")
      .single();

    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { data });
  }

  if (req.method === "PUT") {
    const id = body.id;
    if (!id) return send(res, 400, { error: "id obrigatório" });

    const patch = {};
    if (body.nome != null) patch.nome = String(body.nome).trim();
    if (body.descricao != null) patch.descricao = String(body.descricao).trim() || null;
    if (body.preco != null) patch.preco = Number(body.preco || 0);
    if (body.ativo != null) patch.ativo = !!body.ativo;
    if (body.ordem != null) patch.ordem = Number(body.ordem || 0);
    if (body.imagem_url != null) patch.imagem_url = String(body.imagem_url).trim() || null;

    // se trocar categoria, valida
    if (body.categoria_id != null) {
      const categoria_id = body.categoria_id;
      const { data: cat, error: eCat } = await sb
        .from("categorias")
        .select("id")
        .eq("id", categoria_id)
        .single();
      if (eCat || !cat) return send(res, 400, { error: "categoria_id inválido" });
      patch.categoria_id = categoria_id;
    }

    const { data, error } = await sb
      .from("produtos")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { data });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url, "http://localhost");
    const id = url.searchParams.get("id") || body.id;
    if (!id) return send(res, 400, { error: "id obrigatório" });

    const { error } = await sb.from("produtos").delete().eq("id", id);
    if (error) return send(res, 400, { error: error.message });

    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: "Method not allowed" });
}
