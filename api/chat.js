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
Keep replies concise. Write in plain text only: do not use asterisks, hash headings, backticks or tables. Use short paragraphs, and numbered lines (1., 2., 3.) for steps.`;

const STUCK_SYSTEM = `You are the "I'm Stuck" guide inside UPWISE. The person has a problem and does not know where to begin. Be supportive, practical and non-judgmental.
Never invent facts, statistics, organisations, links or opportunities. If the answer depends on details you do not have, say what you would need to know. For medical, legal and financial matters give general educational guidance only and suggest a qualified professional for real decisions. If the person seems to be in crisis or at risk of harm, respond with care and encourage them to contact local emergency services or someone they trust.
Write plain text only: no asterisks, hash headings, backticks or tables. Use exactly these six sections, each introduced by its own line in this form:
=== Understanding ===
2 or 3 sentences restating their situation in your own words.
=== Main challenges ===
2 to 4 short numbered lines.
=== Options ===
2 or 3 realistic approaches, each a numbered line with a one-line description.
=== Comparison ===
One line per option: its name, its main upside, its main downside.
=== Recommendation ===
One short paragraph saying which option fits best and why, and what could change that.
=== Action plan ===
5 to 7 numbered, concrete, small steps. The first step must be doable today. Add a rough timeframe in brackets where it helps.
Keep the whole answer under 450 words.`;

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

// Providers that have a key, in order of preference: AI_PROVIDER first, then Groq, Gemini, Anthropic.
function availableProviders() {
  const keys = { groq: process.env.GROQ_API_KEY, gemini: process.env.GEMINI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY };
  const want = (process.env.AI_PROVIDER || "").toLowerCase();
  const order = [want, "groq", "gemini", "anthropic"].filter((k, i, arr) => keys[k] && arr.indexOf(k) === i);
  return order;
}
function pickProvider() { return availableProviders()[0] || null; }

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

// Groq retired llama-3.3-70b-versatile on 16 Aug 2026; gpt-oss-120b is its recommended replacement.
// gpt-oss spends part of the token budget on reasoning, so allow more tokens and keep reasoning short.
function groqBody(model, system, history, maxTokens) {
  const body = { model, max_completion_tokens: maxTokens * 2, messages: [{ role: "system", content: system }, ...history] };
  if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
  return body;
}

async function callProvider(provider, primary, system, rawHistory, maxTokens) {
  // GROQ_MODEL / GEMINI_MODEL / ANTHROPIC_MODEL pick a model per provider; AI_MODEL applies to the first provider only
  const model = process.env[provider.toUpperCase() + "_MODEL"] || (primary ? process.env.AI_MODEL : undefined);
  const history = merge(rawHistory);

  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model || "claude-sonnet-5-5", max_tokens: maxTokens, system, messages: history }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error("anthropic " + r.status + ": " + JSON.stringify(d).slice(0, 300));
    return (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  }

  if (provider === "groq") {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + process.env.GROQ_API_KEY },
      body: JSON.stringify(groqBody(model || "openai/gpt-oss-120b", system, history, maxTokens)),
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
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error("gemini " + r.status + ": " + JSON.stringify(d).slice(0, 300));
  return (((d.candidates || [])[0] || {}).content?.parts || []).map((p) => p.text || "").join("\n").trim();
}

// Try each provider that has a key; if one fails, fall back to the next.
async function callAI(system, history, maxTokens = 1000) {
  const list = availableProviders();
  let lastError = new Error("no provider");
  for (let i = 0; i < list.length; i++) {
    try {
      const reply = await callProvider(list[i], i === 0, system, history, maxTokens);
      if (reply) return reply;
      lastError = new Error(list[i] + " returned an empty answer");
    } catch (e) {
      lastError = e;
    }
    console.error("AI provider failed:", lastError.message);
  }
  throw lastError;
}

async function profileContext(token, userId) {
  try {
    const p = await rest(token, `profiles?select=country,interests&id=eq.${userId}`);
    const prof = ((await p.json()) || [])[0];
    return prof
      ? `\nAbout this user (use only when relevant): country code ${prof.country || "unknown"}; interests: ${(prof.interests || []).join(", ") || "none given"}.`
      : "";
  } catch (e) {
    return "";
  }
}

async function handleStuck(token, user, text, res) {
  if (text.length > 2000) return res.status(400).json({ error: "Keep your description under 2000 characters." });
  const since = new Date(Date.now() - 3600e3).toISOString();
  const rl = await rest(token, `ai_usage?select=id&kind=eq.stuck&created_at=gte.${encodeURIComponent(since)}`, {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const used = parseInt((rl.headers.get("content-range") || "").split("/")[1], 10);
  if (used >= 10) return res.status(429).json({ error: "You have reached the hourly limit for I'm Stuck. Please try again later." });
  const mark = await rest(token, "ai_usage", { method: "POST", body: JSON.stringify({ user_id: user.id, kind: "stuck" }) });
  if (!mark.ok) throw new Error("db");
  const context = await profileContext(token, user.id);
  let reply;
  try {
    reply = await callAI(STUCK_SYSTEM + context, [{ role: "user", content: text }], 1800);
  } catch (e) {
    console.error("AI call failed:", e.message);
    return res.status(502).json({ error: "The AI service had a problem. Try again in a moment." });
  }
  if (!reply) return res.status(502).json({ error: "The AI returned an empty answer. Try again." });
  return res.status(200).json({ reply });
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
    if (body.mode === "stuck") return handleStuck(token, user, text, res);
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

    const context = await profileContext(token, user.id);

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
