(() => {
  const BASE = location.pathname.replace(/[^/]*$/, '');
  const UITLEG = {
    'Werkt goed': 'Iets dat prettig werkt en zo moet blijven.',
    'Bug / error': 'Er gaat echt iets stuk of er verschijnt een foutmelding.',
    'Data (incorrect, mist, overbodig)': 'Gegevens kloppen niet, ontbreken of zijn overbodig.',
    'Feature (gewenst, overbodig)': 'Functionaliteit die je mist, of juist niet nodig vindt.',
    'Onduidelijk': 'Je snapt niet wat er gebeurt of wat de bedoeling is.'
  };

  const formulier = document.getElementById('formulier');
  const tabbladSelect = document.getElementById('tabblad');
  const categorieSelect = document.getElementById('categorie');
  const uitlegEl = document.getElementById('categorie-uitleg');
  const tekstEl = document.getElementById('tekst');
  const tellerEl = document.getElementById('teller');
  const bevestiging = document.getElementById('bevestiging');
  const foutEl = document.getElementById('fout');

  let gekozenRol = null;

  fetch(BASE + 'api/bord').then(r => r.json()).then(data => {
    data.tabbladen.forEach(t => tabbladSelect.appendChild(new Option(t, t)));
    data.categorieen.forEach(c => categorieSelect.appendChild(new Option(c, c)));
    const qs = new URLSearchParams(location.search);
    if (data.tabbladen.includes(qs.get('tabblad'))) tabbladSelect.value = qs.get('tabblad');
    if (data.categorieen.includes(qs.get('categorie'))) {
      categorieSelect.value = qs.get('categorie');
      uitlegEl.textContent = UITLEG[categorieSelect.value] || '';
    }
    if (data.fase === 'bevroren') toonFout('Het bord is bevroren; er kunnen geen kaartjes meer bij.');
  }).catch(() => toonFout('Kan de server niet bereiken.'));

  document.querySelectorAll('.rol-knop').forEach(knop => {
    knop.addEventListener('click', () => {
      gekozenRol = knop.dataset.rol;
      document.querySelectorAll('.rol-knop').forEach(k =>
        k.classList.toggle('gekozen', k === knop));
    });
  });

  categorieSelect.addEventListener('change', () => {
    uitlegEl.textContent = UITLEG[categorieSelect.value] || '';
  });

  tekstEl.addEventListener('input', () => {
    tellerEl.textContent = `${tekstEl.value.length} / 180`;
    tellerEl.classList.toggle('vol', tekstEl.value.length >= 180);
  });

  function toonFout(tekst) {
    foutEl.textContent = tekst;
    foutEl.style.display = 'block';
    bevestiging.style.display = 'none';
  }

  formulier.addEventListener('submit', async e => {
    e.preventDefault();
    foutEl.style.display = 'none';
    if (!gekozenRol) return toonFout('Kies eerst je rol (geel of blauw).');

    try {
      const res = await fetch(BASE + 'api/kaarten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rol: gekozenRol,
          tabblad: tabbladSelect.value,
          categorie: categorieSelect.value,
          tekst: tekstEl.value
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toonFout(body.fout || 'Er ging iets mis, probeer het opnieuw.');

      formulier.reset();
      gekozenRol = null;
      document.querySelectorAll('.rol-knop').forEach(k => k.classList.remove('gekozen'));
      uitlegEl.textContent = '';
      tellerEl.textContent = '0 / 180';
      tellerEl.classList.remove('vol');
      bevestiging.style.display = 'block';
      setTimeout(() => { bevestiging.style.display = 'none'; }, 3500);
    } catch (err) {
      toonFout('Kan de server niet bereiken, probeer het opnieuw.');
    }
  });
})();
