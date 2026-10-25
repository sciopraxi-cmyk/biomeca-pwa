// Arrivée d'un RDV (saisie manuelle de l'agenda) : fiche, accès portail, devis, e-mail d'essai, questionnaire programmé.
// Moteur réel de js/biomeca.js contre un faux serveur en mémoire. Données FICTIVES.
import { describe, it, expect } from 'vitest';
import { fonction, ligneConst, objet } from './helpers/extraire-biomeca.mjs';

const FONCTIONS = [
  '_importNormName', 'validerFichePatient', '_rdvTexte', '_rdvManque', '_rdvTrouverFiche', '_rdvPreparerFiche', '_rdvRpc', '_rdvActesEligibles',
  '_rdvMotifsPropose', '_rdvSansEnvoi', '_rdvDevis', '_rdvOrganiser', '_rdvResume', '_rdvTexteMail',
  '_ligneDepuisActe', '_praticienParDefaut', '_centimesVersEuros', '_dateFr', '_doctolibDateFr', '_eurosVersCentimes', '_devisAutoPlanifier',
  '_ligneBaseDocument', '_emetteurDepuisPraticien', '_patientInstantane', '_mentionTva', '_calculerDocument', '_partsRemboursement', '_validerDocument',
  '_erreurCoordonneesBancaires', '_normaliserIban', '_praticienDuDocument', '_docRequete', '_devisAutoCreerUn',
];
const AUJOURDHUI = '2026-10-26';

function monter(o = {}) {
  const srv = { docs: [], numero: 0, notifs: [], rpc: [], appels: [], partages: [], creer: o.creer || 'nouveau', questionnaire: o.questionnaire || 'ok' };
  const corps = [
    'const ACTE_MONTANT_MAX_CENTS = 10000000;',
    ligneConst('MENTION_TVA_DEFAUT'), ligneConst('FRANCHISE_ACTE_CENTS'), ligneConst('FRANCHISE_JOUR_MAX_CENTS'), ligneConst('DOC_LIGNES_MAX'),
    objet('REGIMES_REMBOURSEMENT'), ligneConst('_chiffresSeuls'), ligneConst('AG_MOTIFS'), ligneConst('_RDV_MAILS'),
    'const _ENTETES_JSON = {};', 'const SUPA_URL = "https://x.invalid";',
    'const praticiens = __prats; const patients = __patients; let _actesCache = [];',
    `const _todayISO = () => "${AUJOURDHUI}";`,
    `const _accessPermetCreationDocument = () => ${o.accesLimite ? 'false' : 'true'};`,
    'const _horsConnexion = () => false;',
    'const savePatients = () => { __srv.sauve = (__srv.sauve || 0) + 1; };',
    'const chargerActes = async () => { _actesCache = __actes; return _actesCache; };',
    'const notifierEvenement = (t, o) => { __srv.notifs.push([t, o]); };',
    'const _portailPartagerAuto = (g, p, d) => { __srv.partages.push(d.numero); };',
    'const _portailCompteCache = new Map();',
    'const _portailCabinet = () => "Cabinet Fictif";',
    'const _portailAssurerFiche = async (p) => { if (__srv.ficheKO) return { ok: false, message: "ko" }; if (!p._cloudId) p._cloudId = "cloud-" + p.id; return { ok: true, message: "" }; };',
    'const _portailAppeler = async (a, p, x) => { __srv.appels.push([a, p._cloudId]); if (__srv.creer === "echec") return { status: 500, body: { error: "x" } }; return { status: 200, body: __srv.creer === "existant" ? { ok: true, identifiant: "id1", statut: "initial", existe: true } : __srv.creer === "actif" ? { ok: true, identifiant: "id1", statut: "actif", existe: true } : { ok: true, identifiant: "id1", statut: "initial" } }; };',
    'const authFetch = __authFetch;',
    ...FONCTIONS.map(fonction),
    `return { ${FONCTIONS.join(', ')}, AG_MOTIFS };`,
  ].join('\n');
  const reponse = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
  const authFetch = async (url, opt = {}) => {
    const m = opt.method || 'GET';
    if (url.includes('/rpc/emettre_document')) {
      const { p_id } = JSON.parse(opt.body);
      const d = srv.docs.find((x) => x.id === p_id);
      d.statut = 'emis';
      d.numero = 'D-2026-' + String(++srv.numero).padStart(4, '0');
      return reponse(200, d);
    }
    if (url.endsWith('/documents_facturation') && m === 'POST') {
      const b = JSON.parse(opt.body);
      if (b.source_rdv && srv.docs.some((d) => d.source_rdv === b.source_rdv)) return reponse(409, { message: 'duplicate' });
      const d = Object.assign({ id: 'doc' + (srv.docs.length + 1), statut: 'brouillon' }, b);
      srv.docs.push(d);
      return reponse(201, [d]);
    }
    if (url.includes('/rest/v1/rpc/')) {
      const nom = url.split('/rpc/')[1];
      const b = JSON.parse(opt.body);
      srv.rpc.push([nom, b]);
      if (nom === 'questionnaire_demander') {
        if (srv.questionnaire === 'deja') return reponse(400, { message: 'questionnaire_deja_ouvert' });
        if (srv.questionnaire === 'passe') return reponse(400, { message: 'rdv_passe' });
        if (srv.questionnaire === 'panne') return reponse(500, { message: 'boum' });
        return reponse(200, 'q1');
      }
      return reponse(200, true);
    }
    return reponse(404, {});
  };
  const f = new Function('__prats', '__patients', '__actes', '__srv', '__authFetch', 'pwaUser', corps)(
    [{ id: 7, nom: 'Dr Fictif', titre: 'Podologue', siret: '12345678901234', rpps: '12345678901' }],
    o.patients || [],
    o.actes || [],
    srv,
    authFetch,
    { id: 'u1' }
  );
  return { f, srv };
}

