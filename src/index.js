export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

    const url = new URL(request.url);

    // Service binding request in our Pages Function used: "https://email/send"
    // so we handle path "/send"
    if (request.method === "POST" && url.pathname === "/send") {
      return await handleSend(request, env);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders() });
  }
};

async function handleSend(request, env) {
  const cors = corsHeaders();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400, cors);
  }

  const { emailType, firstName, lastName, email, telephone, message, meta } = body || {};

  const missing = [];
  if (!env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (!env.EMAIL_TO) missing.push("EMAIL_TO");
  if (!env.EMAIL_FROM) missing.push("EMAIL_FROM");
  if (missing.length) return json({ ok: false, error: "Missing Worker env vars", missing }, 500, cors);

  const subject = `[Contact] ${emailType || "Message"} — ${firstName || ""} ${lastName || ""}`.trim();
  const text = [
    `Reason: ${emailType || ""}`,
    `Name: ${(firstName || "").trim()} ${(lastName || "").trim()}`.trim(),
    `Email: ${email || ""}`,
    `Phone: ${telephone || ""}`,
    ``,
    `Message:`,
    `${message || ""}`,
    ``,
    `--- meta ---`,
    `IP: ${meta?.ip || ""}`,
    `UA: ${meta?.ua || ""}`,
    `Referer: ${meta?.referer || ""}`,
    `Timestamp: ${meta?.timestamp || ""}`
  ].join("\n");

  const html = `
    <h2>New Contact Form Submission</h2>
    <p><strong>Reason:</strong> ${escapeHtml(emailType || "")}</p>
    <p><strong>Name:</strong> ${escapeHtml(`${firstName || ""} ${lastName || ""}`.trim())}</p>
    <p><strong>Email:</strong> ${escapeHtml(email || "")}</p>
    <p><strong>Phone:</strong> ${escapeHtml(telephone || "")}</p>
    <hr/>
    <p><strong>Message</strong></p>
  `;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [env.EMAIL_TO],
      reply_to: email ? [email] : undefined,
      subject,
      text,
      html
    })
  });

  if (!resendRes.ok) {
    const detail = await resendRes.text().catch(() => "");
    return json({ ok: false, error: "Resend failed", details: detail || String(resendRes.status) }, 502, cors);
  }

  const data = await resendRes.json().catch(() => ({}));
  return json({ ok: true, id: data?.id }, 200, cors);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
