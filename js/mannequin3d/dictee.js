// Mannequin postural 3D — interprétation d'une description dictée (fonction pure, testée).
// « genu valgum bilatéral marqué, bascule du bassin à droite légère, tête penchée à gauche de 8 degrés »
//   → propositions de valeurs de curseurs (jamais appliquées sans validation du praticien).
// Les niveaux léger / modéré / marqué / sévère donnent une amplitude propre à chaque curseur (qual) ou, à défaut,
// 25 / 50 / 75 / 100 % de l'extrême du curseur dans le sens demandé. Un chiffre dicté l'emporte.
import { PAR_ID } from './parametres.js';

const norm = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// signe : +1 / -1 = sens du curseur ; cote : 'lat' = curseur D/G ; 'signe' = le côté nommé donne le signe (D = +)
const CONCEPTS = [
  {
    re: /genu valgum|genou(x)? (en )?(valgus|x\b)|valgus (du |des |de )?genou|dynamic knee valgus/,
    id: 'genou_valgus',
    s: 1,
    cote: 'lat',
  },
  {
    re: /genu varum|varus (du |des |de )?genou|genou(x)? (en )?varus|genou(x)? en parenthese/,
    id: 'genou_valgus',
    s: -1,
    cote: 'lat',
  },
  {
    re: /recurvatum|genou(x)? (en )?arriere|hyperextension (du |des )?genou/,
    id: 'genou_flex',
    s: -1,
    cote: 'lat',
  },
  { re: /flessum|flexum|genou(x)? (fle?chi|en flexion)/, id: 'genou_flex', s: 1, cote: 'lat' },
  {
    re: /pieds? plats?|pieds? valgus|valgus (du |des |de l )?(pieds?|arriere ?pied)|effondrement (interne|de la voute)|pronation du pied/,
    id: 'pied_valgus',
    s: 1,
    cote: 'lat',
  },
  {
    re: /pieds? creux|pieds? varus|varus (du |des |de l )?(pieds?|arriere ?pied)|supination du pied/,
    id: 'pied_valgus',
    s: -1,
    cote: 'lat',
  },
  {
    re: /(ouverture (du )?pas|pieds? (en dehors|ouverts?|en canard)|charlie chaplin)/,
    id: 'pied_ouverture',
    s: 1,
    cote: 'lat',
  },
  {
    re: /pieds? (en dedans|rentres?|en pigeon)|pigeon.?toe/,
    id: 'pied_ouverture',
    s: -1,
    cote: 'lat',
  },
  {
    re: /rotation interne (de la |des |de |du )?(cuisses?|hanches?|femurs?)|(cuisses?|femurs?|hanches?) en rotation interne/,
    id: 'cuisse_rot',
    s: -1,
    cote: 'lat',
  },
  {
    re: /rotation externe (de la |des |de |du )?(cuisses?|hanches?|femurs?)|(cuisses?|femurs?|hanches?) en rotation externe/,
    id: 'cuisse_rot',
    s: 1,
    cote: 'lat',
  },
  {
    re: /rotation interne (du |des |de )?tibias?|tibias? en rotation interne/,
    id: 'tibia_rot',
    s: -1,
    cote: 'lat',
  },
  {
    re: /rotation externe (du |des |de )?tibias?|tibias? en rotation externe/,
    id: 'tibia_rot',
    s: 1,
    cote: 'lat',
  },
  {
    re: /abduction (de la |des |de )?cuisses?|cuisses? en abduction/,
    id: 'cuisse_abd',
    s: 1,
    cote: 'lat',
  },
  {
    re: /adduction (de la |des |de )?cuisses?|cuisses? en adduction/,
    id: 'cuisse_abd',
    s: -1,
    cote: 'lat',
  },
  {
    re: /hyper ?lordose|lordose (accentuee|marquee|excessive|lombaire)|dos creux|ensellure/,
    id: 'tronc_lordose',
    s: 1,
  },
  {
    re: /hyper ?cyphose|cyphose (accentuee|marquee|excessive|dorsale)|dos rond|dos voute|dos vouté/,
    id: 'tronc_cyphose',
    s: 1,
  },
  { re: /dos plat|retroversion/, id: 'bassin_antev', s: -1 },
  { re: /anteversion/, id: 'bassin_antev', s: 1 },
  {
    re: /(jambe|membre( inferieur)?) (droit|droite|gauche) (est |semble )?(plus )?(courte?|longue?)|inegalite de longueur|(iml|dismetrie)/,
    id: 'bassin_inegalite',
    special: 'iml',
  },
  {
    re: /bascule (du |de )?bassin|bassin (bas|descendu|plus bas|abaisse|incline|bascule)/,
    id: 'bassin_bascule',
    cote: 'signe',
  },
  { re: /rotation (du )?bassin|bassin (tourne|en rotation)/, id: 'bassin_rot', cote: 'signe' },
  {
    re: /inclinaison (de la |du )?ceinture|ceinture scapulaire (inclinee|basculee|oblique|desaxee)|inclinaison scapulaire/,
    id: 'ceinture_incl',
    cote: 'signe',
  },
  {
    re: /rotation (de la )?ceinture|ceinture scapulaire (en rotation|tournee)/,
    id: 'ceinture_rot',
    cote: 'signe',
  },
  {
    re: /epaules? (haute|hautes|elevee|elevees|remontee|remontees)|elevation (de l )?epaule/,
    id: 'epaule_elev',
    s: 1,
    cote: 'lat',
  },
  {
    re: /epaules? (basse|basses|abaissee|abaissees|tombante|tombantes)|abaissement (de l )?epaule/,
    id: 'epaule_elev',
    s: -1,
    cote: 'lat',
  },
  {
    re: /epaules? (en avant|enroulee|enroulees|antepulsee|antepulsees)|antepulsion (de l )?epaule|protraction scapulaire/,
    id: 'epaule_antep',
    s: 1,
    cote: 'lat',
  },
  { re: /retropulsion (de l )?epaule|epaules? en arriere/, id: 'epaule_antep', s: -1, cote: 'lat' },
  {
    re: /(inclinaison|incline|penche|penchee|inclinee) (de la |du |sur la |sur le )?(tete|cou)|tete (penchee|inclinee)/,
    id: 'tete_incl',
    cote: 'signe',
  },
  { re: /rotation (de la )?tete|tete (tournee|en rotation)/, id: 'tete_rot', cote: 'signe' },
  {
    re: /antepulsion (de la )?tete|tete (en avant|projetee|avancee)|protraction cervicale|cou de vautour/,
    id: 'tete_antep',
    s: 1,
  },
  {
    re: /tete (en arriere|en extension)|hyperextension cervicale|extension cervicale/,
    id: 'tete_flex',
    s: -1,
  },
  {
    re: /flexion (de la |cervicale )?tete|tete (en flexion|baissee)|flexion cervicale/,
    id: 'tete_flex',
    s: 1,
  },
  {
    re: /inclinaison (du )?tronc|tronc (incline|penche)|attitude scoliotique|scoliose fonctionnelle/,
    id: 'tronc_incl',
    cote: 'signe',
  },
  { re: /rotation (du )?tronc|tronc (tourne|en rotation)/, id: 'tronc_rot', cote: 'signe' },
  {
    re: /anteriorisation (globale|du thorax|du tronc)|thorax en avant|tronc en avant/,
    id: 'tronc_antero',
    s: 1,
  },
  {
    re: /pronation (de l )?avant ?bras|avant ?bras? en pronation|\bpronation\b/,
    id: 'avbras_pron',
    s: 1,
    cote: 'lat',
  },
  {
    re: /supination (de l )?avant ?bras|avant ?bras? en supination|\bsupination\b/,
    id: 'avbras_pron',
    s: -1,
    cote: 'lat',
  },
  {
    re: /flexion (du )?coude|coude(s)? (fle?chis?|en flexion)/,
    id: 'coude_flex',
    s: 1,
    cote: 'lat',
  },
  { re: /abduction (du )?bras|bras (ecartes?|en abduction)/, id: 'bras_abd', s: 1, cote: 'lat' },
];

