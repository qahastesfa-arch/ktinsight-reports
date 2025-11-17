// api/incidents.js

// Returns the most recent incident reports from the 'incidents' table.

module.exports = async (req, res) => {
  // Basic CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ error: 'Missing server configuration (env vars)' });
  }

  try {
    // Get latest 20 incidents, newest first
    const url = `${SUPABASE_URL}/rest/v1/incidents?select=*&order=reported_at.desc.nullslast&limit=20`;

    const headers = {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // 👇 This is the crucial part: use the public schema
      'Content-Profile': 'public'
    };

    const resp = await fetch(url, { method: 'GET', headers });
    const text = await resp.text();

    if (!resp.ok) {
      // Log and return error
      console.error('Supabase select failed:', text);
      return res.status(502).json({ error: 'Supabase select failed', detail: text });
    }

    const rows = JSON.parse(text || '[]');
    return res.status(200).json(rows);
  } catch (err) {
    console.error('incidents error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
