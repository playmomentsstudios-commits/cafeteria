import { requireAlfa, json } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const auth = await requireAlfa(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.message });

  const { sbAdmin } = auth;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const slug = (body.slug || "").trim();
    if (!slug) return json(res, 400, { error: "slug é obrigatório" });

    // pega cliente atual (para comparar email)
    const { data: atual, error: selErr } = await sbAdmin
      .from("clientes")
      .select("*")
      .eq("slug", slug)
      .single();

    if (selErr) throw selErr;

    // monta patch seguro
    const patch = {};
    const allowed = [
      "nome",
      "whatsapp",
      "cidade",
      "tipo_negocio",
      "endereco",
      "instagram",
      "logo_url",
      "ativo",
      "email"
    ];

    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        patch[k] = body[k];
      }
    }

    // normalizações simples
    if (typeof patch.email === "string") patch.email = patch.email.trim().toLowerCase();
    if (typeof patch.instagram === "string") patch.instagram = patch.instagram.trim().replace(/^@+/, "");
    if (typeof patch.whatsapp === "string") patch.whatsapp = patch.whatsapp.trim();

    // update do cliente
    const { error: upErr } = await sbAdmin
      .from("clientes")
      .update(patch)
      .eq("slug", slug);

    if (upErr) throw upErr;

    // Se email mudou: tenta sincronizar com Auth (best effort)
    const oldEmail = (atual.email || "").trim().toLowerCase();
    const newEmail = (patch.email || "").trim().toLowerCase();

    let authEmailUpdated = false;
    if (newEmail && oldEmail && newEmail !== oldEmail) {
      try {
        // acha o user pelo oldEmail
        const { data: usersData, error: listErr } = await sbAdmin.auth.admin.listUsers({ page: 1, perPage: 2000 });
        if (listErr) throw listErr;

        const u = (usersData?.users || []).find(x => (x.email || "").toLowerCase() === oldEmail);

        if (u?.id) {
          const { error: uErr } = await sbAdmin.auth.admin.updateUserById(u.id, {
            email: newEmail,
            email_confirm: true
          });
          if (uErr) throw uErr;
          authEmailUpdated = true;
        }
      } catch (_e) {
        // não falha a operação toda
        authEmailUpdated = false;
      }
    }

    return json(res, 200, { ok: true, authEmailUpdated });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
