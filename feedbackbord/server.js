const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'cards.json');

const TABBLADEN = [
  'Sprint planning',
  'Lead-overzicht',
  'Mijn sprint',
  'Sprint live',
  'Sprint historie',
  'Algemeen / proces'
];

const CATEGORIEEN = [
  'Werkt goed',
  'Bug / error',
  'Data (incorrect, mist, overbodig)',
  'Feature (gewenst, overbodig)',
  'Onduidelijk'
];

const ROLLEN = ['accountmanager', 'teammanager'];
const FASEN = ['verzamelen', 'stickeren', 'bevroren'];
const MAX_STICKERS_PER_DEELNEMER = 3;
const MAX_TEKST = 180;

// ---------------------------------------------------------------------------
// Staat en persistentie (één JSON-bestand, atomisch weggeschreven)
// ---------------------------------------------------------------------------

function legeStaat() {
  return { fase: 'verzamelen', kaarten: [], stickersPerToken: {} };
}

let staat = legeStaat();

function laadStaat() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    staat = {
      fase: FASEN.includes(data.fase) ? data.fase : 'verzamelen',
      kaarten: Array.isArray(data.kaarten) ? data.kaarten : [],
      stickersPerToken: data.stickersPerToken && typeof data.stickersPerToken === 'object'
        ? data.stickersPerToken
        : {}
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Kon ${DATA_FILE} niet lezen (${err.message}), start met leeg bord.`);
    }
    staat = legeStaat();
  }
}

// Schrijfacties worden geserialiseerd zodat gelijktijdige posts elkaar niet
// doorkruisen; elke write gaat via een tijdelijk bestand plus rename.
let schrijfKetting = Promise.resolve();
function bewaarStaat() {
  const snapshot = JSON.stringify(staat, null, 2);
  schrijfKetting = schrijfKetting.then(async () => {
    const tmp = `${DATA_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fsp.writeFile(tmp, snapshot, 'utf8');
    await fsp.rename(tmp, DATA_FILE);
  }).catch(err => console.error('Opslaan mislukt:', err.message));
  return schrijfKetting;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
laadStaat();

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function isFacilitator(req) {
  return req.query.facilitator === '1';
}

function stickersGebruikt(token) {
  return staat.stickersPerToken[token] || 0;
}

app.get('/join', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'join.html'));
});

// Bordgegevens; de client pollt dit elke 3 seconden.
app.get('/api/bord', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  res.json({
    fase: staat.fase,
    kaarten: staat.kaarten,
    tabbladen: TABBLADEN,
    categorieen: CATEGORIEEN,
    stickersOver: Math.max(0, MAX_STICKERS_PER_DEELNEMER - stickersGebruikt(token)),
    maxStickers: MAX_STICKERS_PER_DEELNEMER
  });
});

app.post('/api/kaarten', async (req, res) => {
  if (staat.fase === 'bevroren') {
    return res.status(409).json({ fout: 'Het bord is bevroren, er kunnen geen kaartjes meer bij.' });
  }
  const { tekst, rol, tabblad, categorie } = req.body || {};
  if (typeof tekst !== 'string' || !tekst.trim()) {
    return res.status(400).json({ fout: 'Tekst ontbreekt.' });
  }
  if (tekst.trim().length > MAX_TEKST) {
    return res.status(400).json({ fout: `Tekst is langer dan ${MAX_TEKST} tekens.` });
  }
  if (!ROLLEN.includes(rol)) {
    return res.status(400).json({ fout: 'Ongeldige rol.' });
  }
  if (!TABBLADEN.includes(tabblad)) {
    return res.status(400).json({ fout: 'Ongeldig tabblad.' });
  }
  if (!CATEGORIEEN.includes(categorie)) {
    return res.status(400).json({ fout: 'Ongeldige categorie.' });
  }
  const kaart = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    tekst: tekst.trim(),
    rol,
    tabblad,
    categorie,
    stickers: 0
  };
  staat.kaarten.push(kaart);
  await bewaarStaat();
  res.status(201).json(kaart);
});

