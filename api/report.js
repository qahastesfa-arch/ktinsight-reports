// api/report.js
// Accepts incident reports (JSON or multipart/form-data).
// If file is included, uploads to private 'evidence' bucket and stores evidence key.
// Inserts into public.incidents with status='pending'.

const formidable = require("formidable");
const fs = require("fs");

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

  // Helper: read raw JSON body
  async function readJsonBody() {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    return JSON.parse(raw || "{}");
  }

  // Helper: detect extension from content-type or magic bytes
  function detectExtAndCt(buf, ctHeader = "") {
    const ct = (ctHeader || "").toLowerCase();

    let ext =
      ct.includes("png")  ? "png"  :
      ct.includes("jpeg") ? "jpg"  :
      ct.includes("jpg")  ? "jpg"  :
      ct.includes("webp") ? "webp" :
      ct.includes("gif")  ? "gif"  :
      ct.includes("pdf")  ? "pdf"  :
                            null;

    if (!ext) {
      const head = buf.slice(0, 8);
      if (head.slice(0, 4).toString() === "%PDF") ext = "pdf";
      else if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) ext = "png";
      else if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) ext = "jpg";
      else if (head.slice(0, 3).toString() === "GIF") ext = "gif";
      else ext = "bin";
    }

    const uploadCT =
      ct ||
      (ext === "pdf" ? "application/pdf" :
       ext === "png" ? "image/png" :
       ext === "jpg" ? "image/jpeg" :
       ext === "webp"? "image/webp" :
       ext === "gif" ? "image/gif" :
       "application/octet-stream");

    return { ext, uploadCT };
  }

  // Helper: upload evidence buffer into private evidence bucket, returning key
  async function uploadEvidence(buf, contentTypeHeader) {
    const { ext, uploadCT } = detectExtAndCt(buf, contentTypeHeader);

    const allowed = ["png", "jpg", "webp", "gif", "pdf", "bin"];
    if (!allowed.includes(ext)) {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `evidence/${key}`;

    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        "Content-Type": uploadCT,
        "x-upsert": "true"
      },
      body: buf
    });

    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Upload failed: ${text}`);
    }

    return key; // store only key in DB
  }

  try {
    const ct = (req.headers["content-type"] || "").toLowerCase();

    let fields = {};
    let evidenceKey = null;

    // ---- Case A: multipart/form-data (file included)
    if (ct.includes("multipart/form-data")) {
      const form = formidable({ multiples: false });

      const parsed = await new Promise((resolve, reject) => {
        form.parse(req, (err, flds, files) => {
          if (err) reject(err);
          else resolve({ flds, files });
        });
      });

      fields = parsed.flds || {};
      const file = parsed.files?.evidence;

      if (file && file.filepath) {
        const buf = fs.readFileSync(file.filepath);
        evidenceKey = await uploadEvidence(buf, file.mimetype || ct);
      }
    }

    // ---- Case B: JSON body (no file, or evidence key already provided)
    else {
      fields = await readJsonBody();
      if (fields.evidence_key) {
        evidenceKey = fields.evidence_key; // already uploaded from client
      }
    }

    // Normalize fields from your form
    const incidentDate = fields.incident_date || fields.reported_at || null;
    const location = fields.location || fields.region || "";
    const reportingCountry = fields.reporting_country || "";
    const reporterName = fields.reporter_name || "";
    const phone = fields.phone || "";
    const details = fields.details || fields.summary || "";

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
      evidence_url: evidenceKey || null,
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
      evidence_key: evidenceKey || null
    });

  } catch (err) {
    console.error("report error", err);
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
};
