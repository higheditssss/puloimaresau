module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { cmd, key, value } = req.body;
  const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
  const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const headers = {
    Authorization: `Bearer ${UPSTASH_TOKEN}`,
    'Content-Type': 'application/json'
  };

  try {
    if (cmd === 'set') {
      const serialized = JSON.stringify(value);
      const ttl = req.body.ttl || 7200; // default 2 ore
      const r = await fetch(`${UPSTASH_URL}/pipeline`, {
        method: 'POST',
        headers,
        body: JSON.stringify([['SET', key, serialized, 'EX', ttl]])
      });
      const d = await r.json();
      return res.status(200).json({ ok: true, d });
    }

    if (cmd === 'get') {
      const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
        headers
      });
      const d = await r.json();
      // d.result is the stored string — parse it back to object
      let result = null;
      if (d.result) {
        try { result = JSON.parse(d.result); } catch(e) { result = d.result; }
      }
      return res.status(200).json({ result });
    }

    if (cmd === 'del') {
      await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown command' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};