// Bundelt de frontend uit public/ in de edge function: node edge/build-edge.js
// Resultaat: edge/index.ts (de te deployen Supabase Edge Function).
const fs = require('fs');
const path = require('path');

const publiek = p => fs.readFileSync(path.join(__dirname, '..', 'public', p), 'utf8');

function bundel(htmlBestand) {
  let html = publiek(htmlBestand);
  html = html.replace('<link rel="stylesheet" href="stijl.css">',
    `<style>\n${publiek('stijl.css')}\n</style>`);
  for (const js of ['bord.js', 'join.js']) {
    html = html.replace(`<script src="${js}"></script>`,
      `<script>\n${publiek(js)}\n</script>`);
  }
  return html;
}

let uit = fs.readFileSync(path.join(__dirname, 'template.ts'), 'utf8');
uit = uit.replace('__BORD_HTML__', JSON.stringify(bundel('index.html')));
uit = uit.replace('__JOIN_HTML__', JSON.stringify(bundel('join.html')));
fs.writeFileSync(path.join(__dirname, 'index.ts'), uit);
console.log(`edge/index.ts gegenereerd (${uit.length} tekens)`);
