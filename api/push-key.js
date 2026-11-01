// GET /api/push-key  -> the PUBLIC notification key (safe to share). The private key never leaves the server.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || "" });
};
