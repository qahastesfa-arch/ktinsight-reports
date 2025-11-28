// api/report.js
// Accepts incident reports as JSON only.
// Expects evidence_key if evidence was uploaded separately.
// Inserts into public.incidents with status='pending'.

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
    const evidenceKey = fields.evidence_key || null;

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
      reporting_country: reportingCountry.trim()
    };
    const contact = JSON.stringify(contactObj);

    const payload = [{
      reported_at,
      region,
      summary,
      category,
      contact,
      evidence_url: evidenceKey,
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
      evidence_key: evidenceKey
    });

  } catch (err) {
    console.error("report error", err);
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
};
