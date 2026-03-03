// ─────────────────────────────────────────────
//  Vercel Serverless Function: /api/seventv
//  Proxiază cererile 7TV API pentru a evita CORS
//  Usage:
//    GET  /api/seventv?type=user&kick_id=123456
//    GET  /api/seventv?type=emotes&kick_id=123456
//    GET  /api/seventv?type=paint&paint_id=XXXX
// ─────────────────────────────────────────────

// v4 GQL query for fetching a single paint by ID
const PAINT_GQL_QUERY = `
query FetchPaint($id: ObjectID!) {
  cosmetic(id: $id) {
    ... on CosmeticPaint {
      id name function color angle repeat
      stops { at color }
      shadows { x_offset y_offset radius color }
      image_url
      layers { id url }
    }
  }
}`;

// Fallback using cosmetics(list:[...])
const PAINT_GQL_LIST = `
query FetchPaintList($id: String!) {
  cosmetics(list: [{ id: $id, kind: PAINT }]) {
    paints {
      id name function color angle repeat
      stops { at color }
      shadows { x_offset y_offset radius color }
      image_url
      layers { id url }
    }
  }
}`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const { type, kick_id, paint_id } = req.query;

  try {
    // ── type=user ──────────────────────────────────────────────────────────────
    if ((type === 'user' || type === 'emotes') && kick_id) {
      const url = `https://7tv.io/v3/users/kick/${encodeURIComponent(kick_id)}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TopChatters/1.0)', 'Accept': 'application/json' }
      });
      if (!r.ok) {
        if (r.status === 404) return res.status(200).json({ not_found: true });
        return res.status(r.status).json({ error: `7TV returned ${r.status}` });
      }
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.status(200).json(await r.json());
    }

    // ── type=paint ─────────────────────────────────────────────────────────────
    if (type === 'paint' && paint_id) {
      let paint = null;

      // 1. v4 GQL: cosmetic(id: $id)
      try {
        const r = await fetch('https://7tv.io/v4/gql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; TopChatters/1.0)',
          },
          body: JSON.stringify({ query: PAINT_GQL_QUERY, variables: { id: paint_id } }),
        });
        if (r.ok) {
          const d = await r.json();
          if (d?.data?.cosmetic?.id) paint = d.data.cosmetic;
        }
      } catch (_) {}

      // 2. v4 GQL: cosmetics(list:[...])
      if (!paint) {
        try {
          const r = await fetch('https://7tv.io/v4/gql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (compatible; TopChatters/1.0)',
            },
            body: JSON.stringify({ query: PAINT_GQL_LIST, variables: { id: paint_id } }),
          });
          if (r.ok) {
            const d = await r.json();
            const list = d?.data?.cosmetics?.paints;
            if (Array.isArray(list) && list.length > 0) paint = list[0];
          }
        } catch (_) {}
      }

      // 3. v3 REST fallback (endpoint may not exist but worth trying)
      if (!paint) {
        try {
          const r = await fetch(`https://7tv.io/v3/cosmetics/paints/${encodeURIComponent(paint_id)}`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; TopChatters/1.0)' }
          });
          if (r.ok) {
            const d = await r.json();
            if (d?.id) paint = d;
          }
        } catch (_) {}
      }

      if (!paint) return res.status(404).json({ not_found: true, paint_id });

      res.setHeader('Cache-Control', 'public, max-age=3600'); // paints rarely change
      return res.status(200).json(paint);
    }

    return res.status(400).json({
      error: 'Use: ?type=user&kick_id=... | ?type=paint&paint_id=...'
    });

  } catch (err) {
    console.error('[7TV proxy]', err);
    return res.status(502).json({ error: err.message || 'Proxy error' });
  }
};