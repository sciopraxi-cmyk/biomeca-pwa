// Landing — menu « Fonctionnalités » (praticien) et pages de description.
// Données statiques : chaque fonctionnalité a un état (disponible / à venir). Une fonction « à venir » ne doit
// jamais être décrite comme disponible. Rien n'est lu en base ; aucun secret ni donnée patient ici.
(function () {
  'use strict';

  var RUBRIQUES = [
    {
      id: 'agenda',
      titre: 'Agenda et patients',
      icone: '📅',
      items: [
        {
          id: 'agenda-vues',
          titre: 'Agenda Jour / Semaine / Mois',
          icone: '🗓️',
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
          icone: '📥',
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
          icone: '🗂️',
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
          icone: '🛎️',
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
      icone: '📋',
      items: [
        {
          id: 'bilan-postural',
          titre: 'Bilan postural',
          icone: '🧍',
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
          icone: '🦶',
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
          icone: '👶',
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
          icone: '✂️',
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
          icone: '🖐️',
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
          icone: '🎤',
          resume: 'Dictez vos observations champ par champ.',
          points: ["Un micro dans les zones de saisie : vous parlez, le texte s'écrit."],
        },
        {
          id: 'dictee-ia',
          titre: 'Dictée IA et rapport automatique',
          icone: '🤖',
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
          icone: '🧬',
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
          icone: '🔎',
          avenir: true,
          resume: 'Le rapport relie les mécanismes lésionnels aux résultats du bilan.',
          points: ['Proposés à partir des résultats du bilan, que vous relisez avant publication.'],
        },
        {
          id: 'exercices-automatiques',
          titre: 'Sélection automatique des exercices',
          icone: '🎯',
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
      icone: '🦶',
      items: [
        {
          id: 'ordonnances',
          titre: 'Ordonnances podologue',
          icone: '📝',
          resume: 'Vos prescriptions avec signature et tampon.',
          points: [
            'Signature et tampon enregistrés une fois.',
            'Prescriptions classées dans le dossier du patient.',
          ],
        },
        {
          id: 'semelles-3d',
          titre: 'Semelles : conception 3D et export STL',
          icone: '👟',
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
          icone: '🧼',
          resume: 'Un registre de traçabilité de votre matériel.',
          points: ['Traçabilité de chaque cycle de stérilisation.', 'Consultable à tout moment.'],
        },
      ],
    },
    {
      id: 'documents',
      titre: 'Documents et relation patient',
      icone: '📄',
      items: [
        {
          id: 'rapports-pdf',
          titre: 'Rapports PDF automatiques',
          icone: '📄',
          resume: 'Le rapport se génère seul, en un clic.',
          points: ['Un rapport clair pour chaque bilan.', "Publiable dans l'espace du patient."],
        },
        {
          id: 'devis-factures',
          titre: 'Devis et factures',
          icone: '🧾',
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
          icone: '✍️',
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
          icone: '🙋',
          resume: 'Vos patients retrouvent leurs documents et leur programme.',
          points: [
            'Accès sécurisé par identifiants.',
            'Documents partagés : devis, ordonnances, rapports de bilan.',
          ],
        },
        {
          id: 'exercices-video',
          titre: 'Exercices vidéo avec chrono',
          icone: '🏃',
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
          icone: '📋',
          resume: 'Le patient remplit avant de venir, vous gagnez du temps.',
          points: [
            'Disponible 3 jours avant le rendez-vous, rappel la veille.',
            'Réponses intégrées à la fiche et au bilan après votre validation.',
          ],
        },
        {
          id: 'messagerie',
          titre: 'Messagerie patient',
          icone: '💬',
          resume: 'Un fil de messages sécurisé avec chaque patient.',
          points: [
            'Messages texte entre le patient et vous.',
            'Activable ou désactivable patient par patient.',
          ],
        },
        {
          id: 'mes-rendez-vous',
          titre: 'Mes rendez-vous (côté patient)',
          icone: '📆',
          avenir: true,
          resume: 'Le patient voit ses rendez-vous passés et à venir.',
          points: ['Dans son espace patient.'],
        },
      ],
    },
    {
      id: 'cabinet',
      titre: 'Cabinet et conformité',
      icone: '🏥',
      items: [
        {
          id: 'sauvegardes',
          titre: 'Sauvegardes automatiques',
          icone: '💾',
          resume: 'Vos données sont enregistrées en continu.',
          points: [
            'Aucun bouton « Sauvegarder » à penser.',
            'Chaque praticien ne voit que ses propres patients.',
          ],
        },
        {
          id: 'mode-domicile',
          titre: 'Mode domicile (hors connexion)',
          icone: '🚗',
          resume: 'Travaillez chez le patient, même sans réseau.',
          points: [
            'Passage automatique en mode hors connexion à la perte du réseau.',
            'Photos mises en attente puis envoyées au retour du réseau.',
          ],
        },
        {
          id: 'notifications',
          titre: 'Centre de notifications',
          icone: '🔔',
          resume: 'Soyez prévenu de ce qui compte.',
          points: [
            "Message d'un patient, séance terminée, devis signé.",
            'Historique consultable et exportable.',
          ],
        },
        {
          id: 'comptabilite',
          titre: 'Comptabilité',
          icone: '📊',
          avenir: true,
          resume: 'Le montant de vos factures et son évolution.',
          points: ['Liste des montants facturés.', 'Tendance par période.'],
        },
        {
          id: 'multi-praticiens',
          titre: 'Cabinet multi-praticiens',
          icone: '👥',
          avenir: true,
          resume: 'Un cabinet, plusieurs praticiens : titulaire, collaborateur, remplaçant.',
          points: ['Droits adaptés au rôle de chacun.'],
        },
        {
          id: 'hds',
          titre: 'Hébergement de santé (HDS)',
          icone: '🔒',
          avenir: true,
          resume: 'Un hébergement certifié pour les données de santé.',
          points: ['Hébergeur certifié HDS : en cours de mise en place.'],
        },
      ],
    },
  ];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function trouver(id) {
    for (var i = 0; i < RUBRIQUES.length; i++) {
      for (var j = 0; j < RUBRIQUES[i].items.length; j++) {
        if (RUBRIQUES[i].items[j].id === id)
          return { rub: RUBRIQUES[i], item: RUBRIQUES[i].items[j] };
      }
    }
    return null;
  }

  function badge(it) {
    if (it.avenir) return '<span class="lpf-badge lpf-avenir">À venir</span>';
    if (it.avenirPartiel) return '<span class="lpf-badge lpf-partiel">En partie à venir</span>';
    return '';
  }

  // Panneau déroulant du menu : 5 colonnes, une par rubrique.
  function construireMenu() {
    var h = '';
    RUBRIQUES.forEach(function (r) {
      h +=
        '<div class="lpf-col"><button type="button" class="lpf-col-titre" onclick="lpRubrique(\'' +
        r.id +
        '\')">' +
        r.icone +
        ' ' +
        esc(r.titre) +
        '</button>';
      r.items.forEach(function (it) {
        h +=
          '<button type="button" class="lpf-lien" onclick="lpFonction(\'' +
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

  function pied() {
    return (
      '<div class="lpf-cta"><div><strong>Essayez Verticy gratuitement pendant 14 jours</strong><span>Sans carte bancaire, accès complet dès l\'inscription.</span></div>' +
      '<div class="lpf-cta-btns"><button type="button" class="lp-primary" onclick="showRegisterForm()">Démarrer l\'essai gratuit</button>' +
      '<button type="button" class="lp-ghost lpf-ghost" onclick="lpAllerTarifs()">Voir les tarifs</button></div></div>'
    );
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
      '<div class="lpf-page"><div class="lpf-fil"><button type="button" onclick="lpVue(\'praticien\')">← Retour</button></div>';
    h += '<h2 class="lpf-titre">' + r.icone + ' ' + esc(r.titre) + '</h2><div class="lpf-grille">';
    r.items.forEach(function (it) {
      h +=
        '<button type="button" class="lpf-carte" onclick="lpFonction(\'' +
        it.id +
        '\')"><span class="lpf-carte-ico">' +
        it.icone +
        '</span><span class="lpf-carte-nom">' +
        esc(it.titre) +
        '</span><span class="lpf-carte-txt">' +
        esc(it.resume) +
        '</span>' +
        badge(it) +
        '</button>';
    });
    h += '</div>' + pied() + '</div>';
    ouvrir(h);
  };

  window.lpFonction = function (id) {
    var t = trouver(id);
    if (!t) return;
    var it = t.item;
    var h =
      '<div class="lpf-page"><div class="lpf-fil"><button type="button" onclick="lpRubrique(\'' +
      t.rub.id +
      '\')">← ' +
      esc(t.rub.titre) +
      '</button></div>';
    h +=
      '<div class="lpf-detail"><div class="lpf-detail-ico">' +
      it.icone +
      '</div><div><h2 class="lpf-titre">' +
      esc(it.titre) +
      ' ' +
      badge(it) +
      '</h2>';
    h += '<p class="lpf-resume">' + esc(it.resume) + '</p><ul class="lpf-points">';
    it.points.forEach(function (p) {
      h += '<li>' + esc(p) + '</li>';
    });
    h += '</ul>';
    if (it.avenir)
      h +=
        '<p class="lpf-note">Cette fonctionnalité n\'est pas encore disponible : elle fait partie des prochaines évolutions de Verticy.</p>';
    h += '</div></div>' + pied() + '</div>';
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
