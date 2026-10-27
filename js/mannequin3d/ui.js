// Mannequin postural 3D — interface praticien (curseurs, vues, peau / muscles).
import { CURSEURS, GROUPES, TABLEAUX, decrire, nettoyerValeurs } from './parametres.js';
import { creerMoteur, VUES } from './moteur.js';

const CSS = `
.m3d{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
.m3d-scene{flex:0 0 auto;width:min(100%,340px)}
.m3d-canvas-box{background:linear-gradient(#eef2f6,#dfe6ed);border:1px solid var(--bord,#d8dee5);border-radius:10px;overflow:hidden;position:relative;touch-action:none}
.m3d-canvas{display:block;width:100%;height:480px;cursor:grab}
.m3d-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#456;font-size:12px;padding:12px;text-align:center}
.m3d-vues,.m3d-barre{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.m3d-btn{border:1px solid var(--bord,#c9d1da);background:#fff;color:#223;border-radius:16px;padding:4px 12px;font-size:12px;cursor:pointer}
.m3d-btn.on{background:#2a7a4e;color:#fff;border-color:#2a7a4e}
.m3d-panel{flex:1 1 360px;min-width:300px;max-height:560px;overflow:auto}
.m3d-grp{border:1px solid var(--bord,#d8dee5);border-radius:8px;margin-bottom:6px;background:#fff}
.m3d-grp>summary{cursor:pointer;padding:7px 10px;font-weight:600;font-size:13px;color:#2a7a4e;display:flex;justify-content:space-between;align-items:center}
.m3d-row{padding:4px 10px 8px}
.m3d-row-top{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#223;gap:8px}
.m3d-row input[type=range]{width:100%;margin:2px 0}
.m3d-row input[type=number]{width:62px;font-size:12px;padding:1px 4px}
.m3d-fin{display:flex;justify-content:space-between;font-size:10px;color:#667}
.m3d-row.act .m3d-row-top span:first-child{font-weight:700;color:#b45309}
.m3d-cr{font-size:12px;color:#223;margin-top:8px;background:#f6faf7;border-radius:8px;padding:8px 10px}
.m3d-cr ul{margin:4px 0 0 16px;padding:0}
`;

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  kids.forEach((x) => e.append(x));
  return e;
}

