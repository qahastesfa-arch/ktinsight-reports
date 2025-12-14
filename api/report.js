// api/report.js
// Accepts incident reports as JSON only.
// Supports multiple evidence uploads via evidence_keys (array).
// Backward compatible with evidence_key (single).
// Inserts into public.incidents with status='pending'.
//
// DB write:
// evidence_url = JSON string of array (e.g. '["a.png","b.pdf"]') OR null

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: "Missing server configuration (env vars)" });
  }

  try {
    // Read JSON body
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    const fields = JSON.parse(raw || "{}");

    const incidentDate = fields.incident_date || fields.reported_at || null;
    const location = fields.location || fields.region || "";
    const reportingCountry = fields.reporting_country || "";
    const reporterName = fields.reporter_name || "";
    const phone = fields.phone || "";
    const details = fields.details || fields.summary || "";

    // ✅ Evidence (new + backward compatible)
    let evidenceKeys = [];

    if (Array.isArray(fields.evidence_keys)) {
      evidenceKeys = fields.evidence_keys
        .filter(Boolean)
        .map(String)
        .map(s => s.trim())
        .filter(Boolean);
    } else if (fields.evidence_key) {
      evidenceKeys = [String(fields.evidence_key).trim()].filter(Boolean);
    }

    // ✅ Enforce: up to 2 files: max 1 image + max 1 PDF
    if (evidenceKeys.length > 2) {
      return res.status(400).json({ error: "Too many evidence files. Max is 2 (1 image + 1 PDF)." });
    }

    const isPdfKey = (k) => k.toLowerCase().endsWith(".pdf");
    const isImageKey = (k) => /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(k);

    const pdfCount = evidenceKeys.filter(isPdfKey).length;
    const imgCount = evidenceKeys.filter(isImageKey).length;

    if (pdfCount > 1 || imgCount > 1) {
      return res.status(400).json({ error: "Please upload at most one image and one PDF." });
    }

    if (!incidentDate || !location || !reportingCountry || !details) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["incident_date", "location", "reporting_country", "details"]
      });
    }

    const reported_at = new Date(incidentDate).toISOString();
    const region = location.trim();
    const summary = details.trim();
    const category = fields.category || "violence";

    const contactObj = {
      name: reporterName.trim() || null,
      phone: phone.trim() || null,
      reporting_country: String(reportingCountry).trim()
    };
    const contact = JSON.stringify(contactObj);

    // Store evidence as JSON string array in the existing evidence_url column
    const evidence_url = evidenceKeys.length ? JSON.stringify(evidenceKeys) : null;

    const payload = [{
      reported_at,
      region,
      summary,
      category,
      contact,
      evidence_url,
      status: "pending"
    }];

    const insertUrl = `${SUPABASE_URL}/rest/v1/incidents`;
    const insertResp = await fetch(insertUrl, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "Content-Profile": "public"
      },
      body: JSON.stringify(payload)
    });

    const text = await insertResp.text();
    if (!insertResp.ok) {
      return res.status(500).json({ error: "Supabase insert failed", detail: text });
    }

    const inserted = JSON.parse(text || "[]")[0];

    return res.status(200).json({
      ok: true,
      id: inserted?.id,
      created_at: inserted?.reported_at,
      evidence_keys: evidenceKeys
    });

  } catch (err) {
    console.error("report error", err);
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
};