const ACTES = [
  { id: 'a1', libelle: 'Consultation de podologie', montant_cents: 3500, sync_doctolib: true, actif: true },
  { id: 'a2', libelle: 'Bilan sur mesure', montant_cents: 9000, perso: true, actif: true },
  { id: 'a3', libelle: 'Acte inactif', montant_cents: 100, perso: true, actif: false },
];
const SAISIE = { nom: 'Martin', prenom: 'Léa', ddn: '2010-05-17', tel: '0600000000', email: 'lea@exemple.fr', adresse: '' };
const dansJours = (n) => {
  const d = new Date(Date.now() + n * 864e5);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T10:00';
};
const fiche = (o = {}) => Object.assign({ id: 1, nom: 'Martin', prenom: 'Léa', ddn: '2010-05-17', email: 'lea@exemple.fr', tel: '', pratId: 7 }, o);
const types = (srv) => srv.notifs.map((n) => n[0]).filter((t) => t !== 'devis_emis'); // devis_emis : notification propre à l'émission du devis
const mails = (srv) => srv.notifs.filter((n) => n[0] === 'email_essai').map((n) => n[1].mail);
const org = (f, p, o) => f._rdvOrganiser(Object.assign({ debut: dansJours(7), motif: 'Consultation de podologie', patient: p, saisie: SAISIE, manuel: true }, o));

describe('informations obligatoires', () => {
  it('liste ce qui manque (nom, prénom, naissance, e-mail)', () => {
    const { f } = monter();
    expect(f._rdvManque({})).toEqual(['nom', 'prénom', 'date de naissance', 'e-mail']);
    expect(f._rdvManque(SAISIE)).toEqual([]);
    expect(f._rdvManque({ ...SAISIE, email: 'pas-un-mail' })).toEqual(['e-mail']);
    expect(f._rdvManque({ ...SAISIE, ddn: '2999-01-01' })).toEqual(['date de naissance']);
    expect(f._rdvManque({ ...SAISIE, nom: '  ' })).toEqual(['nom']);
  });
  it('e-mail manquant : RIEN n\u2019est envoyé, une notification le dit', async () => {
    const p = fiche({ email: '' });
    const { f, srv } = monter({ patients: [p], actes: ACTES });
    const res = await org(f, p, { source: 'ag:e1', saisie: {} });
    expect(res.manque).toEqual(['e-mail']);
    expect(srv.appels).toEqual([]);
    expect(srv.rpc).toEqual([]);
    expect(srv.docs).toEqual([]);
    expect(types(srv)).toEqual(['rdv_sans_envoi']);
    expect(srv.notifs[0][1].detail).toMatch(/e-mail/);
    expect(f._rdvResume(res, null)).toMatch(/RIEN n.a été envoyé/);
  });
  it('saisie incomplète sans fiche (nouveau patient sans naissance) : rien non plus', async () => {
    const { f, srv } = monter({ actes: ACTES });
    const res = await org(f, null, { source: 'ag:e2', saisie: { nom: 'A', prenom: 'B', email: 'a@b.fr' } });
    expect(res.manque).toEqual(['date de naissance']);
    expect(srv.appels).toEqual([]);
    expect(types(srv)).toEqual(['rdv_sans_envoi']);
  });
});