export function monter(conteneur, { etat, onChange, sexeParDefaut = 'homme' } = {}) {
  if (!document.getElementById('m3d-css')) {
    const s = el('style', { id: 'm3d-css' });
    s.textContent = CSS;
    document.head.append(s);
  }
  const S = {
    sexe: (etat && etat.sexe) || sexeParDefaut,
    peau: etat ? etat.peau !== false : true,
    valeurs: Object.assign({}, etat && etat.valeurs),
  };
  let moteur = null,
    detruit = false;
  conteneur.textContent = '';
  const racine = el('div', { class: 'm3d' });
  const canvas = el('canvas', { class: 'm3d-canvas' });
  const msg = el('div', { class: 'm3d-msg' }, 'Chargement du mannequin 3D…');
  const boxCanvas = el('div', { class: 'm3d-canvas-box' }, canvas, msg);
  const btnSexe = {},
    btnVue = {};
  const barreSexe = el('div', { class: 'm3d-barre' });
  for (const [k, l] of [
    ['homme', 'Homme'],
    ['femme', 'Femme'],
  ]) {
    btnSexe[k] = el(
      'button',
      { class: 'm3d-btn', type: 'button', onclick: () => changerSexe(k) },
      l
    );
    barreSexe.append(btnSexe[k]);
  }
  const btnPeau = el('button', {
    class: 'm3d-btn',
    type: 'button',
    onclick: () => {
      S.peau = !S.peau;
      maj();
    },
  });
  barreSexe.append(btnPeau);
  const barreVues = el('div', { class: 'm3d-vues' });
  for (const k of ['face', 'profilD', 'dos', 'profilG']) {
    btnVue[k] = el(
      'button',
      {
        class: 'm3d-btn',
        type: 'button',
        onclick: () => {
          if (moteur) {
            moteur.vue(k);
            majVues();
          }
        },
      },
      VUES[k].label
    );
    barreVues.append(btnVue[k]);
  }
  const selTab = el(
    'select',
    { class: 'inp', style: 'font-size:12px;max-width:100%' },
    el('option', { value: '' }, '— Tableau type —')
  );
  for (const k in TABLEAUX) selTab.append(el('option', { value: k }, TABLEAUX[k].label));
  selTab.addEventListener('change', () => {
    if (!selTab.value) return;
    S.valeurs = Object.assign({}, TABLEAUX[selTab.value].valeurs);
    selTab.value = '';
    majCurseurs();
    maj();
  });
  const btnRaz = el(
    'button',
    {
      class: 'm3d-btn',
      type: 'button',
      onclick: () => {
        S.valeurs = {};
        majCurseurs();
        maj();
      },
    },
    '↺ Neutre'
  );
  const cr = el('div', { class: 'm3d-cr' });
  racine.append(
    el(
      'div',
      { class: 'm3d-scene' },
      barreSexe,
      boxCanvas,
      barreVues,
      el('div', { class: 'm3d-barre' }, selTab, btnRaz)
    )
  );
  const panel = el('div', { class: 'm3d-panel' });
  const lignes = {};
  for (const [gid, glabel] of GROUPES) {
    const cs = CURSEURS.filter((c) => c.groupe === gid);
    const d = el('details', { class: 'm3d-grp' });
    if (gid === 'tete') d.open = true;
    const sum = el('summary', {}, el('span', {}, glabel));
    if (cs.some((c) => c.cote)) {
      sum.append(
        el(
          'button',
          {
            class: 'm3d-btn',
            type: 'button',
            title: 'Copier les valeurs du côté droit sur le côté gauche',
            onclick: (e) => {
              e.preventDefault();
              for (const c of cs)
                if (c.cote === 'D') {
                  const g = CURSEURS.find((x) => x.id === c.id.slice(0, -1) + 'G');
                  if (g) S.valeurs[g.id] = S.valeurs[c.id] || 0;
                }
              majCurseurs();
              maj();
            },
          },
          'D = G'
        )
      );
    }
    d.append(sum);
    for (const c of cs) {
      const rng = el('input', { type: 'range', min: c.min, max: c.max, step: c.pas, value: 0 });
      const num = el('input', { type: 'number', min: c.min, max: c.max, step: c.pas, value: 0 });
      const set = (v) => {
        v = Math.max(c.min, Math.min(c.max, Number(v) || 0));
        if (v) S.valeurs[c.id] = v;
        else delete S.valeurs[c.id];
        majLigne(c.id);
        maj();
      };
      rng.addEventListener('input', () => set(rng.value));
      num.addEventListener('change', () => set(num.value));
      rng.addEventListener('dblclick', () => set(0));
      const row = el(
        'div',
        { class: 'm3d-row' },
        el(
          'div',
          { class: 'm3d-row-top' },
          el('span', {}, c.label),
          el('span', {}, num, ' ' + c.unite)
        ),
        rng,
        el(
          'div',
          { class: 'm3d-fin' },
          el('span', {}, (c.fin[0] || '') + ' ←'),
          el('span', {}, '0'),
          el('span', {}, '→ ' + (c.fin[1] || ''))
        )
      );
      lignes[c.id] = { row, rng, num };
      d.append(row);
    }
    panel.append(d);
  }
  racine.append(el('div', { style: 'flex:1 1 360px;min-width:300px' }, panel, cr));
  conteneur.append(racine);

  function majLigne(id) {
    const l = lignes[id],
      v = S.valeurs[id] || 0;
    l.rng.value = v;
    l.num.value = v;
    l.row.classList.toggle('act', !!v);
  }
  function majCurseurs() {
    for (const c of CURSEURS) majLigne(c.id);
  }
  function majVues() {
    for (const k in btnVue) btnVue[k].classList.toggle('on', !!moteur && moteur.etat.vue === k);
  }
  function majBoutons() {
    for (const k in btnSexe) btnSexe[k].classList.toggle('on', S.sexe === k);
    btnPeau.textContent = S.peau ? '💪 Retirer la peau (muscles)' : '🧍 Remettre la peau';
  }
  function maj() {
    majBoutons();
    if (moteur) {
      moteur.peau(S.peau);
      moteur.pose(S.valeurs);
      moteur.afficher();
    }
    const l = decrire(S.valeurs);
    cr.textContent = '';
    cr.append(el('strong', {}, 'Compte rendu du mannequin'));
    if (!l.length) cr.append(el('div', {}, 'Mannequin neutre : aucun écart saisi.'));
    else {
      const ul = el('ul');
      l.forEach((t) => ul.append(el('li', {}, t)));
      cr.append(ul);
    }
    if (onChange) onChange(etatCourant());
  }
  function etatCourant() {
    return { v: 1, sexe: S.sexe, peau: S.peau, valeurs: nettoyerValeurs(S.valeurs) };
  }
  async function changerSexe(k) {
    S.sexe = k;
    majBoutons();
    if (moteur) {
      msg.style.display = 'flex';
      await moteur.chargerSexe(k);
      msg.style.display = 'none';
      maj();
    } else if (onChange) onChange(etatCourant());
  }
  function ajusterTaille() {
    const w = boxCanvas.clientWidth || 340;
    moteur && moteur.taille(w, 480);
    moteur && moteur.afficher();
  }

  (async () => {
    try {
      moteur = await creerMoteur(canvas);
      if (detruit) {
        moteur.liberer();
        return;
      }
      moteur.etat.peau = S.peau;
      ajusterTaille();
      await moteur.chargerSexe(S.sexe);
      msg.style.display = 'none';
      moteur.vue('face');
      majVues();
      maj();
      let x0 = null;
      canvas.addEventListener('pointerdown', (e) => {
        x0 = e.clientX;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = 'grabbing';
      });
      canvas.addEventListener('pointermove', (e) => {
        if (x0 == null) return;
        moteur.tourner(-(e.clientX - x0) * 0.01);
        x0 = e.clientX;
        majVues();
      });
      const fin = () => {
        x0 = null;
        canvas.style.cursor = 'grab';
      };
      canvas.addEventListener('pointerup', fin);
      canvas.addEventListener('pointercancel', fin);
      window.addEventListener('resize', ajusterTaille);
    } catch (e) {
      msg.style.display = 'flex';
      msg.textContent = 'Mannequin 3D indisponible : ' + (e && e.message ? e.message : e);
      if (typeof console !== 'undefined') console.warn('[mannequin3d]', e);
    }
  })();
  majCurseurs();
  majBoutons();
  const l0 = decrire(S.valeurs);
  if (l0.length) maj();

  return {
    etat: etatCourant,
    definir(e) {
      S.sexe = (e && e.sexe) || sexeParDefaut;
      S.peau = e ? e.peau !== false : true;
      S.valeurs = Object.assign({}, e && e.valeurs);
      majCurseurs();
      if (moteur) moteur.chargerSexe(S.sexe).then(maj);
      else majBoutons();
    },
    detruire() {
      detruit = true;
      window.removeEventListener('resize', ajusterTaille);
      if (moteur) moteur.liberer();
      conteneur.textContent = '';
    },
  };
}
