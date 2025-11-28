// api/sign-upload.js
// Returns a signed upload URL for private bucket "evidence"

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: "Missing env vars" });
  }

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");

    const ext = (body.ext || "bin").toLowerCase();
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const signEndpoint =
      `${SUPABASE_URL}/storage/v1/object/sign/evidence/${encodeURIComponent(key)}`;

    const r = await fetch(signEndpoint, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ expiresIn: 60 * 10 }) // 10 minutes to upload
    });

    const json = await r.json();
    if (!r.ok) return res.status(500).json({ error: "Sign failed", detail: json });

    // Ensure correct prefix
    let signedURL = json.signedURL;
    if (!signedURL.startsWith("/storage/v1/")) signedURL = "/storage/v1" + signedURL;

    return res.status(200).json({
      ok: true,
      key,
      signedUploadUrl: `${SUPABASE_URL}${signedURL}`
    });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: e.message });
  }
};