const NIVEAUX = [
  [/\b(leger|legere|legers|legeres|discret|discrete|minime|faible|modeste)\b/, 0],
  [/\b(modere|moderee|moyen|moyenne|intermediaire)\b/, 1],
  [
    /\b(tres (important|importante|marque|marquee|prononce|prononcee)|severe|majeur|majeure|massif|massive|extreme|sevre)\b/,
    3,
  ],
  [
    /\b(marque|marquee|important|importante|net|nette|prononce|prononcee|franc|franche|notable)\b/,
    2,
  ],
];
const FRACTIONS = [0.25, 0.5, 0.75, 1];
export const LIBELLES_NIVEAU = ['léger', 'modéré', 'marqué', 'sévère'];

function cotes(seg) {
  const droite = /\b(droit|droite|droits|droites)\b/.test(seg);
  const gauche = /\b(gauche|gauches)\b/.test(seg);
  const les2 =
    /bilateral|bilaterale|bilateraux|des deux cotes|deux cotes|\b(les )?(genoux|pieds|epaules|cuisses|hanches|jambes|bras|coudes|avant ?bras|tibias)\b/.test(
      seg
    );
  return { droite, gauche, les2 };
}

function magnitude(c, direction, niveau, nombre) {
  const extreme = direction > 0 ? c.max : -c.min;
  if (nombre != null) return Math.min(extreme, nombre);
  const q = c.qual && direction > 0 ? c.qual[niveau] : null;
  const brut = q != null ? q : extreme * FRACTIONS[niveau];
  return c.unite === 'cm' ? Math.max(0.5, Math.round(brut * 2) / 2) : Math.max(1, Math.round(brut));
}

