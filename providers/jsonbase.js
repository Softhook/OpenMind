(function () {
  const DEFAULT_BASE_URL = 'https://www.jsonbase.io';
  const LS_KEYS = {
    iid: 'jsonbase.iid',
    secret: 'jsonbase.secret',
    baseUrl: 'jsonbase.baseUrl'
  };

  function getConfig() {
    const iid = localStorage.getItem(LS_KEYS.iid) || '';
    const secret = localStorage.getItem(LS_KEYS.secret) || '';
    const baseUrl = localStorage.getItem(LS_KEYS.baseUrl) || DEFAULT_BASE_URL;
    return { iid, secret, baseUrl };
  }

  function ensureConfig(promptIfMissing = true) {
    let { iid, secret, baseUrl } = getConfig();

    if ((!iid || !secret) && promptIfMissing) {
      const enteredIID = window.prompt('Enter your JSONBase IID', iid || '');
      if (!enteredIID) throw new Error('JSONBase IID is required');
      const enteredSecret = window.prompt('Enter your JSONBase secret (kept in localStorage on this device)', secret || '');
      if (!enteredSecret) throw new Error('JSONBase secret is required');

      iid = enteredIID.trim();
      secret = enteredSecret.trim();
      localStorage.setItem(LS_KEYS.iid, iid);
      localStorage.setItem(LS_KEYS.secret, secret);
    }

    if (!baseUrl) baseUrl = DEFAULT_BASE_URL;
    return { iid, secret, baseUrl };
  }

  function setConfig({ iid, secret, baseUrl } = {}) {
    if (iid != null) localStorage.setItem(LS_KEYS.iid, String(iid));
    if (secret != null) localStorage.setItem(LS_KEYS.secret, String(secret));
    if (baseUrl != null) localStorage.setItem(LS_KEYS.baseUrl, String(baseUrl || DEFAULT_BASE_URL));
  }

  function clearConfig() {
    localStorage.removeItem(LS_KEYS.iid);
    localStorage.removeItem(LS_KEYS.secret);
    localStorage.removeItem(LS_KEYS.baseUrl);
  }

  async function saveDocument({ key, data, method = 'PUT' }) {
    if (!key) throw new Error('Document key is required');
    const { iid, secret, baseUrl } = ensureConfig(true);

    const url = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(iid)}/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // Try common auth styles; JSONBase may accept one of these
        'Authorization': `Bearer ${secret}`,
        'X-JSON-BASE-SECRET': secret
      },
      body: JSON.stringify(data ?? {})
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Save failed (${res.status}): ${text || res.statusText}`);
    }
    let body;
    try { body = await res.json(); } catch { body = null; }
    return {
      url,
      status: res.status,
      body
    };
  }

  async function loadDocument({ key }) {
    if (!key) throw new Error('Document key is required');
    const { iid, secret, baseUrl } = ensureConfig(true);

    const url = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(iid)}/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${secret}`,
        'X-JSON-BASE-SECRET': secret
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Load failed (${res.status}): ${text || res.statusText}`);
    }

    let body;
    try { body = await res.json(); } catch { body = null; }

    // Heuristics: some services return {record: {...}} or {data: {...}} or raw object
    let data = null;
    if (body && typeof body === 'object') {
      if (body.record && typeof body.record === 'object') data = body.record;
      else if (body.data && typeof body.data === 'object') data = body.data;
      else if (body.boxes && body.connections) data = body;
      else data = body;
    }
    return { url, status: res.status, data };
  }

  window.JsonBase = {
    getConfig,
    setConfig,
    clearConfig,
    ensureConfig,
    saveDocument,
    loadDocument
  };
})();
