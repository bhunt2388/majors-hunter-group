// Majors Hunter Group site contact form.
// Primary: forward to MHG Command (/api/intake), which creates the contact,
// makes a task for Bryson + JC, and emails/texts both with a task link.
// Fallback: if Command is unreachable or rejects it, push the lead to GoHighLevel
// so an inquiry is never lost.
//
// Env vars (Vercel): INTAKE_SECRET, COMMAND_INTAKE_URL, GHL_TOKEN, GHL_LOCATION_ID

const GHL_BASE = "https://services.leadconnectorhq.com";

async function pushToCommand(payload) {
  const url = process.env.COMMAND_INTAKE_URL;
  const secret = process.env.INTAKE_SECRET;
  if (!url || !secret) throw new Error("Command intake not configured");
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-intake-secret": secret },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(`Command intake ${r.status}: ${j.error || "failed"}`);
  return j;
}

async function pushToGhl({ name, email, phone, company, message, source }) {
  const token = process.env.GHL_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) throw new Error("GHL not configured");
  const [firstName, ...rest] = String(name).trim().split(/\s+/);
  const headers = {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };
  const up = await fetch(`${GHL_BASE}/contacts/upsert`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      locationId, firstName, lastName: rest.join(" ") || "-", email,
      phone: phone || undefined, companyName: company || undefined,
      tags: ["MHG Website Lead", "Majors Hunter Group"], source: source || "majorshuntergroup.com",
    }),
  });
  const uj = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(`GHL upsert ${up.status}`);
  const id = uj?.contact?.id;
  if (id && message) {
    await fetch(`${GHL_BASE}/contacts/${id}/notes`, {
      method: "POST", headers, body: JSON.stringify({ body: `Website inquiry: ${message}` }),
    }).catch(() => {});
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { name, email, phone, company, message, source, website } = req.body || {};

  // Honeypot: real users never fill this hidden field.
  if (website) return res.status(200).json({ ok: true });

  if (!name || !email) {
    return res.status(400).json({ ok: false, error: "Name and email are required" });
  }

  const payload = { name, email, phone, company, message, source: source || "majorshuntergroup.com", site: "mhg" };

  try {
    await pushToCommand(payload);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Command intake failed, falling back to GHL:", err.message);
  }

  try {
    await pushToGhl(payload);
    return res.status(200).json({ ok: true, fallback: true });
  } catch (err) {
    console.error("GHL fallback failed:", err.message);
    return res.status(502).json({ ok: false, error: "Could not record inquiry" });
  }
}
