#!/usr/bin/env node
/**
 * Proxy: agents-cli (snake_case ADK Python API) → @google/adk-devtools (camelCase).
 * Forwards all traffic; rewrites /run_sse and /run JSON bodies.
 */
import http from 'node:http';

const TARGET = process.env.ADK_TARGET || 'http://127.0.0.1:8765';
const PORT = Number(process.env.PROXY_PORT || 8766);

function toCamelKey(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function snakeToCamel(value) {
  if (Array.isArray(value)) return value.map(snakeToCamel);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[toCamelKey(k)] = snakeToCamel(v);
    }
    return out;
  }
  return value;
}

function rewriteBody(pathname, buf) {
  if (!buf.length) return buf;
  if (pathname !== '/run_sse' && pathname !== '/run') return buf;
  try {
    const parsed = JSON.parse(buf.toString('utf8'));
    return Buffer.from(JSON.stringify(snakeToCamel(parsed)), 'utf8');
  } catch {
    return buf;
  }
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url || '/', TARGET);
    const body = rewriteBody(url.pathname, raw);
    const headers = {...req.headers, host: url.host};
    if (body !== raw) {
      headers['content-length'] = String(body.length);
    }
    const upstream = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: req.method,
        headers,
      },
      (upRes) => {
        res.writeHead(upRes.statusCode || 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    upstream.on('error', (err) => {
      res.writeHead(502, {'content-type': 'text/plain'});
      res.end(`proxy error: ${err.message}`);
    });
    upstream.end(body);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`ADK camelCase proxy on http://127.0.0.1:${PORT} → ${TARGET}`);
});
