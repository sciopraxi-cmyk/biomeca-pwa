// ═══════════════════════════════════════════════════════════════════
// #268-L1 — sous-lot boutons : .btn-blue et boutons foncés de Paramètres
// ═══════════════════════════════════════════════════════════════════
//
// Arbitrage du 10/10/2026. En clair, .btn-blue gardait le fond --blue-d
// (#0d4a32, vert-bleu très sombre) : jamais redéfini dans la portée claire.
// On change la RÈGLE, pas la variable : --blue-d sert aussi le badge .bb et
// les puces d'agenda, où une redéfinition aurait fait tomber le texte --blue
// à 1,25:1.
//
// La règle vise « body.theme-clair .page-claire .btn-blue » et non
// « body.theme-clair .btn-blue » : --verticy-bleu n'est déclarée QUE dans la
// portée claire. Un .btn-blue hors de toute .page-claire (fenêtres du groupe
// B, « Choisir une formule ») recevrait sinon une variable indéfinie — fond
// invalide, donc transparent, texte blanc sur le voile.
//
// Hors de ce sous-lot : le bouton flottant « Assistant » (règle soumise à
// validation) ; les puces d'agenda par défaut (1,59:1, futur lot « agenda
// clair ») ; toggleCurveDir, sans appelant.

import { describe, it, expect } from 'vitest';
import { contraste } from './helpers/contraste.mjs';
import {
  analyser,
  sousArbreParId,
  declarations,
  declarationsDeClasses,
  regles,
  resoudre,
  mesurerFenetre,
  valeursClaires,
  valeursRacine,
  FENETRES_A,
  racineFenetre,
  HTML_ENTIER,
} from './helpers/fenetres-claires.mjs';

const SEUIL = 4.5;
const CLAIR = valeursClaires();
const SOMBRE = valeursRacine();
const REGLES = regles();

const trouver = (racine, pred) => {
  const pile = [racine];
  while (pile.length) {
    const n = pile.pop();
    if (pred(n)) return n;
    pile.push(...n.enfants);
  }
  return null;
};

describe('#268 boutons — .btn-blue dans une portée claire', () => {
  it('B1. Fond --verticy-bleu, texte blanc à 4,5:1 au moins', () => {
    const d = declarationsDeClasses(['btn', 'btn-blue'], true);
    expect(d.background).toBe('var(--verticy-bleu)');
    expect(d['border-color']).toBe('var(--verticy-bleu)');
    const fond = resoudre(d.background, CLAIR);
    expect(fond).toBe('#2563eb');
    expect(contraste(resoudre(d.color, CLAIR), fond)).toBeGreaterThanOrEqual(SEUIL);
  });

  it('B1-réel. « Enregistrer le praticien » et « Créer le dossier », mesurés en place', () => {
    const page = sousArbreParId(analyser(HTML_ENTIER), 'pg-praticiens');
    const pp = mesurerFenetre(page).mesures.find((m) =>
      m.texte.includes('Enregistrer le praticien')
    );
    expect(pp, 'bouton du praticien non mesuré').toBeDefined();
    expect(pp.fond).toBe('#2563eb');
    expect(pp.ratio).toBeGreaterThanOrEqual(SEUIL);

    const np = racineFenetre(FENETRES_A.find((f) => f.cle === 'nouveau-patient'));
    const cd = mesurerFenetre(np).mesures.find((m) => m.texte.includes('Créer le dossier'));
    expect(cd, 'bouton Créer le dossier non mesuré').toBeDefined();
    expect(cd.fond).toBe('#2563eb');
    expect(cd.ratio).toBeGreaterThanOrEqual(SEUIL);
  });

  it('B2. Le survol reste --blue, et n’est pas tué par la règle de base', () => {
    // La règle de base est à [0,3,1] : sans règle de survol de même portée,
    // elle battrait .btn-blue:hover [0,2,0] et le survol serait mort — le
    // piège déjà rencontré sur .tcard au lot 3A.
    const survol = REGLES.find((r) =>
      r.selecteurs.includes('body.theme-clair .page-claire .btn-blue:hover')
    );
    expect(survol, 'règle de survol absente').toBeDefined();
    expect(survol.decl.background).toBe('var(--blue)');
    expect(contraste('#ffffff', resoudre('var(--blue)', CLAIR))).toBeGreaterThanOrEqual(SEUIL);
  });
});

describe('#268 boutons — témoin : hors portée claire, rien ne change', () => {
  it('B3. Un .btn-blue sous body.theme-clair mais hors .page-claire garde --blue-d', () => {
    // Cas de « Confirmer » / « Choisir » dans « Choisir une formule ».
    const d = declarationsDeClasses(['btn', 'btn-blue'], true, REGLES, false);
    expect(d.background).toBe('var(--blue-d)');
    expect(resoudre(d.background, SOMBRE)).toBe('#0d4a32');
    // Et la raison du choix de portée : hors .page-claire, --verticy-bleu
    // n'existe pas — une règle au niveau de body rendrait un fond invalide.
    expect(SOMBRE['--verticy-bleu']).toBeUndefined();
  });

  it('B3b. Aucune règle « body.theme-clair .btn-blue » ne pose de fond', () => {
    const fautives = REGLES.filter(
      (r) =>
        r.selecteurs.some((s) => /^body\.theme-clair \.btn-blue(:hover)?$/.test(s)) &&
        (r.decl.background || r.decl['background-color'])
    );
    expect(fautives).toEqual([]);
  });
});

describe('#268 boutons — Paramètres : plus de bleu nuit en dur', () => {
  const page = sousArbreParId(analyser(HTML_ENTIER), 'pg-params');

  for (const libelle of ['Lancer la migration', 'Exporter toutes mes données']) {
    it(`B4. « ${libelle} » sur --verticy-bleu, texte blanc lisible`, () => {
      const b = trouver(page, (n) => n.tag === 'button' && n.texte.includes(libelle));
      expect(b, `${libelle} introuvable`).not.toBeNull();
      const s = declarations(b.attrs.style);
      expect(s.background).toBe('var(--verticy-bleu)');
      expect(s.color).toBe('#fff');
      expect(contraste('#ffffff', resoudre(s.background, CLAIR))).toBeGreaterThanOrEqual(SEUIL);
    });
  }

  it('B4b. Plus aucun #0e1f38 dans la page, hors fenêtre de migration (groupe B)', () => {
    const restes = [];
    const visiter = (n) => {
      if (n.attrs.id === 'backfill-lock-modal') return;
      if (/#0e1f38/i.test(n.attrs.style || ''))
        restes.push(`<${n.tag}> « ${n.texte.trim().slice(0, 30)} »`);
      n.enfants.forEach(visiter);
    };
    visiter(page);
    expect(restes).toEqual([]);
  });
});
