// Feedbackbord als Supabase Edge Function.
// NIET met de hand bewerken: gegenereerd door build-edge.js uit public/ en dit template.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { renderSVG } from 'npm:uqr@0.1.2';

const BORD_HTML: string = __BORD_HTML__;
const JOIN_HTML: string = __JOIN_HTML__;

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

const KAART_VELDEN = 'id, timestamp:aangemaakt, tekst, rol, tabblad, categorie, stickers';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function fout(status: number, tekst: string): Response {
  return json({ fout: tekst }, status);
}

function html(body: string): Response {
  return new Response(body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

async function huidigeFase(): Promise<string> {
  const { data } = await db.from('fb_instellingen').select('fase').eq('id', 1).single();
  return data?.fase ?? 'verzamelen';
}

async function alleKaarten() {
  const { data, error } = await db.from('fb_kaarten').select(KAART_VELDEN)
    .order('aangemaakt', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

function csvExport(kaarten: Record<string, unknown>[]): string {
  const veld = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const kolommen = ['id', 'timestamp', 'rol', 'tabblad', 'categorie', 'tekst', 'stickers'];
  const regels = [kolommen.join(';')].concat(
    kaarten.map(k => kolommen.map(c => veld(k[c])).join(';'))
  );
  return '\ufeff' + regels.join('\r\n');
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  // Pad na de functienaam, zodat zowel /feedbackbord als /functions/v1/feedbackbord werkt.
  const pad = url.pathname.replace(/^.*?\/feedbackbord/, '');
  const facilitator = url.searchParams.get('facilitator') === '1';

  try {
    if (pad === '' && req.method === 'GET') {
      return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);
    }
    if (pad === '/' && req.method === 'GET') return html(BORD_HTML);
    if (pad === '/join' && req.method === 'GET') return html(JOIN_HTML);

    if (pad === '/qr.svg' && req.method === 'GET') {
      const joinUrl = url.origin + url.pathname.replace(/qr\.svg$/, 'join');
      return new Response(renderSVG(joinUrl), {
        headers: { 'Content-Type': 'image/svg+xml' }
      });
    }

    if (pad === '/api/bord' && req.method === 'GET') {
      const token = url.searchParams.get('token') ?? '';
      let gebruikt = 0;
      if (token) {
        const { data } = await db.from('fb_sticker_tokens').select('gebruikt').eq('token', token).maybeSingle();
        gebruikt = data?.gebruikt ?? 0;
      }
      return json({
        fase: await huidigeFase(),
        kaarten: await alleKaarten(),
        tabbladen: TABBLADEN,
        categorieen: CATEGORIEEN,
        stickersOver: Math.max(0, MAX_STICKERS_PER_DEELNEMER - gebruikt),
        maxStickers: MAX_STICKERS_PER_DEELNEMER
      });
    }

    if (pad === '/api/kaarten' && req.method === 'POST') {
      if (await huidigeFase() === 'bevroren') {
        return fout(409, 'Het bord is bevroren, er kunnen geen kaartjes meer bij.');
      }
      const body = await req.json().catch(() => ({}));
      const tekst = typeof body.tekst === 'string' ? body.tekst.trim() : '';
      if (!tekst) return fout(400, 'Tekst ontbreekt.');
      if (tekst.length > MAX_TEKST) return fout(400, `Tekst is langer dan ${MAX_TEKST} tekens.`);
      if (!ROLLEN.includes(body.rol)) return fout(400, 'Ongeldige rol.');
      if (!TABBLADEN.includes(body.tabblad)) return fout(400, 'Ongeldig tabblad.');
      if (!CATEGORIEEN.includes(body.categorie)) return fout(400, 'Ongeldige categorie.');
      const { data, error } = await db.from('fb_kaarten')
        .insert({ tekst, rol: body.rol, tabblad: body.tabblad, categorie: body.categorie })
        .select(KAART_VELDEN).single();
      if (error) throw new Error(error.message);
      return json(data, 201);
    }

    const stickerMatch = pad.match(/^\/api\/kaarten\/([0-9a-f-]{36})\/sticker$/);
    if (stickerMatch && req.method === 'POST') {
      if (await huidigeFase() !== 'stickeren') return fout(409, 'De stickerfase is niet actief.');
      const body = await req.json().catch(() => ({}));
      const token = typeof body.token === 'string' ? body.token : '';
      if (!token) return fout(400, 'Token ontbreekt.');
      const { data, error } = await db.rpc('fb_plak_sticker', {
        p_kaart: stickerMatch[1], p_token: token, p_max: MAX_STICKERS_PER_DEELNEMER
      });
      if (error) {
        if (error.message.includes('sticker_limiet')) {
          return fout(409, `Je hebt al ${MAX_STICKERS_PER_DEELNEMER} stickers uitgedeeld.`);
        }
        if (error.message.includes('kaart_niet_gevonden')) return fout(404, 'Kaartje niet gevonden.');
        throw new Error(error.message);
      }
      const rij = Array.isArray(data) ? data[0] : data;
      return json({ kaart: { stickers: rij.kaart_stickers }, stickersOver: rij.stickers_over });
    }

    const kaartMatch = pad.match(/^\/api\/kaarten\/([0-9a-f-]{36})$/);
    if (kaartMatch && req.method === 'DELETE') {
      if (!facilitator) return fout(403, 'Alleen voor de facilitator.');
      const { data, error } = await db.from('fb_kaarten').delete().eq('id', kaartMatch[1]).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) return fout(404, 'Kaartje niet gevonden.');
      return json({ ok: true });
    }

    if (kaartMatch && req.method === 'PATCH') {
      if (!facilitator) return fout(403, 'Alleen voor de facilitator.');
      const body = await req.json().catch(() => ({}));
      const wijziging: Record<string, string> = {};
      if (body.tabblad !== undefined) {
        if (!TABBLADEN.includes(body.tabblad)) return fout(400, 'Ongeldig tabblad.');
        wijziging.tabblad = body.tabblad;
      }
      if (body.categorie !== undefined) {
        if (!CATEGORIEEN.includes(body.categorie)) return fout(400, 'Ongeldige categorie.');
        wijziging.categorie = body.categorie;
      }
      const { data, error } = await db.from('fb_kaarten').update(wijziging)
        .eq('id', kaartMatch[1]).select(KAART_VELDEN).single();
      if (error || !data) return fout(404, 'Kaartje niet gevonden.');
      return json(data);
    }

    if (pad === '/api/fase' && req.method === 'POST') {
      if (!facilitator) return fout(403, 'Alleen voor de facilitator.');
      const body = await req.json().catch(() => ({}));
      if (!FASEN.includes(body.fase)) return fout(400, 'Ongeldige fase.');
      const { error } = await db.from('fb_instellingen').update({ fase: body.fase }).eq('id', 1);
      if (error) throw new Error(error.message);
      return json({ fase: body.fase });
    }

    if ((pad === '/api/export.json' || pad === '/api/export.csv') && req.method === 'GET') {
      const kaarten = (await alleKaarten()).sort((a: { stickers: number; timestamp: string }, b: { stickers: number; timestamp: string }) =>
        b.stickers - a.stickers || a.timestamp.localeCompare(b.timestamp));
      if (pad === '/api/export.json') {
        return new Response(JSON.stringify(kaarten, null, 2), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': 'attachment; filename="feedbackbord-export.json"'
          }
        });
      }
      return new Response(csvExport(kaarten), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="feedbackbord-export.csv"'
        }
      });
    }

    return fout(404, 'Niet gevonden.');
  } catch (err) {
    console.error(err);
    return fout(500, 'Serverfout, probeer het opnieuw.');
  }
});
