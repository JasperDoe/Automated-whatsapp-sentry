// WhatsApp Sheet Bot — web server version
//
// Exposes POST /send so Google Apps Script (or anything else) can trigger a WhatsApp
// group message over plain HTTP, instead of running a one-off CLI command.

import express from 'express';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import pino from 'pino';

const AUTH_FOLDER = './auth';
const PORT = process.env.PORT || 3000;

const GROUP_JID = process.env.GROUP_JID || '120363426707739092@g.us';
const SHARED_SECRET = process.env.SHARED_SECRET || 'deer';

let sock;
let latestQr = null;

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
      latestQr = qr;
      console.log('\nNew QR generated — view it at your-render-url/qr\n');
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
      latestQr = null;
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

app.get('/qr', async (req, res) => {
  if (!latestQr) {
    return res.send('<h2>No QR right now — either already connected, or still starting up. Refresh in a few seconds.</h2><script>setTimeout(()=>location.reload(),3000)</script>');
  }
  try {
    const dataUrl = await QRCode.toDataURL(latestQr, { width: 500, margin: 2 });
    res.send(`
      <html>
        <head><meta http-equiv="refresh" content="20"></head>
        <body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;margin-top:40px;">
          <h2>Scan with WhatsApp → Linked Devices</h2>
          <img src="${dataUrl}" />
          <p>This page auto-refreshes every 20s in case the code expires.</p>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error rendering QR: ' + err.message);
  }
});

// Keep-alive: ping ourselves every 10 minutes so Render's free tier never spins
// this instance down (which would wipe the WhatsApp session in ./auth).
function startKeepAlive() {
  const selfUrl = process.env.RENDER_EXTERNAL_URL;
  if (!selfUrl) {
    console.log('RENDER_EXTERNAL_URL not set — skipping self-ping (fine for local dev).');
    return;
  }
  setInterval(async () => {
    try {
      await fetch(`${selfUrl}/health`);
      console.log('Keep-alive ping sent.');
    } catch (err) {
      console.log('Keep-alive ping failed:', err.message);
    }
  }, 10 * 60 * 1000); // every 10 minutes
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startSock();
  startKeepAlive();
});
