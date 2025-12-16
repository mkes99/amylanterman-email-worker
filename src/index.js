export default {
  async fetch(request, env) {
    const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,X-Auth" };
    if (request.method === "OPTIONS") return new Response("ok", { headers });
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers });

    const auth = request.headers.get("X-Auth") || "";
    if (!env.WORKER_SHARED_SECRET || auth !== env.WORKER_SHARED_SECRET) return new Response("Unauthorized", { status: 401, headers });

    let payload;
    try { payload = await request.json(); } catch { return new Response("Invalid JSON", { status: 400, headers }); }

    const { emailType, firstName, lastName, email, telephone, message, page, ip, userAgent, recaptcha } = payload || {};
    if (!env.RESEND_API_KEY) return new Response("Missing RESEND_API_KEY", { status: 500, headers });
    if (!env.EMAIL_TO || !env.EMAIL_FROM) return new Response("Missing EMAIL_TO or EMAIL_FROM", { status: 500, headers });

    const safe = (v) => (typeof v === "string" ? v.trim() : "");
    const subject = `Contact: ${safe(emailType) || "General"} — ${safe(firstName)} ${safe(lastName)}`.trim();
    const text = [`Type: ${safe(emailType)}`, `Name: ${safe(firstName)} ${safe(lastName)}`.trim(), `Email: ${safe(email)}`, `Phone: ${safe(telephone)}`, `Page: ${safe(page)}`, `IP: ${safe(ip)}`, `User-Agent: ${safe(userAgent)}`, `reCAPTCHA: ${recaptcha ? `score=${recaptcha.score} action=${recaptcha.action} success=${recaptcha.success}` : "n/a"}`, ``, `Message:`, safe(message)].join("\n");

    const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: env.EMAIL_FROM, to: env.EMAIL_TO, reply_to: safe(email) || undefined, subject, text }) });
    if (!res.ok) { const err = await res.text().catch(() => ""); return new Response(`Email failed: ${err}`, { status: 502, headers }); }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  },
};
