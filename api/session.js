export default function handler(req, res) {
  const cookie = req.headers.cookie || "";
  const authed = cookie.includes("kt_auth=yes");
  res.status(200).json({ ok: authed });
}
