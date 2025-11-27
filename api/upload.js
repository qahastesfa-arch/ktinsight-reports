// api/upload.js
// Receives a file (image or PDF) as raw body and uploads to private 'evidence' bucket.
// Returns: { ok: true, key: "<filename.ext>" }

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

    const ct = (req.headers['content-type'] || '').toLowerCase();

    // 1) Extension from content-type
    let ext =
      ct.includes('png')   ? 'png'  :
      ct.includes('jpeg')  ? 'jpg'  :
      ct.includes('jpg')   ? 'jpg'  :
      ct.includes('webp')  ? 'webp' :
      ct.includes('gif')   ? 'gif'  :
      ct.includes('pdf')   ? 'pdf'  :
                             null;

    // 2) Backup sniff (magic bytes)
    if (!ext) {
      const head = buf.slice(0, 8);
      if (head.slice(0, 4).toString() === '%PDF') ext = 'pdf';
      else if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) ext = 'png';
      else if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) ext = 'jpg';
      else if (head.slice(0, 3).toString() === 'GIF') ext = 'gif';
      else ext = 'bin';
    }

    // Reject clearly unsupported types (optional but safer)
    const allowed = ['png','jpg','webp','gif','pdf','bin'];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: `Unsupported file type: ${ext}` });
    }

    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `evidence/${key}`; // bucket/object

    const uploadCT =
      ct ||
      (ext === 'pdf' ? 'application/pdf' :
       ext === 'png' ? 'image/png' :
       ext === 'jpg' ? 'image/jpeg' :
       'application/octet-stream');

    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        'Content-Type': uploadCT,
        'x-upsert': 'true'
      },
      body: buf
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ error: 'Upload failed', detail: text });
    }

    return res.status(200).json({ ok: true, key });
  } catch (err) {
    console.error('upload error', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
