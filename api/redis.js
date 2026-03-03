export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { cmd, key, value } = req.body;
  const UPSTASH_URL   = process.env.UPSTASH_URL;
  const UPSTASH_TOKEN = process.env.UPSTASH_TOKEN;

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  try {
    if (cmd === 'set') {
      await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(JSON.stringify(value))
      });
      return res.status(200).json({ ok: true });
    }

    if (cmd === 'get') {
      const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      const d = await r.json();
      const result = d.result ? JSON.parse(d.result) : null;
      return res.status(200).json({ result });
    }

    return res.status(400).json({ error: 'Unknown command' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
