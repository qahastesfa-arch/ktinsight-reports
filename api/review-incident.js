// api/review-incident.js
// Admin-only: approve or reject a report by id.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

  if (!SUPABASE_URL || !SERVICE_ROLE || !ADMIN_TOKEN) {
    return res.status(500).json({ error: 'Missing server configuration' });
  }

  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      const raw = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', c => data += c);
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      body = JSON.parse(raw || '{}');
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  const { id, status } = body;
  if (!id || !['approved','rejected'].includes(status)) {
    return res.status(400).json({ error: 'Missing or invalid id/status' });
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/incidents?id=eq.${id}`;
    const headers = {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      'Content-Profile': 'public'
    };

    const payload = { status };

    const resp = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    if (!resp.ok) {
      return res.status(502).json({ error: 'Supabase update failed', detail: text });
    }

    return res.status(200).json({ ok: true, updated: JSON.parse(text || '[]') });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};
