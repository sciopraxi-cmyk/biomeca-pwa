// Portail patient — questionnaire de pré-consultation : modèle des questions (adulte / enfant) et fonctions pures.
// Les clés sont celles de la liste blanche SQL (supabase/migrations/portail-questionnaire-a2-validation.sql) :
// une clé absente de cette liste est refusée par le serveur. Le serveur fait foi ; ici on guide le patient.

const OUI_NON = [
  { v: 'oui', l: 'Oui' },
  { v: 'non', l: 'Non' },
];

const MOTIFS_ADULTE = [
  { v: 'douleur', l: 'Douleur au pied' },
  { v: 'gene_marche_sport', l: 'Gêne à la marche ou au sport' },
  { v: 'douleur_dos_genou_hanche', l: 'Douleur au dos, au genou ou à la hanche' },
  { v: 'semelles', l: 'Semelles à renouveler' },
  { v: 'suivi', l: 'Suivi' },
  { v: 'ongles_peau', l: 'Ongles ou peau' },
  { v: 'autre', l: 'Autre' },
];
const MOTIFS_ENFANT = [
  { v: 'douleur', l: 'Douleur' },
  { v: 'pieds_plats', l: 'Pieds plats' },
  { v: 'dedans_dehors', l: 'Pieds en dedans ou en dehors' },
  { v: 'deformation', l: 'Déformation' },
  { v: 'pointe', l: 'Marche sur la pointe des pieds' },
  { v: 'chutes', l: 'Chutes fréquentes' },
  { v: 'suivi', l: 'Suivi' },
  { v: 'avis_parental', l: 'Avis parental' },
  { v: 'autre', l: 'Autre' },
];
const ZONES = [
  { v: 'orteils', l: 'Orteils' },
  { v: 'avant_pied', l: 'Avant-pied' },
  { v: 'voute', l: 'Voûte du pied' },
  { v: 'talon', l: 'Talon' },
  { v: 'cheville', l: 'Cheville' },
  { v: 'jambe', l: 'Jambe' },
  { v: 'genou', l: 'Genou' },
  { v: 'hanche', l: 'Hanche' },
  { v: 'dos', l: 'Dos' },
  { v: 'autre', l: 'Autre' },
];
const QUAND = [
  { v: 'matin', l: 'Le matin' },
  { v: 'soir', l: 'Le soir' },
  { v: 'effort', l: 'À l’effort' },
  { v: 'nuit', l: 'La nuit' },
  { v: 'permanent', l: 'Tout le temps' },
];
const MALADIES = [
  { v: 'diabete', l: 'Diabète' },
  { v: 'rhumatisme', l: 'Rhumatisme' },
  { v: 'circulation', l: 'Circulation' },
  { v: 'nerfs', l: 'Nerfs' },
  { v: 'autre', l: 'Autre' },
];
const EXAMENS_ADULTE = [
  { v: 'radio', l: 'Radio' },
  { v: 'irm', l: 'IRM' },
  { v: 'echographie', l: 'Échographie' },
  { v: 'scanner', l: 'Scanner' },
  { v: 'podoscopie', l: 'Podoscopie' },
];
const EXAMENS_ENFANT = [
  { v: 'radio', l: 'Radio' },
  { v: 'echographie', l: 'Échographie' },
  { v: 'podoscopie', l: 'Podoscopie' },
];
const CHAUSSURES_ADULTE = [
  { v: 'ville', l: 'Ville' },
  { v: 'talons', l: 'Talons' },
  { v: 'securite', l: 'Sécurité' },
  { v: 'sport', l: 'Sport' },
  { v: 'sandales', l: 'Sandales' },
  { v: 'pieds_nus', l: 'Pieds nus' },
];
const CHAUSSURES_ENFANT = [
  { v: 'ville', l: 'Ville' },
  { v: 'sport', l: 'Sport' },
  { v: 'sandales', l: 'Sandales' },
  { v: 'bottes', l: 'Bottes' },
];

const q = (cle, type, libelle, extra) => ({ cle, type, libelle, ...(extra || {}) });

const DOULEUR = [
  q('douleur', 'oui_non', 'Avez-vous mal en ce moment ?', { options: OUI_NON }),
  q('douleur_zones', 'multi', 'Où avez-vous mal ?', {
    options: ZONES,
    si: { cle: 'douleur', egal: 'oui' },
  }),
  q('douleur_quand', 'multi', 'Quand ?', { options: QUAND, si: { cle: 'douleur', egal: 'oui' } }),
  q('eva', 'eva', 'Intensité de la douleur, de 0 (aucune) à 10 (insupportable)', {
    si: { cle: 'douleur', egal: 'oui' },
  }),
];

