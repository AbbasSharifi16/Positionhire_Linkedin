const { config } = require('./config');

// Cached admin JWT. The website issues 24h tokens; we cache and only re-login
// when a request comes back 401 (expired/invalid).
let cachedToken = null;

async function login() {
  const res = await fetch(`${config.siteApiBase}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.adminUsername,
      password: config.adminPassword
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(
      `Admin login failed (${res.status}): ${data.message || 'no token returned'}`
    );
  }
  cachedToken = data.token;
  return cachedToken;
}

async function getToken() {
  if (cachedToken) return cachedToken;
  return login();
}

// Sends one create request with the given token. Returns the fetch Response
// plus parsed JSON body so the caller can inspect status.
async function postPosting(token, embedCode) {
  const res = await fetch(`${config.siteApiBase}/admin/linkedin-postings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ embedCode })
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// Public: create a LinkedIn posting from an embed URL. Handles token refresh on 401.
// Returns the created posting object (same shape the admin panel list uses).
async function createPosting(embedCode) {
  let token = await getToken();
  let { res, data } = await postPosting(token, embedCode);

  if (res.status === 401) {
    // Token expired/invalid — force a fresh login once and retry.
    cachedToken = null;
    token = await login();
    ({ res, data } = await postPosting(token, embedCode));
  }

  if (!res.ok) {
    const message = data.message || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

module.exports = { createPosting, login };
