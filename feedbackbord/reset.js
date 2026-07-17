// Maakt cards.json leeg voor een oefenronde: npm run reset
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'cards.json');
const leeg = { fase: 'verzamelen', kaarten: [], stickersPerToken: {} };

fs.mkdirSync(dataDir, { recursive: true });
const tmp = `${dataFile}.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(leeg, null, 2));
fs.renameSync(tmp, dataFile);
console.log('cards.json is leeggemaakt. Herstart de server als die al draait.');
