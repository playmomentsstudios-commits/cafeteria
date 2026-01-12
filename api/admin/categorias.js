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

    let q = sb.from("categorias").select("*").order("ordem", { ascending: true });
    if (cliente_slug) q = q.eq("cliente_slug", cliente_slug);

    const { data, error } = await q;
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { data });
  }

  const body = await readBody(req);

  if (req.method === "POST") {
    const cliente_slug = String(body.cliente_slug || "").trim();
    const nome = String(body.nome || "").trim();
    const ordem = Number(body.ordem || 0);
    const ativo = body.ativo !== false;

    if (!cliente_slug) return send(res, 400, { error: "cliente_slug obrigatório" });
    if (!nome) return send(res, 400, { error: "nome obrigatório" });

    // ✅ garante que cliente existe (evita FK estourar)
    const { data: cli, error: eC } = await sb
      .from("clientes")
      .select("slug")
      .eq("slug", cliente_slug)
      .single();

    if (eC || !cli) return send(res, 400, { error: "cliente_slug não existe" });

    const { data, error } = await sb
      .from("categorias")
      .insert({ cliente_slug, nome, ordem, ativo })
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
    if (body.ordem != null) patch.ordem = Number(body.ordem || 0);
    if (body.ativo != null) patch.ativo = !!body.ativo;

    const { data, error } = await sb
      .from("categorias")
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

    // apaga produtos da categoria
    await sb.from("produtos").delete().eq("categoria_id", id);

    const { error } = await sb.from("categorias").delete().eq("id", id);
    if (error) return send(res, 400, { error: error.message });

    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: "Method not allowed" });
}
