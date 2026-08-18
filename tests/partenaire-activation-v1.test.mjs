// API partenaire — activation v1 — vérification du contrat
// docs/api-partenaire-activation-v1.md.
//
// Trois niveaux, comme pour l'API de lecture :
//   1. les corps produits sont comparés OCTET PAR OCTET aux goldens ;
//   2. les exemples du contrat sont comparés aux mêmes goldens, ce qui
//      empêche le document de dériver de l'implémentation ;
//   3. les règles du contrat sont vérifiées cas par cas.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CLES_ACTIVATION,
  ENGAGEMENT_PARTENAIRE,
  FORMULES_PARTENAIRE,
  corpsActivation,
  corpsErreur,
  estEmailValide,
  estPartnerRefValide,
  normaliserEmail,
  normaliserPartnerRef,
  rejeuConcordant,
  resoudreFormule,
  validerPayload,
} from '../supabase/functions/_shared/partenaire-activation-v1.ts';
import { PLAN_MODULES, isValidModulesForPlan } from '../js/subscription.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER_GOLDEN = join(ICI, 'golden', 'partenaire-activation-v1');
const CONTRAT = join(ICI, '..', 'docs', 'api-partenaire-activation-v1.md');

const golden = (nom) => readFileSync(join(DOSSIER_GOLDEN, nom), 'utf8');

// ═══════════════════════════════════════════════════════════════════
// 1. Sérialisation — octet par octet
// ═══════════════════════════════════════════════════════════════════

