// Mannequin postural 3D — reprise des résultats de « Analyse posturale — captures 4 vues » (fonctions pures, sans WebGL).
// À partir des angles déjà calculés par le bloc 4 vues (face, dos, profil G, profil D), on PROPOSE une valeur pour les curseurs
// du mannequin qui ont un équivalent. Rien n'est écrit ici : l'interface montre l'aperçu avant/après et le praticien coche.
// Règles décidées par le praticien : moyenne quand une mesure vient de plusieurs vues ; une mesure sous le seuil du cabinet
// n'est pas reportée ; les conversions % → cm sont estimées (marquées « estimé »).
import { PAR_ID } from './parametres.js?v=v316';
import { seuilCabinet } from './mecanismes.js?v=v316';

// Seuils par défaut (identiques à POSTURE_THRESHOLDS_DEFAULTS de biomeca.js) ; la valeur du cabinet les remplace.
const DEFAUTS = {
  'face.tete': 2,
  'face.epaules': 2,
  'face.bassin': 2,
  'face.translation': 3,
  'face.valgumVarum': 3,
  'face.ouvertureMin': 15,
  'face.ouvertureMax': 25,
  'dos.calcaneen': 3,
  'neutralite.bassin': 3,
  'neutralite.genou': 3,
  'neutralite.cva': 2,
  'courbures.cervicale.hyper': 28,
  'courbures.thoracique.hyper': 32,
  'courbures.lombaire.hyper': 35,
};
const seuil = (cle) => {
  const c = seuilCabinet(cle);
  return c == null ? DEFAUTS[cle] : c;
};

