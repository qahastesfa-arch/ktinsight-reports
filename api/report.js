// api/report.js
// Accepts JSON with your form fields + optional evidence_url and inserts an incident row.

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Missing server configuration (env vars)' });
  }

  // Parse JSON body safely
  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      const raw = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      body = JSON.parse(raw || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const {
    incident_date,     // required
    location,          // required
    reporting_country, // required
    reporter_name,     // optional
    phone,             // optional
    details,           // required
    evidence_url       // optional; from /api/upload
  } = body;

  // Validate required fields only
  const required = { incident_date, location, reporting_country, details };
  for (const [k, v] of Object.entries(required)) {
    if (!v || String(v).trim() === '') {
      return res.status(400).json({ error: `Missing required field: ${k}` });
    }
  }

  // Map to DB fields
  const reported_at = new Date(`${incident_date}T12:00:00.000Z`).toISOString();
  const region = location;
  const summary = details;
  const category = 'attack'; // static for now

  // Build optional contact string
  const contactParts = [];
  if (reporter_name && reporter_name.trim()) contactParts.push(reporter_name.trim());
  if (phone && phone.trim()) contactParts.push(phone.trim());
  if (reporting_country && reporting_country.trim()) contactParts.push(`from ${reporting_country.trim()}`);
  const contact = contactParts.length ? contactParts.join(' | ') : null;

  try {
    const url = `${SUPABASE_URL}/rest/v1/incidents`;
    const headers = {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      Prefer: 'return=representation',
      // 👇 THIS tells Supabase to use the public schema, not graphql_public
      'Content-Profile': 'public'
    };

    const payload = [{
      reported_at,
      region,
      summary,
      category,
      contact,
      evidence_url: evidence_url || null
    }];

    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text = await resp.text();

    if (!resp.ok) {
      return res.status(502).json({ error: 'Supabase insert failed', detail: text });
    }

    const [row] = JSON.parse(text);
    return res.status(200).json({ ok: true, id: row.id, created_at: row.created_at });
  } catch (err) {
    console.error('report error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
