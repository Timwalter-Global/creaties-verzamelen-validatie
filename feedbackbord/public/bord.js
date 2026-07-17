(() => {
  const FACILITATOR = new URLSearchParams(location.search).get('facilitator') === '1';
  const MAX_ZICHTBAAR_PER_CEL = 3;
  const PILL_KLASSEN = ['pill-groen', 'pill-rood', 'pill-grijs', 'pill-blauw', 'pill-amber'];
  const KORTE_KOLOM = ['Werkt goed', 'Bug / error', 'Data', 'Feature', 'Onduidelijk'];

  let token = localStorage.getItem('feedbackbord-token');
  if (!token) {
    token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('feedbackbord-token', token);
  }

  const bordEl = document.getElementById('bord');
  const faseBanner = document.getElementById('fase-banner');
  const overlay = document.getElementById('overlay');
  const meldingEl = document.getElementById('melding');

  let data = null;
  let openCel = null; // {tabblad, categorie} van de uitvergrote cel

  if (FACILITATOR) {
    document.body.classList.add('facilitator');
    document.getElementById('facilitator-balk').classList.add('actief');
  }
  document.getElementById('join-url').textContent =
    location.origin.replace(/^https?:\/\//, '') + '/join';

  let meldingTimer;
  function meld(tekst) {
    meldingEl.textContent = tekst;
    meldingEl.classList.add('zichtbaar');
    clearTimeout(meldingTimer);
    meldingTimer = setTimeout(() => meldingEl.classList.remove('zichtbaar'), 2200);
  }

  function rotatie(id) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return ((Math.abs(h) % 50) / 10 - 2.5).toFixed(1);
  }

  async function apiCall(url, opties) {
    const res = await fetch(url + (FACILITATOR ? (url.includes('?') ? '&' : '?') + 'facilitator=1' : ''), opties);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.fout || 'Er ging iets mis.');
    return body;
  }

  function maakKaartEl(kaart, groot) {
    const el = document.createElement('div');
    el.className = `kaart kaart-${kaart.rol}`;
    el.style.transform = `rotate(${rotatie(kaart.id)}deg)`;
    el.dataset.id = kaart.id;

    const tekst = document.createElement('div');
    tekst.textContent = kaart.tekst;
    tekst.style.paddingBottom = kaart.stickers > 0 ? '0.4rem' : '0';
    el.appendChild(tekst);

    if (kaart.stickers > 0) {
      const stickers = document.createElement('div');
      stickers.className = 'stickers';
      if (kaart.stickers <= 5) {
        for (let i = 0; i < kaart.stickers; i++) {
          const stip = document.createElement('span');
          stip.className = 'stip';
          stickers.appendChild(stip);
        }
      } else {
        const stip = document.createElement('span');
        stip.className = 'stip';
        const aantal = document.createElement('span');
        aantal.className = 'stip-aantal';
        aantal.textContent = `×${kaart.stickers}`;
        stickers.append(stip, aantal);
      }
      el.appendChild(stickers);
    }

    if (FACILITATOR) {
      const weg = document.createElement('button');
      weg.className = 'verwijder';
      weg.textContent = '×';
      weg.title = 'Kaartje verwijderen';
      weg.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Dit kaartje verwijderen?')) return;
        try {
          await apiCall(`/api/kaarten/${kaart.id}`, { method: 'DELETE' });
          await vernieuw();
        } catch (err) { meld(err.message); }
      });
      el.appendChild(weg);

      el.draggable = true;
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', kaart.id);
        e.stopPropagation();
      });
    }

    if (data && data.fase === 'stickeren') {
      el.addEventListener('click', async e => {
        e.stopPropagation();
        try {
          const uit = await apiCall(`/api/kaarten/${kaart.id}/sticker`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
          meld(`Sticker geplakt · nog ${uit.stickersOver} over`);
          await vernieuw();
        } catch (err) { meld(err.message); }
      });
    }
    return el;
  }

  function maakCel(tabblad, categorie, kaarten) {
    const cel = document.createElement('div');
    cel.className = 'cel';
    const zichtbaar = kaarten.slice(0, MAX_ZICHTBAAR_PER_CEL);
    zichtbaar.forEach(k => cel.appendChild(maakKaartEl(k, false)));
    if (kaarten.length > MAX_ZICHTBAAR_PER_CEL) {
      const meer = document.createElement('span');
      meer.className = 'meer';
      meer.textContent = `+${kaarten.length - MAX_ZICHTBAAR_PER_CEL} meer`;
      cel.appendChild(meer);
    }
    cel.addEventListener('click', () => {
      openCel = { tabblad, categorie };
      renderOverlay();
    });

    if (FACILITATOR) {
      cel.addEventListener('dragover', e => { e.preventDefault(); cel.classList.add('sleep-doel'); });
      cel.addEventListener('dragleave', () => cel.classList.remove('sleep-doel'));
      cel.addEventListener('drop', async e => {
        e.preventDefault();
        cel.classList.remove('sleep-doel');
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        try {
          await apiCall(`/api/kaarten/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tabblad, categorie })
          });
          await vernieuw();
        } catch (err) { meld(err.message); }
      });
    }
    return cel;
  }

  function renderBord() {
    bordEl.innerHTML = '';

    bordEl.appendChild(document.createElement('div')); // lege hoekcel
    data.categorieen.forEach((cat, i) => {
      const kop = document.createElement('div');
      kop.className = 'kolomkop';
      const pill = document.createElement('span');
      pill.className = `pill ${PILL_KLASSEN[i]}`;
      pill.textContent = KORTE_KOLOM[i] || cat;
      pill.title = cat;
      kop.appendChild(pill);
      bordEl.appendChild(kop);
    });

    data.tabbladen.forEach(tab => {
      const rijkop = document.createElement('div');
      rijkop.className = 'rijkop';
      rijkop.textContent = tab;
      bordEl.appendChild(rijkop);
      data.categorieen.forEach(cat => {
        const kaarten = data.kaarten.filter(k => k.tabblad === tab && k.categorie === cat);
        bordEl.appendChild(maakCel(tab, cat, kaarten));
      });
    });
  }

  function renderFase() {
    document.body.classList.toggle('stickeren', data.fase === 'stickeren');
    faseBanner.className = data.fase === 'verzamelen' ? '' : data.fase;
    if (data.fase === 'stickeren') {
      faseBanner.textContent = FACILITATOR
        ? 'Stickerfase actief — deelnemers verdelen hun stickers'
        : `Stickerfase — tik op kaartjes om te stemmen (nog ${data.stickersOver} van ${data.maxStickers} stickers)`;
    } else if (data.fase === 'bevroren') {
      faseBanner.textContent = 'Het bord is bevroren — geen nieuwe kaartjes of stickers';
    }
    if (FACILITATOR) {
      document.getElementById('knop-stickeren').disabled = data.fase === 'stickeren';
      document.getElementById('knop-bevriezen').disabled = data.fase === 'bevroren';
      document.getElementById('knop-verzamelen').disabled = data.fase === 'verzamelen';
    }
  }

  function renderOverlay() {
    if (!openCel) { overlay.classList.remove('open'); return; }
    const { tabblad, categorie } = openCel;
    const kaarten = data.kaarten.filter(k => k.tabblad === tabblad && k.categorie === categorie);
    document.getElementById('overlay-rij').textContent = tabblad;
    const i = data.categorieen.indexOf(categorie);
    const kolomEl = document.getElementById('overlay-kolom');
    kolomEl.innerHTML = '';
    const pill = document.createElement('span');
    pill.className = `pill ${PILL_KLASSEN[i] || 'pill-grijs'}`;
    pill.textContent = categorie;
    kolomEl.appendChild(pill);
    const houder = document.getElementById('overlay-kaarten');
    houder.innerHTML = '';
    kaarten.forEach(k => houder.appendChild(maakKaartEl(k, true)));
    if (kaarten.length === 0) {
      openCel = null;
    }
    overlay.classList.toggle('open', openCel !== null);
  }

  overlay.addEventListener('click', e => {
    if (e.target === overlay) { openCel = null; renderOverlay(); }
  });
  document.getElementById('overlay-sluit').addEventListener('click', () => {
    openCel = null;
    renderOverlay();
  });

  if (FACILITATOR) {
    const zetFase = fase => async () => {
      try {
        await apiCall('/api/fase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fase })
        });
        await vernieuw();
      } catch (err) { meld(err.message); }
    };
    document.getElementById('knop-stickeren').addEventListener('click', zetFase('stickeren'));
    document.getElementById('knop-bevriezen').addEventListener('click', zetFase('bevroren'));
    document.getElementById('knop-verzamelen').addEventListener('click', zetFase('verzamelen'));
  }

  async function vernieuw() {
    try {
      const res = await fetch(`/api/bord?token=${encodeURIComponent(token)}`);
      if (!res.ok) return;
      data = await res.json();
    } catch (err) {
      return; // server even niet bereikbaar; volgende poll probeert opnieuw
    }
    renderFase();
    renderBord();
    if (openCel) renderOverlay();
  }

  vernieuw();
  setInterval(vernieuw, 3000);
})();
