// api/pending-incidents.js
// Admin-only: list pending incidents.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

  if (!SUPABASE_URL || !SERVICE_ROLE || !ADMIN_TOKEN) {
    return res.status(500).json({ error: 'Missing server configuration' });
  }

  // simple admin protection
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/incidents?select=*&status=eq.pending&order=reported_at.desc.nullslast&limit=200`;

    const headers = {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      Accept: 'application/json',
      'Accept-Profile': 'public'
    };

    const resp = await fetch(url, { method: 'GET', headers });
    const text = await resp.text();

    if (!resp.ok) {
      return res.status(502).json({ error: 'Supabase select failed', detail: text });
    }

    return res.status(200).json(JSON.parse(text || '[]'));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
};
