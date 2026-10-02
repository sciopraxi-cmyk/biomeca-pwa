import { describe, it, expect } from 'vitest';
import {
  assignerMarqueurs,
  retirerSeriesManufacturees,
  colonnesCandidates,
  MAX_TACHES,
} from '../js/marqueurs-assignation.mjs';

// ═══════════════════════════════════════════════════════════════════
// #272 étage B — assignation, éprouvée sur DONNÉES RÉELLES
// ═══════════════════════════════════════════════════════════════════
//
// Toutes les coordonnées viennent d'une image KFPPA réelle, vue de face,
// relevée par le praticien : six marqueurs qu'il a placés à la main, et les
// vingt-huit taches que le détecteur a réellement trouvées sur cette même
// image — dont AUCUNE n'est un marqueur.
//
// Ce n'est donc pas un jeu construit pour faire passer l'algorithme : c'est
// le cas qui l'a mis en échec.

const MARQUEURS_D = [
  { x: 902, y: 33 },
  { x: 887, y: 247 },
  { x: 885, y: 501 },
];
const MARQUEURS_G = [
  { x: 1093, y: 31 },
  { x: 1090, y: 223 },
  { x: 1086, y: 501 },
];

// Les vingt-huit artefacts. Deux suites y dominent : les deux arêtes
// éclairées du montant du tapis, onze et dix points chacune.
const ARTEFACTS = [
  [781, 540],
  [675, 584],
  [632, 585],
  [636, 675],
  [634, 721],
  [647, 755],
  [1180, 95],
  [1132, 114],
  [1176, 134],
  [1146, 181],
  [1174, 200],
  [1144, 240],
  [1172, 257],
  [1142, 290],
  [1170, 306],
  [1140, 337],
  [1168, 349],
  [1138, 380],
  [1166, 390],
  [1136, 420],
  [1164, 425],
  [1134, 456],
  [1162, 459],
  [1160, 491],
  [1132, 494],
  [1158, 521],
  [1210, 522],
  [1128, 525],
].map(([x, y]) => ({ x, y }));

const TOUT = [...ARTEFACTS, ...MARQUEURS_D, ...MARQUEURS_G];

// Comparaison par coordonnées : l'ordre des objets ne doit pas compter, mais
// l'ordre VERTICAL dans chaque côté, si.
const coords = (arr) => arr.map((p) => [p.x, p.y]);

