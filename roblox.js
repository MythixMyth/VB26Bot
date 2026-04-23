import 'dotenv/config';
import crypto from 'node:crypto';

const UNIVERSE_ID = process.env.ROBLOX_UNIVERSE_ID;
const API_KEY = process.env.ROBLOX_API_KEY;
const DATASTORE_NAME = 'Public_1';
const BANS_STORE = 'Bans';
const PENDING_STORE = 'PendingCommands';
const MESSAGING_TOPIC = 'DiscordCommands';
const DATA_PREFIX = 'PLAYER_';

async function robloxRequest(url, options = {}) {
  const { headers: extraHeaders, ...restOptions } = options;
  const res = await fetch(url, {
    ...restOptions,
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Roblox API ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

export async function getPlayerData(userId) {
  const entryKey = DATA_PREFIX + userId;
  const url = `https://apis.roblox.com/datastores/v1/universes/${UNIVERSE_ID}/standard-datastores/datastore/entries/entry?datastoreName=${encodeURIComponent(DATASTORE_NAME)}&entryKey=${encodeURIComponent(entryKey)}`;
  return robloxRequest(url);
}

export async function publishMessage(data) {
  const url = `https://apis.roblox.com/messaging-service/v1/universes/${UNIVERSE_ID}/topics/${MESSAGING_TOPIC}`;
  return robloxRequest(url, {
    method: 'POST',
    body: JSON.stringify({ message: JSON.stringify(data) }),
  });
}

export async function writeBan(userId, banData) {
  const entryKey = String(userId);
  const url = `https://apis.roblox.com/datastores/v1/universes/${UNIVERSE_ID}/standard-datastores/datastore/entries/entry?datastoreName=${encodeURIComponent(BANS_STORE)}&entryKey=${encodeURIComponent(entryKey)}`;
  return robloxRequest(url, {
    method: 'POST',
    body: JSON.stringify(banData),
    headers: { 'content-md5': crypto.createHash('md5').update(JSON.stringify(banData)).digest('base64') },
  });
}

export async function writePendingCommand(userId, command) {
  const entryKey = String(userId);
  const storeUrl = `https://apis.roblox.com/datastores/v1/universes/${UNIVERSE_ID}/standard-datastores/datastore/entries/entry?datastoreName=${encodeURIComponent(PENDING_STORE)}&entryKey=${encodeURIComponent(entryKey)}`;

  let existing = [];
  try {
    const data = await robloxRequest(storeUrl);
    if (Array.isArray(data)) {
      existing = data;
    }
  } catch {
    // No existing entry
  }

  existing.push(command);

  return robloxRequest(storeUrl, {
    method: 'POST',
    body: JSON.stringify(existing),
    headers: { 'content-md5': crypto.createHash('md5').update(JSON.stringify(existing)).digest('base64') },
  });
}

export function parseDuration(durationStr) {
  if (/^perm(anent)?$/i.test(durationStr.trim())) {
    return { seconds: -1, label: 'Permanent' };
  }

  const match = durationStr.match(/^(\d+)\s*(m|h|d|w|min|mins|hour|hours|day|days|week|weeks)$/i);
  if (!match) return null;

  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  const multipliers = {
    m: 60, min: 60, mins: 60,
    h: 3600, hour: 3600, hours: 3600,
    d: 86400, day: 86400, days: 86400,
    w: 604800, week: 604800, weeks: 604800,
  };

  const seconds = amount * (multipliers[unit] || 60);
  return { seconds, label: `${amount}${match[2]}` };
}

export async function getPlayerUsername(userId) {
  try {
    const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    if (res.ok) {
      const data = await res.json();
      return data.name;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function getPlayerThumbnail(userId) {
  try {
    const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`);
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data[0]) {
        return data.data[0].imageUrl;
      }
    }
  } catch {
    // ignore
  }
  return null;
}