// hypothèses d'estimation (marquées « estimé » dans l'aperçu)
export const LARGEUR_APPUI_CM = 30; // largeur d'appui supposée pour convertir les % de la vue de face en cm
export const LONGUEUR_C7_TRAGUS_CM = 15; // distance C7 → tragus supposée pour convertir l'angle CVA en cm d'antépulsion
export const CVA_NORME = 50; // ° (norme du cabinet, voir POSTURE_THRESHOLDS.neutralite.cva)

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : null);
const moy = (l) => {
  const v = l.map(num).filter((x) => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const arrondi = (x) => Math.round(x * 10) / 10;

// Mesures non reportées (pas de curseur équivalent) : on ne les liste que si elles sont réellement mesurées.
const NON_REPORTEES = [
  ['dos', 'rachisApex', 'Rachis de dos (apex, convexité)'],
  ['dos', 'asymetrieScapula', 'Scapulas (asymétrie, orientation)'],
  ['dos', 'sillonInterfessier', 'Sillon inter-fessier'],
  ['dos', 'trianglesTaille', 'Triangles de la taille'],
  ['dos', 'axeJambierD', 'Axe jambier'],
  ['face', 'translationBassin', 'Translation du bassin (face)'],
  ['face', 'deviationMandibule', 'Déviation de la mandibule (face)'],
  ['face', 'devNombril', 'Déviation du nombril (face)'],
  ['profilG', 'global', 'Antériorisation globale (profil)'],
  ['profilD', 'global', 'Antériorisation globale (profil)'],
  ['profilG', 'hanche', 'Hanche et cuisse (profil)'],
  ['profilD', 'hanche', 'Hanche et cuisse (profil)'],
];

/**
 * @param {object} analyse  bilan._postureAnalysis ({face, dos, profilG, profilD}, chacun avec .angles)
 * @returns {{propositions: Array<{id,valeur,estime,source}>, nonReportees: string[], vues: string[]}}
 */
export function calculerReprise(analyse) {
  const A = (k) => (analyse && analyse[k] && analyse[k].angles) || null;
  const face = A('face'),
    dos = A('dos'),
    pG = A('profilG'),
    pD = A('profilD');
  const vues = [face && 'face', dos && 'dos', pG && 'profil gauche', pD && 'profil droit'].filter(
    Boolean
  );
  const prop = {};
  const poser = (id, v, source, estime = false) => {
    const c = PAR_ID[id];
    if (!c || num(v) === null) return;
    let x = arrondi(Math.max(c.min, Math.min(c.max, v)));
    if (x === 0) return;
    prop[id] = { id, valeur: x, estime: !!estime, source };
  };
  const au = (v, s) => v !== null && Math.abs(v) >= s;

  // ── Fermeture viscérale (face) : voir règle du praticien ──────────────────────────────
  const ferm =
    face && (face.fermetureViscerale === 'D' || face.fermetureViscerale === 'G')
      ? face.fermetureViscerale
      : null;
  const sgn = ferm === 'D' ? 1 : -1;
  const ligneE = num(face && face.ligneEpaules);
  const bassinF = num(face && face.basculeBassin);
  let fermReglee = false;
  if (ferm) {
    // en position neutre la ligne des épaules et la ligne du bassin sont parallèles : l'angle qu'elles forment
    // (même convention de signe sur les deux : + = D plus haut) est l'écart reporté.
    const theta = ligneE !== null && bassinF !== null ? Math.abs(ligneE - bassinF) : null;
    const tronc = num(face.inclinaisonTronc);
    const busteDevie = au(tronc, seuil('face.tete'));
    if (busteDevie && theta !== null && theta > 0) {
      poser(
        'tronc_incl',
        sgn * theta,
        'fermeture viscérale ' +
          ferm +
          ' : angle entre la ligne des épaules et la ligne du bassin (' +
          arrondi(theta) +
          '°), buste dévié sur la photo'
      );
      fermReglee = true; // épaule et bassin suivent le tronc : on ne les reporte pas une 2e fois
    } else if (!busteDevie) {
      // buste droit sur la photo : épaule du côté de la fermeture abaissée, bassin du même côté monté
      if (ligneE !== null)
        poser(
          'ceinture_incl',
          sgn * Math.abs(ligneE),
          'fermeture viscérale ' + ferm + ' : épaule ' + ferm + ' abaissée'
        );
      if (bassinF !== null)
        poser(
          'bassin_bascule',
          -sgn * Math.abs(bassinF),
          'fermeture viscérale ' + ferm + ' : bassin ' + ferm + ' monté'
        );
      fermReglee = true;
    }
  }

  // ── Tête, épaules, bassin, tronc, thorax (face / dos) ─────────────────────────────────
  const incT = moy([face && face.inclinaisonTete, dos && dos.inclinaisonTete]);
  if (au(incT, seuil('face.tete')))
    poser('tete_incl', incT, 'inclinaison de la tête (moyenne des vues)');
  const rotT = num(face && face.rotationTete); // dos : signe ambigu, non repris
  if (au(rotT, seuil('face.tete'))) poser('tete_rot', rotT, 'rotation de la tête (face)');
  if (!fermReglee) {
    const ep = moy([ligneE, dos && dos.ligneEpaules]);
    if (au(ep, seuil('face.epaules')))
      poser('ceinture_incl', -ep, 'ligne des épaules (moyenne des vues ; + mannequin = côté bas)'); // + analyse = D plus haut
    const ba = moy([bassinF, dos && dos.basculeBassin]);
    if (au(ba, seuil('face.bassin')))
      poser('bassin_bascule', -ba, 'bascule du bassin (moyenne des vues ; + mannequin = côté bas)');
    const tr = num(face && face.inclinaisonTronc);
    if (au(tr, seuil('face.tete'))) poser('tronc_incl', tr, 'inclinaison du tronc (face)');
  }
  const th = num(face && face.translationThorax);
  if (au(th, seuil('face.translation')))
    poser(
      'thorax_transl',
      (th * LARGEUR_APPUI_CM) / 100,
      'translation du thorax (' +
        arrondi(th) +
        ' % × largeur d\u2019appui supposée ' +
        LARGEUR_APPUI_CM +
        ' cm)',
      true
    );

  // ── Membres inférieurs ───────────────────────────────────────────────────────────────
  for (const c of ['D', 'G']) {
    const vg = num(face && face['valgumVarum' + c]);
    if (au(vg, seuil('face.valgumVarum')))
      poser('genou_valgus_' + c, vg, 'valgus / varus du genou ' + c + ' (face)');
    const ou = num(face && face['ouverturePas' + c]);
    if (ou !== null) {
      const mn = seuil('face.ouvertureMin'),
        mx = seuil('face.ouvertureMax');
      if (ou > mx)
        poser(
          'pied_ouverture_' + c,
          ou - mx,
          'ouverture du pas ' + c + ' au-delà de la zone physiologique (' + arrondi(ou) + '°)'
        );
      else if (ou < mn)
        poser(
          'pied_ouverture_' + c,
          ou - mn,
          'pas ' + c + ' en dedans de la zone physiologique (' + arrondi(ou) + '°)'
        );
    }
    const ca = num(dos && dos['angleCalcaneen' + c]);
    if (au(ca, seuil('dos.calcaneen')))
      poser('pied_valgus_' + c, ca, 'angle calcanéen ' + c + ' (dos)');
    const pr = c === 'D' ? pD : pG;
    const gf = num(pr && pr.genouFlexion);
    if (gf !== null && Math.abs(180 - gf) >= seuil('neutralite.genou'))
      poser('genou_flex_' + c, 180 - gf, 'flessum / récurvatum du genou ' + c + ' (profil)');
  }

  // ── Profils : courbures, bassin, tête ────────────────────────────────────────────────
  const prof = (k) => moy([pG && pG[k], pD && pD[k]]);
  const cyph = prof('deviationThoracique');
  if (cyph !== null && cyph > seuil('courbures.thoracique.hyper'))
    poser(
      'tronc_cyphose',
      cyph - seuil('courbures.thoracique.hyper'),
      'hypercyphose : dépassement du seuil du cabinet (' + arrondi(cyph) + '°)'
    );
  const lord = prof('deviationLombaire');
  if (lord !== null && lord > seuil('courbures.lombaire.hyper'))
    poser(
      'tronc_lordose',
      lord - seuil('courbures.lombaire.hyper'),
      'hyperlordose : dépassement du seuil du cabinet (' + arrondi(lord) + '°)'
    );
  const bp = prof('bassin');
  if (au(bp, seuil('neutralite.bassin')))
    poser('bassin_antev', bp, 'antéversion / rétroversion du bassin (profil)');
  const cva = prof('cva');
  if (cva !== null && cva < CVA_NORME - seuil('neutralite.cva')) {
    const rad = Math.PI / 180;
    poser(
      'tete_antep',
      LONGUEUR_C7_TRAGUS_CM * (Math.cos(cva * rad) - Math.cos(CVA_NORME * rad)),
      'antépulsion de la tête d\u2019après l\u2019angle cranio-vertébral (' +
        arrondi(cva) +
        '°, norme ' +
        CVA_NORME +
        '°)',
      true
    );
  }
  const cerv = prof('deviationCervicale');
  if (cerv !== null && cerv > seuil('courbures.cervicale.hyper'))
    // hyperlordose cervicale = antépulsion + extension de la tête (l'antépulsion vient de l'angle cranio-vertébral ci-dessus)
    poser(
      'tete_flex',
      -(cerv - seuil('courbures.cervicale.hyper')),
      'hyperlordose cervicale : extension de la tête = dépassement du seuil (' +
        arrondi(cerv) +
        '°)'
    );

  const ordre = Object.keys(PAR_ID);
  const propositions = Object.values(prop).sort(
    (a, b) => ordre.indexOf(a.id) - ordre.indexOf(b.id)
  );
  const nonReportees = [];
  for (const [vue, champ, lib] of NON_REPORTEES) {
    const a = A(vue);
    const v = a && a[champ];
    if (
      v !== null &&
      v !== undefined &&
      !(typeof v === 'number' && !isFinite(v)) &&
      !nonReportees.includes(lib)
    )
      nonReportees.push(lib);
  }
  if (face && face.nezTordu === true) nonReportees.push('Nez tordu (face)');
  return { propositions, nonReportees, vues };
}
