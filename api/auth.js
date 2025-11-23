export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const { password } = req.body || {};
  const expected = process.env.SITE_PASSWORD;

  if (!expected) {
    return res.status(500).json({ ok: false, message: "Server password not set" });
  }

  if (password === expected) {
    res.setHeader(
      "Set-Cookie",
      `kt_auth=yes; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ ok: false, message: "Incorrect password" });
}
