# HIGHSB — Music Battle Platform

## Setup Local (Dev)
```bash
node server.js
# Deschide: http://localhost:3000
```

## Deploy Vercel
```bash
vercel --prod
```

## Variabile de mediu (opțional - pentru cache Redis)
```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## Cum funcționează votarea
1. Hostul creează o cameră cu username-ul Kick
2. HIGHSB conectează la `chatrooms.{chatroomId}.v2` via Pusher (key: 32cbd69e4b950bf97679)
3. Mesajele `!1` și `!2` din chat sunt detectate automat
4. Un vot per utilizator — duplicatele sunt ignorate
5. Hostul apasă "Start Poll" → "End Poll" manual
