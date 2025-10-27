/*
  Simple proxy to call JSONBase from the browser without CORS issues.
  - Exposes GET/PUT /jsonbase/:key
  - Forwards to https://www.jsonbase.io/<IID>/<key>
  - CORS enabled for any origin by default (configure via ALLOW_ORIGIN)
  Secrets:
  - Preferred: set env JSONBASE_IID and JSONBASE_SECRET on the server
  - Fallback (dev only): accept X-JSONBASE-IID and X-JSONBASE-SECRET headers from the client
*/

const express = require('express');
const cors = require('cors');
const pkg = require('./package.json');

// Use global fetch if Node >= 18; else fallback to node-fetch
let _fetch = global.fetch;
if (typeof _fetch !== 'function') {
  _fetch = (...args) => require('node-fetch')(...args);
}
const fetch = _fetch;

const app = express();
const PORT = process.env.PORT || 3001;
const DEFAULT_BASE = 'https://www.jsonbase.io';
const BASE_URL = (process.env.JSONBASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

app.use(cors({ origin: ALLOW_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({ name: pkg.name, version: pkg.version, ok: true });
});

function getCreds(req) {
  // Preferred: server env
  let iid = process.env.JSONBASE_IID || '';
  let secret = process.env.JSONBASE_SECRET || '';

  // Fallback to per-request headers (dev only)
  if (!iid) iid = req.get('X-JSONBASE-IID') || '';
  if (!secret) secret = req.get('X-JSONBASE-SECRET') || '';

  return { iid: String(iid).trim(), secret: String(secret).trim() };
}

function buildUrl(iid, key) {
  return `${BASE_URL}/${encodeURIComponent(iid)}/${encodeURIComponent(key)}`;
}

async function forwardJsonBase(method, iid, key, body) {
  const url = buildUrl(iid, key);
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  const secret = process.env.JSONBASE_SECRET;
  const headerSecret = secret || '';
  if (headerSecret) headers['Authorization'] = `Bearer ${headerSecret}`;
  // Also include explicit header variant for compatibility
  if (headerSecret) headers['X-JSON-BASE-SECRET'] = headerSecret;

  const res = await fetch(url, {
    method,
    headers,
    body: method === 'PUT' ? JSON.stringify(body || {}) : undefined
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  if (!res.ok) {
    const error = new Error(`Upstream error ${res.status}: ${res.statusText}`);
    error.status = res.status;
    error.body = text;
    throw error;
  }
  return { status: res.status, body: json ?? text };
}

// GET document
app.get('/jsonbase/:key', async (req, res) => {
  try {
    const { iid, secret } = getCreds(req);
    if (!iid || (!secret && !process.env.JSONBASE_SECRET)) {
      return res.status(400).json({ error: 'Missing credentials (IID/SECRET)' });
    }

    // If using per-request secret, temporarily set for forward
    const prevSecret = process.env.JSONBASE_SECRET;
    if (!prevSecret && secret) process.env.JSONBASE_SECRET = secret;

    const result = await forwardJsonBase('GET', iid, req.params.key);

    if (!prevSecret && secret) delete process.env.JSONBASE_SECRET;

    res.status(result.status).json(result.body);
  } catch (err) {
    const code = err.status || 502;
    res.status(code).json({ error: err.message, upstream: err.body });
  }
});

// PUT document
app.put('/jsonbase/:key', async (req, res) => {
  try {
    const { iid, secret } = getCreds(req);
    if (!iid || (!secret && !process.env.JSONBASE_SECRET)) {
      return res.status(400).json({ error: 'Missing credentials (IID/SECRET)' });
    }

    // If using per-request secret, temporarily set for forward
    const prevSecret = process.env.JSONBASE_SECRET;
    if (!prevSecret && secret) process.env.JSONBASE_SECRET = secret;

    const result = await forwardJsonBase('PUT', iid, req.params.key, req.body);

    if (!prevSecret && secret) delete process.env.JSONBASE_SECRET;

    res.status(result.status).json(result.body);
  } catch (err) {
    const code = err.status || 502;
    res.status(code).json({ error: err.message, upstream: err.body });
  }
});

// POST document (optional alternative to PUT)
app.post('/jsonbase/:key', async (req, res) => {
  try {
    const { iid, secret } = getCreds(req);
    if (!iid || (!secret && !process.env.JSONBASE_SECRET)) {
      return res.status(400).json({ error: 'Missing credentials (IID/SECRET)' });
    }

    const prevSecret = process.env.JSONBASE_SECRET;
    if (!prevSecret && secret) process.env.JSONBASE_SECRET = secret;

    const result = await forwardJsonBase('POST', iid, req.params.key, req.body);

    if (!prevSecret && secret) delete process.env.JSONBASE_SECRET;

    res.status(result.status).json(result.body);
  } catch (err) {
    const code = err.status || 502;
    res.status(code).json({ error: err.message, upstream: err.body });
  }
});

app.listen(PORT, () => {
  console.log(`JSONBase proxy running on http://localhost:${PORT}`);
});