app.post('/api/kaarten/:id/sticker', async (req, res) => {
  if (staat.fase !== 'stickeren') {
    return res.status(409).json({ fout: 'De stickerfase is niet actief.' });
  }
  const token = req.body && typeof req.body.token === 'string' ? req.body.token : '';
  if (!token) {
    return res.status(400).json({ fout: 'Token ontbreekt.' });
  }
  if (stickersGebruikt(token) >= MAX_STICKERS_PER_DEELNEMER) {
    return res.status(409).json({ fout: `Je hebt al ${MAX_STICKERS_PER_DEELNEMER} stickers uitgedeeld.` });
  }
  const kaart = staat.kaarten.find(k => k.id === req.params.id);
  if (!kaart) {
    return res.status(404).json({ fout: 'Kaartje niet gevonden.' });
  }
  kaart.stickers += 1;
  staat.stickersPerToken[token] = stickersGebruikt(token) + 1;
  await bewaarStaat();
  res.json({ kaart, stickersOver: MAX_STICKERS_PER_DEELNEMER - stickersGebruikt(token) });
});

app.delete('/api/kaarten/:id', async (req, res) => {
  if (!isFacilitator(req)) {
    return res.status(403).json({ fout: 'Alleen voor de facilitator.' });
  }
  const index = staat.kaarten.findIndex(k => k.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ fout: 'Kaartje niet gevonden.' });
  }
  staat.kaarten.splice(index, 1);
  await bewaarStaat();
  res.json({ ok: true });
});

// Kaartje verplaatsen naar een andere cel (facilitator, drag & drop).
app.patch('/api/kaarten/:id', async (req, res) => {
  if (!isFacilitator(req)) {
    return res.status(403).json({ fout: 'Alleen voor de facilitator.' });
  }
  const kaart = staat.kaarten.find(k => k.id === req.params.id);
  if (!kaart) {
    return res.status(404).json({ fout: 'Kaartje niet gevonden.' });
  }
  const { tabblad, categorie } = req.body || {};
  if (tabblad !== undefined) {
    if (!TABBLADEN.includes(tabblad)) return res.status(400).json({ fout: 'Ongeldig tabblad.' });
    kaart.tabblad = tabblad;
  }
  if (categorie !== undefined) {
    if (!CATEGORIEEN.includes(categorie)) return res.status(400).json({ fout: 'Ongeldige categorie.' });
    kaart.categorie = categorie;
  }
  await bewaarStaat();
  res.json(kaart);
});

app.post('/api/fase', async (req, res) => {
  if (!isFacilitator(req)) {
    return res.status(403).json({ fout: 'Alleen voor de facilitator.' });
  }
  const { fase } = req.body || {};
  if (!FASEN.includes(fase)) {
    return res.status(400).json({ fout: 'Ongeldige fase.' });
  }
  staat.fase = fase;
  await bewaarStaat();
  res.json({ fase: staat.fase });
});

function gesorteerdeKaarten() {
  return [...staat.kaarten].sort((a, b) =>
    b.stickers - a.stickers || a.timestamp.localeCompare(b.timestamp));
}

app.get('/api/export.json', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="feedbackbord-export.json"');
  res.json(gesorteerdeKaarten());
});

app.get('/api/export.csv', (req, res) => {
  const csvVeld = v => `"${String(v).replace(/"/g, '""')}"`;
  const kolommen = ['id', 'timestamp', 'rol', 'tabblad', 'categorie', 'tekst', 'stickers'];
  const regels = [kolommen.join(';')].concat(
    gesorteerdeKaarten().map(k => kolommen.map(c => csvVeld(k[c])).join(';'))
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="feedbackbord-export.csv"');
  res.send('\ufeff' + regels.join('\r\n'));
});

app.get('/qr.svg', async (req, res) => {
  try {
    const svg = await QRCode.toString(joinUrl(), { type: 'svg', margin: 1, width: 220 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (err) {
    res.status(500).send('QR-code kon niet worden gemaakt.');
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

function lokaalIp() {
  for (const netjes of Object.values(os.networkInterfaces())) {
    for (const nic of netjes || []) {
      if (nic.family === 'IPv4' && !nic.internal) return nic.address;
    }
  }
  return 'localhost';
}

function joinUrl() {
  return `http://${lokaalIp()}:${PORT}/join`;
}

app.listen(PORT, '0.0.0.0', async () => {
  const bordUrl = `http://${lokaalIp()}:${PORT}/`;
  console.log('');
  console.log('Feedbackbord draait.');
  console.log(`  Bord (beamer):      ${bordUrl}`);
  console.log(`  Bord (facilitator): ${bordUrl}?facilitator=1`);
  console.log(`  Deelnemers:         ${joinUrl()}`);
  console.log('');
  console.log('Scan om mee te doen (zelfde wifi-netwerk):');
  try {
    console.log(await QRCode.toString(joinUrl(), { type: 'terminal', small: true }));
  } catch (err) {
    console.log('  (QR-code kon niet worden getoond)');
  }
});
