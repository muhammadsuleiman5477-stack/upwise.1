// POST /api/send-reminders  -> sends due reminders as push notifications, even when the app is closed.
// Called on a schedule by the database. Protected by CRON_SECRET. Uses the Supabase secret key (server only).
const webpush = require("web-push");

const SB_URL = "https://psbwkkkchfxuordslfps.supabase.co";

function sbFetch(path, opts = {}) {
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  const headers = { apikey: key, "Content-Type": "application/json", ...(opts.headers || {}) };
  if (key.startsWith("eyJ")) headers.Authorization = "Bearer " + key; // older JWT-style keys also need this header
  return fetch(SB_URL + "/rest/v1/" + path, { ...opts, headers });
}

function toMin(s) { const p = String(s).split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
function isQuiet(sub, now) {
  if (!sub.quiet_on) return false;
  let m;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: sub.tz || "UTC" }).formatToParts(now);
    m = (+parts.find((p) => p.type === "hour").value) * 60 + (+parts.find((p) => p.type === "minute").value);
  } catch (e) { return false; }
  const a = toMin(sub.quiet_start), b = toMin(sub.quiet_end);
  return a <= b ? (m >= a && m < b) : (m >= a || m < b);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!process.env.CRON_SECRET || req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Not allowed." });
  }
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: "Server settings are missing." });
  }
  try {
    webpush.setVapidDetails("mailto:upwiseai1@gmail.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

    const sr = await sbFetch("push_subscriptions?select=id,user_id,endpoint,p256dh,auth,tz,quiet_on,quiet_start,quiet_end,vib&limit=1000");
    const subs = await sr.json();
    if (!sr.ok || !Array.isArray(subs)) throw new Error("could not read subscriptions");
    if (!subs.length) return res.status(200).json({ claimed: 0 });

    // only claim reminders for people with a registered device; everyone else is handled inside the app
    const users = [...new Set(subs.map((s) => s.user_id))];
    const now = new Date();
    const cr = await sbFetch(
      `reminders?status=eq.pending&remind_at=lte.${encodeURIComponent(now.toISOString())}&user_id=in.(${users.join(",")})&select=id,user_id,title,remind_at`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status: "fired" }) }
    );
    const claimed = await cr.json();
    if (!cr.ok || !Array.isArray(claimed)) throw new Error("could not claim reminders");

    const jobs = [];
    for (const rem of claimed) {
      const late = now - new Date(rem.remind_at) > 15 * 60000;
      for (const sub of subs.filter((s) => s.user_id === rem.user_id)) {
        jobs.push({ rem, sub, payload: { title: "UPWISE reminder", body: (late ? "Missed: " : "") + rem.title, id: rem.id, remind_at: rem.remind_at, vib: sub.vib, quiet: isQuiet(sub, now) } });
      }
    }

    let sent = 0, failed = 0, removed = 0;
    for (let i = 0; i < jobs.length; i += 25) {
      const batch = jobs.slice(i, i + 25);
      const results = await Promise.allSettled(batch.map((j) =>
        webpush.sendNotification({ endpoint: j.sub.endpoint, keys: { p256dh: j.sub.p256dh, auth: j.sub.auth } }, JSON.stringify(j.payload), { TTL: 3600, urgency: "high" })
      ));
      for (let k = 0; k < results.length; k++) {
        if (results[k].status === "fulfilled") { sent++; continue; }
        failed++;
        const code = results[k].reason && results[k].reason.statusCode;
        if (code === 404 || code === 410) { // the device unsubscribed: forget it
          await sbFetch("push_subscriptions?id=eq." + batch[k].sub.id, { method: "DELETE" });
          removed++;
        } else console.error("push failed:", code, results[k].reason && (results[k].reason.body || results[k].reason.message));
      }
    }
    return res.status(200).json({ claimed: claimed.length, sent, failed, removed });
  } catch (e) {
    console.error("send-reminders error:", e.message);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
