// Converts whatever LinkedIn link the user pastes into a canonical embed URL
// of the exact shape the website backend accepts:
//   https://www.linkedin.com/embed/feed/update/urn:li:(activity|share|ugcPost):<id>
//
// The backend's regex (linkedinPostingController.js) is:
//   /^https:\/\/www\.linkedin\.com\/embed\/feed\/update\/urn:li:(share|ugcPost|activity):\d+\/?(\?.*)?$/i
//
// The URN *type* matters: a "/posts/...-share-<id>-..." link embeds as
// urn:li:share:<id>, while a "...-activity-<id>-..." link embeds as
// urn:li:activity:<id>. Picking the wrong type still passes the backend regex
// but the iframe on the site would 404. So we verify which type actually serves
// content (HTTP 200) before returning it.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Already a valid embed URL? Pass it through unchanged.
const EMBED_URL_REGEX =
  /^https:\/\/www\.linkedin\.com\/embed\/feed\/update\/urn:li:(share|ugcPost|activity):\d+\/?(\?.*)?$/i;

// Explicit urn (in /feed/update/ links and iframe srcs): urn:li:activity:<id>
const URN_REGEX = /urn:li:(activity|share|ugcPost):(\d{6,})/i;

// The "...-share-<id>-abcd" / "...-activity-<id>-abcd" tail of a /posts/ link.
const SLUG_TYPE_REGEX = /(activity|share|ugcPost)[-:](\d{6,})/i;

function canonType(t) {
  const l = (t || '').toLowerCase();
  if (l === 'ugcpost') return 'ugcPost';
  return l; // 'activity' | 'share'
}

function buildEmbed(type, id) {
  return `https://www.linkedin.com/embed/feed/update/urn:li:${type}:${id}`;
}

// Pull the URN type + numeric id out of any recognized LinkedIn URL form.
function extractTypeAndId(url) {
  if (!url) return null;
  const urn = url.match(URN_REGEX);
  if (urn) return { type: canonType(urn[1]), id: urn[2] };
  const slug = url.match(SLUG_TYPE_REGEX);
  if (slug) return { type: canonType(slug[1]), id: slug[2] };
  return null;
}

// Pull the first LinkedIn / lnkd.in URL out of an arbitrary chunk of pasted text.
function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0] : null;
}

function isLinkedInHost(url) {
  return /(^|\.)linkedin\.com/i.test(url) || /(^|\.)lnkd\.in/i.test(url);
}

// If the pasted text is (or contains) an iframe, grab its src so we can normalize it.
function srcFromIframe(text) {
  const iframe = (text || '').match(/<iframe\b[^>]*>/i);
  if (!iframe) return null;
  const src = iframe[0].match(/src\s*=\s*["']([^"']+)["']/i);
  return src ? src[1].trim() : null;
}

// Follow redirects for shortened lnkd.in links to reveal the real post URL.
async function resolveRedirects(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': UA }
    });
    return res.url || url; // res.url is the final URL after redirects
  } catch {
    return url; // fall back to the original; extraction may still work
  }
}

// Does this embed URL actually serve the post (HTTP 200)? A wrong URN type 404s.
async function verifyEmbed(url) {
  try {
    const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': UA } });
    return res.status === 200;
  } catch {
    return false;
  }
}

// Pure, network-free best-guess conversion. Used by unit tests and as a fallback.
function toEmbedUrl(rawUrl) {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  if (EMBED_URL_REGEX.test(url)) return url.split('?')[0];
  const t = extractTypeAndId(url);
  return t ? buildEmbed(t.type, t.id) : null;
}

// Main entry: takes the raw message text, returns { embedUrl, verified } or { error }.
async function normalizeToEmbedUrl(rawText) {
  const text = (rawText || '').trim();
  if (!text) return { error: 'empty' };

  const iframeSrc = srcFromIframe(text);
  const candidate = iframeSrc || extractFirstUrl(text);

  if (!candidate) return { error: 'no-url' };
  if (!isLinkedInHost(candidate)) return { error: 'not-linkedin' };

  // Already a clean embed URL -> use as-is.
  if (EMBED_URL_REGEX.test(candidate)) {
    return { embedUrl: candidate.split('?')[0], verified: true };
  }

  // Extract type+id; if the link is a lnkd.in shortener, resolve redirects first.
  let info = extractTypeAndId(candidate);
  if (!info) {
    const resolved = await resolveRedirects(candidate);
    info = extractTypeAndId(resolved);
  }
  if (!info) return { error: 'unparseable', candidate };

  // Try the link's own type first, then the other two, and return the one that
  // actually returns HTTP 200 so the stored iframe is guaranteed to render.
  const order = [info.type, 'share', 'activity', 'ugcPost'].filter(
    (v, i, a) => a.indexOf(v) === i
  );
  for (const type of order) {
    const embed = buildEmbed(type, info.id);
    if (await verifyEmbed(embed)) {
      return { embedUrl: embed, verified: true, type };
    }
  }

  // None verified (e.g. network blocked / private post): fall back to the link's
  // own type and let the backend attempt it.
  return { embedUrl: buildEmbed(info.type, info.id), verified: false, type: info.type };
}

module.exports = {
  normalizeToEmbedUrl,
  toEmbedUrl,
  extractTypeAndId,
  extractFirstUrl,
  EMBED_URL_REGEX
};
