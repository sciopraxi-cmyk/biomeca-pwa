// Landing — menu « Fonctionnalités » (praticien) et pages de description.
// Données statiques : chaque fonctionnalité a un état (disponible / à venir). Une fonction « à venir » ne doit
// jamais être décrite comme disponible. Rien n'est lu en base ; aucun secret ni donnée patient ici.
(function () {
  'use strict';

  var RUBRIQUES = [
    {
      id: 'agenda',
      titre: 'Agenda et patients',
      items: [
        {
          id: 'agenda-vues',
          titre: 'Agenda Jour / Semaine / Mois',
          resume: 'Votre planning dans Verticy, avec vos agendas Google.',
          points: [
            'Trois vues : jour, semaine, mois.',
            'Rendez-vous simultanés lisibles, séjours et journées entières dans un bandeau à part.',
            'Une couleur par compte Google connecté.',
            'Google ne reçoit que les initiales du patient et le motif : jamais le nom complet ni le téléphone.',
          ],
        },
        {
          id: 'import-doctolib',
          titre: 'Import Doctolib (CSV)',
          resume: "Importez l'historique de rendez-vous exporté depuis Doctolib.",
          points: [
            'Import manuel du fichier officiel « Historique de RDV » : conforme aux conditions de Doctolib.',
            "Les rendez-vous s'affichent dans l'agenda en lecture seule.",
            'Création automatique des fiches des patients inconnus : à venir.',
          ],
        },
        {
          id: 'dossier-patient',
          titre: 'Dossier patient',
          resume: 'Une fiche par patient, sans doublon, avec tout son historique.',
          points: [
            'Fiche patient avec coordonnées, bilans successifs et documents.',
            'Détection des doublons (nom, prénom, date de naissance).',
            'Import et export CSV du répertoire patients.',
            "Le numéro de sécurité sociale n'est jamais stocké.",
          ],
        },
        {
          id: 'arrivee-rdv',
          titre: "Arrivée d'un rendez-vous",
          resume: 'Un rendez-vous saisi, et tout est préparé pour votre patient.',
          points: [
            'Fiche créée ou retrouvée sans doublon, accès au portail patient préparé.',
            'Devis généré tout de suite quand le motif est un acte.',
            'Questionnaire visible par le patient 3 jours avant, rappel la veille.',
            'Envoi automatique des e-mails même Verticy fermé : à venir.',
          ],
          avenirPartiel: true,
        },
      ],
    },
    {
      id: 'bilans',
      titre: 'Bilans',
      items: [
        {
          id: 'bilan-postural',
          titre: 'Bilan postural',
          resume: 'Une analyse posturale complète, du recueil au rapport.',
          points: [
            'Analyse en 9 sections.',
            'Rapport PDF généré automatiquement.',
            'Comparaison entre bilans successifs (initial et contrôles).',
          ],
        },
        {
          id: 'bilan-sport',
          titre: 'Bilan de podologie du sport',
          resume: "L'analyse cinématique complète du sportif.",
          points: [
            'Analyse cinématique complète.',
            'Bilan sportif et suivi de performance.',
            'Rapport PDF généré automatiquement.',
          ],
        },
        {
          id: 'bilan-podopediatrie',
          titre: 'Bilan de podopédiatrie',
          resume: "Un bilan qui s'ajuste tout seul à l'âge de l'enfant.",
          points: [
            "Questions et tests ajustés automatiquement selon l'âge de l'enfant.",
            'Suivi de croissance.',
            'Rapport PDF généré automatiquement.',
          ],
        },
        {
          id: 'bilan-pedicurie',
          titre: 'Bilan de pédicurie',
          resume: 'Soins et appareillage, offert avec toutes les formules.',
          points: [
            'Bilan de pédicurie complet : soins et appareillage.',
            'Inclus dans chaque formule, sans supplément.',
            'Rapport PDF généré automatiquement.',
          ],
        },
        {
          id: 'bilan-osteopathique',
          titre: 'Bilan ostéopathique',
          avenir: true,
          resume: 'Pour les podologues aussi ostéopathes : parlez, le rapport s’écrit.',
          points: [
            'Uniquement par dictée avec IA : le rapport est généré automatiquement.',
            'Offert avec toutes les formules.',
          ],
        },
        {
          id: 'dictee-vocale',
          titre: 'Dictée vocale',
          resume: 'Dictez vos observations champ par champ.',
          points: ["Un micro dans les zones de saisie : vous parlez, le texte s'écrit."],
        },
        {
          id: 'dictee-ia',
          titre: 'Dictée IA et rapport automatique',
          avenir: true,
          resume: 'Pour chaque bilan : vous dictez, Verticy rédige le rapport.',
          points: [
            'Disponible pour chacun des bilans.',
            'Vous relisez et validez avant publication.',
          ],
        },
        {
          id: 'visualisation-3d',
          titre: 'Visualisation 3D du patient',
          avenir: true,
          resume: 'Un mannequin 3D qui se déforme selon les dysfonctions que vous cochez.',
          points: [
            'Remplace les silhouettes annotées.',
            'Vues de face, de dos et de profil.',
            'Compensations proposées, jamais imposées : vous validez.',
          ],
        },
        {
          id: 'mecanismes-lesionnels',
          titre: 'Mécanismes lésionnels dans le rapport',
          avenir: true,
          resume: 'Le rapport relie les mécanismes lésionnels aux résultats du bilan.',
          points: ['Proposés à partir des résultats du bilan, que vous relisez avant publication.'],
        },
        {
          id: 'exercices-automatiques',
          titre: 'Sélection automatique des exercices',
          avenir: true,
          resume: 'Les exercices sont choisis selon les résultats du bilan.',
          points: [
            'Proposition automatique, que vous pouvez modifier.',
            'Publiée dans le programme du patient.',
          ],
        },
      ],
    },
    {
      id: 'podologie',
      titre: 'Podologie',
      items: [
        {
          id: 'ordonnances',
          titre: 'Ordonnances podologue',
          resume: 'Vos prescriptions avec signature et tampon.',
          points: [
            'Signature et tampon enregistrés une fois.',
            'Prescriptions classées dans le dossier du patient.',
          ],
        },
        {
          id: 'semelles-3d',
          titre: 'Semelles : conception 3D et export STL',
          avenir: true,
          resume: 'Concevez la semelle en 3D, à la bonne pointure, puis exportez-la.',
          points: [
            'Conception numérique 3D de la semelle orthopédique.',
            'Éléments correcteurs avec matériau, épaisseur et dureté.',
            'Export STL pour la fabrication.',
            'Scan au téléphone : à étudier.',
          ],
        },
        {
          id: 'sterilisation',
          titre: 'Stérilisation',
          resume: 'Un registre de traçabilité de votre matériel.',
          points: ['Traçabilité de chaque cycle de stérilisation.', 'Consultable à tout moment.'],
        },
      ],
    },
    {
      id: 'documents',
      titre: 'Documents et relation patient',
      items: [
        {
          id: 'rapports-pdf',
          titre: 'Rapports PDF automatiques',
          resume: 'Le rapport se génère seul, en un clic.',
          points: ['Un rapport clair pour chaque bilan.', "Publiable dans l'espace du patient."],
        },
        {
          id: 'devis-factures',
          titre: 'Devis et factures',
          resume: 'Vos documents de facturation, rattachés à chaque patient.',
          points: [
            'Devis et factures par patient, avec tiers payant.',
            "Catalogue d'actes personnalisable.",
            'Impression et export des documents émis.',
          ],
        },
        {
          id: 'signature-devis',
          titre: 'Signature du devis par le patient',
          resume: 'Le patient signe son devis depuis son espace.',
          points: [
            'Signature tracée au doigt.',
            'Date et empreinte du document conservées avec la signature.',
            'Code de confirmation pour les patients mineurs.',
          ],
        },
        {
          id: 'espace-patient',
          titre: 'Espace patient',
          resume: 'Vos patients retrouvent leurs documents et leur programme.',
          points: [
            'Accès sécurisé par identifiants.',
            'Documents partagés : devis, ordonnances, rapports de bilan.',
          ],
        },
        {
          id: 'exercices-video',
          titre: 'Exercices vidéo avec chrono',
          resume: 'Un programme à suivre chez soi, avec suivi côté praticien.',
          points: [
            'Vidéo de chaque exercice et chronomètre.',
            'Validation de chaque séance et message « Bravo ».',
            'Vous êtes prévenu quand le patient termine sa séance.',
          ],
        },
        {
          id: 'questionnaire',
          titre: 'Questionnaire avant rendez-vous',
          resume: 'Le patient remplit avant de venir, vous gagnez du temps.',
          points: [
            'Disponible 3 jours avant le rendez-vous, rappel la veille.',
            'Réponses intégrées à la fiche et au bilan après votre validation.',
          ],
        },
        {
          id: 'messagerie',
          titre: 'Messagerie patient',
          resume: 'Un fil de messages sécurisé avec chaque patient.',
          points: [
            'Messages texte entre le patient et vous.',
            'Activable ou désactivable patient par patient.',
          ],
        },
        {
          id: 'mes-rendez-vous',
          titre: 'Mes rendez-vous (côté patient)',
          avenir: true,
          resume: 'Le patient voit ses rendez-vous passés et à venir.',
          points: ['Dans son espace patient.'],
        },
      ],
    },
    {
      id: 'cabinet',
      titre: 'Cabinet et conformité',
      items: [
        {
          id: 'sauvegardes',
          titre: 'Sauvegardes automatiques',
          resume: 'Vos données sont enregistrées en continu.',
          points: [
            'Aucun bouton « Sauvegarder » à penser.',
            'Chaque praticien ne voit que ses propres patients.',
          ],
        },
        {
          id: 'mode-domicile',
          titre: 'Mode domicile (hors connexion)',
          resume: 'Travaillez chez le patient, même sans réseau.',
          points: [
            'Passage automatique en mode hors connexion à la perte du réseau.',
            'Photos mises en attente puis envoyées au retour du réseau.',
          ],
        },
        {
          id: 'notifications',
          titre: 'Centre de notifications',
          resume: 'Soyez prévenu de ce qui compte.',
          points: [
            "Message d'un patient, séance terminée, devis signé.",
            'Historique consultable et exportable.',
          ],
        },
        {
          id: 'comptabilite',
          titre: 'Comptabilité',
          avenir: true,
          resume: 'Le montant de vos factures et son évolution.',
          points: ['Liste des montants facturés.', 'Tendance par période.'],
        },
        {
          id: 'multi-praticiens',
          titre: 'Cabinet multi-praticiens',
          avenir: true,
          resume: 'Un cabinet, plusieurs praticiens : titulaire, collaborateur, remplaçant.',
          points: ['Droits adaptés au rôle de chacun.'],
        },
        {
          id: 'hds',
          titre: 'Hébergement de santé (HDS)',
          avenir: true,
          resume: 'Un hébergement certifié pour les données de santé.',
          points: ['Hébergeur certifié HDS : en cours de mise en place.'],
        },
      ],
    },
  ];

  // ─── Icônes (traits 24×24, style Lucide) et habillage par rubrique / fonction ───
  var P = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    calcheck:
      '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18m-11 6 2 2 4-4"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
    msg: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    folder:
      '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    cube: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    spark:
      '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    target:
      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    receipt:
      '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 2 2V2l-2 2-3-2-3 2-3-2-3 2z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 6v2M12 16v2"/>',
    video:
      '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    db: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17M16 7h6v6"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    heart:
      '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
    scissors:
      '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
    person: '<circle cx="12" cy="5" r="1"/><path d="m9 20 3-6 3 6M6 8l6 2 6-2M12 10v4"/>',
    feet: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4M4 13h4"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    drop: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
  };
  function ico(k, taille) {
    var s = taille || 22;
    return (
      '<svg class="lpx-ico" width="' +
      s +
      '" height="' +
      s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (P[k] || P.spark) +
      '</svg>'
    );
  }
  window.lpIco = ico;

  var RUB_META = {
    agenda: {
      ic: 'calendar',
      c: '#2563EB',
      accroche: 'Votre planning et vos patients, sans ressaisie.',
    },
    bilans: { ic: 'clip', c: '#0D9488', accroche: 'Cinq bilans, de la saisie au rapport.' },
    podologie: { ic: 'feet', c: '#6D28D9', accroche: 'Les outils propres au podologue.' },
    documents: { ic: 'file', c: '#B45309', accroche: "De l'ordonnance au suivi à domicile." },
    cabinet: { ic: 'shield', c: '#0369A1', accroche: 'Un cabinet fiable, même sans réseau.' },
  };
  // Photos : illustrations déjà présentes dans l'application (assets/bilans), une par bilan.
  // Captures d'écran réelles de Verticy pour les autres fonctionnalités (assets/landing).
  var ITEM_META = {
    'agenda-vues': { ic: 'calendar', img: 'assets/landing/agenda-semaine.png' },
    'import-doctolib': { ic: 'download', img: 'assets/landing/import-doctolib.png' },
    'dossier-patient': { ic: 'folder', img: 'assets/landing/dossier-patient.png' },
    'arrivee-rdv': { ic: 'calcheck', img: 'assets/landing/arrivee-rdv.png' },
    'bilan-postural': { ic: 'person', img: 'assets/landing/bilan-postural-interieur.png' },
    'bilan-sport': { ic: 'pulse', img: 'assets/landing/bilan-sport-interieur.png' },
    'bilan-podopediatrie': { ic: 'heart', img: 'assets/landing/bilan-podopediatrie-interieur.png' },
    'bilan-pedicurie': { ic: 'scissors', img: 'assets/landing/bilan-pedicurie-interieur.png' },
    'bilan-osteopathique': { ic: 'hand', img: 'assets/bilans/illus-osteopathie.jpg' },
    'dictee-vocale': { ic: 'mic' },
    'dictee-ia': { ic: 'spark' },
    'visualisation-3d': { ic: 'cube' },
    'mecanismes-lesionnels': { ic: 'search' },
    'exercices-automatiques': { ic: 'target' },
    ordonnances: { ic: 'file', img: 'assets/landing/ordonnances.png' },
    'semelles-3d': { ic: 'layers' },
    sterilisation: { ic: 'drop', img: 'assets/landing/sterilisation.png' },
    'rapports-pdf': { ic: 'file', img: 'assets/landing/rapport-pdf.png' },
    'devis-factures': { ic: 'receipt', img: 'assets/landing/devis-factures.png' },
    'signature-devis': { ic: 'pen', img: 'assets/landing/patient-documents-a-signer.png' },
    'espace-patient': { ic: 'user', img: 'assets/landing/patient-accueil.png' },
    'exercices-video': { ic: 'video', img: 'assets/landing/patient-exercices.png' },
    questionnaire: { ic: 'clip', img: 'assets/landing/patient-questionnaire.png' },
    messagerie: { ic: 'msg', img: 'assets/landing/patient-messagerie.png' },
    'mes-rendez-vous': { ic: 'clock' },
    sauvegardes: { ic: 'db' },
    'mode-domicile': { ic: 'car', img: 'assets/landing/mode-domicile.png' },
    notifications: { ic: 'bell', img: 'assets/landing/notifications.png' },
    comptabilite: { ic: 'trend' },
    'multi-praticiens': { ic: 'users' },
    hds: { ic: 'lock' },
  };
  RUBRIQUES.forEach(function (r) {
    var m = RUB_META[r.id];
    r.ic = m.ic;
    r.couleur = m.c;
    r.accroche = m.accroche;
    r.items.forEach(function (it) {
      var im = ITEM_META[it.id] || {};
      it.ic = im.ic || 'spark';
      if (im.img) it.img = im.img;
    });
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function trouver(id) {
    for (var i = 0; i < RUBRIQUES.length; i++) {
      for (var j = 0; j < RUBRIQUES[i].items.length; j++) {
        if (RUBRIQUES[i].items[j].id === id)
          return { rub: RUBRIQUES[i], item: RUBRIQUES[i].items[j], pos: j };
      }
    }
    return null;
  }

  function badge(it) {
    if (it.avenir) return '<span class="lpx-badge lpx-avenir">À venir</span>';
    if (it.avenirPartiel) return '<span class="lpx-badge lpx-partiel">En partie à venir</span>';
    return '';
  }

  // ─── Menu déroulant (barre du haut) ───
  function construireMenu() {
    var h = '';
    RUBRIQUES.forEach(function (r) {
      h +=
        '<div class="lpx-mcol" style="--c:' +
        r.couleur +
        '"><button type="button" class="lpx-mtitre" onclick="lpRubrique(\'' +
        r.id +
        '\')"><span class="lpx-mchip">' +
        ico(r.ic, 16) +
        '</span>' +
        esc(r.titre) +
        '</button>';
      r.items.forEach(function (it) {
        h +=
          '<button type="button" class="lpx-mlien" onclick="lpFonction(\'' +
          it.id +
          '\')"><span>' +
          esc(it.titre) +
          '</span>' +
          (it.avenir ? '<em>à venir</em>' : '') +
          '</button>';
      });
      h += '</div>';
    });
    return h;
  }

  // ─── Explorateur de la page praticien : onglets de rubriques + liste des fonctions ───
  var rubActive = 'agenda';
  function ligneFonction(it) {
    return (
      '<button type="button" class="lpx-ligne" onclick="lpFonction(\'' +
      it.id +
      '\')"><span class="lpx-ligne-ico">' +
      ico(it.ic, 20) +
      '</span><span class="lpx-ligne-txt"><strong>' +
      esc(it.titre) +
      badge(it) +
      '</strong><small>' +
      esc(it.resume) +
      '</small></span><span class="lpx-ligne-fl">' +
      ico('chevron', 18) +
      '</span></button>'
    );
  }
  function dessinerExplorateur() {
    var z = document.getElementById('lpx-explorer');
    if (!z) return;
    var r =
      RUBRIQUES.filter(function (x) {
        return x.id === rubActive;
      })[0] || RUBRIQUES[0];
    var h = '<div class="lpx-tabs" role="tablist">';
    RUBRIQUES.forEach(function (x) {
      var n = x.items.length;
      h +=
        '<button type="button" role="tab" aria-selected="' +
        (x.id === r.id) +
        '" class="lpx-tab' +
        (x.id === r.id ? ' on' : '') +
        '" style="--c:' +
        x.couleur +
        '" onclick="lpExplorer(\'' +
        x.id +
        '\')"><span class="lpx-tab-ico">' +
        ico(x.ic, 20) +
        '</span><span><strong>' +
        esc(x.titre) +
        '</strong><small>' +
        n +
        ' fonctions</small></span></button>';
    });
    h +=
      '</div><div class="lpx-pan" style="--c:' +
      r.couleur +
      '"><div class="lpx-pan-tete"><div><h3>' +
      esc(r.titre) +
      '</h3><p>' +
      esc(r.accroche) +
      '</p></div>';
    h +=
      '<button type="button" class="lpx-lien-fl" onclick="lpRubrique(\'' +
      r.id +
      '\')">Voir toute la rubrique ' +
      ico('arrow', 16) +
      '</button></div><div class="lpx-lignes">';
    r.items.forEach(function (it) {
      h += ligneFonction(it);
    });
    h += '</div></div>';
    z.innerHTML = h;
  }
  window.lpExplorer = function (id) {
    rubActive = id;
    dessinerExplorateur();
  };

  // ─── Pages ───
  function pied() {
    return (
      '<section class="lpx-cta"><div><h2>Essayez Verticy gratuitement pendant 14 jours</h2><p>Sans carte bancaire, accès complet dès l\'inscription.</p></div>' +
      '<div class="lpx-cta-btns"><button type="button" class="lpx-btn lpx-btn-clair" onclick="showRegisterForm()">Démarrer l\'essai gratuit</button>' +
      '<button type="button" class="lpx-btn lpx-btn-fantome" onclick="lpAllerTarifs()">Voir les tarifs</button></div></section>'
    );
  }
  function fil(parts) {
    var h = '<nav class="lpx-fil" aria-label="Fil d\'Ariane">';
    parts.forEach(function (p, i) {
      if (i) h += '<span class="lpx-fil-sep">' + ico('chevron', 14) + '</span>';
      h += p.on
        ? '<button type="button" onclick="' + p.on + '">' + esc(p.t) + '</button>'
        : '<span class="lpx-fil-cur">' + esc(p.t) + '</span>';
    });
    return h + '</nav>';
  }
  function ouvrir(html) {
    var z = document.getElementById('lp-fonctions');
    if (!z) return;
    z.innerHTML = html;
    if (typeof lpVue === 'function') lpVue('fonction');
    var m = document.getElementById('lpf-menu');
    if (m) m.classList.remove('ouvert');
  }

  window.lpRubrique = function (id) {
    var r = RUBRIQUES.filter(function (x) {
      return x.id === id;
    })[0];
    if (!r) return;
    var h =
      '<div class="lpx-fp" style="--c:' +
      r.couleur +
      '">' +
      fil([
        { t: 'Fonctionnalités', on: "lpVue('praticien',{scroll:'lpx-explorer'})" },
        { t: r.titre },
      ]);
    h +=
      '<header class="lpx-rub-tete"><span class="lpx-rub-ico">' +
      ico(r.ic, 30) +
      '</span><div><h1>' +
      esc(r.titre) +
      '</h1><p>' +
      esc(r.accroche) +
      '</p></div></header>';
    h += '<div class="lpx-grille">';
    r.items.forEach(function (it) {
      h += '<button type="button" class="lpx-fcarte" onclick="lpFonction(\'' + it.id + '\')">';
      h += it.img
        ? '<span class="lpx-fcarte-img" style="background-image:url(' + it.img + ')"></span>'
        : '<span class="lpx-fcarte-ico">' + ico(it.ic, 26) + '</span>';
      h +=
        '<span class="lpx-fcarte-nom">' +
        esc(it.titre) +
        '</span><span class="lpx-fcarte-txt">' +
        esc(it.resume) +
        '</span>' +
        badge(it) +
        '<span class="lpx-fcarte-fl">' +
        ico('arrow', 18) +
        '</span></button>';
    });
    h += '</div>' + pied() + '</div>';
    ouvrir(h);
  };

  window.lpFonction = function (id) {
    var t = trouver(id);
    if (!t) return;
    var it = t.item,
      r = t.rub;
    var h =
      '<div class="lpx-fp" style="--c:' +
      r.couleur +
      '">' +
      fil([
        { t: 'Fonctionnalités', on: "lpVue('praticien',{scroll:'lpx-explorer'})" },
        { t: r.titre, on: "lpRubrique('" + r.id + "')" },
        { t: it.titre },
      ]);
    h +=
      '<section class="lpx-fp-hero"><div class="lpx-fp-txt"><span class="lpx-eyebrow">' +
      ico(r.ic, 14) +
      esc(r.titre) +
      '</span>';
    h +=
      '<div class="lpx-fp-titre"><h1>' +
      esc(it.titre) +
      '</h1>' +
      badge(it) +
      '</div><p class="lpx-fp-resume">' +
      esc(it.resume) +
      '</p><ul class="lpx-checks">';
    it.points.forEach(function (p) {
      h +=
        '<li><span class="lpx-check">' +
        ico('check', 14) +
        '</span><span>' +
        esc(p) +
        '</span></li>';
    });
    h += '</ul>';
    if (it.avenir)
      h +=
        '<p class="lpx-note">Cette fonctionnalité n\'est pas encore disponible : elle fait partie des prochaines évolutions de Verticy.</p>';
    h +=
      '<div class="lpx-fp-btns"><button type="button" class="lpx-btn lpx-btn-plein" onclick="showRegisterForm()">Essayer gratuitement</button><button type="button" class="lpx-btn lpx-btn-contour" onclick="lpAllerTarifs()">Voir les tarifs</button></div></div>';
    h += '<div class="lpx-fp-visuel' + (it.img ? ' avec-photo' : '') + '">';
    h += it.img
      ? '<img src="' +
        it.img +
        '" alt="' +
        esc(it.titre) +
        '" loading="lazy"' +
        (it.img.indexOf('assets/landing/') === 0 ? ' class="capture"' : '') +
        '/>'
      : '<div class="lpx-fp-motif"></div><div class="lpx-fp-medaillon">' +
        ico(it.ic, 64) +
        '</div>';
    if (it.avenir) h += '<span class="lpx-fp-ruban">À venir</span>';
    h += '</div></section>';
    var autres = r.items.filter(function (x) {
      return x.id !== id;
    });
    if (autres.length) {
      h += '<section class="lpx-voisines"><h2>Dans la même rubrique</h2><div class="lpx-lignes">';
      autres.slice(0, 6).forEach(function (x) {
        h += ligneFonction(x);
      });
      h += '</div></section>';
    }
    h += pied() + '</div>';
    ouvrir(h);
  };

  window.lpMenuBascule = function () {
    var m = document.getElementById('lpf-menu');
    if (m) m.classList.toggle('ouvert');
  };

  window.LP_FONCTIONS = RUBRIQUES;

  function init() {
    var m = document.getElementById('lpf-menu');
    if (m) m.innerHTML = construireMenu();
    dessinerExplorateur();
    document.addEventListener('click', function (e) {
      var menu = document.getElementById('lpf-menu');
      var btn = document.getElementById('lp-nav-fonctions');
      if (
        menu &&
        menu.classList.contains('ouvert') &&
        !menu.contains(e.target) &&
        !(btn && btn.contains(e.target))
      )
        menu.classList.remove('ouvert');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
