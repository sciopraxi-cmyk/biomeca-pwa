// ═══════════════════════════════════════════════════════════════════
// #279 étape 2 — entrées SYNTHÉTIQUES de validateAndSave, pour les 9 tests
// ═══════════════════════════════════════════════════════════════════
//
// DÉPÔT PUBLIC : tout ici est fabriqué pour le test. DataURL factices
// (« data:image/jpeg;base64,QUJD » et variantes), coordonnées et angles
// inventés, patient fictif sans nom ni date de naissance. Aucune photo réelle,
// aucune capture de démonstration.
//
// Chaque cas couvre les champs que validateAndSave sérialise : marqueurs
// connus (markersConnus + dims) ou non, kfppaSigne, path déjà envoyé,
// créneau vide, frames vidéo — pour que le résultat de référence exerce
// chaque branche de la construction.

const IMG = (n) => `data:image/jpeg;base64,QUJD${n}`;
const PT = (x, y, side = '', name = 'p') => ({ x, y, side, name });

// Marqueurs inventés, trois points par côté ; un point NON placé pour
// vérifier que la persistance le filtre (#250).
const MARQUEURS = [
  PT(100, 100, 'D', 'a'),
  PT(110, 200, 'D', 'b'),
  PT(100, 300, 'D', 'c'),
  PT(300, 100, 'G', 'a'),
  PT(290, 200, 'G', 'b'),
  PT(null, null, 'G', 'c'),
];

// Créneaux d'un test d'après sa configuration : angles inventés, déterministes
// (10 + 1,5 × rang, alternés en signe), le rang 0 porte les marqueurs, le
// rang 1 un path déjà envoyé, le DERNIER créneau reste vide.
function creneaux(t) {
  const n = t.photoLabels.length;
  return t.photoLabels.map((label, i) => {
    const side = t.photoSides[i] || '';
    if (i === n - 1 && n > 2) {
      return { label, side, dataUrl: null, angle: null, path: null, markersConnus: false };
    }
    const s = {
      label,
      side,
      dataUrl: IMG(i),
      angle: (i % 2 ? -1 : 1) * (10 + 1.5 * i),
      path: i === 1 ? `u/test-${i}.jpg` : null,
    };
    if (i === 0) {
      s.markers = MARQUEURS.map((m) => ({ ...m }));
      s.dims = { w: 1920, h: 1080 };
      s.markersConnus = true;
    } else {
      s.markersConnus = false;
    }
    return s;
  });
}

const FRAMES = () => [
  {
    time: 1.25,
    dataUrl: IMG('f0'),
    angD: 4.5,
    angG: -2.5,
    markers: MARQUEURS.map((m) => ({ ...m })),
    dims: { w: 1920, h: 1080 },
    markersConnus: true,
  },
  {
    time: 2.5,
    dataUrl: IMG('f1'),
    angD: 9.5,
    angG: 1.5,
    path: 'u/frame-1.jpg',
    markersConnus: false,
  },
];

// Patient fictif : ni nom, ni date de naissance ; _bilanId fixé pour que
// validateAndSave ne tire pas d'identifiant aléatoire.
export const patientFictif = (civilite) => ({
  id: 'patient-synthetique',
  civilite,
  mesures: { _bilanId: 'bilan-synthetique' },
});

// Cas : identifiant du test, entrées, civilité.
export function cas(TESTS) {
  const liste = [];
  for (const id of Object.keys(TESTS)) {
    const t = TESTS[id];
    let slots = creneaux(t);
    if (t.kfppaPhotos) {
      // KFPPA : bipodal sans angle unique, angleD/angleG signés ; unipodaux signés.
      slots = slots.map((s) => ({ ...s }));
      slots[0] = { ...slots[0], angle: null, angleD: 1.2, angleG: -0.6, kfppaSigne: true };
      slots[1] = { ...slots[1], angle: -3.4, kfppaSigne: true };
      slots[2] = {
        label: t.photoLabels[2],
        side: 'D',
        dataUrl: IMG(2),
        angle: 11.2,
        path: null,
        markersConnus: false,
        kfppaSigne: true,
      };
    }
    if (t.mobiliteAP) {
      slots = slots.map((s, i) => ({ ...s, angleD: 12 - 20 * i, angleG: 14 - 18 * i }));
    }
    liste.push({
      nom: id,
      id,
      slots,
      frames: FRAMES(),
      civilite: id === 'kfppa-sldj' ? 'Mme' : 'M.',
    });
  }
  // Amorti « en descente » : taligrade SOUS plantigrade, pour que les écarts
  // soient NÉGATIFS avant la valeur absolue (le cas général ne l'exerçait pas).
  const ta = TESTS['amorti-marche'];
  liste.push({
    nom: 'amorti-marche#descente',
    id: 'amorti-marche',
    slots: ta.photoLabels.map((label, i) => ({
      label,
      side: ta.photoSides[i] || '',
      dataUrl: IMG(i),
      angle: [2, -3, -6, 7, 4, 5][i],
      path: null,
      markersConnus: false,
    })),
    frames: [],
    civilite: 'M.',
  });
  // Repli KFPPA sur les frames : créneaux unipodaux vides.
  const tk = TESTS['kfppa-marche'];
  liste.push({
    nom: 'kfppa-marche#repli-frames',
    id: 'kfppa-marche',
    slots: tk.photoLabels.map((label, i) => ({
      label,
      side: tk.photoSides[i] || '',
      dataUrl: null,
      angle: null,
      path: null,
      markersConnus: false,
    })),
    frames: FRAMES(),
    civilite: '',
  });
  return liste;
}