describe('#272-B assignation sur données réelles', () => {
  it('0. TÉMOIN — le jeu d’essai est bien celui annoncé', () => {
    // Sans cela, un test vert pourrait porter sur un jeu vide ou tronqué.
    expect(ARTEFACTS).toHaveLength(28);
    expect(TOUT).toHaveLength(34);
    expect(MARQUEURS_D).toHaveLength(3);
    expect(MARQUEURS_G).toHaveLength(3);
  });

  it('1. Les 34 taches mélangées → exactement les six bonnes', () => {
    const r = assignerMarqueurs(TOUT, 'genou-bi', 'face');
    expect(r, 'refus alors qu’une configuration existe').not.toBeNull();
    // Vue de FACE : le côté droit du patient est à gauche de l'image.
    expect(coords(r.D)).toEqual(coords(MARQUEURS_D));
    expect(coords(r.G)).toEqual(coords(MARQUEURS_G));
  });

  it('2. Les 28 artefacts SEULS → null', () => {
    // Refuser est le comportement attendu. Les deux arêtes de tapis ont un
    // compte exact de points alignés — c'est précisément le piège que le
    // contrôle actuel de la production ne voit pas.
    expect(assignerMarqueurs(ARTEFACTS, 'genou-bi', 'face')).toBeNull();
  });

  it('3. Cinq marqueurs sur six → null', () => {
    // Une assignation partielle produit un angle faux qui a l'air normal.
    for (let i = 0; i < 6; i++) {
      const six = [...MARQUEURS_D, ...MARQUEURS_G];
      const cinq = six.filter((_, k) => k !== i);
      expect(
        assignerMarqueurs([...ARTEFACTS, ...cinq], 'genou-bi', 'face'),
        `marqueur ${i} retiré : devrait refuser`
      ).toBeNull();
    }
  });

  it('4. TÉMOIN — un seul marqueur décalé de 200 px fait ROUGIR le cas 1', () => {
    // Sans ce témoin, « rend les six » pourrait venir d'une fonction qui rend
    // n'importe quoi. On vérifie que le résultat n'est plus celui attendu.
    const altere = [...ARTEFACTS, { x: 902 + 200, y: 33 }, ...MARQUEURS_D.slice(1), ...MARQUEURS_G];
    const r = assignerMarqueurs(altere, 'genou-bi', 'face');
    const inchange =
      r !== null && JSON.stringify(coords(r.D)) === JSON.stringify(coords(MARQUEURS_D));
    expect(inchange, 'le décalage n’a rien changé : le test 1 ne prouve rien').toBe(false);
  });

  it('5. La VUE est un paramètre — face et dos échangent les côtés', () => {
    const face = assignerMarqueurs(TOUT, 'genou-bi', 'face');
    const dos = assignerMarqueurs(TOUT, 'genou-bi', 'dos');
    expect(face).not.toBeNull();
    expect(dos).not.toBeNull();
    // Mêmes coordonnées, côtés échangés. C'est la convention de #267, pas une
    // redécouverte : en vue de dos, le côté droit du patient est à droite.
    expect(coords(dos.D)).toEqual(coords(face.G));
    expect(coords(dos.G)).toEqual(coords(face.D));
    // Et les deux ne se confondent pas : sans cela l'assertion serait creuse.
    expect(coords(face.D)).not.toEqual(coords(face.G));
  });

  it('6. Entrées irrecevables → null, jamais d’exception', () => {
    expect(assignerMarqueurs([], 'genou-bi', 'face')).toBeNull();
    expect(assignerMarqueurs(TOUT, 'mla', 'face')).toBeNull(); // pas de latéralité
    expect(assignerMarqueurs(TOUT, 'inconnu', 'face')).toBeNull();
    expect(assignerMarqueurs(TOUT, 'genou-bi', 'profil')).toBeNull();
    expect(assignerMarqueurs(null, 'genou-bi', 'face')).toBeNull();
  });
});

