import { describe, it, expect } from 'vitest';
import { charger, envCapture, slotsVierges } from './helpers/harnais-kfppa.mjs';
import { patientFictif } from './helpers/resultats-279-donnees.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 3e — envoi sur Storage dès la capture, message à la validation
// ═══════════════════════════════════════════════════════════════════
//
// Décisions du praticien :
//   - chaque capture part sur Storage AUSSITÔT ; l'image reste en mémoire
//     pour l'affichage ; la capture n'écrit RIEN dans le stockage local ;
//   - si, à la validation, une photo n'a toujours pas de path après une
//     nouvelle tentative, le praticien est prévenu (« photo non envoyée —
//     vérifiez votre connexion ») et peut RÉESSAYER ; seulement s'il choisit
//     de continuer, le créneau est enregistré avec nonEnvoyee:true, ses
//     coordonnées et son angle, SANS l'image ; le rapport affiche la mention
//     rouge « photo non envoyée — à recapturer » ;
//   - JAMAIS de data: écrite dans le stockage local.
//
// Faux Storage du harnais : file de réponses 'ok' | 'echec'. Ce que
// savePatients écrirait passe par le VRAI filtre _stripDataURLsForPersist.
// Données synthétiques ; patient fictif.

const ouvrir = (opts) => {
  const env = charger({ persistance: true, envoiReel: true, ...opts });
  const t = env.TESTS['kfppa-marche'];
  envCapture(env, 'kfppa-marche', slotsVierges(t));
  env.poser({ patient: { ...patientFictif('M.'), bilanData: {} } });
  return env;
};

describe('#279 étape 3e — envoi dès la capture', () => {
  it('J1. Envoi réussi : path posé, image gardée en mémoire, rien écrit localement', async () => {
    const env = ouvrir({ envois: ['ok'] });
    await env.captureVidPhotoSlot(2);
    const s = env.slots()[2];
    expect(env.envois()).toHaveLength(1);
    expect(s.path).toBe(env.envois()[0].path);
    expect(s.path).toMatch(
      /^utilisateur-synthetique\/patient-synthetique\/sport\/bilan-synthetique\/kfppa-marche\//
    );
    expect(s.dataUrl).toBe('data:image/jpeg;base64,BRUTE');
    expect('envoiEchoue' in s).toBe(false);
    expect(env.enregistrements(), 'la capture n’écrit rien').toEqual([]);
  });

  it('J2. Envoi raté : image gardée en mémoire seulement, envoiEchoue', async () => {
    const env = ouvrir({ envois: ['echec'] });
    await env.captureVidPhotoSlot(2);
    const s = env.slots()[2];
    expect(s.path).toBeNull();
    expect(s.envoiEchoue).toBe(true);
    expect(s.dataUrl).toBe('data:image/jpeg;base64,BRUTE');
    expect(env.enregistrements()).toEqual([]);
  });

  it('J3. Recapture pendant l’envoi : le premier envoi ne s’applique pas à la nouvelle image', async () => {
    // Le PREMIER envoi est lent : il finit APRÈS le second — la vraie course.
    const env = ouvrir({ envois: [{ r: 'ok', delai: 30 }, 'ok'] });
    const p1 = env.captureVidPhotoSlot(2);
    env.slots()[2].dataUrl = 'data:image/jpeg;base64,NOUVELLE'; // recapture avant la fin du 1er envoi
    const p2 = env.captureVidPhotoSlot(2);
    await Promise.all([p1, p2]);
    const [e1, e2] = env.envois();
    expect(e1.path).not.toBe(e2.path);
    expect(env.slots()[2].path).toBe(e2.path);
  });
});

describe('#279 étape 3e — validation', () => {
  const capturerTout = async (env) => {
    for (const i of [0, 1, 2]) await env.captureVidPhotoSlot(i);
  };

  it('J4. Tout envoyé : aucun message, aucune data: écrite', async () => {
    const env = ouvrir({ envois: ['ok', 'ok', 'ok'] });
    await capturerTout(env);
    await env.validateAndSave();
    expect(env.questions()).toEqual([]);
    const ecrit = env.ecrits().join('\n');
    expect(ecrit.length).toBeGreaterThan(100);
    expect(ecrit).not.toContain('data:');
  });

  it('J5. Envoi encore raté : message, nouvelle tentative, puis « continuer » → nonEnvoyee sans image', async () => {
    // capture D ratée, nouvel essai à la validation raté, réessai raté.
    const env = ouvrir({
      envois: ['ok', 'ok', 'echec', 'echec', 'echec'],
      // Réessayer (OK), « autres choix » (Annuler), enregistrer sans la photo (OK).
      reponses: [true, false, true],
    });
    await capturerTout(env);
    await env.validateAndSave();
    expect(env.questions()).toHaveLength(3);
    // 1re question : nomme la photo ; « Annuler » ne fait RIEN perdre.
    const q = env.questions()[0];
    expect(q).toContain(
      'Photo « Valgum dynamique unipodal D » non envoyée — vérifiez votre connexion.'
    );
    expect(q).toContain("OK = réessayer l'envoi ; Annuler = autres choix");
    // 2e question, après « autres choix » : la conséquence en clair.
    const q2 = env.questions()[2];
    expect(q2).toContain(
      'Enregistrer le test SANS cette photo ? Son angle et ses points sont conservés, la photo devra être recapturée.'
    );
    expect(q2).toContain(
      'OK = enregistrer sans la photo ; Annuler = revenir au test sans rien enregistrer (la photo reste à l’écran, vous pourrez réessayer plus tard).'
    );
    expect(env.envois()).toHaveLength(5); // 3 captures + validation + réessai
    const e = env.patient().mesures['kfppa-marche'].photos[2];
    expect(e.nonEnvoyee).toBe(true);
    expect('dataUrl' in e).toBe(false);
    expect(e.angle).not.toBeNull(); // angle conservé
    expect(e.markers.length).toBeGreaterThan(0); // coordonnées conservées
    const ecrit = env.ecrits().join('\n');
    expect(ecrit).toContain('"nonEnvoyee":true');
    expect(ecrit).not.toContain('data:');
  });

  it('J6. Réessai réussi : photo envoyée, pas de nonEnvoyee', async () => {
    // Réponses de RÉSERVE (autres choix, revenir au test) : si le réessai
    // n'envoyait rien, une 2e question serait posée — l'assertion ci-dessous
    // le constate, au lieu d'un confirm inattendu.
    const env = ouvrir({
      envois: ['ok', 'ok', 'echec', 'echec', 'ok'],
      reponses: [true, false, false],
    });
    await capturerTout(env);
    await env.validateAndSave();
    expect(env.questions(), 'une seule question : le réessai a envoyé la photo').toHaveLength(1);
    const e = env.patient().mesures['kfppa-marche'].photos[2];
    expect(e.path).toBe(env.envois()[4].path);
    expect('nonEnvoyee' in e).toBe(false);
    expect(env.ecrits().join('\n')).not.toContain('data:');
  });
});

