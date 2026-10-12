// Majors Hunter Group — site contact form -> GoHighLevel lead capture
// Upserts a contact + tags it, using the existing GHL Private Integration
// Token / Location (set as Vercel env vars, never committed to the repo).
//
// Required env vars (set via `vercel env add`):
//   GHL_TOKEN       pit-xxxxxxxx private integration token
//   GHL_LOCATION_ID GHL location id
//   NOTIFY_EMAIL    optional — not used yet, reserved for future email relay

const GHL_BASE = "https://services.leadconnectorhq.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { name, email, phone, company, message, source } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ ok: false, error: "Name and email are required" });
  }

  const token = process.env.GHL_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    console.error("Missing GHL_TOKEN or GHL_LOCATION_ID env vars");
    return res.status(500).json({ ok: false, error: "Server not configured" });
  }

  const [firstName, ...rest] = String(name).trim().split(/\s+/);
  const lastName = rest.join(" ") || "-";

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Version: "2021-07-28",
  };

  try {
    const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        locationId,
        firstName,
        lastName,
        email,
        phone: phone || undefined,
        companyName: company || undefined,
        tags: ["MHG Website Lead", "Majors Hunter Group"],
        source: source || "majorshuntergroup.com",
      }),
    });

    const upsertJson = await upsertRes.json().catch(() => ({}));

    if (!upsertRes.ok) {
      console.error("GHL upsert failed", upsertRes.status, upsertJson);
      return res.status(502).json({ ok: false, error: "CRM upsert failed" });
    }

    const contactId = upsertJson?.contact?.id;

    // Best-effort note with the inquiry message — don't fail the request if this errors.
    if (contactId && message) {
      try {
        await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
          method: "POST",
          headers,
          body: JSON.stringify({ body: `Website inquiry: ${message}` }),
        });
      } catch (noteErr) {
        console.error("GHL note creation failed (non-fatal)", noteErr);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Lead handler error", err);
    return res.status(500).json({ ok: false, error: "Unexpected server error" });
  }
}