describe('#272-B les briques, éprouvées séparément', () => {
  it('7. Les deux arêtes de tapis sont reconnues comme manufacturées', () => {
    const { series, restantes } = retirerSeriesManufacturees(ARTEFACTS);
    expect(
      series.length,
      'aucune série trouvée dans une image qui en contient deux'
    ).toBeGreaterThanOrEqual(2);
    // Les séries retirées sont longues : c'est le critère, et non l'alignement.
    for (const s of series) expect(s.length).toBeGreaterThanOrEqual(5);
    expect(restantes.length).toBeLessThan(ARTEFACTS.length);
  });

  it('8. TÉMOIN — trois points alignés ne sont PAS une série', () => {
    // Mesuré sur les données réelles : les trois marqueurs du côté G sont
    // alignés plus finement (résidu 0,09 px) que l'arête de tapis (1,55 px).
    // Si le critère était l'alignement, ils seraient retirés — et l'algorithme
    // rejetterait l'anatomie en gardant l'objet manufacturé.
    const { series, restantes } = retirerSeriesManufacturees(MARQUEURS_G);
    expect(series).toHaveLength(0);
    expect(restantes).toHaveLength(3);
  });

  it('9. L’énumération trouve les deux jambes parmi les taches restantes', () => {
    const { restantes } = retirerSeriesManufacturees(TOUT);
    const cols = colonnesCandidates(restantes, 3);
    const estJambe = (c, m) =>
      c.length === m.length && c.every((p) => m.some((q) => q.x === p.x && q.y === p.y));
    expect(
      cols.some((c) => estJambe(c, MARQUEURS_D)),
      'la jambe D doit figurer'
    ).toBe(true);
    expect(
      cols.some((c) => estJambe(c, MARQUEURS_G)),
      'la jambe G doit figurer'
    ).toBe(true);
  });

  it('10. Au-delà de MAX_TACHES, la fonction REFUSE au lieu de ramer', () => {
    // La borne est importée, jamais recopiée : si elle change, ce test suit.
    const trop = [];
    for (let i = 0; i <= MAX_TACHES; i++) trop.push({ x: 100 + i, y: 100 + i * 7 });
    expect(trop.length).toBeGreaterThan(MAX_TACHES);
    expect(assignerMarqueurs(trop, 'ap-bi', 'dos')).toBeNull();

    // ET LA BORNE DOIT SAVOIR ACCEPTER. Une liste de taille EXACTEMENT
    // MAX_TACHES, contenant une configuration valide noyée dans du
    // remplissage, doit rendre un résultat. Sans cette moitié, une fonction
    // qui refuserait TOUJOURS passerait l'assertion ci-dessus, et « refuse
    // au-delà de la borne » ne se distinguerait pas de « refuse tout le
    // temps ». Le remplissage est posé en bande quasi horizontale : aucun de
    // ses sous-ensembles ne peut former une colonne verticale.
    const legD = jambeAP(900, 200, 10);
    const legG = jambeAP(1100, 198, 10);
    // Le remplissage est tenu À L'ÉCART DE L'AXE des deux jambes. Une
    // première version le posait jusqu'à x = 875, à 25 px de la jambe D :
    // un seul de ces points, 500 px plus bas, suffisait à la faire avaler
    // par une fausse série — cf. le cas 14, qui documente ce défaut. Ici on
    // veut éprouver la BORNE, pas ce mécanisme-là.
    const bourrage = [];
    for (let i = 0; bourrage.length + 8 < MAX_TACHES; i++) {
      bourrage.push({ x: 100 + i * 15, y: 700 + (i % 5) });
    }
    const juste = [...bourrage, ...legD, ...legG];
    expect(juste.length, 'la liste doit atteindre exactement la borne').toBe(MAX_TACHES);
    const r = assignerMarqueurs(juste, 'ap-bi', 'dos');
    expect(r, 'à la borne exacte, une configuration valide doit être trouvée').not.toBeNull();
    expect(coords(r.D)).toEqual(coords(legG));
    expect(coords(r.G)).toEqual(coords(legD));
  });
});

// ═══════════════════════════════════════════════════════════════════
// Les tests de DOS — quatre marqueurs, dont deux presque collés
// ═══════════════════════════════════════════════════════════════════
//
// GÉOMÉTRIE CONSTRUITE, PAS RELEVÉE. Je ne dispose pas des coordonnées d'une
// capture de verrouillage AP : les seules mesures réelles en ma possession
// sont celles du KFPPA ci-dessus. Les points ci-dessous sont bâtis à partir
// de distances anatomiques et de l'échelle de l'image réelle (1,39 mm/px) —
// milieu mollet, jonction musculo-tendineuse à 140 mm, calcanéum supérieur à
// 90 mm de plus, calcanéum inférieur 35 mm sous lui.
//
// Une fixture construite et annoncée vaut mieux qu'une fixture réelle mal
// attribuée ; mais elle n'établit que la COHÉRENCE de l'algorithme sur cette
// géométrie, pas qu'elle soit celle du terrain.

const mm = (v) => Math.round(v / 1.39);

function jambeAP(xBase, yBase, decalageMollet) {
  return [
    { x: xBase + mm(decalageMollet), y: yBase },
    { x: xBase + mm(decalageMollet * 0.4), y: yBase + mm(140) },
    { x: xBase, y: yBase + mm(230) },
    { x: xBase, y: yBase + mm(265) },
  ];
}