const ADULTE = [
  {
    titre: 'Votre consultation',
    questions: [
      q('motif', 'multi', 'Pourquoi consultez-vous ?', { options: MOTIFS_ADULTE }),
      q('motif_autre_txt', 'texte', 'Précisez', { si: { cle: 'motif', contient: 'autre' } }),
      q(
        'premiere_fois',
        'oui_non',
        'Est-ce la première fois que vous consultez pour ce problème ?',
        {
          options: OUI_NON,
        }
      ),
      ...DOULEUR,
    ],
  },
  {
    titre: 'Depuis votre dernière visite',
    fiche: ['antecedents', 'examens'],
    questions: [
      q('chg_blessure', 'oui_non', 'Une blessure, entorse, fracture ou chute ?', {
        options: OUI_NON,
      }),
      q('chg_blessure_txt', 'texte', 'Laquelle, et quand ?', {
        si: { cle: 'chg_blessure', egal: 'oui' },
      }),
      q('chg_operation', 'oui_non', 'Une opération ?', { options: OUI_NON }),
      q('chg_operation_txt', 'texte', 'Laquelle, et quand ?', {
        si: { cle: 'chg_operation', egal: 'oui' },
      }),
      q('chg_maladie_types', 'multi', 'Une nouvelle maladie ou un nouveau diagnostic ?', {
        options: MALADIES,
      }),
      q('chg_maladie_txt', 'texte', 'Précisez', { si: { cle: 'chg_maladie_types', rempli: true } }),
      q('chg_examens', 'multi', 'De nouveaux examens ?', { options: EXAMENS_ADULTE }),
      q('chg_examens_txt', 'texte', 'Précisez (date, résultat)', {
        si: { cle: 'chg_examens', rempli: true },
      }),
      q('chg_traitements_txt', 'texte', 'De nouveaux traitements ou médicaments ?'),
      q('allergies_txt', 'texte', 'Des allergies ?'),
      q('atcd_familiaux_txt', 'texte', 'Des antécédents familiaux à signaler ?'),
    ],
  },
  {
    titre: 'Votre quotidien',
    fiche: ['poids_taille', 'metier'],
    questions: [
      q('poids', 'nombre', 'Votre poids (kg)', { min: 1, max: 400, fiche: 'poids' }),
      q('taille', 'nombre', 'Votre taille (cm)', { min: 30, max: 250, fiche: 'taille' }),
      q('metier_txt', 'texte', 'Votre métier', { fiche: 'metier' }),
      q('position', 'choix', 'Dans la journée, vous êtes plutôt…', {
        options: [
          { v: 'assis', l: 'Assis' },
          { v: 'debout', l: 'Debout' },
          { v: 'marche', l: 'En marche' },
          { v: 'mixte', l: 'Un peu de tout' },
        ],
      }),
      q('chaussures', 'multi', 'Vos chaussures au quotidien', { options: CHAUSSURES_ADULTE }),
      q('chaussures_gene_txt', 'texte', 'Une gêne avec vos chaussures ? (étroites, trop courtes…)'),
      q(
        'appareillage',
        'oui_non',
        'Portez-vous des semelles, une orthèse ou un autre appareillage ?',
        {
          options: OUI_NON,
        }
      ),
      q('appareillage_txt', 'texte', 'Lesquels ?', { si: { cle: 'appareillage', egal: 'oui' } }),
    ],
  },
  {
    titre: 'Votre sport',
    questions: [
      q('sport_pratique', 'oui_non', 'Pratiquez-vous un sport ?', {
        options: OUI_NON,
        fiche: 'sport_oui',
      }),
      q('sport_txt', 'texte', 'Quel(s) sport(s) ?', {
        si: { cle: 'sport_pratique', egal: 'oui' },
        fiche: 'sport',
      }),
      q('sport_freq_txt', 'texte', 'Combien de fois par semaine ?', {
        si: { cle: 'sport_pratique', egal: 'oui' },
      }),
      q('sport_duree_txt', 'texte', 'Combien de temps par séance ?', {
        si: { cle: 'sport_pratique', egal: 'oui' },
      }),
      q('sport_niveau', 'choix', 'Votre niveau', {
        options: [
          { v: 'loisir', l: 'Loisir' },
          { v: 'competition', l: 'Compétition' },
        ],
        si: { cle: 'sport_pratique', egal: 'oui' },
      }),
      q(
        'sport_objectif_txt',
        'texte',
        'Un objectif ou une prochaine échéance ? (course, compétition…)',
        {
          si: { cle: 'sport_pratique', egal: 'oui' },
        }
      ),
      q('sport_chaussures_txt', 'texte', 'Quelles chaussures de sport utilisez-vous ?', {
        si: { cle: 'sport_pratique', egal: 'oui' },
      }),
    ],
  },
  {
    titre: 'Pour votre praticien',
    questions: [q('notes_txt', 'texte', 'Autre chose à nous dire ?', { long: true })],
  },
];

