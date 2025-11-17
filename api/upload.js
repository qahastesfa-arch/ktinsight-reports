// api/upload.js
// Receives a file (image) as raw body and uploads it to the private 'evidence' bucket in Supabase Storage.
// Returns: { ok: true, path: "evidence/<generated>.ext" }

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
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks);

    if (!buf.length) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ct = req.headers['content-type'] || '';
    const ext =
      ct.includes('png')  ? 'png'  :
      ct.includes('jpeg') ? 'jpg'  :
      ct.includes('jpg')  ? 'jpg'  :
      ct.includes('webp') ? 'webp' :
      ct.includes('gif')  ? 'gif'  :
                            'bin';

    const objectName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `evidence/${objectName}`;

    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        'Content-Type': ct || 'application/octet-stream',
        'x-upsert': 'true'
      },
      body: buf
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: 'Upload failed', detail: text });
    }

    return res.status(200).json({ ok: true, path });
  } catch (err) {
    console.error('upload error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
