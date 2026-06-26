/* ============================================================================
 *  Kariwala Demo ERP — Lead List (read-only)
 *
 *  Reads the leads stored in the ERP's own Google Sheet and returns them
 *  to the UI.  Called every 3s by the browser to refresh the inbox.
 *
 *  The actual receiving of new leads happens in /api/erp-receive — this
 *  endpoint is purely for display.
 * ========================================================================= */

const ERP_APPS_SCRIPT_URL = process.env.ERP_APPS_SCRIPT_URL || '';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type',  'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (!ERP_APPS_SCRIPT_URL) {
    return res.status(200).end(JSON.stringify({
      ok: false,
      leads: [],
      error: 'NOT_CONFIGURED',
      message: 'ERP_APPS_SCRIPT_URL is not set in Vercel environment variables.'
    }));
  }

  try {
    const r = await fetch(ERP_APPS_SCRIPT_URL + '?action=list', {
      method: 'GET', redirect: 'follow'
    });
    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch (e) {
      return res.status(200).end(JSON.stringify({
        ok: false, leads: [], error: 'BAD_JSON',
        message: 'ERP storage did not return JSON.',
        raw: text.slice(0, 200)
      }));
    }
    if (!data.ok) {
      return res.status(200).end(JSON.stringify({
        ok: false, leads: [], error: 'STORAGE_NOT_READY',
        message: 'ERP storage returned an error.',
        upstream: data
      }));
    }
    return res.status(200).end(JSON.stringify({
      ok: true,
      leads: data.leads || [],
      count: (data.leads || []).length,
      fetchedAt: new Date().toISOString()
    }));
  } catch (err) {
    return res.status(200).end(JSON.stringify({
      ok: false, leads: [], error: 'FETCH_FAILED',
      message: String(err && err.message || err)
    }));
  }
};