const ENFANT = [
  {
    titre: 'La consultation',
    questions: [
      q('motif', 'multi', 'Pourquoi consultez-vous pour votre enfant ?', {
        options: MOTIFS_ENFANT,
      }),
      q('motif_autre_txt', 'texte', 'Précisez', { si: { cle: 'motif', contient: 'autre' } }),
      q(
        'premiere_fois',
        'oui_non',
        'Est-ce la première fois que vous consultez pour ce problème ?',
        {
          options: OUI_NON,
        }
      ),
      q('douleur', 'oui_non', 'Votre enfant se plaint-il de douleur ?', { options: OUI_NON }),
      q('douleur_zones', 'multi', 'Où a-t-il mal ?', {
        options: ZONES,
        si: { cle: 'douleur', egal: 'oui' },
      }),
      q('douleur_quand', 'multi', 'Quand ?', {
        options: QUAND,
        si: { cle: 'douleur', egal: 'oui' },
      }),
      q('eva', 'eva', 'Intensité de la douleur, de 0 (aucune) à 10 (insupportable)', {
        si: { cle: 'douleur', egal: 'oui' },
      }),
    ],
  },
  {
    titre: 'Naissance et marche',
    questions: [
      q('age_marche_mois', 'nombre', 'À quel âge a-t-il marché ? (en mois)', { min: 0, max: 60 }),
      q('premature', 'oui_non', 'Est-il né prématuré ?', { options: OUI_NON }),
      q('terme_sa', 'nombre', 'À combien de semaines ? (terme en semaines d’aménorrhée)', {
        min: 20,
        max: 45,
        si: { cle: 'premature', egal: 'oui' },
      }),
    ],
  },
  {
    titre: 'Son histoire de santé',
    fiche: ['antecedents', 'examens'],
    questions: [
      q('atcd_medicaux_txt', 'texte', 'Antécédents médicaux'),
      q('atcd_chirurgicaux_txt', 'texte', 'Antécédents chirurgicaux'),
      q('atcd_traumatiques_txt', 'texte', 'Blessures ou fractures passées'),
      q('atcd_familiaux_txt', 'texte', 'Antécédents familiaux à signaler'),
      q(
        'chg_blessure',
        'oui_non',
        'Depuis la dernière visite : une blessure, entorse, fracture ou chute ?',
        {
          options: OUI_NON,
        }
      ),
      q('chg_blessure_txt', 'texte', 'Laquelle, et quand ?', {
        si: { cle: 'chg_blessure', egal: 'oui' },
      }),
      q('chg_operation', 'oui_non', 'Depuis la dernière visite : une opération ?', {
        options: OUI_NON,
      }),
      q('chg_operation_txt', 'texte', 'Laquelle, et quand ?', {
        si: { cle: 'chg_operation', egal: 'oui' },
      }),
      q('chg_maladie_txt', 'texte', 'Depuis la dernière visite : un nouveau diagnostic ?'),
      q('chg_examens', 'multi', 'Des examens déjà faits ?', { options: EXAMENS_ENFANT }),
      q('chg_examens_txt', 'texte', 'Précisez (date, résultat)', {
        si: { cle: 'chg_examens', rempli: true },
      }),
      q('chg_traitements_txt', 'texte', 'Des traitements ou médicaments ?'),
      q('allergies_txt', 'texte', 'Des allergies ?'),
    ],
  },
  {
    titre: 'Son quotidien',
    fiche: ['poids_taille'],
    questions: [
      q('poids', 'nombre', 'Son poids (kg)', { min: 1, max: 400, fiche: 'poids' }),
      q('taille', 'nombre', 'Sa taille (cm)', { min: 30, max: 250, fiche: 'taille' }),
      q('sport_txt', 'texte', 'Son sport ou ses activités', { fiche: 'sport' }),
      q('sport_freq_txt', 'texte', 'Combien de fois par semaine ?'),
      q('chaussures', 'multi', 'Ses chaussures', { options: CHAUSSURES_ENFANT }),
      q('chaussures_gene_txt', 'texte', 'Une gêne ou une usure inhabituelle ?'),
      q('appareillage', 'oui_non', 'Porte-t-il des semelles ou une orthèse ?', {
        options: OUI_NON,
      }),
      q('appareillage_txt', 'texte', 'Lesquelles ?', { si: { cle: 'appareillage', egal: 'oui' } }),
    ],
  },
  {
    titre: 'Pour votre praticien',
    questions: [q('notes_txt', 'texte', 'Autre chose à nous dire ?', { long: true })],
  },
];

export const MODELES = { adulte: ADULTE, enfant: ENFANT };

export function modeleDe(type) {
  return MODELES[type] || null;
}