describe('#272-B tests de dos (ap-bi)', () => {
  it('11. Quatre marqueurs par côté, dont deux calcanéums rapprochés', () => {
    // Décalage du ventre du mollet de 10 mm : étalement relatif mesuré 0,037,
    // dans la même plage que les jambes réelles du KFPPA (0,036 et 0,015).
    const D = jambeAP(900, 200, 10);
    const G = jambeAP(1100, 198, 10);
    const r = assignerMarqueurs([...D, ...G], 'ap-bi', 'dos');
    expect(r, 'refus sur une configuration pourtant plausible').not.toBeNull();
    // Vue de DOS : le côté droit du patient est à DROITE de l'image.
    expect(coords(r.D)).toEqual(coords(G));
    expect(coords(r.G)).toEqual(coords(D));
  });

  it('12. Les deux calcanéums, presque collés, ne sont pas confondus', () => {
    // C'est la géométrie qui mettait en échec le contrôle de la production :
    // écarts 140 / 90 / 35 mm, soit un rapport max/min de 4 — au-dessus du
    // 2,5 exigé par spacingOk, qui rejetterait donc l'anatomie réelle.
    const D = jambeAP(900, 200, 10);
    const r = assignerMarqueurs([...D, ...jambeAP(1100, 198, 10)], 'ap-bi', 'dos');
    expect(r).not.toBeNull();
    const ys = r.G.map((p) => p.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b)); // triés de haut en bas
    const ecarts = ys.slice(1).map((y, i) => y - ys[i]);
    expect(Math.max(...ecarts) / Math.min(...ecarts), 'rapport des écarts').toBeGreaterThan(2.5);
  });

  it('14. Une série qui avale une jambe est rattrapée par LA GARDE', () => {
    // CE QUI A CHANGÉ, ET POURQUOI. Ce cas figeait d'abord un refus obtenu
    // PAR ACCIDENT : la jambe D disparaissait, il ne restait qu'une colonne,
    // et la fonction rendait null faute de paire. Le refus était juste, sa
    // raison ne l'était pas — il suffisait qu'un faux candidat existe ailleurs
    // pour qu'une paire se forme et que la fonction assigne (cf. cas 15).
    //
    // Désormais le refus vient de la GARDE DE VÉRIFICATION : après coup, on
    // regarde ce qui a été jeté, et l'on refuse si une série retirée était
    // MAJORITAIREMENT une colonne plausible. Ici 4 points sur 5, soit 0,80.
    //
    // Mécanisme de l'accident, mesuré : la tolérance de série vaut
    // 0,03 × étendue. Un seul point 309 px plus bas porte l'étendue à 500 px
    // donc la tolérance à 15 px — assez pour qu'une jambe dont l'étalement
    // réel n'est que de 7 px y entre tout entière.
    const legD = jambeAP(900, 200, 10);
    const legG = jambeAP(1100, 198, 10);
    const parasite = { x: 850, y: 700 }; // sur l'axe de la jambe D, loin en bas
    const r = assignerMarqueurs([...legD, ...legG, parasite], 'ap-bi', 'dos');
    expect(r, 'une configuration concurrente a été détruite : refuser').toBeNull();
  });

  it('15. SUBSTITUTION — jambe avalée PLUS faux candidat → null', () => {
    // LE CAS LE PLUS IMPORTANT DU FICHIER. C'est le seul mode d'échec de
    // cette fonction qui produise un angle faux plutôt qu'un refus.
    //
    // Mesuré avant la garde : la jambe D était avalée, un faux candidat
    // prenait sa place, et la fonction rendait DEUX CÔTÉS FAUX — ce qui
    // sortait comme « D » était la vraie jambe G, et ce qui sortait comme
    // « G » était l'artefact. Aucun signal, un angle calculé et imprimé.
    //
    // La garde le transforme en refus explicite. Sur un outil clinique,
    // refuser en s'expliquant vaut mieux que produire deux angles faux.
    const legD = jambeAP(900, 200, 10);
    const legG = jambeAP(1100, 198, 10);
    const parasite = { x: 850, y: 700 };
    const fauxCandidat = [
      { x: 700, y: 199 },
      { x: 701, y: 300 },
      { x: 700, y: 364 },
      { x: 700, y: 390 },
    ];
    const r = assignerMarqueurs([...legD, ...legG, parasite, ...fauxCandidat], 'ap-bi', 'dos');
    expect(r, 'substitution silencieuse : la garde doit refuser').toBeNull();
  });

  it('16. LIMITE NON RÉSOLUE — une longue série dans l’axe d’une jambe', () => {
    // CE TEST CONSIGNE UN DÉFAUT, IL NE LE JUSTIFIE PAS.
    //
    // Quand une série est assez LONGUE pour que la jambe n'y soit pas
    // majoritaire, la garde reste muette et la substitution se produit : la
    // fonction assigne quatre points faux, les deux côtés inversés.
    //
    // MESURÉ, et c'est pourquoi on n'ajoute pas de critère ici :
    //   - la jambe occupe 4 points sur 10, soit 0,40 : sous la majorité ;
    //   - les écarts de cette série valent 101·64·26·109·90·90·90·90·90,
    //     soit un rapport max/médian de 1,21 — PLUS RÉGULIER que les vraies
    //     arêtes de tapis, mesurées à 1,61 et 1,37. Un critère de régularité
    //     ne la distinguerait donc pas.
    //
    // CE CAS EST INTRINSÈQUEMENT AMBIGU. Une jambe alignée sur une arête, aux
    // mêmes écarts, n'est pas distinguable de cette arête par la seule
    // géométrie des points. Aucun traitement a posteriori ne le résout.
    //
    // IL SE TRAITE AILLEURS : l'acquisition n'a lieu qu'UNE FOIS et le
    // praticien voit le résultat à l'écran. Elle devra être CONFIRMÉE
    // visuellement avant d'être verrouillée, et le suivi partira d'un état
    // validé par un humain. NE PAS « réparer » ce cas en déplaçant un seuil
    // ici : ce serait rouvrir la porte aux artefacts que les cas 1 et 2
    // écartent.
    const legD = jambeAP(900, 200, 10);
    const legG = jambeAP(1100, 198, 10);
    const arete = [];
    for (let k = 0; k < 6; k++) arete.push({ x: 900, y: 500 + k * 90 });
    const fauxCandidat = [
      { x: 700, y: 199 },
      { x: 701, y: 300 },
      { x: 700, y: 364 },
      { x: 700, y: 390 },
    ];
    const r = assignerMarqueurs([...legD, ...legG, ...arete, ...fauxCandidat], 'ap-bi', 'dos');
    // Comportement ACTUEL, consigné tel quel : la fonction assigne, et c'est
    // faux. Le jour où l'étage A confirmera visuellement, ce cas restera
    // rouge côté fonction pure — c'est voulu, il documente la limite.
    expect(r, 'comportement actuel : elle assigne au lieu de refuser').not.toBeNull();
    expect(coords(r.G), 'le côté G rendu est le faux candidat').toEqual(coords(fauxCandidat));
    expect(coords(r.D), 'et le côté D rendu est en réalité la jambe G').toEqual(coords(legG));
  });

  it('13. LIMITE CONNUE — un mollet très en dehors n’est plus reconnu', () => {
    // Mesuré : à 15 mm de décalage l'étalement relatif atteint 0,058, à 25 mm
    // il atteint 0,094 — soit PLUS que le parasite du KFPPA, mesuré à 0,086.
    // Aucun seuil unique ne sépare alors l'anatomie de l'artefact.
    //
    // CE TEST FIGE UNE LIMITE, IL NE LA JUSTIFIE PAS. Il est là pour que le
    // jour où un modèle par famille de test remplacera le seuil unique, on
    // sache exactement ce qui change. Ne pas le « réparer » en remontant le
    // seuil : ce serait rouvrir la porte au parasite.
    const D = jambeAP(900, 200, 25);
    const G = jambeAP(1100, 198, 25);
    expect(assignerMarqueurs([...D, ...G], 'ap-bi', 'dos')).toBeNull();
  });
});