describe('#279 étape 3e — rapport et relecture', () => {
  const MENTION = '⚠️ Photo « Unipodal D » non envoyée — à recapturer';
  const ne = (o) => ({
    label: 'Unipodal D',
    side: 'D',
    angle: 7,
    path: null,
    nonEnvoyee: true,
    ...o,
  });

  it('J7. Rapport : mention rouge, photos de côté, photo bipodale, test à photo unique', () => {
    const env = charger();
    const hv = env.buildPrintSection(env.TESTS.verrou, { photos: [ne({})] }, []);
    expect(hv).toContain(MENTION);
    expect(hv).toContain('color:#b91c1c');
    const hk = env._kfppaPhotoBipodaleHTML(
      { photos: [ne({ side: '', label: 'Station bipodale' })] },
      env.TESTS['kfppa-marche']
    );
    expect(hk).toContain('⚠️ Photo « Station bipodale » non envoyée — à recapturer');
    const hs = env.buildPrintSingleSide(env.TESTS.mobilite, {
      photos: [ne({ side: '', label: 'Inversion' })],
    });
    expect(hs).toContain('⚠️ Photo « Inversion » non envoyée — à recapturer');
  });

  it('J8. nonEnvoyee écrit avec le créneau et relu à la réouverture', async () => {
    const env = charger();
    const p = env._serialiserPhoto(ne({}));
    expect(p.nonEnvoyee).toBe(true);
    expect('nonEnvoyee' in env._serialiserPhoto({ label: 'x', side: 'D', angle: 1 })).toBe(false);
    const patient = JSON.parse(
      JSON.stringify({
        ...patientFictif('M.'),
        mesures: { _bilanId: 'b', verrou: { photos: [p], frames: [] } },
      })
    );
    const cache = {};
    const elements = new Proxy(
      {},
      {
        get: (_o, id) =>
          (cache[id] ||= {
            style: {},
            textContent: '',
            innerHTML: '',
            classList: { add() {}, remove() {} },
          }),
      }
    );
    env.poser({ patient, elements });
    await env.launchTest('verrou');
    expect(env.slots()[0].nonEnvoyee).toBe(true);
  });

  it('J9. Réouverture : un créneau nonEnvoyee affiche la mention et son angle, pas l’emplacement vide', () => {
    const env = charger();
    env.poser({ test: 'verrou' });
    const slot = {
      label: 'Statique D',
      side: 'D',
      dataUrl: null,
      angle: 7,
      path: null,
      nonEnvoyee: true,
    };
    for (const [site, h] of [
      ['vignette', env.vidPhotoSlotHTML(slot, 0)],
      ['mode photo', env.photoSlotHTML(slot, 0)],
    ]) {
      expect(h, site).toContain('⚠️ photo non envoyée — à recapturer');
      expect(h, `${site} : angle conservé`).toContain('7.0°');
      expect(h, `${site} : pas d’emplacement vide`).not.toMatch(/vig-vide|ph-lbl-empty|📷/);
    }
    // Un clic relance la capture du créneau.
    expect(env.vidPhotoSlotHTML(slot, 3)).toContain('captureVidPhotoSlot(3)');
    expect(env.photoSlotHTML(slot, 3)).toContain('capturePhotoSlot(3)');
  });

  it('J10. Annuler puis Annuler : rien n’est écrit, la photo reste dans le créneau', async () => {
    const env = ouvrir({ envois: ['ok', 'ok', 'echec', 'echec'], reponses: [false, false] });
    for (const i of [0, 1, 2]) await env.captureVidPhotoSlot(i);
    await env.validateAndSave();
    expect(env.questions()).toHaveLength(2);
    expect(env.enregistrements(), 'ni écriture, ni message, ni navigation').toEqual([]);
    expect(env.ecrits()).toEqual([]);
    // Le bilan en mémoire n'a pas reçu le résultat (il partirait au prochain enregistrement).
    expect(env.patient().mesures['kfppa-marche']).toBeUndefined();
    const s = env.slots()[2];
    expect(s.dataUrl).toBe('data:image/jpeg;base64,BRUTE');
    expect(s.envoiEchoue).toBe(true);
  });
});
