// WhatsApp Sheet Bot — web server version
//
// Exposes POST /send so Google Apps Script (or anything else) can trigger a WhatsApp
// group message over plain HTTP, instead of running a one-off CLI command.
//
// Run: node server.js
// First run still needs the QR scan if ./auth doesn't already have a session
// (if you already scanned via index.js, it'll reuse that session — no rescan needed).
//
// Test it locally once running:
//   curl -X POST http://localhost:3000/send -H "Content-Type: application/json" -d "{\"message\":\"hello from curl\"}"

import express from 'express';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import pino from 'pino';

const AUTH_FOLDER = './auth';
const PORT = process.env.PORT || 3000;

// 🔧 Set this to your group's JID (get it from `node index.js`)
const GROUP_JID = process.env.GROUP_JID || '120363426707739092@g.us';

// 🔧 Simple shared-secret check so randoms on the internet can't use your bot
// once this is deployed publicly. Set this to any string you like.
const SHARED_SECRET = process.env.SHARED_SECRET || 'change-me-to-a-real-secret';

let sock;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();
  console.log(`Using WhatsApp Web version ${version.join('.')}`);

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'warn' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan this QR code with WhatsApp (Linked Devices):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `WhatsApp connection closed. statusCode=${statusCode} reason="${lastDisconnect?.error?.message}"`,
        shouldReconnect ? 'Reconnecting in 5s...' : 'Logged out — delete ./auth and re-scan.'
      );
      if (shouldReconnect) setTimeout(startSock, 5000);
    } else if (connection === 'open') {
      console.log('✅ Connected to WhatsApp.');
    }
  });
}

const app = express();
app.use(express.json());

app.post('/send', async (req, res) => {
  try {
    const { message, secret } = req.body;

    if (secret !== SHARED_SECRET) {
      return res.status(401).json({ ok: false, error: 'Invalid secret' });
    }
    if (!message) {
      return res.status(400).json({ ok: false, error: 'Missing "message" in request body' });
    }
    if (!sock) {
      return res.status(503).json({ ok: false, error: 'WhatsApp not connected yet' });
    }

    await sock.sendMessage(GROUP_JID, { text: message });
    console.log(`Sent: "${message}"`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Send failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true, connected: !!sock }));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startSock();
});// WhatsApp Sheet Bot — web server version
//
// Exposes POST /send so Google Apps Script (or anything else) can trigger a WhatsApp
// group message over plain HTTP, instead of running a one-off CLI command.
//
// Run: node server.js
// First run still needs the QR scan if ./auth doesn't already have a session
// (if you already scanned via index.js, it'll reuse that session — no rescan needed).
//
// Test it locally once running:
//   curl -X POST http://localhost:3000/send -H "Content-Type: application/json" -d "{\"message\":\"hello from curl\"}"

import express from 'express';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import pino from 'pino';

const AUTH_FOLDER = './auth';
const PORT = process.env.PORT || 3000;

// 🔧 Set this to your group's JID (get it from `node index.js`)
const GROUP_JID = process.env.GROUP_JID || '120363426707739092@g.us';

// 🔧 Simple shared-secret check so randoms on the internet can't use your bot
// once this is deployed publicly. Set this to any string you like.
const SHARED_SECRET = process.env.SHARED_SECRET || 'change-me-to-a-real-secret';

let sock;

async function startSock() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan this QR code with WhatsApp (Linked Devices):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('WhatsApp connection closed.', shouldReconnect ? 'Reconnecting...' : 'Logged out — delete ./auth and re-scan.');
      if (shouldReconnect) startSock();
    } else if (connection === 'open') {
      console.log('✅ Connected to WhatsApp.');
    }
  });
}

const app = express();
app.use(express.json());

app.post('/send', async (req, res) => {
  try {
    const { message, secret } = req.body;

    if (secret !== SHARED_SECRET) {
      return res.status(401).json({ ok: false, error: 'Invalid secret' });
    }
    if (!message) {
      return res.status(400).json({ ok: false, error: 'Missing "message" in request body' });
    }
    if (!sock) {
      return res.status(503).json({ ok: false, error: 'WhatsApp not connected yet' });
    }

    await sock.sendMessage(GROUP_JID, { text: message });
    console.log(`Sent: "${message}"`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Send failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true, connected: !!sock }));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startSock();
});
