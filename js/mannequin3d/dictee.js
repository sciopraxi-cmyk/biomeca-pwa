// Mannequin postural 3D — interprétation d'une description dictée ou tapée (fonction pure, testée).
// « le patient présente un genu valgum bilatéral marqué, bascule du bassin à droite légère, tête penchée à gauche de 8 degrés »
//   → propositions de valeurs de curseurs (jamais appliquées sans validation du praticien).
// Principe : la phrase est découpée en propositions ; dans chacune on cherche des MOTS-CLÉS (radicaux, sans accents,
// dans n'importe quel ordre) qui désignent un curseur, puis le côté, le niveau (léger / modéré / marqué / sévère)
// ou un chiffre (le chiffre l'emporte). Aucun nom de patient n'est lu ni conservé.
import { PAR_ID } from './parametres.js?v=v303';

export const EXEMPLES = [
  'genu valgum bilatéral marqué',
  'bascule du bassin à droite légère, tête penchée à gauche de 8 degrés',
  'pied plat droit modéré, recurvatum du genou gauche sévère',
  'hyperlordose importante avec antéversion du bassin, dos rond léger',
  'épaule droite plus haute, ceinture scapulaire inclinée à gauche',
  'jambe droite plus courte de 12 mm',
  'antériorisation globale à partir des chevilles, tête en avant de 5 cm',
  'poids du corps sur la jambe droite, modéré',
];

