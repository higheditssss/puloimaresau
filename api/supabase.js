import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const supaAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Helper: fetch a Redis room key
async function redisGet(key) {
  try {
    const r = await fetch(`${process.env.UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_TOKEN}` }
    });
    const d = await r.json();
    if (!d.result) return null;
    return typeof d.result === 'string' ? JSON.parse(d.result) : d.result;
  } catch(e) { return null; }
}

async function redisScan(pattern) {
  try {
    const r = await fetch(`${process.env.UPSTASH_URL}/scan/0/match/${encodeURIComponent(pattern)}/count/100`, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_TOKEN}` }
    });
    const d = await r.json();
    return (d.result && d.result[1]) || [];
  } catch(e) { return []; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, payload } = req.body || {};

  try {

    // ── GOOGLE OAUTH ──
    if (action === 'google_oauth_url') {
      const { redirect } = payload || {};
      const { data, error } = await supaAnon.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirect || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000', skipBrowserRedirect: true }
      });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ url: data.url });
    }

    if (action === 'google_get_user') {
      const { access_token } = payload || {};
      if (!access_token) return res.status(400).json({ error: 'Missing access_token' });
      const { data: { user }, error } = await supaAnon.auth.getUser(access_token);
      if (error || !user) return res.status(401).json({ error: 'Invalid token' });
      return res.status(200).json({ user });
    }

    if (action === 'get_user_by_google') {
      const { google_id } = payload || {};
      if (!google_id) return res.status(400).json({ error: 'Missing google_id' });
      const { data } = await supa.from('users').select('*').eq('google_id', google_id).single();
      return res.status(200).json({ data: data || null });
    }

    // ── USERS ──
    if (action === 'upsert_user') {
      const { kick_username, avatar, google_id, google_email, google_avatar } = payload || {};
      if (!kick_username) return res.status(400).json({ error: 'Missing kick_username' });
      const update = { kick_username, avatar: avatar || google_avatar || null, last_seen: new Date().toISOString() };
      if (google_id)    update.google_id    = google_id;
      if (google_email) update.google_email = google_email;
      const { data, error } = await supa.from('users').upsert(update, { onConflict: 'kick_username' }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data });
    }

    // ── BATTLE HISTORY ──
    if (action === 'get_history') {
      const { kick_username } = payload || {};
      if (!kick_username) return res.status(400).json({ error: 'Missing kick_username' });
      const { data, error } = await supa.from('battle_history').select('*').eq('kick_username', kick_username).order('created_at', { ascending: false }).limit(10);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data: data || [] });
    }

    if (action === 'add_history') {
      const { kick_username, room_id, room_name, won, song_title, song_thumb } = payload || {};
      if (!kick_username) return res.status(400).json({ error: 'Missing kick_username' });
      const { error } = await supa.from('battle_history').insert({
        kick_username, room_id: room_id || null, room_name: room_name || 'Battle',
        won: won || false, song_title: song_title || null, song_thumb: song_thumb || null, created_at: new Date().toISOString()
      });
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    // ── DISCOVERY: battle-uri active din Redis ──
    if (action === 'discovery_live') {
      const keys = await redisScan('room_*');
      const rooms = [];
      for (const key of keys.slice(0, 20)) {
        const data = await redisGet(key);
        if (data && data.room && !data.tournamentDone) {
          rooms.push({
            room: data.room,
            songs: data.songs || [],
            battleStarted: data.battleStarted || false,
            currentRound: data.currentTournamentRound || 0
          });
        }
      }
      // Sort: live first, then waiting
      rooms.sort((a, b) => (b.battleStarted ? 1 : 0) - (a.battleStarted ? 1 : 0));
      return res.status(200).json({ rooms });
    }

    // ── DISCOVERY: ultimii câștigători din Supabase ──
    if (action === 'discovery_winners') {
      const { data, error } = await supa
        .from('battle_history')
        .select('*')
        .eq('won', true)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ winners: data || [] });
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}