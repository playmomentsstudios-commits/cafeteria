import { requireAlfa, json } from "../_lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const auth = await requireAlfa(req);
  if (!auth.ok) return json(res, auth.status, { error: auth.message });

  const { sbAdmin } = auth;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const email = (body.email || "").trim().toLowerCase();
    if (!email) return json(res, 400, { error: "email é obrigatório" });

    const { data: linkData, error: linkErr } = await sbAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: process.env.CLIENTE_REDIRECT_TO || undefined,
      },
    });
    if (linkErr) throw linkErr;

    return json(res, 200, {
      ok: true,
      recovery_link: linkData?.properties?.action_link || null
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || String(e) });
  }
}