// → { propositions: [{id, valeur, texte, phrase, niveau, defaut, remarque}], ignorees: [phrases non comprises] }
export function interpreter(texte) {
  const propositions = [];
  const ignorees = [];
  const segments = norm(texte)
    .split(/[.;\n,]| puis | avec | ainsi que /)
    .map((x) => x.trim())
    .filter(Boolean);
  let dernier = null;
  for (const seg of segments) {
    const sansCote = seg
      .replace(/\b(droit|droite|droits|droites|gauche|gauches)\b/g, ' ')
      .replace(/\s+/g, ' ');
    const concept = CONCEPTS.find((k) => k.re.test(seg) || k.re.test(sansCote));
    const sc = cotes(seg);
    const cc = concept || (dernier && (sc.droite || sc.gauche || sc.les2) ? dernier : null);
    if (!cc) {
      ignorees.push(seg);
      continue;
    }
    dernier = cc;
    let niveau = 1,
      defaut = true;
    for (const [re, n] of NIVEAUX)
      if (re.test(seg)) {
        niveau = n;
        defaut = false;
        break;
      }
    const nb = seg.match(/(\d+(?:[.,]\d+)?)\s*(?:°|deg|degres?|cm|centimetres?|mm|millimetres?)?/);
    const nombre = nb ? parseFloat(nb[1].replace(',', '.')) : null;
    if (nombre != null) defaut = false;
    const cibles = []; // [{id, direction}]
    let remarque = '';
    if (cc.special === 'iml') {
      const m = seg.match(/(droit|droite|gauche)/);
      const longue = /longue?/.test(seg) && !/courte?/.test(seg);
      if (!m) {
        ignorees.push(seg + ' (côté non précisé)');
        continue;
      }
      const dCourte = (m[1] === 'gauche') === longue; // jambe G longue ⇒ D courte
      cibles.push({ id: 'bassin_inegalite', dir: dCourte ? 1 : -1 });
    } else if (cc.cote === 'lat') {
      let lst = [];
      if (sc.les2 || (sc.droite && sc.gauche)) lst = ['D', 'G'];
      else if (sc.droite) lst = ['D'];
      else if (sc.gauche) lst = ['G'];
      else {
        lst = ['D', 'G'];
        remarque = 'côté non précisé : appliqué des deux côtés';
      }
      for (const l of lst) cibles.push({ id: cc.id + '_' + l, dir: cc.s });
    } else if (cc.cote === 'signe') {
      if (sc.droite === sc.gauche) {
        ignorees.push(seg + ' (côté non précisé)');
        continue;
      }
      cibles.push({ id: cc.id, dir: sc.droite ? 1 : -1 });
    } else cibles.push({ id: cc.id, dir: cc.s });
    for (const t of cibles) {
      const c = PAR_ID[t.id];
      if (!c) continue;
      const m = magnitude(c, t.dir, niveau, nombre);
      const valeur = t.dir * m;
      const mot = (valeur < 0 ? c.fin[0] : c.fin[1]) || '';
      const i = propositions.findIndex((p) => p.id === t.id);
      const prop = {
        id: t.id,
        valeur,
        phrase: seg,
        niveau: nombre != null ? null : niveau,
        defaut,
        remarque,
        texte: c.label + ' : ' + (mot ? mot + ' ' : '') + Math.abs(valeur) + ' ' + c.unite,
      };
      if (i >= 0) propositions[i] = prop;
      else propositions.push(prop);
    }
  }
  return { propositions, ignorees };
}
