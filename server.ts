import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'spmt-dev-secret-change-in-production';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://spacemountain.live,https://spacemountain-live.fly.dev').split(',');

app.use(express.json());
app.use(cookieParser());

// CORS for ecosystem apps
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Auth middleware
function authenticate(req: any, res: any, next: any) {
  const token = req.cookies?.spmt_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Health ───
app.get('/api/health', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE password_hash != ?').get('SYSTEM_NO_LOGIN') as any;
  res.json({ status: 'ok', app: 'spmt-live', uptime: process.uptime(), users: userCount?.count || 0 });
});

// ─── Auth: Register ───
app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName, discordUsername, twitchUsername } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const clean = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (clean.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(clean);
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  // Resolve Discord ID from username if provided
  let discordId: string | null = null;
  const cleanDiscord = (discordUsername || '').trim().replace(/^@/, '');
  if (cleanDiscord && process.env.DISCORD_BOT_TOKEN) {
    try {
      const guildId = process.env.DISCORD_GUILD_ID || '';
      if (guildId) {
        const searchRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(cleanDiscord)}&limit=1`, {
          headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        });
        if (searchRes.ok) {
          const members = await searchRes.json();
          if (members.length > 0 && members[0].user) {
            discordId = members[0].user.id;
          }
        }
      }
    } catch (e) { console.warn('Discord lookup failed:', e); }
  }

  // Resolve Twitch ID from username if provided
  let twitchId: string | null = null;
  const cleanTwitch = (twitchUsername || '').trim().toLowerCase();
  if (cleanTwitch && process.env.TWITCH_CLIENT_ID && process.env.TWITCH_ACCESS_TOKEN) {
    try {
      const twitchRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(cleanTwitch)}`, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
        },
      });
      if (twitchRes.ok) {
        const data = await twitchRes.json();
        if (data.data?.length > 0) {
          twitchId = data.data[0].id;
        }
      }
    } catch (e) { console.warn('Twitch lookup failed:', e); }
  }

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 12);
  const email = `${clean}@spmt.live`;

  db.prepare(`INSERT INTO users (id, username, email, display_name, password_hash, discord_username, discord_id, twitch_username, twitch_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, clean, email, displayName || clean, hash, cleanDiscord || null, discordId, cleanTwitch || null, twitchId, new Date().toISOString());

  const token = jwt.sign({ id, username: clean, email }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('spmt_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.status(201).json({ user: { id, username: clean, email, displayName: displayName || clean, discordId, twitchId }, token });
});

// ─── Auth: Login ───
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const clean = username.trim().toLowerCase().replace(/@spmt\.live$/, '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(clean) as any;
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user.id, username: user.username, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('spmt_token', token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ user: { id: user.id, username: user.username, email: user.email, displayName: user.display_name }, token });
});

// ─── Auth: Logout ───
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('spmt_token');
  res.json({ ok: true });
});

// ─── Auth: Current user ───
app.get('/api/auth/me', authenticate, (req: any, res) => {
  const user = db.prepare('SELECT id, username, email, display_name, discord_username, discord_id, twitch_username, twitch_id, created_at FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ─── User: Link Discord/Twitch ───
app.post('/api/user/link', authenticate, async (req: any, res) => {
  try {
    const { discordUsername, twitchUsername } = req.body;

  let discordId: string | null = null;
  const cleanDiscord = (discordUsername || '').trim().replace(/^@/, '');
  if (cleanDiscord && process.env.DISCORD_BOT_TOKEN) {
    try {
      const guildId = process.env.DISCORD_GUILD_ID || '';
      if (guildId) {
        const searchRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(cleanDiscord)}&limit=1`, {
          headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        });
        if (searchRes.ok) {
          const members = await searchRes.json();
          if (members.length > 0 && members[0].user) {
            discordId = members[0].user.id;
          }
        }
      }
    } catch {}
  }

  let twitchId: string | null = null;
  const cleanTwitch = (twitchUsername || '').trim().toLowerCase();
  if (cleanTwitch && process.env.TWITCH_CLIENT_ID && process.env.TWITCH_ACCESS_TOKEN) {
    try {
      const twitchRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(cleanTwitch)}`, {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
        },
      });
      if (twitchRes.ok) {
        const data = await twitchRes.json();
        if (data.data?.length > 0) twitchId = data.data[0].id;
      }
    } catch {}
  }

  const updates: string[] = [];
  const params: any[] = [];
  if (cleanDiscord) { updates.push('discord_username = ?'); params.push(cleanDiscord); }
  if (discordId) { updates.push('discord_id = ?'); params.push(discordId); }
  if (cleanTwitch) { updates.push('twitch_username = ?'); params.push(cleanTwitch); }
  if (twitchId) { updates.push('twitch_id = ?'); params.push(twitchId); }

  if (updates.length > 0) {
    params.push(req.user.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  res.json({ ok: true, discordId, twitchId, discordUsername: cleanDiscord, twitchUsername: cleanTwitch });
  } catch (err: any) {
    console.error('Link failed:', err);
    res.status(500).json({ error: 'Link failed: ' + (err.message || 'unknown error') });
  }
});

// ─── User: Lookup by username, discord_id, or twitch_id ───
app.get('/api/user/lookup', (req, res) => {
  const { username, discord_id, twitch_id } = req.query;
  let user: any = null;
  if (username) user = db.prepare('SELECT id, username, display_name, discord_id, twitch_id, twitch_username, discord_username FROM users WHERE username = ?').get(username);
  else if (discord_id) user = db.prepare('SELECT id, username, display_name, discord_id, twitch_id, twitch_username, discord_username FROM users WHERE discord_id = ?').get(discord_id);
  else if (twitch_id) user = db.prepare('SELECT id, username, display_name, discord_id, twitch_id, twitch_username, discord_username FROM users WHERE twitch_id = ?').get(twitch_id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ─── OAuth2: Authorize (simplified) ───
// Other apps redirect here: GET /api/oauth/authorize?client_id=X&redirect_uri=Y&state=Z
app.get('/api/oauth/authorize', (req: any, res) => {
  const { client_id, redirect_uri, state } = req.query;
  if (!client_id || !redirect_uri) return res.status(400).json({ error: 'client_id and redirect_uri required' });

  // Check if user is authenticated
  const token = req.cookies?.spmt_token || req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  let user: any = null;
  if (token) {
    try {
      user = jwt.verify(token, JWT_SECRET) as any;
    } catch {}
  }

  // If not logged in, redirect to login page with return params
  if (!user) {
    const returnUrl = `/api/oauth/authorize?client_id=${encodeURIComponent(client_id as string)}&redirect_uri=${encodeURIComponent(redirect_uri as string)}${state ? `&state=${encodeURIComponent(state as string)}` : ''}`;
    return res.redirect(`/?return=${encodeURIComponent(returnUrl)}`);
  }

  // Verify client
  const client = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(client_id) as any;
  if (!client) return res.status(404).json({ error: 'Unknown client' });
  if (!client.redirect_uris.split(',').includes(redirect_uri)) return res.status(400).json({ error: 'Invalid redirect_uri' });

  // Generate authorization code
  const code = uuidv4();
  db.prepare('INSERT INTO oauth_codes (code, user_id, client_id, redirect_uri, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(code, user.id, client_id, redirect_uri, new Date(Date.now() + 5 * 60 * 1000).toISOString());

  const url = `${redirect_uri}?code=${code}${state ? `&state=${state}` : ''}`;
  res.redirect(url);
});

// ─── OAuth2: Token exchange ───
app.post('/api/oauth/token', (req, res) => {
  const { code, client_id, client_secret, redirect_uri } = req.body;
  if (!code || !client_id || !client_secret) return res.status(400).json({ error: 'Missing fields' });

  const client = db.prepare('SELECT * FROM oauth_clients WHERE client_id = ? AND client_secret = ?').get(client_id, client_secret) as any;
  if (!client) return res.status(401).json({ error: 'Invalid client credentials' });

  const authCode = db.prepare('SELECT * FROM oauth_codes WHERE code = ? AND client_id = ? AND redirect_uri = ?').get(code, client_id, redirect_uri) as any;
  if (!authCode) return res.status(400).json({ error: 'Invalid code' });
  if (new Date(authCode.expires_at) < new Date()) return res.status(400).json({ error: 'Code expired' });

  // Delete used code
  db.prepare('DELETE FROM oauth_codes WHERE code = ?').run(code);

  const user = db.prepare('SELECT id, username, email, display_name FROM users WHERE id = ?').get(authCode.user_id) as any;
  const access_token = jwt.sign({ id: user.id, username: user.username, email: user.email, client_id }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ access_token, token_type: 'Bearer', expires_in: 7 * 24 * 3600, user });
});

// ─── OAuth2: User info (for apps to verify tokens) ───
app.get('/api/oauth/userinfo', authenticate, (req: any, res) => {
  const user = db.prepare('SELECT id, username, email, display_name, created_at FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ─── Messaging: Send ───
app.post('/api/messages', authenticate, (req: any, res) => {
  const { to, subject, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'Recipient and body required' });

  const recipient = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(to, to) as any;
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

  const id = uuidv4();
  db.prepare('INSERT INTO messages (id, from_id, to_id, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.user.id, recipient.id, subject || '', body, new Date().toISOString());

  res.status(201).json({ id, sent: true });
});

// ─── Messaging: Inbox ───
app.get('/api/messages/inbox', authenticate, (req: any, res) => {
  const messages = db.prepare(`
    SELECT m.id, m.subject, m.body, m.created_at, u.username as from_user, u.display_name as from_name
    FROM messages m JOIN users u ON m.from_id = u.id
    WHERE m.to_id = ? ORDER BY m.created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json(messages);
});

