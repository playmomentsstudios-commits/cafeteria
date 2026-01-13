// api/admin/reset-senha.js
import { createClient } from "@supabase/supabase-js";

// CORS helpers
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // (Opcional) validar token do Admin Alfa
    // Seu front envia Authorization: Bearer <access_token>
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const { email } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email é obrigatório" });
    }

    // Service Role é obrigatório para gerar link de recovery
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Env vars ausentes: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Para garantir que só o Alfa use (opcional e recomendado):
    // checa se o email do token é playmomentsstudios@gmail.com
    const { data: u, error: uErr } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr) return res.status(401).json({ error: "Token inválido", details: uErr.message });

    const emailToken = (u?.user?.email || "").toLowerCase().trim();
    if (emailToken !== "playmomentsstudios@gmail.com") {
      return res.status(403).json({ error: "Apenas Admin Alfa pode gerar link de senha" });
    }

    // Gera o link de recuperação
    const redirectTo =
      process.env.RECOVERY_REDIRECT_TO ||
      "https://playmomentsstudios-commits.github.io/cafeteria/";

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo }
    });

    if (error) return res.status(400).json({ error: error.message });

    // Supabase retorna action_link
    const recovery_link = data?.properties?.action_link || null;

    if (!recovery_link) {
      return res.status(500).json({ error: "Não foi possível obter action_link do Supabase" });
    }

    return res.status(200).json({ recovery_link });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Erro inesperado" });
  }
}
