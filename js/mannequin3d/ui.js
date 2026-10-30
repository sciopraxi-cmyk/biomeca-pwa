// Mannequin postural 3D — interface praticien (curseurs, vues, peau / muscles).
import {
  CURSEURS,
  GROUPES,
  TABLEAUX,
  CATEGORIES_TABLEAUX,
  appliquerTableau,
  BUILD,
  PAR_ID,
  decrire,
  nettoyerValeurs,
} from './parametres.js?v=v326';
import { creerMoteur, VUES } from './moteur.js?v=v326';
import { interpreter, EXEMPLES } from './dictee.js?v=v326';
import {
  evaluer,
  htmlHypothese,
  htmlPrudence,
  htmlSynthese,
  reglesManuelles,
} from './mecanismes.js?v=v326';
import { evaluerProfil, htmlProfil } from './chaines.js?v=v326';
import { calculerReprise } from './reprise-4vues.js?v=v326';

const CSS = `
.m3d{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
.m3d-scene{flex:0 0 auto;width:min(100%,340px)}
.m3d-canvas-box{background:linear-gradient(#eef2f6,#dfe6ed);border:1px solid var(--bord,#d8dee5);border-radius:10px;overflow:hidden;position:relative;touch-action:none}
.m3d-canvas{display:block;width:100%;height:480px;cursor:grab}
.m3d-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#456;font-size:12px;padding:12px;text-align:center}
.m3d-vues,.m3d-barre{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.m3d-reprise{border:1px solid #c9d1da;border-radius:8px;background:#f8fafc;padding:8px 10px;margin-top:8px}
.m3d-btn{border:1px solid var(--bord,#c9d1da);background:#fff;color:#223;border-radius:16px;padding:4px 12px;font-size:12px;cursor:pointer}
.m3d-tabmenu{position:relative;font-size:12px}
.m3d-tabmenu>summary{list-style:none;display:inline-block}
.m3d-tabmenu>summary::-webkit-details-marker{display:none}
.m3d-tabmenu>summary::after{content:' ▾'}
.m3d-tabpanel{position:absolute;z-index:40;left:0;top:100%;margin-top:4px;width:min(440px,92vw);max-height:360px;overflow:auto;background:#fff;border:1px solid var(--bord,#c9d1da);border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:4px}
.m3d-cat{border-top:1px solid #eef1f4}
.m3d-cat>summary{cursor:pointer;padding:6px 8px;font-weight:600;color:#2a7a4e}
.m3d-tabitem{display:block;width:100%;text-align:left;border:0;background:none;padding:5px 8px 5px 18px;font-size:12px;color:#223;cursor:pointer;border-radius:4px}
.m3d-tabpanel>.m3d-tabitem{padding-left:8px;font-weight:600}
.m3d-tabitem:hover{background:#eef6f1}
.m3d-btn.on{background:#2a7a4e;color:#fff;border-color:#2a7a4e}
.m3d-panel{flex:1 1 440px;min-width:300px;max-height:560px;overflow:auto}
.m3d-cols{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;padding:0 10px 4px}
.m3d-colhead{font-size:11px;font-weight:700;color:#456;text-align:center;border-bottom:1px solid var(--bord,#d8dee5);padding:2px 0;margin-bottom:2px}
.m3d-cols .m3d-row{padding:3px 0 6px;min-width:0}
.m3d-cols .m3d-row-top{font-size:11px;line-height:1.2}
.m3d-cols .m3d-fin{font-size:9px}
.m3d-cols input[type=number]{width:46px}
.m3d-grp{border:1px solid var(--bord,#d8dee5);border-radius:8px;margin-bottom:6px;background:#fff}
.m3d-grp>summary{cursor:pointer;padding:7px 10px;font-weight:600;font-size:13px;color:#2a7a4e;display:flex;justify-content:space-between;align-items:center}
.m3d-row{padding:4px 10px 8px}
.m3d-row-top{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#223;gap:8px}
.m3d-row input[type=range]{width:100%;margin:2px 0}
.m3d-row input[type=number]{width:62px;font-size:12px;padding:1px 4px}
.m3d-fin{display:flex;justify-content:space-between;font-size:10px;color:#667}
.m3d-row.act .m3d-row-top span:first-child{font-weight:700;color:#b45309}
.m3d-cr{font-size:12px;color:#223;margin-top:8px;background:#f6faf7;border-radius:8px;padding:8px 10px}
.m3d-dic{border:1px solid var(--bord,#d8dee5);border-radius:8px;background:#fff;padding:8px 10px;margin-bottom:8px}
.m3d-dic textarea{width:100%;box-sizing:border-box;font-size:12px}
.m3d-dic small{color:#667;font-size:10px;display:block;margin-top:3px}
.m3d-prop{margin-top:6px;font-size:12px;color:#223}
.m3d-prop label{display:flex;gap:6px;align-items:flex-start;padding:2px 0}
.m3d-prop em{color:#92400e;font-style:normal;font-size:10px}
.m3d-row.prop{outline:2px dashed #b45309;background:#fff7ed;border-radius:6px}
.m3d-meca,.m3d-profbox{margin-top:8px;border:1px solid var(--bord,#d8dee5);border-radius:8px;background:#fff;padding:8px 10px}
.m3d-profbox h4,.m3d-meca h4{margin:0 0 4px;font-size:13px;color:#7c2d12}
.m3d-hyp{border:1px solid #e2e8f0;border-radius:6px;margin:5px 0;padding:4px 8px;background:#fafafa}
.m3d-hyp>summary{cursor:pointer;font-size:12px}
.m3d-cr ul{margin:4px 0 0 16px;padding:0;column-count:2;column-gap:32px}
.m3d-cr li{break-inside:avoid;margin-bottom:2px}
@media(max-width:640px){.m3d-cr ul{column-count:1}}
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

export function monter(
  conteneur,
  {
    etat,
    onChange,
    sexeParDefaut = 'homme',
    profil = 'adulte',
    mecanismes = true,
    analyseVues = null,
  } = {}
) {
  // profil : 'adulte' ou période de la podopédiatrie ('II', 'III', 'IV') = mannequin enfant aux bonnes proportions
  const enfant = profil === 'II' || profil === 'III' || profil === 'IV';
  if (!document.getElementById('m3d-css')) {
    const s = el('style', { id: 'm3d-css' });
    s.textContent = CSS;
    document.head.append(s);
  }
  const S = {
    sexe: (etat && etat.sexe) || sexeParDefaut,
    peau: etat ? etat.peau !== false : true,
    valeurs: Object.assign({}, etat && etat.valeurs),
    retenues: Array.isArray(etat && etat.retenues)
      ? etat.retenues.filter((x) => typeof x === 'string')
      : [],
    // profil du patient et chaîne musculaire : « Inclure au rapport » coché par le praticien
    profilRetenu: !!(etat && etat.profilRetenu),
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
    ['homme', enfant ? 'Garçon' : 'Homme'],
    ['femme', enfant ? 'Fille' : 'Femme'],
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
  const btnRep = el(
    'button',
    {
      class: 'm3d-btn',
      type: 'button',
      title: 'Lignes de repère : épaules, bassin, yeux, genoux, fil à plomb',
      onclick: () => {
        S.reperes = !S.reperes;
        maj();
      },
    },
    '📐 Repères'
  );
  const infoRep = el('div', {
    class: 'm3d-cr',
    style: 'display:none;font-size:11px;margin:6px 0 0',
  });
  barreSexe.append(btnRep);
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
  // Menu « Tableau type (cumulable) » : catégories dépliables au clic (genoux, pieds, bassin, ILMI, tronc/buste,
  // antériorisation/postériorisation, chaînes posturales, chaînes chaînistes) ; un clic sur un tableau l'applique
  // (cumul avec ce qui est déjà réglé) et referme le menu.
  const selTab = el('details', { class: 'm3d-tabmenu' });
  selTab.append(el('summary', { class: 'm3d-btn m3d-tabsum' }, '— Tableau type (cumulable) —'));
  const tabPanel = el('div', { class: 'm3d-tabpanel' });
  selTab.append(tabPanel);
  const itemTab = (k) =>
    el('button', { type: 'button', class: 'm3d-tabitem', 'data-tableau': k }, TABLEAUX[k].label);
  tabPanel.append(itemTab('neutre'));
  for (const [cid, clabel] of CATEGORIES_TABLEAUX) {
    const cles = Object.keys(TABLEAUX).filter((k) => TABLEAUX[k].categorie === cid);
    if (!cles.length) continue;
    const cat = el('details', { class: 'm3d-cat', 'data-cat': cid });
    cat.append(el('summary', {}, clabel + ' (' + cles.length + ')'));
    cles.forEach((k) => cat.append(itemTab(k)));
    tabPanel.append(cat);
  }
  tabPanel.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-tableau]');
    if (!b) return;
    S.valeurs = appliquerTableau(S.valeurs, b.dataset.tableau);
    selTab.open = false;
    majCurseurs();
    maj();
  });
  // un clic ailleurs referme le menu
  const fermerMenu = (ev) => {
    if (selTab.open && !selTab.contains(ev.target)) selTab.open = false;
  };
  document.addEventListener('click', fermerMenu);
  const btnRaz = el(
    'button',
    {
      class: 'm3d-btn',
      type: 'button',
      onclick: () => {
        S.valeurs = {};
        S.prop = null;
        majProp();
        majCurseurs();
        maj();
      },
    },
    '↺ Neutre'
  );
  // Reprise des résultats de « Analyse posturale — captures 4 vues » : aperçu avant/après, le praticien coche ce qu'il reprend.
  // Rien n'est écrit sans clic sur « Appliquer » (et l'application passe par maj() comme un réglage manuel).
  const repriseBox = el('div', { class: 'm3d-reprise', style: 'display:none' });
  const btnReprise = el(
    'button',
    {
      class: 'm3d-btn',
      type: 'button',
      'data-m3d-reprise': '1',
      title: 'Reporter sur le mannequin les mesures de « Analyse posturale — captures 4 vues »',
      onclick: () => ouvrirReprise(),
    },
    '📸 Reporter les 4 vues'
  );
  function ouvrirReprise() {
    if (repriseBox.style.display !== 'none') {
      repriseBox.style.display = 'none';
      return;
    }
    const r = calculerReprise(analyseVues ? analyseVues() : null);
    repriseBox.textContent = '';
    repriseBox.style.display = 'block';
    repriseBox.append(el('strong', {}, 'Reprise des 4 vues'));
    if (!r.vues.length) {
      repriseBox.append(
        el(
          'div',
          {},
          "Aucune vue n'est encore analysée : placez les points dans « Analyse posturale — captures 4 vues »."
        ),
        el(
          'button',
          { class: 'm3d-btn', type: 'button', onclick: () => (repriseBox.style.display = 'none') },
          'Fermer'
        )
      );
      return;
    }
    repriseBox.append(
      el(
        'div',
        { style: 'font-size:11px;color:#475569' },
        'Vues utilisées : ' +
          r.vues.join(', ') +
          '. Moyenne quand une mesure vient de plusieurs vues.'
      )
    );
    const coches = [];
    if (!r.propositions.length)
      repriseBox.append(
        el('div', {}, 'Aucune mesure au-dessus des seuils du cabinet : rien à reporter.')
      );
    const ul = el('div', { class: 'm3d-rep-liste' });
    for (const p of r.propositions) {
      const actuel = Number(S.valeurs[p.id]) || 0;
      const cb = el('input', { type: 'checkbox', 'data-rep-id': p.id });
      cb.checked = actuel === 0; // un curseur déjà réglé n'est jamais remplacé sans que le praticien le coche
      coches.push([p, cb]);
      const avant = actuel ? decrire({ [p.id]: actuel })[0] : 'neutre';
      const apres = decrire({ [p.id]: p.valeur })[0];
      ul.append(
        el(
          'label',
          { style: 'display:block;margin:4px 0;font-size:12px' },
          cb,
          ' ' + apres + (p.estime ? ' (estimé)' : ''),
          el(
            'span',
            { style: 'color:#64748b' },
            ' — avant : ' + avant + (actuel ? ' (sera remplacé si coché)' : '') + ' — ' + p.source
          )
        )
      );
    }
    repriseBox.append(ul);
    if (r.nonReportees.length)
      repriseBox.append(
        el(
          'div',
          { style: 'font-size:11px;color:#64748b;margin:6px 0' },
          'Mesures sans curseur équivalent (non reportées) : ' + r.nonReportees.join(' ; ') + '.'
        )
      );
    const barre = el('div', { class: 'm3d-barre' });
    if (r.propositions.length)
      barre.append(
        el(
          'button',
          {
            class: 'm3d-btn on',
            type: 'button',
            'data-m3d-reprise-ok': '1',
            onclick: () => {
              for (const [p, cb] of coches) if (cb.checked) S.valeurs[p.id] = p.valeur;
              repriseBox.style.display = 'none';
              majCurseurs();
              maj();
            },
          },
          'Appliquer la sélection'
        )
      );
    barre.append(
      el(
        'button',
        { class: 'm3d-btn', type: 'button', onclick: () => (repriseBox.style.display = 'none') },
        'Annuler'
      )
    );
    repriseBox.append(barre);
  }
  const cr = el('div', { class: 'm3d-cr' });
  const hyp = el('div', { class: 'm3d-meca' });
  const prof = el('div', { class: 'm3d-profbox' });
  racine.append(
    el(
      'div',
      { class: 'm3d-scene' },
      barreSexe,
      boxCanvas,
      barreVues,
      infoRep,
      el('div', { class: 'm3d-barre' }, selTab, btnRaz, ...(analyseVues ? [btnReprise] : [])),
      repriseBox
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
    const faireLigne = (c, libelle) => {
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
        { class: 'm3d-row', 'data-id': c.id },
        el(
          'div',
          { class: 'm3d-row-top' },
          el('span', {}, libelle),
          el('span', {}, num, ' ' + c.unite)
        ),
        rng,
        el(
          'div',
          { class: 'm3d-fin' },
          el('span', {}, (c.fin[0] || '') + ' ←'),
          el('span', {}, '→ ' + (c.fin[1] || ''))
        )
      );
      lignes[c.id] = { row, rng, num };
      return row;
    };
    cs.filter((c) => !c.cote).forEach((c) => d.append(faireLigne(c, c.label)));
    const lat = cs.filter((c) => c.cote);
    if (lat.length) {
      const grille = el(
        'div',
        { class: 'm3d-cols' },
        el('div', { class: 'm3d-colhead' }, 'Gauche (patient)'),
        el('div', { class: 'm3d-colhead' }, 'Droite (patient)')
      );
      for (const c of lat.filter((x) => x.cote === 'G')) {
        const dr = PAR_ID[c.id.slice(0, -1) + 'D'];
        grille.append(faireLigne(c, c.court), faireLigne(dr, c.court));
      }
      d.append(grille);
    }
    d.append(el('div', { style: 'height:4px' }));
    panel.append(d);
  }
  const zone = el('textarea', {
    class: 'inp',
    rows: '2',
    placeholder:
      'Dictez ou écrivez ce que vous observez, ex. « genu valgum bilatéral marqué, bascule du bassin à droite légère, tête penchée à gauche de 8 degrés »',
  });
  const SR =
    typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  let reco = null;
  const btnMic = el(
    'button',
    { class: 'm3d-btn', type: 'button', onclick: () => basculerMicro() },
    '🎤 Dicter'
  );
  if (!SR) {
    btnMic.disabled = true;
    btnMic.title = 'Dictée non disponible sur ce navigateur : saisissez le texte';
  }
  const btnInterp = el(
    'button',
    { class: 'm3d-btn', type: 'button', onclick: () => proposer() },
    '🔍 Interpréter'
  );
  const liste = el('div', { class: 'm3d-prop' });
  const dic = el(
    'div',
    { class: 'm3d-dic' },
    el('strong', { style: 'font-size:12px' }, '🎙️ Dictée : le mannequin se déforme, vous validez'),
    zone,
    el('div', { class: 'm3d-barre' }, btnMic, btnInterp),
    el(
      'small',
      {},
      'Niveaux : léger, modéré, marqué, sévère (ou un chiffre). La reconnaissance vocale est celle de votre navigateur : ne dictez aucune donnée identifiante.'
    ),
    liste
  );
  racine.append(el('div', { style: 'flex:1 1 440px;min-width:300px' }, dic, panel));
  // compte rendu et mécanismes : sur toute la largeur, sous le mannequin et les curseurs
  racine.append(
    el(
      'div',
      { style: 'flex:1 1 100%;min-width:0' },
      cr,
      hyp,
      prof,
      el(
        'div',
        {
          class: 'm3d-build',
          style: 'font-size:10px;color:#9ca3af;text-align:right;margin-top:4px',
        },
        'Mannequin 3D ' + BUILD
      )
    )
  );
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
  function fusion() {
    const m = Object.assign({}, S.valeurs);
    if (S.prop) for (const p of S.prop) if (p.coche) m[p.id] = p.valeur;
    return m;
  }
  function majProp() {
    for (const id in lignes) lignes[id].row.classList.remove('prop');
    liste.textContent = '';
    if (!S.prop) return;
    if (!S.prop.length) {
      liste.append(
        el(
          'div',
          {},
          'Rien de reconnu dans ce texte. Nommez le mouvement ou la déformation et le côté, par exemple :'
        )
      );
      const ul = el('ul', { style: 'margin:4px 0 0 16px;padding:0' });
      EXEMPLES.forEach((x) => ul.append(el('li', {}, '« ' + x + ' »')));
      liste.append(ul);
      if (S.ignorees && S.ignorees.length)
        liste.append(el('small', {}, 'Parties non comprises : ' + S.ignorees.join(' / ')));
      return;
    }
    for (const p of S.prop) {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = p.coche;
      cb.addEventListener('change', () => {
        p.coche = cb.checked;
        majProp();
        maj();
      });
      liste.append(
        el(
          'label',
          {},
          cb,
          el(
            'span',
            {},
            p.texte + ' ',
            p.defaut ? el('em', {}, '(niveau modéré par défaut)') : '',
            p.remarque ? el('em', {}, ' ' + p.remarque) : ''
          )
        )
      );
      if (lignes[p.id]) {
        lignes[p.id].row.classList.toggle('prop', p.coche);
        const d = lignes[p.id].row.closest('details');
        if (d && p.coche) d.open = true;
      }
    }
    const ok = el(
      'button',
      {
        class: 'm3d-btn on',
        type: 'button',
        onclick: () => {
          S.valeurs = fusion();
          S.prop = null;
          majCurseurs();
          majProp();
          maj();
        },
      },
      '✔ Appliquer'
    );
    const non = el(
      'button',
      {
        class: 'm3d-btn',
        type: 'button',
        onclick: () => {
          S.prop = null;
          majProp();
          maj();
        },
      },
      '✖ Annuler'
    );
    liste.append(el('div', { class: 'm3d-barre' }, ok, non));
  }
  function proposer() {
    const r = interpreter(zone.value);
    S.prop = r.propositions.map((p) => Object.assign({ coche: true }, p));
    S.ignorees = r.ignorees;
    majProp();
    maj();
    if (S.prop.length && r.ignorees.length)
      liste.append(el('small', {}, 'Non compris : ' + r.ignorees.join(' / ')));
  }
  function basculerMicro() {
    if (reco) {
      reco.stop();
      return;
    }
    reco = new SR();
    reco.lang = 'fr-FR';
    reco.continuous = true;
    reco.interimResults = false;
    reco.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal)
          zone.value += (zone.value ? ', ' : '') + e.results[i][0].transcript.trim();
    };
    reco.onend = () => {
      reco = null;
      btnMic.textContent = '🎤 Dicter';
      btnMic.classList.remove('on');
      if (zone.value.trim()) proposer();
    };
    reco.onerror = () => {
      /* micro refusé ou coupé : le texte déjà reconnu reste utilisable */
    };
    btnMic.textContent = '⏹ Arrêter';
    btnMic.classList.add('on');
    reco.start();
  }
  function maj() {
    majBoutons();
    if (moteur) {
      moteur.peau(S.peau);
      moteur.pose(fusion());
      const ang = moteur.montrerReperes(!!S.reperes);
      btnRep.classList.toggle('on', !!S.reperes);
      infoRep.style.display = S.reperes ? 'block' : 'none';
      if (S.reperes && ang)
        infoRep.textContent =
          'Inclinaison vue de face (° ; + = côté droit du patient plus haut) — épaules : ' +
          ang.epaules +
          ' · bassin : ' +
          ang.bassin +
          ' · yeux : ' +
          ang.yeux +
          ' · genoux : ' +
          ang.genoux;
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
    majMeca();
    majProfil();
    if (onChange) onChange(etatCourant());
  }
  // Profil du patient et chaîne musculaire (hypothèse) sur les valeurs VALIDÉES ; toutes périodes (adulte, sport, enfant)
  function majProfil() {
    const ouverts = [...prof.querySelectorAll('details[open]')].map(
      (d) => d.querySelector('summary').textContent
    );
    const ang = moteur && moteur.angles ? moteur.angles() : null;
    const p = evaluerProfil(nettoyerValeurs(S.valeurs), { yeux: ang && ang.yeux });
    prof.innerHTML = htmlProfil(p, { coche: true, retenu: S.profilRetenu });
    prof.querySelectorAll('details').forEach((d) => {
      if (ouverts.includes(d.querySelector('summary').textContent)) d.open = true;
    });
  }
  prof.addEventListener('change', (ev) => {
    if (!(ev.target && ev.target.dataset && ev.target.dataset.profil)) return;
    S.profilRetenu = !!ev.target.checked;
    if (onChange) onChange(etatCourant());
  });
  // Hypothèses de mécanisme lésionnel sur les valeurs VALIDÉES (pas sur l'aperçu d'une dictée)
  function majMeca() {
    if (!mecanismes) {
      S.retenues = [];
      hyp.innerHTML =
        '<div style="font-size:12px;color:#475569">Mécanismes lésionnels : non proposés pour cette période (écarts fréquents et souvent physiologiques chez le jeune enfant).</div>';
      return;
    }
    const res = evaluer(nettoyerValeurs(S.valeurs));
    const ouverts = new Set(
      [...hyp.querySelectorAll('details.m3d-hyp[open]')].map((d) => d.dataset.id)
    );
    // une règle retenue qui ne se déclenche plus est retirée de la sélection
    const actives = new Set(res.map((x) => x.regle.id));
    S.retenues = S.retenues.filter((id) => actives.has(id));
    let h = '<h4>🔗 Mécanismes lésionnels possibles (hypothèses)</h4>' + htmlPrudence();
    if (!res.length) {
      h +=
        '<div style="font-size:12px;color:#475569">Aucune règle ne se déclenche avec les valeurs actuelles' +
        (Object.keys(S.valeurs).length
          ? ' (écarts sous les seuils d’activation)'
          : ' (mannequin neutre)') +
        '.</div>';
    } else {
      h += htmlSynthese(res);
      h +=
        '<div style="font-size:12px;margin:6px 0">Cochez les hypothèses à <b>inclure dans le rapport</b> (' +
        S.retenues.length +
        ' retenue' +
        (S.retenues.length > 1 ? 's' : '') +
        ') : ' +
        '<button type="button" class="m3d-btn" data-meca-tout="1">Tout retenir</button> <button type="button" class="m3d-btn" data-meca-tout="0">Aucune</button></div>';
      h += res
        .map((x) => htmlHypothese(x, { coche: true, retenue: S.retenues.includes(x.regle.id) }))
        .join('');
    }
    const man = reglesManuelles();
    h +=
      '<details style="margin-top:6px;font-size:11px;color:#475569"><summary>' +
      man.length +
      ' règles non calculées automatiquement (elles demandent le contexte clinique : douleur, sport, chaussage, tests)</summary><ul style="margin:4px 0 0 16px;padding:0">' +
      man
        .map((m) => '<li><b>' + m.id + '</b> ' + m.titre.replace(/[<>&]/g, '') + '</li>')
        .join('') +
      '</ul></details>';
    hyp.innerHTML = h;
    hyp.querySelectorAll('details.m3d-hyp').forEach((d) => {
      if (ouverts.has(d.dataset.id)) d.open = true;
    });
  }
  hyp.addEventListener('change', (ev) => {
    const c = ev.target && ev.target.dataset && ev.target.dataset.meca;
    if (!c) return;
    S.retenues = ev.target.checked
      ? [...new Set([...S.retenues, c])]
      : S.retenues.filter((x) => x !== c);
    majMeca();
    if (onChange) onChange(etatCourant());
  });
  hyp.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-meca-tout]');
    if (!b) return;
    S.retenues =
      b.dataset.mecaTout === '1' ? evaluer(nettoyerValeurs(S.valeurs)).map((x) => x.regle.id) : [];
    majMeca();
    if (onChange) onChange(etatCourant());
  });
  function etatCourant() {
    return {
      v: 1,
      sexe: S.sexe,
      peau: S.peau,
      valeurs: nettoyerValeurs(S.valeurs),
      retenues: S.retenues.slice(),
      profilRetenu: S.profilRetenu,
    };
  }
  async function changerSexe(k) {
    S.sexe = k;
    majBoutons();
    if (moteur) {
      msg.style.display = 'flex';
      await moteur.chargerSexe(k, profil);
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
      await moteur.chargerSexe(S.sexe, profil);
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
    diag: () => (moteur ? moteur.diag() : null),
    angles: () => (moteur ? moteur.angles() : null),
    definir(e) {
      S.sexe = (e && e.sexe) || sexeParDefaut;
      S.peau = e ? e.peau !== false : true;
      S.valeurs = Object.assign({}, e && e.valeurs);
      S.profilRetenu = !!(e && e.profilRetenu);
      majCurseurs();
      if (moteur) moteur.chargerSexe(S.sexe, profil).then(maj);
      else majBoutons();
    },
    detruire() {
      detruit = true;
      window.removeEventListener('resize', ajusterTaille);
      document.removeEventListener('click', fermerMenu);
      if (moteur) moteur.liberer();
      conteneur.textContent = '';
    },
  };
}
