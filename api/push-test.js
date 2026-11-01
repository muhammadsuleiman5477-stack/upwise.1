// POST /api/push-test  -> sends a test notification to the signed-in user's own devices.
const webpush = require("web-push");

const SB_URL = "https://psbwkkkchfxuordslfps.supabase.co";
const SB_KEY = "sb_publishable_LfP4Zf3yaWYDWgqnFXRlGA_VVXSeq8-"; // publishable key, safe to include

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: "Background alerts are not set up on the server yet." });
  }
  const token = (req.headers.authorization || "").replace(/^Bearer /i, "");
  if (!token) return res.status(401).json({ error: "Please log in again." });
  try {
    const u = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: "Bearer " + token } });
    if (!u.ok) return res.status(401).json({ error: "Your session expired. Please log in again." });

    // read only this user's own devices (Row Level Security does the filtering)
    const r = await fetch(SB_URL + "/rest/v1/push_subscriptions?select=endpoint,p256dh,auth,vib", {
      headers: { apikey: SB_KEY, Authorization: "Bearer " + token },
    });
    const subs = await r.json();
    if (!r.ok || !Array.isArray(subs)) return res.status(500).json({ error: "Could not read your devices." });
    if (!subs.length) return res.status(404).json({ error: "No device is registered yet. Turn on background alerts first." });

    webpush.setVapidDetails("mailto:upwiseai1@gmail.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    let sent = 0, failed = 0;
    const errors = [];
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: "UPWISE test", body: "Background alerts are working.", test: true, vib: s.vib }),
          { TTL: 300, urgency: "high" }
        );
        sent++;
      } catch (e) {
        failed++;
        errors.push((e.statusCode || "?") + ": " + String(e.body || e.message).slice(0, 140));
        if (e.statusCode === 404 || e.statusCode === 410) {
          // this device registration is dead: remove it so the app can register a fresh one
          await fetch(SB_URL + "/rest/v1/push_subscriptions?endpoint=eq." + encodeURIComponent(s.endpoint), {
            method: "DELETE", headers: { apikey: SB_KEY, Authorization: "Bearer " + token },
          }).catch(() => {});
        }
        console.error("push test failed:", e.statusCode, e.body || e.message);
      }
    }
    return res.status(200).json({ sent, failed, errors });
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong on our side. Try again." });
  }
};
