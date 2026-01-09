export default async function handler(req, res) {
  try {

    // ✅ CORS (cola aqui)
    const allowed = new Set([
      "https://playmomentsstudios-commits.github.io",
      "https://cafeteria-gamma-orpin.vercel.app"
    ]);

    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    // ✅ fim CORS

    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });

    ...
