// ─────────────────────────────────────────────
//  Top Chatters — Kick.com proxy server
//  Run: node server.js
//  Then open: http://localhost:3000
// ─────────────────────────────────────────────
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

function fetchJson(targetUrl) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Invalid JSON from Kick')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // CORS headers pentru toate răspunsurile
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── API proxy: /api/channel?user=highman ──
  if (parsed.pathname === '/api/channel') {
    const user = parsed.query.user;
    if (!user) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing ?user= param' }));
      return;
    }

    try {
      // Încearcă v2 mai întâi, fallback la v1
      let data;
      try {
        data = await fetchJson(`https://kick.com/api/v2/channels/${encodeURIComponent(user)}`);
      } catch(e) {
        data = await fetchJson(`https://kick.com/api/v1/channels/${encodeURIComponent(user)}`);
      }

      const chatroomId  = data?.chatroom?.id;
      const isLive      = !!(data?.livestream);
      const title       = data?.livestream?.session_title || null;
      const viewers     = data?.livestream?.viewer_count || 0;
      const avatar      = data?.user?.profile_pic || null;
      const kickUserId  = data?.user?.id || null;

      if (!chatroomId) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Channel not found or no chatroom' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ chatroomId, isLive, title, viewers, avatar, kickUserId }));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── Serve index.html ──────────────────────
  if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('index.html not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ⚡ Top Chatters Server pornit!');
  console.log(`  🌐 Deschide: http://localhost:${PORT}`);
  console.log('  📡 Proxy Kick API activ');
  console.log('');
  console.log('  Apasă CTRL+C ca să oprești.');
  console.log('');
});