// ─────────────────────────────────────────────
//  Vercel Serverless Function: /api/cache
//  PERSISTENT cache cu Upstash Redis (GRATUIT)
//  Datele expiră după 20 ore
//  
//  Setup RAPID (5 minute):
//  1. Mergi pe https://upstash.com (sign up gratuit cu GitHub)
//  2. Creează Redis Database (Frankfurt/EU pentru România)
//  3. Copiază REST URL și REST TOKEN din dashboard
//  4. Adaugă în Vercel: 
//     - Environment Variable: UPSTASH_REDIS_REST_URL
//     - Environment Variable: UPSTASH_REDIS_REST_TOKEN
//  5. Redeploy: vercel --prod
// ─────────────────────────────────────────────

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-cache');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { action, key } = req.query;
  
  // Upstash Redis credentials (din Vercel Environment Variables)
  const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
  const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  
  // Verifică dacă Redis e configurat
  if (!REDIS_URL || !REDIS_TOKEN) {
    // Fallback: returnează uncached pentru a nu bloca aplicația
    console.warn('⚠️ Redis not configured - cache disabled');
    
    if (action === 'get') {
      return res.status(200).json({ 
        cached: false,
        error: 'Redis not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel environment variables.'
      });
    }
    
    if (action === 'set') {
      return res.status(200).json({ 
        success: false,
        error: 'Redis not configured'
      });
    }
    
    return res.status(503).json({ 
      error: 'Redis storage not configured',
      setup: 'https://upstash.com → Create DB → Copy REST URL & TOKEN → Add to Vercel env vars'
    });
  }

  try {
    const TWENTY_HOURS = 20 * 60 * 60; // 20 ore în secunde

    // Helper pentru apeluri Redis
    async function redisCommand(command) {
      const response = await fetch(REDIS_URL, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${REDIS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(command)
      });
      
      if (!response.ok) {
        throw new Error(`Redis error: ${response.status}`);
      }
      
      return await response.json();
    }

    if (action === 'get' && key) {
      // GET cheie din Redis
      const result = await redisCommand(['GET', key]);
      
      if (!result.result) {
        return res.status(200).json({ cached: false });
      }
      
      // Parsează datele
      const cached = JSON.parse(result.result);
      
      return res.status(200).json({
        cached: true,
        data: cached.data,
        expiresAt: cached.expiresAt,
        expiresIn: Math.floor((cached.expiresAt - Date.now()) / 1000)
      });
    }

    if (action === 'set' && key && req.method === 'POST') {
      const expiresAt = Date.now() + (TWENTY_HOURS * 1000);
      
      const cacheData = JSON.stringify({
        data: req.body,
        expiresAt: expiresAt
      });
      
      // SET în Redis cu expirare automată după 20 ore
      await redisCommand(['SETEX', key, TWENTY_HOURS, cacheData]);

      return res.status(200).json({
        success: true,
        expiresAt: expiresAt,
        expiresIn: TWENTY_HOURS
      });
    }

    if (action === 'stats') {
      // Obține toate cheile care încep cu topChatters_
      const keysResult = await redisCommand(['KEYS', 'topChatters_*']);
      const keys = keysResult.result || [];
      
      // Obține TTL pentru fiecare cheie
      const keyStats = await Promise.all(
        keys.map(async (k) => {
          const ttlResult = await redisCommand(['TTL', k]);
          return {
            key: k,
            expiresIn: ttlResult.result || 0
          };
        })
      );
      
      return res.status(200).json({
        totalKeys: keys.length,
        keys: keyStats
      });
    }

    if (action === 'clear' && key) {
      // DELETE cheie (pentru reset manual)
      await redisCommand(['DEL', key]);
      return res.status(200).json({ success: true, deleted: key });
    }

    return res.status(400).json({ error: 'Invalid action or missing parameters' });
    
  } catch (error) {
    console.error('❌ Cache error:', error);
    return res.status(500).json({ 
      error: 'Cache operation failed', 
      message: error.message,
      cached: false // Fallback pentru GET
    });
  }
};