describe('accès, devis, e-mail, questionnaire', () => {
  it('RDV dans 7 jours, acte reconnu : accès + devis immédiats, e-mail unique, questionnaire visible à J-3', async () => {
    const p = fiche();
    const { f, srv } = monter({ patients: [p], actes: ACTES });
    const debut = dansJours(7);
    const res = await org(f, p, { source: 'ag:e3', debut });
    expect(res.acces).toBe('cree');
    expect(res.devis.etat).toBe('cree');
    expect(srv.docs.length).toBe(1);
    expect(srv.docs[0].source_rdv).toBe('ag:e3');
    expect(srv.partages.length).toBe(1);
    expect(types(srv)).toEqual(['email_essai']);
    expect(srv.notifs.find((n) => n[0] === 'email_essai')[1]).toMatchObject({ mail: 'acces_devis', patientId: 1 });
    expect(p.accesEnvoyeLe).toBeTruthy();
    const q = srv.rpc.find((r) => r[0] === 'questionnaire_demander');
    expect(q[1]).toEqual({ p_patient: 'cloud-1', p_rdv: new Date(debut).toISOString(), p_source: 'ag:e3' });
    expect(res.questionnaire).toBe('programme');
    expect(res.visibleLe).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const txt = f._rdvResume(res, { creee: true });
    expect(txt).toMatch(/Fiche patient créée/);
    expect(txt).toMatch(/Devis n° D-2026-0001/);
    expect(txt).toMatch(/le patient le verra à partir du/);
    expect(txt).toMatch(/Aucun vrai e-mail/);
  });
  it('RDV dans 2 jours : questionnaire disponible tout de suite', async () => {
    const p = fiche();
    const { f } = monter({ patients: [p], actes: ACTES });
    const res = await org(f, p, { source: 'ag:e4', debut: dansJours(2) });
    expect(res.visibleLe).toBe('');
    expect(f._rdvResume(res, null)).toMatch(/disponible tout de suite/);
  });
  it('compte existant et identifiants déjà envoyés : pas de nouveaux identifiants, mais devis + « un devis vous attend » (Q22-1)', async () => {
    const p = fiche({ accesEnvoyeLe: '2026-10-01T00:00:00Z' });
    const { f, srv } = monter({ patients: [p], actes: ACTES, creer: 'existant' });
    const res = await org(f, p, { source: 'ag:e5' });
    expect(res.acces).toBe('existant');
    expect(res.mail).toBe('devis');
    expect(mails(srv)).toEqual(['devis']);
    expect(srv.rpc.some((r) => r[0] === 'questionnaire_demander')).toBe(true);
  });
  it('patient déjà actif (connecté) : aucun identifiant renvoyé', async () => {
    const p = fiche();
    const { f, srv } = monter({ patients: [p], actes: ACTES, creer: 'actif' });
    const res = await org(f, p, { source: 'ag:e6' });
    expect(mails(srv)).toEqual(['devis']);
    expect(res.mail).toBe('devis');
  });
  it('motif non reconnu : e-mail d\u2019accès seul, notification « sans devis », questionnaire quand même', async () => {
    const p = fiche();
    const { f, srv } = monter({ patients: [p], actes: ACTES });
    const res = await org(f, p, { source: 'ag:e7', motif: 'Autre chose' });
    expect(res.devis.etat).toBe('ignore');
    expect(srv.docs).toEqual([]);
    expect(types(srv).sort()).toEqual(['devis_auto_ignores', 'email_essai']);
    expect(srv.notifs.find((n) => n[0] === 'email_essai')[1].mail).toBe('acces');
    expect(res.questionnaire).toBe('programme');
    expect(f._rdvResume(res, null)).toMatch(/Pas de devis : intitulé non reconnu/);
  });
  it('acte personnalisé : reconnu en saisie manuelle seulement ; acte inactif jamais', async () => {
    const p = fiche();
    const m = monter({ patients: [p], actes: ACTES });
    const res = await org(m.f, p, { source: 'ag:e8', motif: 'Bilan sur mesure' });
    expect(res.devis.etat).toBe('cree');
    expect(JSON.stringify(m.srv.docs[0])).toMatch(/Bilan sur mesure/);
    const p2 = fiche({ id: 2 });
    const m2 = monter({ patients: [p2], actes: ACTES });
    expect((await org(m2.f, p2, { source: 'ag:e9', motif: 'Bilan sur mesure', manuel: false })).devis.etat).toBe('ignore');
    const p3 = fiche({ id: 3 });
    const m3 = monter({ patients: [p3], actes: ACTES });
    expect((await org(m3.f, p3, { source: 'ag:e10', motif: 'Acte inactif' })).devis.etat).toBe('ignore');
  });
  it('rejouer le même RDV : un seul devis, un seul questionnaire, identifiants une seule fois', async () => {
    const p = fiche();
    const { f, srv } = monter({ patients: [p], actes: ACTES });
    await org(f, p, { source: 'ag:e11' });
    srv.questionnaire = 'deja';
    srv.creer = 'existant';
    const res = await org(f, p, { source: 'ag:e11' });
    expect(srv.docs.length).toBe(1);
    expect(res.devis.etat).toBe('deja');
    expect(res.questionnaire).toBe('deja');
    expect(mails(srv).filter((m) => m === 'acces_devis').length).toBe(1);
    expect(mails(srv).filter((m) => m === 'devis').length).toBe(0);
  });
  it('RDV déplacé : le questionnaire est replanifié avant la demande', async () => {
    const p = fiche({ accesEnvoyeLe: 'x' });
    const { f, srv } = monter({ patients: [p], actes: ACTES, creer: 'existant' });
    await org(f, p, { source: 'ag:e12', debut: dansJours(9), motif: 'Autre', modif: true });
    expect(srv.rpc.map((r) => r[0])).toEqual(['questionnaire_replanifier', 'questionnaire_demander']);
  });
  it('accès portail impossible : ni devis, ni e-mail, ni questionnaire', async () => {
    const p = fiche();
    const { f, srv } = monter({ patients: [p], actes: ACTES, creer: 'echec' });
    const res = await org(f, p, { source: 'ag:e13' });
    expect(srv.docs).toEqual([]);
    expect(srv.rpc).toEqual([]);
    expect(types(srv)).toEqual(['rdv_sans_envoi']);
    expect(res.erreurs.length).toBe(1);
  });
  it('fiche non enregistrée dans le cloud : rien d\u2019envoyé', async () => {
    const p = fiche();
    const m = monter({ patients: [p], actes: ACTES });
    m.srv.ficheKO = true;
    await org(m.f, p, { source: 'ag:e14' });
    expect(m.srv.appels).toEqual([]);
    expect(types(m.srv)).toEqual(['rdv_sans_envoi']);
  });
  it('questionnaire en panne : signalé, le reste est fait', async () => {
    const p = fiche();
    const { f } = monter({ patients: [p], actes: ACTES, questionnaire: 'panne' });
    const res = await org(f, p, { source: 'ag:e15' });
    expect(res.questionnaire).toBe('echec');
    expect(res.devis.etat).toBe('cree');
    expect(f._rdvResume(res, null)).toMatch(/questionnaire n.a pas pu être programmé/);
  });
  it('accès limité (abonnement) : pas de devis, le reste continue', async () => {
    const p = fiche();
    const { f, srv } = monter({ patients: [p], actes: ACTES, accesLimite: true });
    const res = await org(f, p, { source: 'ag:e16' });
    expect(res.devis.etat).toBe('ignore');
    expect(srv.docs).toEqual([]);
    expect(res.questionnaire).toBe('programme');
  });
});

