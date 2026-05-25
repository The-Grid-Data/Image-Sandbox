// Vercel serverless proxy — fetches images server-side so CORS on the origin host is irrelevant.
// SSRF guards: blocks private IPs, enforces image/* Content-Type, caps body at 20 MB.
// DNS rebinding is a known MVP-tier limitation — hostname is resolved immediately before fetch.

import dns from 'dns';
import { promisify } from 'util';

export const config = { runtime: 'nodejs' };

const lookup = promisify(dns.lookup);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

function isPrivateIP(ip) {
  return (
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^::1$/.test(ip) ||
    /^fc00:/i.test(ip) ||
    /^fe80:/i.test(ip) ||
    (/^172\.(\d+)\./.test(ip) && parseInt(RegExp.$1, 10) >= 16 && parseInt(RegExp.$1, 10) <= 31)
  );
}

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).end('Missing url parameter');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).end('Invalid url');
  }

  // Resolve hostname and check for private IPs before fetching
  let resolved;
  try {
    resolved = await lookup(parsed.hostname);
  } catch {
    return res.status(400).end('Could not resolve hostname');
  }

  if (isPrivateIP(resolved.address)) {
    return res.status(403).end('Forbidden');
  }

  let upstream;
  try {
    upstream = await fetch(url);
  } catch {
    return res.status(502).end('Upstream fetch failed');
  }

  if (!upstream.ok) {
    return res.status(upstream.status).end('Upstream error');
  }

  const contentType = upstream.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    return res.status(415).end('Not an image');
  }

  // Stream body with size cap
  const reader = upstream.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      reader.cancel();
      return res.status(413).end('Image too large (max 20 MB)');
    }
    chunks.push(value);
  }

  const body = Buffer.concat(chunks.map(c => Buffer.from(c)));
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(body);
}
