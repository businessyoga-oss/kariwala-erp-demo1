/* ============================================================================
 *  Kariwala Demo ERP — Post-Fair Lead Receiver
 *
 *  This is the API endpoint that the Trade Fair Analyzer POSTs leads to,
 *  with an API token in the Authorization header.  In production, the real
 *  ERP development team would build the equivalent of this endpoint inside
 *  Kariwala's actual ERP — that is the whole point of the demo.
 *
 *  Contract
 *  --------
 *  POST  /api/erp-receive
 *  Headers:
 *    Content-Type:  application/json
 *    Authorization: Bearer <API_TOKEN>
 *  Body:
 *    {
 *      "lead": { ...full lead object from Trade Fair Analyzer... }
 *    }
 *
 *  Returns:
 *    200 { ok: true,  row, message } on success
 *    200 { ok: false, error, message } on failure (always 200 so the
 *                                                  Vercel proxy can read it)
 *
 *  Side-effects
 *  ------------
 *  On a successful POST, the lead is forwarded to the ERP's own Google Sheet
 *  via its Apps Script web app (ERP_APPS_SCRIPT_URL env var).  The ERP's
 *  Sheet is the demo's "internal ERP database".
 * ========================================================================= */

const ERP_APPS_SCRIPT_URL = process.env.ERP_APPS_SCRIPT_URL || '';
const ERP_SECRET_TOKEN    = process.env.ERP_SECRET_TOKEN    ||
  'kari_erp_demo_token_replace_with_your_own_secret';

// The public API token that the Trade Fair Analyzer must send.
// Tokens are designed to look like real API keys for the demo.
const API_TOKEN = process.env.DEMO_ERP_API_TOKEN ||
  'kari_erp_pk_2026_a7f3b9c2d4e1f8g6h5j2k9l3m7n4p1q8';

function jsonOk(res, body)  { return res.status(200).end(JSON.stringify(body)); }

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  // CORS so the TFA browser can call this endpoint directly (or via proxy)
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    // Friendly health check page when someone visits the URL in a browser
    return jsonOk(res, {
      ok: true,
      ready: true,
      app: 'Kariwala Demo ERP — Post-Fair Lead Receiver',
      message: 'This endpoint accepts POST requests with a lead payload + API token. See /api/erp-info for usage.'
    });
  }

  if (req.method !== 'POST') {
    return jsonOk(res, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' });
  }

  // ---- 1. AUTH: read token from Authorization header or X-API-Key header ----
  let providedToken = '';
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    providedToken = authHeader.slice(7).trim();
  }
  if (!providedToken && req.headers['x-api-key']) {
    providedToken = String(req.headers['x-api-key']).trim();
  }
  // Allow token in the body too, as a convenience for testing
  let body = {};
  try { body = await readJsonBody(req); } catch (e) { body = {}; }
  if (!providedToken && body.token) providedToken = String(body.token);

  if (!providedToken) {
    return jsonOk(res, {
      ok: false,
      error: 'MISSING_API_TOKEN',
      message: 'No API token provided. Send it in the Authorization header as "Bearer <token>".'
    });
  }
  if (providedToken !== API_TOKEN) {
    return jsonOk(res, {
      ok: false,
      error: 'INVALID_API_TOKEN',
      message: 'The API token does not match. Check the value configured in your Trade Fair Analyzer Cloud Sync Settings.'
    });
  }

  // ---- 2. VALIDATE PAYLOAD ----
  const lead = body.lead;
  if (!lead || typeof lead !== 'object') {
    return jsonOk(res, {
      ok: false,
      error: 'MISSING_LEAD',
      message: 'Request body must include a "lead" object with the analyzed data.'
    });
  }

  // ---- 3. WRITE TO ERP'S OWN STORAGE (Google Sheet via Apps Script) ----
  if (!ERP_APPS_SCRIPT_URL) {
    return jsonOk(res, {
      ok: false,
      error: 'ERP_STORAGE_NOT_CONFIGURED',
      message: 'The ERP storage endpoint is not configured. Set the ERP_APPS_SCRIPT_URL env var in Vercel.'
    });
  }

  try {
    const upstreamPayload = { token: ERP_SECRET_TOKEN, lead: lead };
    const r = await fetch(ERP_APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(upstreamPayload),
      redirect: 'follow'
    });
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch (e) { /* leave empty */ }

    if (data && data.ok) {
      return jsonOk(res, {
        ok: true,
        message: 'Lead received and stored in ERP database.',
        row: data.row || null,
        receivedAt: new Date().toISOString(),
        leadId: lead.id || null
      });
    }
    return jsonOk(res, {
      ok: false,
      error: 'STORAGE_REJECTED',
      message: 'The ERP storage rejected the write.',
      upstream: (data && data.error) || text.slice(0, 200)
    });
  } catch (err) {
    return jsonOk(res, {
      ok: false,
      error: 'STORAGE_FAILED',
      message: 'Could not reach the ERP storage endpoint.',
      detail: String(err && err.message || err)
    });
  }
};

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end',  () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}
