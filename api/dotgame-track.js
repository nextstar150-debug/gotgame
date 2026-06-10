function send(response, status, body) {
  response.setHeader('cache-control', 'no-store');
  response.status(status).json(body);
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return null;
  return { url, key };
}

async function supabaseFetch(path, options = {}) {
  const config = supabaseConfig();
  if (!config) {
    return { ok: false, status: 503, data: { error: 'Supabase is not configured' } };
  }

  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

function normalizeCounters(rows) {
  const counters = {
    total_plays: 12901,
    total_solves: 0,
    total_shares: 0
  };

  for (const row of rows || []) {
    if (row.key === 'plays') counters.total_plays = Number(row.value || 0);
    if (row.key === 'solves') counters.total_solves = Number(row.value || 0);
    if (row.key === 'shares') counters.total_shares = Number(row.value || 0);
  }

  return counters;
}

export default async function handler(request, response) {
  if (request.method === 'GET') {
    const result = await supabaseFetch('/rest/v1/dotgame_counters?select=key,value');
    if (!result.ok) return send(response, result.status, result.data);
    return send(response, 200, normalizeCounters(result.data));
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return send(response, 405, { error: 'Method not allowed' });
  }

  const payload = request.body || {};
  const eventType = payload.eventType;
  const level = Number(payload.level);
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.slice(0, 80) : null;

  if (!['start', 'success', 'share'].includes(eventType)) {
    return send(response, 400, { error: 'Invalid event type' });
  }

  if (!Number.isInteger(level) || level < 1 || level > 99) {
    return send(response, 400, { error: 'Invalid level' });
  }

  const result = await supabaseFetch('/rest/v1/rpc/track_dotgame_event', {
    method: 'POST',
    body: JSON.stringify({
      event_type: eventType,
      level,
      session_id: sessionId
    })
  });

  if (!result.ok) return send(response, result.status, result.data);
  return send(response, 200, Array.isArray(result.data) ? result.data[0] : result.data);
}
