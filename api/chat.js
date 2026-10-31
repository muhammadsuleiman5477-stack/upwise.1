// POST /api/chat  (Vercel serverless function)
// Checks the user's login, saves messages under Row Level Security using the user's own token,
// and calls the AI. AI keys are secret and live only in Vercel's environment variables.

const SB_URL = "https://psbwkkkchfxuordslfps.supabase.co";
const SB_KEY = "sb_publishable_LfP4Zf3yaWYDWgqnFXRlGA_VVXSeq8-"; // publishable key, safe to include
const MAX_PER_HOUR = 40;

const SYSTEM = `You are UPWISE, an AI life assistant for students and young people, especially in Nigeria but useful anywhere. Be clear, practical and warm. Explain complicated things simply, give examples, and turn problems into step-by-step plans. Ask one clarifying question when you truly need more detail.
Never invent facts, sources, statistics, scholarships, organisations, links or deadlines. If you are unsure or cannot verify something, say so and point to official sources.
For medical, legal and financial topics, give general educational information only, say it is not professional advice, and suggest a qualified professional for real decisions. Never recommend gambling, high-risk trading or anything promising guaranteed profit.
For study help, explain concepts and guide the student rather than writing work meant to be handed in as their own in an assessment.
If someone seems to be in crisis or at risk of harm, respond with care and encourage them to contact local emergency services or someone they trust.
Keep replies concise. Use plain text with no markdown symbols; use numbered lines for steps.`;

function rest(token, path, opts = {}) {
  return fetch(SB_URL + "/rest/v1/" + path, {
    ...opts,
    headers: {
      apikey: SB_KEY,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
}

function pickProvider() {
  const want = (process.env.AI_PROVIDER || "").toLowerCase();
  const keys = { groq: process.env.GROQ_API_KEY, gemini: process.env.GEMINI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY };
  if (keys[want]) return want;
  return ["groq", "gemini", "anthropic"].find((k) => keys[k]) || null;
}

// merge neighbouring messages from the same role (some providers require alternating turns)
function merge(history) {
  const out = [];
  for (const m of history) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

async function callAI(system, rawHistory) {
  const provider = pickProvider();
  const model = process.env.AI_MODEL;
  const history = merge(rawHistory);

  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || "claude-sonnet-5-5", max_tokens: 1000, system, messages: history }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error("anthropic " + r.status + ": " + JSON.stringify(d).slice(0, 300));
    return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  }

  if (provider === "groq") {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + process.env.GROQ_API_KEY },
      body: JSON.stringify({ model: model || "llama-3.3-70b-versatile", max_tokens: 1000, messages: [{ role: "system", content: system }, ...history] }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error("groq " + r.status + ": " + JSON.stringify(d).slice(0, 300));
    return String(((d.choices || [])[0] || {}).message?.content || "").trim();
  }

  const m = model || "gemini-2.5-flash";
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: history.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] })),
      generationConfig: { maxOutputTokens: 1000 },
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error("gemini " + r.status + ": " + JSON.stringify(d).slice(0, 300));
  return (((d.candidates || [])[0] || {}).content?.parts || []).map((p) => p.text || "").join("\n").trim();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!pickProvider()) {
    return res.status(500).json({ error: "The assistant is not set up yet. Add an AI key (GROQ_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY) in Vercel and redeploy." });
  }
  const token = (req.headers.authorization || "").replace(/^Bearer /i, "");
  if (!token) return res.status(401).json({ error: "Please log in again." });

  try {
    const u = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: "Bearer " + token } });
    if (!u.ok) return res.status(401).json({ error: "Your session expired. Please log in again." });
    const user = await u.json();

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const text = typeof body.message === "string" ? body.message.trim() : "";
    if (!text || text.length > 4000) return res.status(400).json({ error: "Write a message under 4000 characters." });
    let convId = body.conversation_id || null;
    if (convId && !/^[0-9a-f-]{36}$/i.test(String(convId))) return res.status(400).json({ error: "Bad conversation." });

    // simple rate limit per user
    const since = new Date(Date.now() - 3600e3).toISOString();
    const rl = await rest(token, `messages?select=id&role=eq.user&created_at=gte.${encodeURIComponent(since)}`, {
      headers: { Prefer: "count=exact", Range: "0-0" },
    });
    const used = parseInt((rl.headers.get("content-range") || "").split("/")[1], 10);
    if (used >= MAX_PER_HOUR) return res.status(429).json({ error: "You have reached the hourly message limit. Please try again later." });

    if (!convId) {
      const c = await rest(token, "conversations", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ user_id: user.id, title: text.slice(0, 60) }),
      });
      if (!c.ok) throw new Error("db");
      convId = (await c.json())[0].id;
    } else {
      const c = await rest(token, `conversations?select=id&id=eq.${convId}`);
      if (!(await c.json()).length) return res.status(404).json({ error: "Conversation not found." });
    }

    const saved = await rest(token, "messages", {
      method: "POST",
      body: JSON.stringify({ conversation_id: convId, user_id: user.id, role: "user", content: text }),
    });
    if (!saved.ok) throw new Error("db");

    const h = await rest(token, `messages?select=role,content&conversation_id=eq.${convId}&order=created_at.desc&limit=20`);
    const history = (await h.json()).reverse();

    const p = await rest(token, `profiles?select=country,interests&id=eq.${user.id}`);
    const prof = ((await p.json()) || [])[0];
    const context = prof
      ? `\nAbout this user (use only when relevant): country code ${prof.country || "unknown"}; interests: ${(prof.interests || []).join(", ") || "none given"}.`
      : "";

    let reply;
    try {
      reply = await callAI(SYSTEM + context, history);
    } catch (e) {
      console.error("AI call failed:", e.message);
      return res.status(502).json({ error: "The AI service had a problem. Try again in a moment." });
    }
    if (!reply) return res.status(502).json({ error: "The AI returned an empty answer. Try again." });

    await rest(token, "messages", {
      method: "POST",
      body: JSON.stringify({ conversation_id: convId, user_id: user.id, role: "assistant", content: reply }),
    });
    await rest(token, `conversations?id=eq.${convId}`, {
      method: "PATCH",
      body: JSON.stringify({ updated_at: new Date().toISOString() }),
    });

    return res.status(200).json({ conversation_id: convId, reply });
  } catch (e) {
    return res.status(500).json({ error: "Something went wrong on our side. Try again." });
  }
};