const norm = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b[dlnsjmtc][’'`]/g, ' ') // l'épaule → épaule (évite le « d » isolé de d'un)
    .replace(/[’'`]/g, ' ')
    // fautes de transcription fréquentes
    .replace(/\bval ?gu(e|es|s)?\b/g, 'valgus')
    .replace(/\bvalgum\b/g, 'valgus')
    .replace(/\bvarum\b/g, 'varus')
    .replace(/\brecourbatum|recurvatom\w*|recurvatum\b/g, 'recurvatum')
    .replace(/\bflexum\b/g, 'flessum')
    .replace(/\bs?cyphose\b|\bcifose\b/g, 'cyphose')
    .replace(/\bhyper ?lordose\b/g, 'hyper lordose')
    .replace(/\bhyper ?cyphose\b/g, 'hyper cyphose')
    .replace(/\bantero ?version\b/g, 'anteversion')
    .replace(/\bretro ?version\b/g, 'retroversion')
    .replace(/\s+/g, ' ')
    .trim();

// nombres écrits en lettres (reconnaissance vocale) : « huit », « vingt cinq », « trente »
const UNITES = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  'dix sept': 17,
  'dix huit': 18,
  'dix neuf': 19,
  vingt: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
};
function nombresEnChiffres(t) {
  return t
    .replace(/\b(?:un|une) (?=(?:centimetre|cm|millimetre|mm|degre)\b)/g, '1 ')
    .replace(
      /\b(vingt|trente|quarante|cinquante)(?: et| )?[- ]?(un|deux|trois|quatre|cinq|six|sept|huit|neuf)\b/g,
      (_, a, b) => String(UNITES[a] + UNITES[b])
    )
    .replace(/\bdix[- ](sept|huit|neuf)\b/g, (_, b) => String(10 + UNITES[b]))
    .replace(
      /\b(zero|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|dix|neuf|huit|sept|six|cinq|quatre|trois|deux)\b(?= ?(degres?|deg|cm|centimetres?|mm|millimetres?|%))/g,
      (m) => String(UNITES[m])
    );
}

const A = (...rx) => rx; // « tous ces motifs doivent apparaître dans la proposition »
const CONCEPTS = [
  // ── global (avant les segments pour que « globale » prime)
  {
    id: 'glob',
    all: A(
      /anterioris|posterioris|(penche|incline|bascule|oscille)\w* (en )?(avant|arriere)|en bloc/,
      /global|corps|ensemble|bloc|entier|tout/
    ),
    special: 'global',
  },
  // ── genou
  {
    id: 'genou_flex',
    all: A(/recurvatum|hyperextension|genou\w* (en )?arriere|(genoux?|genu) (recul|bloque)/),
    s: -1,
    cote: 'lat',
  },
  {
    id: 'genou_valgus',
    all: A(/valgus|\bx\b|genoux? en x|se touchent|cagneux/, /genou|genu|jambes?\b/),
    none: A(/\bpieds?\b|arriere ?pied|calcan/),
    s: 1,
    cote: 'lat',
  },
  {
    id: 'genou_valgus',
    all: A(/varus|arquee|en parenthese|bancal|en o\b/, /genou|genu|jambes?\b/),
    none: A(/\bpieds?\b|arriere ?pied|calcan/),
    s: -1,
    cote: 'lat',
  },
  {
    id: 'genou_flex',
    all: A(/flessum|genou\w* (flechi|en flexion|plie)|flexion (du |des )?genou/),
    s: 1,
    cote: 'lat',
  },
  // ── pied
  {
    id: 'pied_valgus',
    all: A(/valgus|plat|effondr|pronat|affaiss/, /pieds?|arriere ?pied|calcan|voute|arche/),
    s: 1,
    cote: 'lat',
  },
  {
    id: 'pied_valgus',
    all: A(/varus|creux|supinat|cave/, /pieds?|arriere ?pied|calcan|voute|arche/),
    s: -1,
    cote: 'lat',
  },
  {
    id: 'pied_ouverture',
    all: A(
      /ouverture|ouvert|en dehors|duck|canard|charlie|divergen|exorotation/,
      /pas\b|pieds?|marche|angle de/
    ),
    s: 1,
    cote: 'lat',
  },
  {
    id: 'pied_ouverture',
    all: A(
      /en dedans|rentr|pigeon|introversion|convergen|endorotation|ferme/,
      /pas\b|pieds?|marche|angle de/
    ),
    s: -1,
    cote: 'lat',
  },
  // ── hanche / cuisse / tibia
  {
    id: 'cuisse_rot',
    all: A(
      /rotation interne|\bri\b|endorotation|rotation en dedans/,
      /cuisse|femur|hanche|coxo|membres? inferieurs?|\bmi\b/
    ),
    s: -1,
    cote: 'lat',
  },
  {
    id: 'cuisse_rot',
    all: A(
      /rotation externe|\bre\b|exorotation|rotation en dehors/,
      /cuisse|femur|hanche|coxo|membres? inferieurs?|\bmi\b/
    ),
    s: 1,
    cote: 'lat',
  },
  {
    id: 'tibia_rot',
    all: A(/rotation interne|\bri\b|torsion tibiale interne/, /tibia|jambe/),
    s: -1,
    cote: 'lat',
  },
  {
    id: 'tibia_rot',
    all: A(/rotation externe|\bre\b|torsion tibiale externe/, /tibia|jambe/),
    s: 1,
    cote: 'lat',
  },
  { id: 'cuisse_abd', all: A(/abduction|ecart/, /cuisse|hanche|femur/), s: 1, cote: 'lat' },
  {
    id: 'cuisse_abd',
    all: A(/adduction|croise|rapproch/, /cuisse|hanche|femur/),
    s: -1,
    cote: 'lat',
  },
  // ── bassin
  {
    id: 'bassin_inegalite',
    all: A(
      /inegalite|dysmetrie|dismetrie|\biml\b|\bilmi\b|(jambe|membre|pied)\w* (droit\w*|gauche\w*)?.{0,25}(court|long)|(court|long)\w*.{0,25}(jambe|membre)/
    ),
    special: 'iml',
  },
  {
    id: 'bassin_antev',
    all: A(/retroversi|bassin\w* (plat|en arriere|retro)|fesses plates|dos plat/),
    s: -1,
  },
  {
    id: 'bassin_antev',
    all: A(/anteverse|anteversion|bassin\w* (en avant|antero|ante)|ensellure|cambrure du bassin/),
    s: 1,
  },
  {
    id: 'bassin_rot',
    all: A(/bassin|iliaque|hemi ?bassin/, /rotation|tourn|rote|pivot|torsion/),
    cote: 'signe',
    special: 'pos',
  },
  {
    id: 'bassin_bascule',
    all: A(
      /bassin|iliaque|crete|hemi ?bassin/,
      /bascul|bas\b|basse|descend|incline|oblique|haut|haute|monte|remonte|desaxe|plus bas|plus haut/
    ),
    cote: 'signe',
    special: 'bascule',
  },
  {
    id: 'poids_lr',
    all: A(/poids|appui|charge/, /jambe|pied|cote|droit|droite|gauche|repartition|asymetri/),
    cote: 'signe',
    special: 'pos',
  },
  // ── rachis
  {
    id: 'tronc_lordose',
    all: A(/lordos|dos creux|creuse|cambrure lombaire|ensellure lombaire/),
    none: A(/perte de lordose|rectitude/),
    s: 1,
  },
  { id: 'tronc_cyphose', all: A(/cyphos|dos rond|dos vout|dos bossu|enroule\w* dorsal/), s: 1 },
  {
    id: 'tronc_antero',
    all: A(/anterioris|(en )?avant|projet|decale/, /thorax|tronc|buste|poitrine/),
    s: 1,
  },
  {
    id: 'thorax_transl',
    all: A(/translat|decal|deplace|glisse/, /thorax|tronc|buste|cage/),
    cote: 'signe',
  },
  {
    id: 'tronc_rot',
    all: A(/rotation|tourn|rote|torsion/, /tronc|thorax|buste|rachis|colonne/),
    cote: 'signe',
    special: 'pos',
  },
  {
    id: 'tronc_incl',
    all: A(
      /incline|penche|inclinaison|scolio|lateroflex|lateral|flexion laterale|gite/,
      /tronc|thorax|buste|rachis|colonne|corps|scolio/
    ),
    cote: 'signe',
    special: 'pos',
  },
  // ── ceinture scapulaire / épaules
  {
    id: 'ceinture_rot',
    all: A(/ceinture|scapul|omoplate|thorax/, /rotation|tourn|rote|torsion/),
    none: A(/tronc|rachis/),
    cote: 'signe',
    special: 'pos',
  },
  {
    id: 'ceinture_incl',
    all: A(
      /ceinture scapul|ligne (des )?epaules|epaules? (en )?(oblique|bascul|desax|incline)|bi ?acromial|inclinaison scapul|ceinture/
    ),
    cote: 'signe',
    special: 'bascule',
  },
  {
    id: 'epaule_antep',
    all: A(/epaules?|scapula/, /avant|enroul|antepuls|protract|ferme|ronde/),
    none: A(/arriere|retropuls/),
    s: 1,
    cote: 'lat',
  },
  { id: 'epaule_antep', all: A(/epaules?/, /arriere|retropuls|retract|bombe/), s: -1, cote: 'lat' },
  {
    id: 'epaule_elev',
    all: A(/epaules?|trapeze/, /haut|elev|remont|monte|crispe|surelev/),
    none: A(/basse|abaiss|tomb|descend/),
    s: 1,
    cote: 'lat',
  },
  {
    id: 'epaule_elev',
    all: A(/epaules?/, /bas\b|basse|abaiss|tomb|descend|affaiss/),
    s: -1,
    cote: 'lat',
  },
  // ── tête et cou
  {
    id: 'tete_antep',
    all: A(
      /antepuls|protract|(tete|cou|menton)\w* (en avant|projet|avance|decal)|cou de vautour|tete avancee|forward head/
    ),
    s: 1,
  },
  {
    id: 'tete_flex',
    all: A(/\b(tete|cervical|nuque|cou)\b/, /extension|en arriere|redresse|renverse/),
    none: A(/antepuls|avant/),
    s: -1,
  },
  {
    id: 'tete_flex',
    all: A(/\b(tete|cervical|cou)\b/, /flexion|baisse|fle?chie|penche\w* en avant|menton rentre/),
    none: A(/antepuls/),
    s: 1,
  },
  {
    id: 'tete_rot',
    all: A(/\b(tete|cou|cervical|menton|regard)\b/, /rotation|tourn|rote|pivot/),
    cote: 'signe',
    special: 'pos',
  },
  {
    id: 'tete_incl',
    all: A(
      /\b(tete|cou|cervical|oreille)\b/,
      /incline|penche|inclinaison|torticolis|lateroflex|bascul/
    ),
    cote: 'signe',
    special: 'pos',
  },
  { id: 'tete_transl', all: A(/\b(tete|cou)\b/, /translat|decal|deplace|glisse/), cote: 'signe' },
  // ── membre supérieur
  { id: 'avbras_pron', all: A(/pronat/), s: 1, cote: 'lat' },
  { id: 'avbras_pron', all: A(/supinat/), s: -1, cote: 'lat' },
  { id: 'coude_flex', all: A(/coude/, /flexion|fle?chi|plie/), s: 1, cote: 'lat' },
  { id: 'bras_rot', all: A(/bras|epaule|humerus/, /rotation interne|\bri\b/), s: -1, cote: 'lat' },
  { id: 'bras_rot', all: A(/bras|epaule|humerus/, /rotation externe|\bre\b/), s: 1, cote: 'lat' },
  {
    id: 'bras_abd',
    all: A(/abduction|ecarte|eloigne/, /bras|membre superieur/),
    s: 1,
    cote: 'lat',
  },
  {
    id: 'bras_abd',
    all: A(/adduction|colle|rapproche/, /bras|membre superieur/),
    s: -1,
    cote: 'lat',
  },
];

const NIVEAUX = [
  [
    /\b(tres (important|importante|marque|marquee|prononce|prononcee|accentue|accentuee)|severe|majeur|majeure|massif|massive|extreme|enorme|maximal|maximale)\b/,
    3,
  ],
  [
    /\b(leger|legere|legers|legeres|discret|discrete|minime|faible|modeste|un peu|sensible|debutant)\b/,
    0,
  ],
  [/\b(modere|moderee|moyen|moyenne|intermediaire)\b/, 1],
  [
    /\b(marque|marquee|important|importante|net|nette|prononce|prononcee|franc|franche|notable|accentue|accentuee|fort|forte|beaucoup|evident|evidente|excessif|excessive)\b/,
    2,
  ],
];
const FRACTIONS = [0.25, 0.5, 0.75, 1];
export const LIBELLES_NIVEAU = ['léger', 'modéré', 'marqué', 'sévère'];

const COTE_D = /\b(droit|droite|droits|droites|dte)\b/;
const COTE_G = /\b(gauche|gauches|gche)\b/;
const LES2 =
  /bilateral\w*|des deux cotes|deux cotes|\bles deux\b|\bles (genoux|pieds|epaules|cuisses|hanches|jambes|bras|coudes|avant ?bras|tibias|membres)\b|\bgenoux\b|\bpieds\b|\bepaules\b|\bjambes\b|\bcuisses\b|\bcoudes\b/;
function cotes(seg0) {
  const seg = seg0.split(/ que /)[0]; // « épaule droite plus haute que la gauche » : seul le premier côté est concerné
  const lettres = seg.match(
    /\b(?:cote|genou|pied|epaule|bras|jambe|hanche|cuisse|coude|membre|tibia)\s+([dg])\b/
  );
  let droite = COTE_D.test(seg),
    gauche = COTE_G.test(seg);
  if (lettres) {
    if (lettres[1] === 'd') droite = true;
    else gauche = true;
  }
  return { droite, gauche, les2: LES2.test(seg) };
}

function magnitude(c, direction, niveau, nombre, unite) {
  const extreme = direction > 0 ? c.max : -c.min;
  if (nombre != null) {
    let n = nombre;
    if (c.unite === 'mm' && /cm|centimetre/.test(unite || '')) n = nombre * 10;
    if (c.unite === 'cm' && /mm|millimetre/.test(unite || '')) n = nombre / 10;
    return Math.min(extreme, n);
  }
  const q = c.qual && direction > 0 ? c.qual[niveau] : null;
  const brut = q != null ? q : extreme * FRACTIONS[niveau];
  return c.unite === 'cm' ? Math.max(0.5, Math.round(brut * 2) / 2) : Math.max(1, Math.round(brut));
}

const ok = (seg, c) =>
  c.all.every((r) => r.test(seg)) && !(c.none && c.none.some((r) => r.test(seg)));
// proposition du texte : « avec », « et », virgules… mais pas « plus » (« plus courte »)
const COUPE =
  /[.;\n,:!?]| puis | avec | ainsi que | mais | et aussi | associe a | associee a | on note | on observe /;

// → { propositions: [{id, valeur, texte, phrase, niveau, defaut, remarque}], ignorees: [phrases non comprises] }
export function interpreter(texte) {
  const propositions = [];
  const ignorees = [];
  const brut = nombresEnChiffres(norm(texte))
    .replace(/[,;]\s*(\d+(?:[.,]\d+)?\s*(?:°|degres?|deg|cm|centimetres?|mm|millimetres?))/g, ' $1')
    .replace(
      /[,;]\s*(leger\w*|modere\w*|marque\w*|severe\w*|important\w*|discret\w*)(?=\s*(?:[,;.]|$| et ))/g,
      ' $1'
    );
  // « et » sépare deux constats, sauf entre deux côtés (« à droite et à gauche »)
  const segments = brut
    .split(COUPE)
    .flatMap((x) =>
      x.split(/ et (?!(?:a |de |du |des )?(?:droite|gauche|droit|gauches|droits|droites)\b)/)
    )
    .map((x) => x.trim())
    .filter((x) => x.length > 1);
  let dernier = null;
  for (const seg of segments) {
    const sansCote = seg
      .replace(/\b(droit|droite|droits|droites|gauche|gauches)\b/g, ' ')
      .replace(/\s+/g, ' ');
    const concept = CONCEPTS.find((k) => ok(seg, k) || ok(sansCote, k));
    const sc = cotes(seg);
    const herite = !concept && dernier && (sc.droite || sc.gauche || sc.les2);
    const cc = concept || (herite ? dernier.concept : null);
    if (!cc) {
      ignorees.push(seg);
      continue;
    }
    let niveau = 1,
      defaut = true;
    for (const [re, n] of NIVEAUX)
      if (re.test(seg)) {
        niveau = n;
        defaut = false;
        break;
      }
    const nb = seg.match(/(\d+(?:[.,]\d+)?)\s*(°|degres?|deg|cm|centimetres?|mm|millimetres?)?/);
    let nombre = nb ? parseFloat(nb[1].replace(',', '.')) : null;
    const unite = nb ? nb[2] : null;
    if (nombre != null) defaut = false;
    if (herite && defaut && dernier) {
      niveau = dernier.niveau;
      nombre = dernier.nombre;
      defaut = dernier.defaut;
    }
    dernier = { concept: cc, niveau, nombre, defaut };
    const cibles = [];
    let remarque = '';
    const inverse =
      /\b(haut|haute|monte|remonte|plus haut|plus haute|releve)\b/.test(seg) &&
      !/\b(bas|basse|descend|plus bas|plus basse)\b/.test(seg);
    if (cc.special === 'global') {
      const pivot = /cheville|talon|pied/.test(seg)
        ? 'glob_chev'
        : /genou/.test(seg)
          ? 'glob_gen'
          : /bassin|hanche/.test(seg)
            ? 'glob_bassin'
            : null;
      const arriere = /posterioris|en arriere|retropuls/.test(seg) && !/anterioris/.test(seg);
      if (!pivot) remarque = 'articulation non précisée : depuis les chevilles';
      cibles.push({ id: pivot || 'glob_chev', dir: arriere ? -1 : 1 });
    } else if (cc.special === 'iml') {
      const m = seg.match(/(droit|droite|gauche)/);
      const longue = /longue?\b/.test(seg) && !/courte?\b/.test(seg);
      if (!m) {
        ignorees.push(seg + ' (côté non précisé)');
        continue;
      }
      const dCourte = (m[1] === 'gauche') === longue; // jambe G longue ⇒ D courte
      cibles.push({ id: 'bassin_inegalite', dir: dCourte ? 1 : -1 });
    } else if (cc.cote === 'lat') {
      let lst = [];
      if (sc.droite && sc.gauche) lst = ['D', 'G'];
      else if (sc.droite) lst = ['D'];
      else if (sc.gauche) lst = ['G'];
      else if (sc.les2) lst = ['D', 'G'];
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
      let dir = sc.droite ? 1 : -1;
      if (cc.special === 'bascule' && inverse) dir = -dir; // « bassin haut à droite » = côté droit haut = gauche bas
      cibles.push({ id: cc.id, dir });
    } else cibles.push({ id: cc.id, dir: cc.s });
    for (const t of cibles) {
      const c = PAR_ID[t.id];
      if (!c) continue;
      const m = magnitude(c, t.dir, niveau, nombre, unite);
      const valeur = t.dir * m;
      const mot = (valeur < 0 ? c.fin[0] : c.fin[1]) || '';
      const prop = {
        id: t.id,
        valeur,
        phrase: seg,
        niveau: nombre != null ? null : niveau,
        defaut,
        remarque,
        texte: c.label + ' : ' + (mot ? mot + ' ' : '') + Math.abs(valeur) + ' ' + c.unite,
      };
      const i = propositions.findIndex((p) => p.id === t.id);
      if (i >= 0) {
        if (!(defaut && !propositions[i].defaut)) propositions[i] = prop;
      } else propositions.push(prop);
    }
  }
  return { propositions, ignorees };
}