// ─── Messaging: Sent ───
app.get('/api/messages/sent', authenticate, (req: any, res) => {
  const messages = db.prepare(`
    SELECT m.id, m.subject, m.body, m.created_at, u.username as to_user, u.display_name as to_name
    FROM messages m JOIN users u ON m.to_id = u.id
    WHERE m.from_id = ? ORDER BY m.created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json(messages);
});

// ─── Forum: Create thread ───
app.post('/api/forum/threads', authenticate, (req: any, res) => {
  const { title, category, body } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Title and body required' });

  const id = uuidv4();
  const postId = uuidv4();
  const now = new Date().toISOString();

  db.prepare('INSERT INTO forum_threads (id, title, category, author_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, title, category || 'General', req.user.id, now);
  db.prepare('INSERT INTO forum_posts (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(postId, id, req.user.id, body, now);

  res.status(201).json({ id, title });
});

// ─── Forum: Get thread posts ───
app.get('/api/forum/threads/:id', (req, res) => {
  const thread = db.prepare('SELECT t.*, u.username as author FROM forum_threads t JOIN users u ON t.author_id = u.id WHERE t.id = ?').get(req.params.id) as any;
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const posts = db.prepare(`
    SELECT p.id, p.body, p.created_at, u.username as author, u.display_name as author_name
    FROM forum_posts p JOIN users u ON p.author_id = u.id
    WHERE p.thread_id = ? ORDER BY p.created_at ASC
  `).all(req.params.id);

  res.json({ thread, posts });
});

// ─── Forum: Reply to thread ───
app.post('/api/forum/threads/:id/reply', authenticate, (req: any, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'Body required' });

  const thread = db.prepare('SELECT id FROM forum_threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const id = uuidv4();
  db.prepare('INSERT INTO forum_posts (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, req.user.id, body, new Date().toISOString());

  res.status(201).json({ id });
});

// ─── User Settings ───
app.get('/api/settings', authenticate, (req: any, res) => {
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.user.id) as any;
  res.json(settings || {});
});

app.post('/api/settings', authenticate, (req: any, res) => {
  const { theme, notifications, bio } = req.body;
  const existing = db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(req.user.id);

  if (existing) {
    db.prepare('UPDATE user_settings SET theme = COALESCE(?, theme), notifications = COALESCE(?, notifications), bio = COALESCE(?, bio) WHERE user_id = ?')
      .run(theme, notifications, bio, req.user.id);
  } else {
    db.prepare('INSERT INTO user_settings (user_id, theme, notifications, bio) VALUES (?, ?, ?, ?)')
      .run(req.user.id, theme || 'solar-flare', notifications ?? 1, bio || '');
  }

  res.json({ ok: true });
});

// ─── System Messaging: App-to-user messages (used by ecosystem apps) ───
app.post('/api/system/message', (req, res) => {
  const apiKey = req.headers['x-spmt-key'];
  if (apiKey !== process.env.SYSTEM_API_KEY) return res.status(401).json({ error: 'Invalid API key' });

  const { from_app, to, subject, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'to and body required' });

  const recipient = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(to, to) as any;
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

  // Create a system user for the app if it doesn't exist
  const appUsername = (from_app || 'system').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let appUser = db.prepare('SELECT id FROM users WHERE username = ?').get(appUsername) as any;
  if (!appUser) {
    const appId = `app_${appUsername}`;
    db.prepare('INSERT OR IGNORE INTO users (id, username, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(appId, appUsername, `${appUsername}@spmt.live`, from_app || 'System', 'SYSTEM_NO_LOGIN', new Date().toISOString());
    appUser = { id: appId };
  }

  const id = uuidv4();
  db.prepare('INSERT INTO messages (id, from_id, to_id, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, appUser.id, recipient.id, subject || `Message from ${from_app || 'System'}`, body, new Date().toISOString());

  res.status(201).json({ id, sent: true });
});

// ─── System Messaging: Broadcast to all users ───
app.post('/api/system/broadcast', (req, res) => {
  const apiKey = req.headers['x-spmt-key'];
  if (apiKey !== process.env.SYSTEM_API_KEY) return res.status(401).json({ error: 'Invalid API key' });

  const { from_app, subject, body } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });

  const allUsers = db.prepare('SELECT id FROM users WHERE password_hash != ?').all('SYSTEM_NO_LOGIN') as any[];
  const appUsername = (from_app || 'system').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let appUser = db.prepare('SELECT id FROM users WHERE username = ?').get(appUsername) as any;
  if (!appUser) {
    const appId = `app_${appUsername}`;
    db.prepare('INSERT OR IGNORE INTO users (id, username, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(appId, appUsername, `${appUsername}@spmt.live`, from_app || 'System', 'SYSTEM_NO_LOGIN', new Date().toISOString());
    appUser = { id: appId };
  }

  const now = new Date().toISOString();
  let sent = 0;
  for (const user of allUsers) {
    const id = uuidv4();
    db.prepare('INSERT INTO messages (id, from_id, to_id, subject, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, appUser.id, user.id, subject || `Broadcast from ${from_app}`, body, now);
    sent++;
  }

  res.json({ sent, ok: true });
});

// ─── Discord Forwarding: Mirror Discord messages into spmt.live forum threads ───
// DSH calls this to forward messages. Each Discord channel maps to one forum thread.
app.post('/api/forum/forward', (req, res) => {
  const apiKey = req.headers['x-spmt-key'];
  if (apiKey !== process.env.SYSTEM_API_KEY) return res.status(401).json({ error: 'Invalid API key' });

  const { channelId, channelName, guildName, userName, userAvatar, message, attachments } = req.body;
  if (!channelId || (!message && !(attachments?.length))) return res.status(400).json({ error: 'channelId and message required' });

  // Find or create the thread for this channel
  let thread = db.prepare('SELECT id, title FROM forum_threads WHERE category = ?').get(`discord:${channelId}`) as any;

  if (!thread) {
    // Create thread mapped to this Discord channel
    const threadId = uuidv4();
    const title = channelName ? `#${channelName}` : `Discord Channel`;
    const now = new Date().toISOString();

    // Get or create a system user for the guild
    const botUsername = (guildName || 'discord').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'discord';
    let botUser = db.prepare('SELECT id FROM users WHERE username = ?').get(botUsername) as any;
    if (!botUser) {
      const botId = `app_${botUsername}`;
      db.prepare('INSERT OR IGNORE INTO users (id, username, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(botId, botUsername, `${botUsername}@spmt.live`, guildName || 'Discord', 'SYSTEM_NO_LOGIN', now);
      botUser = { id: botId };
    }

    db.prepare('INSERT INTO forum_threads (id, title, category, author_id, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(threadId, title, `discord:${channelId}`, botUser.id, now);

    thread = { id: threadId, title };
  }

  // Get or create user for the message author
  const authorUsername = (userName || 'unknown').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30) || 'unknown';
  let author = db.prepare('SELECT id FROM users WHERE username = ?').get(authorUsername) as any;
  if (!author) {
    const authorId = `discord_${authorUsername}_${Date.now().toString(36)}`;
    db.prepare('INSERT OR IGNORE INTO users (id, username, email, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(authorId, authorUsername, `${authorUsername}@discord`, userName || authorUsername, 'SYSTEM_NO_LOGIN', new Date().toISOString());
    author = { id: authorId };
  }

  // Post the message as a reply in the thread
  const postId = uuidv4();
  let body = message || '';
  if (attachments?.length) {
    const urls = attachments.map((a: any) => a.url || a.proxy_url).filter(Boolean);
    if (urls.length) body += (body ? '\n' : '') + urls.join('\n');
  }

  db.prepare('INSERT INTO forum_posts (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(postId, thread.id, author.id, body, new Date().toISOString());

  res.status(201).json({ success: true, threadId: thread.id, postId });
});

// ─── Forum: List threads (updated to hide internal discord: categories from public view) ───
app.get('/api/forum/threads', (req, res) => {
  const showDiscord = req.query.discord === 'true';
  const query = showDiscord
    ? 'SELECT t.id, t.title, t.category, t.created_at, u.username as author, (SELECT COUNT(*) FROM forum_posts WHERE thread_id = t.id) as post_count FROM forum_threads t JOIN users u ON t.author_id = u.id ORDER BY t.created_at DESC LIMIT 50'
    : `SELECT t.id, t.title, t.category, t.created_at, u.username as author, (SELECT COUNT(*) FROM forum_posts WHERE thread_id = t.id) as post_count FROM forum_threads t JOIN users u ON t.author_id = u.id WHERE t.category NOT LIKE 'discord:%' ORDER BY t.created_at DESC LIMIT 50`;
  const threads = db.prepare(query).all();
  res.json(threads);
});

// ─── Forum: List Discord-mirrored channels ───
app.get('/api/forum/discord-channels', (req, res) => {
  const threads = db.prepare(`
    SELECT t.id, t.title, t.category, t.created_at,
      (SELECT COUNT(*) FROM forum_posts WHERE thread_id = t.id) as post_count,
      (SELECT body FROM forum_posts WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
    FROM forum_threads t WHERE t.category LIKE 'discord:%' ORDER BY t.created_at DESC
  `).all();
  res.json(threads);
});

// ─── Arena: Shared PvP Rocket Battlefield ───
app.get('/api/arena/state', authenticate, (req: any, res) => {
  // Get all active players in the arena (active in last 10 seconds)
  const cutoff = new Date(Date.now() - 10000).toISOString();
  const players = db.prepare('SELECT * FROM arena_players WHERE last_seen > ?').all(cutoff);
  res.json({ players });
});

app.post('/api/arena/join', authenticate, (req: any, res) => {
  const existing = db.prepare('SELECT user_id FROM arena_players WHERE user_id = ?').get(req.user.id);
  if (!existing) {
    db.prepare('INSERT INTO arena_players (user_id, username, x, y, angle, hp, kills, deaths, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, req.user.username, Math.random() * 800, Math.random() * 600, 0, 100, 0, 0, new Date().toISOString());
  } else {
    db.prepare('UPDATE arena_players SET hp = 100, last_seen = ? WHERE user_id = ?')
      .run(new Date().toISOString(), req.user.id);
  }
  res.json({ joined: true });
});

app.post('/api/arena/update', authenticate, (req: any, res) => {
  const { x, y, angle } = req.body;
  db.prepare('UPDATE arena_players SET x = ?, y = ?, angle = ?, last_seen = ? WHERE user_id = ?')
    .run(x, y, angle, new Date().toISOString(), req.user.id);
  res.json({ ok: true });
});

app.post('/api/arena/shoot', authenticate, (req: any, res) => {
  const { targetId } = req.body;
  if (!targetId) return res.status(400).json({ error: 'targetId required' });

  const target = db.prepare('SELECT * FROM arena_players WHERE user_id = ?').get(targetId) as any;
  if (!target || target.hp <= 0) return res.status(400).json({ error: 'Invalid target' });

  const damage = 25;
  const newHp = Math.max(0, target.hp - damage);
  db.prepare('UPDATE arena_players SET hp = ? WHERE user_id = ?').run(newHp, targetId);

  let killed = false;
  if (newHp <= 0) {
    // Award kill to shooter
    db.prepare('UPDATE arena_players SET kills = kills + 1 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE arena_players SET deaths = deaths + 1, hp = 100, x = ?, y = ? WHERE user_id = ?')
      .run(Math.random() * 800, Math.random() * 600, targetId);
    // Award XP points via user table if exists
    db.prepare('UPDATE users SET display_name = display_name WHERE id = ?').run(req.user.id); // placeholder for points
    killed = true;
  }

  res.json({ hit: true, damage, killed, targetHp: newHp });
});

app.get('/api/arena/shop', authenticate, async (req: any, res) => {
  // Fetch user's points from Discord Stream Hub
  let dshPoints = 0;
  try {
    const dshRes = await fetch('https://discord-stream-hub-new.fly.dev/api/points/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DSH_BOT_KEY}` },
      body: JSON.stringify({ userId: req.user.id, username: req.user.username }),
    });
    if (dshRes.ok) { const d = await dshRes.json(); dshPoints = d.points || 0; }
  } catch {}

  res.json({
    balance: dshPoints,
    items: [
      { id: 'bullets-10', name: '10 Bullets', cost: 50, description: 'Standard ammo pack' },
      { id: 'missiles-3', name: '3 Missiles', cost: 150, description: 'High damage, slow fire' },
      { id: 'shield', name: 'Shield (30s)', cost: 200, description: 'Temporary invulnerability' },
      { id: 'speed-boost', name: 'Speed Boost', cost: 100, description: '2x speed for 20s' },
    ]
  });
});

app.get('/api/arena/leaderboard', (req, res) => {
  const leaders = db.prepare('SELECT username, kills, deaths FROM arena_players ORDER BY kills DESC LIMIT 20').all();
  res.json(leaders);
});

// ─── Static fallback (for minimal frontend later) ───
app.use(express.static('public'));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile('index.html', { root: 'public' });
});

// ─── Start ───
initDb();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`spmt.live running on http://localhost:${PORT}`);
});