/** Toutes les questions à plat. */
export function questionsDe(type) {
  const m = modeleDe(type);
  return m ? m.flatMap((s) => s.questions) : [];
}

const vide = (v) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

/** La question est-elle visible avec ces réponses ? */
export function questionVisible(question, reponses) {
  const s = question.si;
  if (!s) return true;
  const v = (reponses || {})[s.cle];
  if (s.egal !== undefined) return v === s.egal;
  if (s.contient !== undefined) return Array.isArray(v) && v.includes(s.contient);
  if (s.rempli) return !vide(v);
  return true;
}

/** Réponses prêtes à envoyer : seulement les questions visibles, sans valeur vide, valeurs bornées. */
export function nettoyerReponses(type, reponses) {
  const r = reponses || {};
  const sortie = {};
  for (const qu of questionsDe(type)) {
    if (!questionVisible(qu, r)) continue;
    let v = r[qu.cle];
    if (vide(v)) continue;
    if (qu.type === 'texte') v = String(v).trim().slice(0, 1000);
    else if (qu.type === 'nombre' || qu.type === 'eva') {
      v = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(v)) continue;
      const min = qu.type === 'eva' ? 0 : qu.min;
      const max = qu.type === 'eva' ? 10 : qu.max;
      if (v < min || v > max) continue;
    } else if (qu.type === 'multi') {
      v = (Array.isArray(v) ? v : []).filter((x) => qu.options.some((o) => o.v === x));
      if (v.length === 0) continue;
    } else if (qu.type === 'oui_non' || qu.type === 'choix') {
      if (!qu.options.some((o) => o.v === v)) continue;
    }
    sortie[qu.cle] = v;
  }
  return sortie;
}

/** Nombres hors limites parmi les réponses saisies : liste de messages pour guider le patient. */
export function erreursReponses(type, reponses) {
  const r = reponses || {};
  const erreurs = [];
  for (const qu of questionsDe(type)) {
    if (!questionVisible(qu, r)) continue;
    const v = r[qu.cle];
    if (vide(v)) continue;
    if (qu.type === 'nombre') {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || n < qu.min || n > qu.max) {
        erreurs.push(`« ${qu.libelle} » : indiquez un nombre entre ${qu.min} et ${qu.max}.`);
      }
    }
    if (qu.type === 'texte' && String(v).length > 1000) {
      erreurs.push(`« ${qu.libelle} » : 1000 caractères au maximum.`);
    }
  }
  return erreurs;
}

/** Valeurs de départ tirées de la fiche (lecture seule pour le patient) : seulement ce qui n'a pas encore de réponse. */
export function valeursDepart(type, reponses, fiche) {
  const r = { ...(reponses || {}) };
  const f = fiche || {};
  for (const qu of questionsDe(type)) {
    if (!qu.fiche || r[qu.cle] !== undefined) continue;
    if (qu.fiche === 'sport_oui') {
      if (!vide(f.sport)) r[qu.cle] = 'oui';
      continue;
    }
    const src = qu.fiche === 'sport' ? f.sport : qu.fiche === 'metier' ? f.metier : f[qu.fiche];
    if (!vide(src)) r[qu.cle] = typeof src === 'number' ? String(src) : String(src);
  }
  return r;
}

/** Phrase de la carte d'accueil. */
export function phraseQuestionnaire(etat) {
  if (!etat) return 'Rien à remplir pour l’instant';
  if (!etat.modifiable && !etat.rempli_at) return 'Le délai est dépassé';
  if (!etat.rempli_at) return 'À remplir avant votre rendez-vous';
  return etat.modifiable ? 'Envoyé — vous pouvez encore le modifier' : 'Envoyé, merci ✨';
}

export function messageErreurQuestionnaire(statut, corps) {
  const m = corps && typeof corps === 'object' ? String(corps.message || '') : '';
  if (statut === 0) return 'Pas de connexion internet. Vérifiez votre réseau puis réessayez.';
  if (m.includes('delai_depasse'))
    return 'Le rendez-vous est passé : le questionnaire ne peut plus être modifié.';
  if (m.includes('questionnaire_introuvable')) return 'Ce questionnaire n’est plus disponible.';
  if (m.includes('trop_de_modifications'))
    return 'Trop de modifications. Parlez-en à votre praticien.';
  if (m.includes('reponses_vides')) return 'Répondez à au moins une question avant d’envoyer.';
  if (m.includes('texte_trop_long'))
    return 'Un de vos textes est trop long (1000 caractères au maximum).';
  if (m.includes('valeur_hors_limites'))
    return 'Un nombre est hors limites : vérifiez le poids, la taille ou la douleur.';
  if (statut >= 500) return 'Petit souci de notre côté. Réessayez dans un instant.';
  return 'Une erreur est survenue. Réessayez.';
}