describe('Sérialisation — octet par octet (contrat § 9)', () => {
  it('1. compte créé produit exactement activation-cree.json', () => {
    expect(corpsActivation('3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'cree')).toBe(
      golden('activation-cree.json')
    );
  });

  it('2. compte existant produit exactement activation-existant.json', () => {
    expect(corpsActivation('9c5b94b1-35ad-49bb-b118-8e8fc24abf80', 'existant')).toBe(
      golden('activation-existant.json')
    );
  });

  it('3. les quatre corps d’erreur figés sont produits à l’identique', () => {
    expect(corpsErreur('formule_inconnue')).toBe(golden('erreur-formule-inconnue.json'));
    expect(corpsErreur('email_invalide')).toBe(golden('erreur-email-invalide.json'));
    expect(corpsErreur('licence_active_existante')).toBe(
      golden('erreur-licence-active-existante.json')
    );
    expect(corpsErreur('reference_incoherente')).toBe(golden('erreur-reference-incoherente.json'));
  });

  it('4. aucun golden ne porte de saut de ligne final ni d’indentation', () => {
    for (const nom of readdirSync(DOSSIER_GOLDEN)) {
      const octets = readFileSync(join(DOSSIER_GOLDEN, nom), 'utf8');
      expect(octets.endsWith('}'), `${nom} doit finir par } sans saut de ligne`).toBe(true);
      expect(octets.includes('\n'), `${nom} ne doit contenir aucun saut de ligne`).toBe(false);
      expect(octets.includes(': '), `${nom} ne doit pas être indenté`).toBe(false);
    }
  });

  it('5. l’ordre des clés est licenceId puis statut', () => {
    const corps = corpsActivation('3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'cree');
    expect(Object.keys(JSON.parse(corps))).toEqual([...CLES_ACTIVATION]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Le contrat ne dérive pas de l'implémentation
// ═══════════════════════════════════════════════════════════════════

describe('Contrat et goldens décrivent le même objet', () => {
  const markdown = readFileSync(CONTRAT, 'utf8');
  const exemples = [
    ...markdown.matchAll(/<!--\s*golden:\s*(\S+)\s*-->\s*\n+```json\n([\s\S]*?)```/g),
  ];

  it('6. chaque golden est référencé par un exemple du contrat', () => {
    const references = exemples.map(([, nom]) => nom).sort();
    expect(references).toEqual(readdirSync(DOSSIER_GOLDEN).sort());
  });

  it.each(exemples.map(([, nom, bloc]) => [nom, bloc]))(
    '7. l’exemple %s du contrat décrit le même objet que le golden',
    (nom, bloc) => {
      const duContrat = JSON.parse(bloc);
      const duGolden = JSON.parse(golden(nom));
      expect(duContrat).toEqual(duGolden);
      expect(Object.keys(duContrat)).toEqual(Object.keys(duGolden));
      expect(JSON.stringify(duContrat)).toBe(golden(nom));
    }
  );

  it('8. les 7 jetons du contrat sont exactement ceux du code', () => {
    for (const jeton of Object.keys(FORMULES_PARTENAIRE)) {
      expect(markdown.includes('`' + jeton + '`'), `${jeton} doit figurer au § 6`).toBe(true);
    }
    expect(Object.keys(FORMULES_PARTENAIRE)).toHaveLength(7);
  });

  it('9. aucune donnée interdite ne figure dans un golden (frontière § 1)', () => {
    // Frontière santé + colonnes strictement internes (§ 8) : ni l'une ni
    // les autres ne doivent jamais apparaître dans un corps de réponse.
    const interdits = [
      'nom',
      'prenom',
      'ddn',
      'email',
      'patientId',
      'bilanId',
      'payload',
      'partner_ref',
      'partnerRef',
      'compte_cree',
      'formule_partenaire',
      'user_id',
      'userId',
    ];
    for (const nom of readdirSync(DOSSIER_GOLDEN)) {
      const contenu = readFileSync(join(DOSSIER_GOLDEN, nom), 'utf8');
      for (const mot of interdits) {
        expect(contenu.includes(`"${mot}"`), `${nom} ne doit pas porter ${mot}`).toBe(false);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Vocabulaire des formules (contrat § 6)
// ═══════════════════════════════════════════════════════════════════

describe('Vocabulaire des formules (contrat § 6)', () => {
  it('10. chaque jeton se résout en (formule interne, modules)', () => {
    expect(resoudreFormule('SPORT')).toEqual({
      planIdx: 1,
      formuleInterne: 'formule_2',
      modules: ['podo_sport'],
    });
    expect(resoudreFormule('ESSENTIEL_PEDIATRIE')).toEqual({
      planIdx: 0,
      formuleInterne: 'formule_1',
      modules: ['podopedia'],
    });
  });

  it('11. chaque couple est valide au regard du canon subscription.mjs', () => {
    // Garde essentielle : si le canon Verticy évolue, ce test rougit ici et
    // non en production.
    for (const [jeton, f] of Object.entries(FORMULES_PARTENAIRE)) {
      const verdict = isValidModulesForPlan(f.planIdx, f.modules);
      expect(verdict.ok, `${jeton} : ${verdict.reason ?? ''}`).toBe(true);
    }
  });

  it('12. la formule interne vaut toujours formule_(planIdx+1)', () => {
    // Correspondance établie par stripe-webhook/index.ts:170.
    for (const [jeton, f] of Object.entries(FORMULES_PARTENAIRE)) {
      expect(f.formuleInterne, jeton).toBe('formule_' + (f.planIdx + 1));
    }
  });

  it('13. les 5 plans du canon sont tous atteignables', () => {
    const plansCouverts = new Set(Object.values(FORMULES_PARTENAIRE).map((f) => f.planIdx));
    expect([...plansCouverts].sort()).toEqual(PLAN_MODULES.map((p) => p.planIdx).sort());
  });

  it('14. les deux plans à choix ont bien deux jetons chacun', () => {
    const parPlan = (idx) =>
      Object.values(FORMULES_PARTENAIRE).filter((f) => f.planIdx === idx).length;
    expect(parPlan(0)).toBe(2); // Essentiel
    expect(parPlan(3)).toBe(2); // Duo Sport
    expect(parPlan(1)).toBe(1);
    expect(parPlan(2)).toBe(1);
    expect(parPlan(4)).toBe(1);
  });

  it('15. tout jeton hors des 7 est refusé, sans rattrapage de casse', () => {
    for (const v of ['sport', 'Sport', 'ESSENTIEL', 'PODO', 'DUO_SPORT', '', null, undefined, 3]) {
      expect(resoudreFormule(v), String(v)).toBe(null);
    }
  });

  it('16. aucun jeton ne se résout via une clé héritée d’Object.prototype', () => {
    // Object.hasOwn plutôt qu'un accès direct : sans lui, 'constructor' ou
    // 'toString' résoudraient vers une fonction et non vers null.
    expect(resoudreFormule('constructor')).toBe(null);
    expect(resoudreFormule('toString')).toBe(null);
    expect(resoudreFormule('__proto__')).toBe(null);
  });

  it('17. engagement partenaire distinct des valeurs existantes', () => {
    expect(ENGAGEMENT_PARTENAIRE).toBe('partenaire_podaxia');
    expect(['admin_gratuit', 'sans', '1_an']).not.toContain(ENGAGEMENT_PARTENAIRE);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Courriel et partner_ref (contrat § 5 et § 10.1)
// ═══════════════════════════════════════════════════════════════════

describe('Normalisation et validation (contrat § 10.1)', () => {
  it('18. le courriel est normalisé en minuscules, sans espaces', () => {
    expect(normaliserEmail('  Camille@Cabinet-Exemple.FR ')).toBe('camille@cabinet-exemple.fr');
    expect(normaliserEmail(null)).toBe('');
  });

  it('19. accepte un courriel bien formé', () => {
    for (const v of ['a@b.fr', 'praticienne@cabinet-exemple.fr', 'c.d+podaxia@sous.domaine.com']) {
      expect(estEmailValide(v), v).toBe(true);
    }
  });

  it('20. refuse un courriel malformé', () => {
    for (const v of ['', 'sans-arobase', 'a@b', 'a@@b.fr', 'a b@c.fr', '@b.fr', 'a@.fr']) {
      expect(estEmailValide(v), JSON.stringify(v)).toBe(false);
    }
  });

  it('21. refuse un courriel trop long', () => {
    expect(estEmailValide('a'.repeat(250) + '@b.fr')).toBe(false);
  });

  it('22. partner_ref : chaîne non vide et bornée', () => {
    expect(estPartnerRefValide(normaliserPartnerRef('PDX-2026-004178'))).toBe(true);
    expect(estPartnerRefValide(normaliserPartnerRef('   '))).toBe(false);
    expect(estPartnerRefValide(normaliserPartnerRef(null))).toBe(false);
    expect(estPartnerRefValide(normaliserPartnerRef('x'.repeat(201)))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Validation du payload (contrat § 10)
// ═══════════════════════════════════════════════════════════════════

const PAYLOAD = {
  partner_ref: 'PDX-2026-004178',
  email: 'praticienne@cabinet-exemple.fr',
  nom: 'Dupont',
  prenom: 'Camille',
  formule: 'DUO_SPORT_PEDIATRIE',
};

describe('validerPayload (contrat § 10)', () => {
  it('23. accepte un payload complet et le normalise', () => {
    const r = validerPayload({ ...PAYLOAD, email: '  Praticienne@Cabinet-Exemple.FR ' });
    expect(r.ok).toBe(true);
    expect(r.payload.email).toBe('praticienne@cabinet-exemple.fr');
    expect(r.payload.jetonFormule).toBe('DUO_SPORT_PEDIATRIE');
    expect(r.payload.formule.modules).toEqual(['podo_sport', 'podopedia']);
  });

  it('24. nom et prenom sont facultatifs et n’empêchent jamais l’activation', () => {
    const r = validerPayload({
      partner_ref: 'PDX-1',
      email: 'a@b.fr',
      formule: 'SPORT',
    });
    expect(r.ok).toBe(true);
    expect(r.payload.nom).toBe(null);
    expect(r.payload.prenom).toBe(null);
  });

  it('25. un champ inconnu est ignoré silencieusement', () => {
    const r = validerPayload({ ...PAYLOAD, champ_futur: 'valeur', montant: 42 });
    expect(r.ok).toBe(true);
  });

  it('26. les erreurs de forme portent le code exact du contrat', () => {
    expect(validerPayload(null)).toEqual({ ok: false, erreur: 'corps_invalide' });
    expect(validerPayload([])).toEqual({ ok: false, erreur: 'corps_invalide' });
    expect(validerPayload('texte')).toEqual({ ok: false, erreur: 'corps_invalide' });
    expect(validerPayload({ ...PAYLOAD, partner_ref: '' })).toEqual({
      ok: false,
      erreur: 'partner_ref_manquant',
    });
    expect(validerPayload({ ...PAYLOAD, email: 'nawak' })).toEqual({
      ok: false,
      erreur: 'email_invalide',
    });
    expect(validerPayload({ ...PAYLOAD, formule: 'PREMIUM' })).toEqual({
      ok: false,
      erreur: 'formule_inconnue',
    });
  });

  it('27. partner_ref est contrôlée avant le courriel, et le courriel avant la formule', () => {
    // L'ordre des contrôles suit celui du tableau du § 10 : un payload
    // cumulant trois défauts remonte le premier, de façon déterministe.
    const troisDefauts = { partner_ref: '', email: 'nawak', formule: 'PREMIUM' };
    expect(validerPayload(troisDefauts).erreur).toBe('partner_ref_manquant');
    expect(validerPayload({ ...troisDefauts, partner_ref: 'PDX-1' }).erreur).toBe('email_invalide');
    expect(validerPayload({ ...troisDefauts, partner_ref: 'PDX-1', email: 'a@b.fr' }).erreur).toBe(
      'formule_inconnue'
    );
  });

  it('28. nom et prenom trop longs sont tronqués, jamais rejetés', () => {
    const r = validerPayload({ ...PAYLOAD, nom: 'N'.repeat(500) });
    expect(r.ok).toBe(true);
    expect(r.payload.nom.length).toBe(120);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Concordance d'un rejeu (contrat § 8.1)
// ═══════════════════════════════════════════════════════════════════

describe('rejeuConcordant (contrat § 8.1)', () => {
  const existante = {
    emailCompte: 'praticienne@cabinet-exemple.fr',
    formulePartenaire: 'DUO_SPORT_PEDIATRIE',
  };

  it('29. payload identique : c’est un rejeu', () => {
    expect(
      rejeuConcordant(existante, 'praticienne@cabinet-exemple.fr', 'DUO_SPORT_PEDIATRIE')
    ).toBe(true);
  });

  it('30. la comparaison du courriel se fait sur la forme normalisée', () => {
    expect(
      rejeuConcordant(
        { ...existante, emailCompte: '  Praticienne@Cabinet-Exemple.FR ' },
        'praticienne@cabinet-exemple.fr',
        'DUO_SPORT_PEDIATRIE'
      )
    ).toBe(true);
  });

  it('31. courriel divergent : contradiction, pas rejeu', () => {
    expect(rejeuConcordant(existante, 'autre@cabinet.fr', 'DUO_SPORT_PEDIATRIE')).toBe(false);
  });

  it('32. formule divergente : contradiction, pas rejeu', () => {
    expect(rejeuConcordant(existante, 'praticienne@cabinet-exemple.fr', 'INTEGRAL')).toBe(false);
  });

  it('33. deux variantes d’un même plan interne sont bien distinguées', () => {
    // C'est LE cas que formule_partenaire existe pour attraper :
    // ESSENTIEL_POSTURO et ESSENTIEL_PEDIATRIE valent tous deux formule_1,
    // et DUO_SPORT_POSTURO / DUO_SPORT_PEDIATRIE tous deux formule_4.
    // user_data.formule seul les confondrait.
    const essentiel = { emailCompte: 'a@b.fr', formulePartenaire: 'ESSENTIEL_POSTURO' };
    expect(rejeuConcordant(essentiel, 'a@b.fr', 'ESSENTIEL_PEDIATRIE')).toBe(false);
    expect(rejeuConcordant(essentiel, 'a@b.fr', 'ESSENTIEL_POSTURO')).toBe(true);

    const duoSport = { emailCompte: 'a@b.fr', formulePartenaire: 'DUO_SPORT_POSTURO' };
    expect(rejeuConcordant(duoSport, 'a@b.fr', 'DUO_SPORT_PEDIATRIE')).toBe(false);

    expect(FORMULES_PARTENAIRE.ESSENTIEL_POSTURO.formuleInterne).toBe(
      FORMULES_PARTENAIRE.ESSENTIEL_PEDIATRIE.formuleInterne
    );
    expect(FORMULES_PARTENAIRE.DUO_SPORT_POSTURO.formuleInterne).toBe(
      FORMULES_PARTENAIRE.DUO_SPORT_PEDIATRIE.formuleInterne
    );
  });

  it('34. licence antérieure au webhook (formule non mémorisée) : contrôle sur le seul courriel', () => {
    const ancienne = { emailCompte: 'a@b.fr', formulePartenaire: null };
    expect(rejeuConcordant(ancienne, 'a@b.fr', 'INTEGRAL')).toBe(true);
    expect(rejeuConcordant(ancienne, 'autre@b.fr', 'INTEGRAL')).toBe(false);
  });

  it('35. nom et prenom ne participent pas à la comparaison', () => {
    // rejeuConcordant ne les reçoit même pas : la garantie est structurelle,
    // pas comportementale. Une correction d'orthographe ne peut pas faire
    // échouer une activation.
    expect(rejeuConcordant.length).toBe(3);
  });
});
