// Messagerie patient ↔ praticien : logique pure du portail + garde-fous de source. Données fictives.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  MESSAGE_MAX,
  compteurMessage,
  messageErreurMessagerie,
  phraseMessagerie,
  tempsRestantMessage,
  heureMessage,
  preparerFil,
} from '../patient/patient-logique.mjs';

describe('compteur de saisie', () => {
  it('vide / espaces : non envoyable ; 1000 : envoyable ; 1001 : trop', () => {
    expect(compteurMessage('').envoyable).toBe(false);
    expect(compteurMessage('   \n ').envoyable).toBe(false);
    expect(compteurMessage('a'.repeat(MESSAGE_MAX))).toMatchObject({
      restant: 0,
      envoyable: true,
      trop: false,
    });
    expect(compteurMessage('a'.repeat(MESSAGE_MAX + 1))).toMatchObject({
      restant: -1,
      envoyable: false,
      trop: true,
    });
  });
  it('les retours chariot ne comptent pas, les emojis comptent pour 1', () => {
    expect(compteurMessage('a\r\nb').restant).toBe(MESSAGE_MAX - 3);
    expect(compteurMessage('😀😀').restant).toBe(MESSAGE_MAX - 2);
  });
});

describe("messages d'erreur", () => {
  it('chaque code du serveur a une phrase claire, jamais le code brut', () => {
    for (const code of [
      'trop_de_messages',
      'messagerie_desactivee',
      'texte_invalide',
      'delai_depasse',
      'trop_de_modifications',
    ]) {
      const m = messageErreurMessagerie(400, { message: code });
      expect(m).not.toContain('_');
      expect(m.length).toBeGreaterThan(20);
    }
    expect(messageErreurMessagerie(0, null)).toMatch(/Pas de réseau/);
    expect(messageErreurMessagerie(503, null)).toMatch(/Petit souci/);
    expect(messageErreurMessagerie(400, { message: 'ERREUR SQL interne secrète' })).not.toContain(
      'secrète'
    );
  });
});

describe('affichage', () => {
  it('phrase de la carte', () => {
    expect(phraseMessagerie(0)).toBe('Écrire à votre praticien');
    expect(phraseMessagerie(1)).toBe('1 nouveau message');
    expect(phraseMessagerie(4)).toBe('4 nouveaux messages');
    expect(phraseMessagerie(2, false)).toMatch(/fermée/);
  });
  it('temps restant', () => {
    expect(tempsRestantMessage(300)).toBe('5:00');
    expect(tempsRestantMessage(272)).toBe('4:32');
    expect(tempsRestantMessage(-5)).toBe('0:00');
    expect(tempsRestantMessage('x')).toBe('0:00');
  });
  it('horodatage : heure seule le jour même, sinon jour/mois + heure', () => {
    const maintenant = new Date(2026, 9, 24, 15, 0);
    expect(heureMessage(new Date(2026, 9, 24, 9, 5).toISOString(), maintenant)).toBe('09:05');
    expect(heureMessage(new Date(2026, 9, 22, 14, 30).toISOString(), maintenant)).toBe(
      '22/10 14:30'
    );
    expect(heureMessage("n'importe quoi", maintenant)).toBe('');
  });
});

describe('préparation du fil', () => {
  const lignes = [
    {
      id: 'a',
      sens: 'patient',
      texte: 'Bonjour',
      created_at: '2026-10-24T10:00:00Z',
      modifie_at: null,
      reste_s: 120,
      lu_at: '2026-10-24T10:01:00Z',
    },
    {
      id: 'b',
      sens: 'praticien',
      texte: 'Réponse',
      created_at: '2026-10-24T10:02:00Z',
      modifie_at: '2026-10-24T10:03:00Z',
      reste_s: 0,
      lu_at: null,
    },
  ];
  it("patient : ses messages à droite, JAMAIS d'état « lu » même si le serveur en envoyait un", () => {
    const f = preparerFil(lignes, 'patient');
    expect(f[0]).toMatchObject({ miens: true, resteS: 120, lu: null });
    expect(f[1]).toMatchObject({ miens: false, resteS: 0, lu: null, modifie: true });
    expect(JSON.stringify(f)).not.toContain('2026-10-24T10:01:00Z');
  });
  it('praticien (aperçu) : « lu » visible sous SES messages seulement', () => {
    const f = preparerFil(lignes, 'praticien');
    expect(f[0]).toMatchObject({ miens: false, lu: null });
    expect(f[1]).toMatchObject({ miens: true, lu: false });
    expect(preparerFil([{ ...lignes[1], lu_at: 'x' }], 'praticien')[0].lu).toBe(true);
  });
  it('lignes tordues ignorées', () => {
    expect(preparerFil([null, {}, { id: 'z' }, { id: 'y', texte: 5 }], 'patient')).toEqual([]);
    expect(preparerFil(null, 'patient')).toEqual([]);
  });
});

describe('garde-fous de source', () => {
  const js = readFileSync(new URL('../patient/patient.js', import.meta.url), 'utf8');
  const debut = js.indexOf('// ─── Messagerie patient');
  const fin = js.indexOf('// ─── Démarrage ───');
  const bloc = js.slice(debut, fin);
  it('le bloc messagerie existe', () => {
    expect(debut).toBeGreaterThan(0);
    expect(fin).toBeGreaterThan(debut);
  });
  it('textes affichés avec textContent : aucun innerHTML ni insertAdjacentHTML dans le bloc', () => {
    expect(bloc).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML/);
  });
  it('le patient ne lit jamais lu_at : le bloc ne le cite que dans des commentaires', () => {
    const sansCommentaires = bloc.replace(/\/\/.*$/gm, '');
    expect(sansCommentaires).not.toContain('lu_at');
  });
  it("un seul appel d'écriture par action, toujours par fonction serveur (jamais d'accès direct à la table)", () => {
    expect(bloc).not.toMatch(/rest\/v1\/messages_portail/);
    expect(bloc).toContain("`messagerie_${action}_${APERCU ? 'praticien' : 'patient'}`");
  });
  it('les fonctions SQL sont dans des fichiers de moins de 4000 caractères (collés par Joël)', () => {
    const dossier = new URL('../supabase/migrations/', import.meta.url);
    const fichiers = readdirSync(dossier).filter((f) => f.startsWith('portail-messagerie-'));
    expect(fichiers.length).toBe(5);
    for (const f of fichiers)
      expect([...readFileSync(new URL(f, dossier), 'utf8')].length, f).toBeLessThan(4000);
  });
  it('aucun droit direct sur les tables de messages dans les migrations', () => {
    const dossier = new URL('../supabase/migrations/', import.meta.url);
    const tout = readdirSync(dossier)
      .filter((f) => f.startsWith('portail-messagerie-'))
      .map((f) => readFileSync(new URL(f, dossier), 'utf8'))
      .join('\n');
    expect(tout).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+(TABLE\s+)?public\.messages_portail/i
    );
    expect(tout).toMatch(
      /REVOKE ALL ON public\.messages_portail, public\.messages_portail_versions FROM PUBLIC, anon, authenticated/
    );
  });
});