describe('fiche patient', () => {
  it('nouveau patient : fiche créée avec ce qui est saisi', () => {
    const { f, srv } = monter();
    const r = f._rdvPreparerFiche(SAISIE, null);
    expect(r.creee).toBe(true);
    expect(r.patient).toMatchObject({ nom: 'Martin', prenom: 'Léa', ddn: '2010-05-17', email: 'lea@exemple.fr', tel: '0600000000', pratId: 7 });
    expect(srv.sauve).toBe(1);
  });
  it('jamais de doublon (nom + prénom + naissance, sans tenir compte de la casse)', () => {
    const existant = fiche({ id: 5 });
    const { f } = monter({ patients: [existant] });
    const r = f._rdvPreparerFiche({ ...SAISIE, nom: 'MARTIN', prenom: 'léa', tel: '0611111111' }, null);
    expect(r.creee).toBe(false);
    expect(r.patient).toBe(existant);
    expect(existant.tel).toBe('0611111111');
  });
  it('même nom, autre prénom ou autre naissance : nouvelle fiche (pas un doublon)', () => {
    const existant = fiche({ id: 5 });
    const { f } = monter({ patients: [existant] });
    expect(f._rdvPreparerFiche({ ...SAISIE, prenom: 'Paul' }, null).creee).toBe(true);
    expect(f._rdvPreparerFiche({ ...SAISIE, ddn: '2012-01-01' }, null).creee).toBe(true);
  });
  it('fiche existante : complétée sans écraser la naissance ni l\u2019identité', () => {
    const p = fiche({ email: '' });
    const { f } = monter({ patients: [p] });
    const r = f._rdvPreparerFiche({ ...SAISIE, ddn: '1999-01-01', nom: 'Autre', email: 'neuf@exemple.fr' }, p);
    expect(r.completee).toBe(true);
    expect(p).toMatchObject({ ddn: '2010-05-17', nom: 'Martin', email: 'neuf@exemple.fr' });
  });
  it('fiche existante sans naissance : complétée ; e-mail invalide ignoré', () => {
    const p = fiche({ ddn: '', email: 'ok@exemple.fr' });
    const { f } = monter({ patients: [p] });
    f._rdvPreparerFiche({ ...SAISIE, email: 'invalide' }, p);
    expect(p.ddn).toBe('2010-05-17');
    expect(p.email).toBe('ok@exemple.fr');
  });
  it('identité incomplète : aucune fiche créée', () => {
    const { f } = monter();
    expect(f._rdvPreparerFiche({ nom: 'A', prenom: 'B', ddn: '' }, null).patient).toBe(null);
    expect(f._rdvPreparerFiche({ nom: 'A', prenom: 'B', ddn: '2999-01-01' }, null).patient).toBe(null);
  });
});

