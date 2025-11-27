// api/evidence.js
// Generates a signed URL for a private storage object in bucket "evidence"
// and redirects to a correct Supabase storage URL.
// Usage: /api/evidence?key=<filename.ext>

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: "Missing env vars" });
  }

  let key = req.query.key;
  if (!key) return res.status(400).json({ error: "Missing key" });

  // Normalize older formats
  key = key.replace(/^evidence\//, "");

  try {
    // ✅ ALWAYS use the correct signing endpoint
    const signEndpoint =
      `${SUPABASE_URL}/storage/v1/object/sign/evidence/${encodeURIComponent(key)}`;

    const r = await fetch(signEndpoint, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ expiresIn: 60 * 60 }) // 1 hour
    });

    const json = await r.json();
    if (!r.ok) {
      return res.status(500).json({ error: "Sign failed", detail: json });
    }

    let signedURL = json.signedURL;
    if (!signedURL) {
      return res.status(500).json({ error: "No signedURL returned", detail: json });
    }

    // Some Supabase responses return:
    //   /object/sign/evidence/<key>?token=...
    // Others return:
    //   /storage/v1/object/sign/evidence/<key>?token=...
    //
    // ✅ Force it to include /storage/v1
    if (!signedURL.startsWith("/storage/v1/")) {
      signedURL = "/storage/v1" + signedURL; // adds missing prefix
    }

    // Final absolute redirect
    return res.redirect(302, `${SUPABASE_URL}${signedURL}`);

  } catch (err) {
    console.error("evidence error", err);
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
};