describe('menu « motif de consultation »', () => {
  it('avant chargement des actes : motifs usuels', () => {
    const { f } = monter({ actes: ACTES });
    expect(f._rdvMotifsPropose()).toEqual(f.AG_MOTIFS);
  });
  it('après chargement : + actes personnalisés actifs + actes Doctolib, sans doublon', async () => {
    const p = fiche();
    const { f } = monter({ patients: [p], actes: [...ACTES, { id: 'a4', libelle: 'bilan podologique', perso: true, actif: true }] });
    await org(f, p, { source: 'ag:m', motif: 'x' }); // charge les actes
    const l = f._rdvMotifsPropose();
    expect(l).toContain('Bilan sur mesure');
    expect(l).toContain('Consultation de podologie');
    expect(l).not.toContain('Acte inactif');
    expect(l.filter((x) => x.toLowerCase() === 'bilan podologique').length).toBe(1);
    expect(l.slice(0, f.AG_MOTIFS.length)).toEqual(f.AG_MOTIFS);
  });
});

describe('textes des e-mails d\u2019essai', () => {
  it('accès + devis : identifiant, première connexion, lien', () => {
    const { f } = monter();
    const t = f._rdvTexteMail('acces_devis', { prenom: 'Léa', cabinet: 'Cabinet Fictif', identifiant: 'abc-123', lien: 'https://x.invalid/patient/' });
    expect(t).toMatch(/Bonjour Léa/);
    expect(t).toMatch(/abc-123/);
    expect(t).toMatch(/devis vous attend/);
    expect(t).toMatch(/date de naissance à l.envers/);
    expect(t).toMatch(/20100517/);
    expect(t).toMatch(/https:\/\/x\.invalid\/patient\//);
  });
  it('accès seul : pas de devis ; les 5 genres produisent un texte', () => {
    const { f } = monter();
    expect(f._rdvTexteMail('acces', { identifiant: 'z' })).not.toMatch(/devis/);
    ['acces', 'acces_devis', 'devis', 'questionnaire', 'rappel'].forEach((g) => expect(f._rdvTexteMail(g, {}).length).toBeGreaterThan(40));
    expect(f._rdvTexteMail('inconnu', {})).toBe('');
  });
  it('questionnaire et rappel : ni question ni réponse', () => {
    const { f } = monter();
    ['questionnaire', 'rappel'].forEach((g) => expect(f._rdvTexteMail(g, { prenom: 'Léa' })).not.toMatch(/douleur|antécédent|opér|traitement/i));
  });
});
