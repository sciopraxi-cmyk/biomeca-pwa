// #271-B — placement de l'arc, de la valeur d'angle et des légendes.
//
// LES FONCTIONS NE SONT PAS RECOPIÉES : elles sont EXTRAITES de js/biomeca.js
// et évaluées telles quelles. Deux implémentations parallèles finiraient par
// diverger sans que rien ne le signale — c'est le piège du miroir de tests
// (#132). L'extraction échoue bruyamment si un nom disparaît ou devient
// ambigu, ce qui vaut mieux qu'un test qui passerait sur du code mort.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'biomeca.js'),
  'utf8'
);

function extraitFonction(nom) {
  const tete = 'function ' + nom + '(';
  const i = SRC.indexOf(tete);
  if (i === -1) throw new Error('fonction introuvable : ' + nom);
  if (SRC.indexOf(tete, i + 1) !== -1) throw new Error('fonction ambiguë : ' + nom);
  const f = SRC.indexOf('\n}\n', i);
  if (f === -1) throw new Error('fin introuvable : ' + nom);
  return SRC.slice(i, f + 2);
}
function extraitConstante(nom) {
  const tete = 'const ' + nom + ' = ';
  const i = SRC.indexOf(tete);
  if (i === -1) throw new Error('constante introuvable : ' + nom);
  if (SRC.indexOf(tete, i + 1) !== -1) throw new Error('constante ambiguë : ' + nom);
  return SRC.slice(i, SRC.indexOf('\n', i));
}

const SOURCE = [
  extraitConstante('MKR_ANG_W_REF'),
  extraitConstante('MKR_ANG_PX_REF'),
  extraitConstante('MKR_SIN_DEV_MIN'),
  extraitConstante('MKR_LEG_PAS_MAX'),
  extraitFonction('_mkrFontAngle'),
  extraitFonction('_mkrCreux'),
  extraitFonction('_mkrBoite'),
  extraitFonction('_mkrBoitesSeCoupent'),
  extraitFonction('_mkrBoiteCoupeArc'),
  extraitFonction('_mkrPlaceLegende'),
  extraitFonction('_coord'), // dépendance de _isPlacedPt, à extraire AVANT lui
  extraitFonction('_isPlacedPt'),
  extraitFonction('_mkrCentre'),
  extraitFonction('_mkrExterieur'),
  extraitConstante('MKR_ARC_LW'),
  extraitConstante('MKR_ARC_PART_SEGMENT'),
  extraitFonction('_mkrSegW'),
  extraitFonction('_mkrValeurDansArc'),
  extraitFonction('_mkrAncreSommet'),
  extraitFonction('_mkrAncreApresValeur'),
  extraitFonction('_mkrDisposition'),
].join('\n');

const M = new Function(
  SOURCE +
    '\nreturn { MKR_SIN_DEV_MIN, _mkrFontAngle, _mkrCreux, _mkrBoite,' +
    ' _mkrBoitesSeCoupent, _mkrBoiteCoupeArc, _mkrPlaceLegende,' +
    ' _mkrCentre, _mkrExterieur, _mkrAncreSommet, _mkrAncreApresValeur,' +
    ' _mkrValeurDansArc, _mkrSegW, MKR_ARC_LW, MKR_ARC_PART_SEGMENT, _mkrDisposition };'
)();

// Contexte de dessin factice : largeur proportionnelle au nombre de caractères.
const CTX = { measureText: (t) => ({ width: t.length * 6 }) };

// Coordonnées RÉELLES du relevé #272-B (1920×1080).
const REEL = {
  D: { A: { x: 902, y: 33 }, B: { x: 887, y: 247 }, C: { x: 885, y: 501 } },
  G: { A: { x: 1093, y: 31 }, B: { x: 1090, y: 223 }, C: { x: 1086, y: 501 } },
};
const uv = (g) => [
  { x: g.A.x - g.B.x, y: g.A.y - g.B.y },
  { x: g.C.x - g.B.x, y: g.C.y - g.B.y },
];
// Sommet reflété sur la corde : même amplitude, déviation inversée. FABRIQUÉ.
function miroir(g) {
  const dx = g.C.x - g.A.x,
    dy = g.C.y - g.A.y;
  const t = ((g.B.x - g.A.x) * dx + (g.B.y - g.A.y) * dy) / (dx * dx + dy * dy);
  const px = g.A.x + t * dx,
    py = g.A.y + t * dy;
  return { A: g.A, B: { x: 2 * px - g.B.x, y: 2 * py - g.B.y }, C: g.C };
}

describe('#271-B — taille de la valeur d’angle', () => {
  it('vaut 13 px à 1280, la définition d’avant #272-A', () => {
    expect(M._mkrFontAngle(1280)).toBe(13);
  });

  it('retrouve à 1920 la proportion qu’elle avait à 1280', () => {
    expect(M._mkrFontAngle(1920)).toBeCloseTo(19.5, 6);
    expect(M._mkrFontAngle(1920) / 1920).toBeCloseTo(13 / 1280, 10);
  });

  it('ne descend jamais sous les 13 px d’origine', () => {
    expect(M._mkrFontAngle(640)).toBe(13);
  });
});

describe('#271-B — sens de l’arc', () => {
  it('trace l’arc intérieur quand la déviation est franche (jambe D mesurée)', () => {
    const [u, v] = uv(REEL.D);
    const c = M._mkrCreux(u, v, REEL.D.B, REEL.G.B);
    expect(c.sinDev).toBeGreaterThan(M.MKR_SIN_DEV_MIN); // au-dessus du seuil
    expect(c.croix).toBeGreaterThan(0);
    expect(c.sens).toBe(false); // horaire = arc de moins de 180°
  });

  it('inverse le sens quand la déviation franche part de l’autre côté', () => {
    const g = miroir(REEL.D); // cas FABRIQUÉ par symétrie
    const [u, v] = uv(g);
    const c = M._mkrCreux(u, v, g.B, REEL.G.B);
    expect(c.croix).toBeLessThan(0);
    expect(c.sens).toBe(true); // c’est ce qui évitait l’arc rentrant de 183,6°
  });
});

describe('#271-B — jambe presque droite : pas de bascule sur le bruit', () => {
  it('la jambe G mesurée est SOUS le seuil de déviation', () => {
    const [u, v] = uv(REEL.G);
    const c = M._mkrCreux(u, v, REEL.G.B, REEL.D.B);
    expect(c.sinDev).toBeLessThan(M.MKR_SIN_DEV_MIN);
    expect(c.stable).toBe(false);
  });

  it('un genou dévié d’un cheveu dans un sens ou dans l’autre donne le MÊME côté', () => {
    const droit = uv(REEL.G);
    const inverse = uv(miroir(REEL.G)); // croix de signe opposé, même amplitude
    const a = M._mkrCreux(droit[0], droit[1], REEL.G.B, REEL.D.B);
    const b = M._mkrCreux(inverse[0], inverse[1], REEL.G.B, REEL.D.B);
    expect(a.croix * b.croix).toBeLessThan(0); // les signes sont bien opposés…
    expect(b.cote).toBe(a.cote); // …et pourtant le côté ne bouge pas
    expect(b.sens).toBe(a.sens);
  });

  it('sous le seuil, le creux est placé à l’opposé de l’autre jambe', () => {
    const [u, v] = uv(REEL.G);
    const c = M._mkrCreux(u, v, REEL.G.B, REEL.D.B);
    // La jambe D est à gauche (x plus petit) : le creux de G doit partir vers +x.
    expect(REEL.D.B.x).toBeLessThan(REEL.G.B.x);
    expect(c.bx).toBeGreaterThan(0);
  });

  it('sans jambe controlatérale, le côté est fixe et non aléatoire', () => {
    const droit = uv(REEL.G);
    const inverse = uv(miroir(REEL.G));
    const a = M._mkrCreux(droit[0], droit[1], REEL.G.B, null);
    const b = M._mkrCreux(inverse[0], inverse[1], REEL.G.B, null);
    expect(a.cote).toBe(1);
    expect(b.cote).toBe(1);
  });
});

describe('#271-B — garde controlatérale', () => {
  const ARC_LOIN = { x: 1e6, y: 1e6, r: 1, lw: 1 };

  it('deux boîtes qui se recoupent sont détectées, deux disjointes ne le sont pas', () => {
    const a = { x0: 0, y0: 0, x1: 10, y1: 10 };
    expect(M._mkrBoitesSeCoupent(a, { x0: 5, y0: 5, x1: 15, y1: 15 })).toBe(true);
    expect(M._mkrBoitesSeCoupent(a, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(false);
  });

  it('une boîte posée sur l’anneau de l’arc est détectée, une au centre ne l’est pas', () => {
    const arc = { x: 0, y: 0, r: 50, lw: 2.5 };
    expect(M._mkrBoiteCoupeArc({ x0: 45, y0: -5, x1: 55, y1: 5 }, arc)).toBe(true);
    expect(M._mkrBoiteCoupeArc({ x0: -5, y0: -5, x1: 5, y1: 5 }, arc)).toBe(false);
  });

  // LE POINT QUE LE COMMENTAIRE SEUL AVAIT DÉJÀ FAILLI TRAHIR : l'ordre.
  it('une légende qui heurte est DÉCALÉE, pas raccourcie', () => {
    const zone = { boite: { x0: 20, y0: -5, x1: 30, y1: 5 }, arc: ARC_LOIN };
    const p = M._mkrPlaceLegende(CTX, 'Rotule D', { x: 0, y: 0 }, { x: 1, y: 0 }, 10, 10, [zone]);
    expect(p.texte).toBe('Rotule D'); // intact
    expect(p.decale).toBe(true);
    expect(p.raccourci).toBe(false);
    expect(p.x).toBeGreaterThan(10); // poussé au-delà de sa place nominale
  });

  it('elle n’est raccourcie que si aucun décalage ne suffit', () => {
    const partout = { boite: { x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }, arc: ARC_LOIN };
    const p = M._mkrPlaceLegende(CTX, 'Rotule D', { x: 0, y: 0 }, { x: 1, y: 0 }, 10, 10, [
      partout,
    ]);
    expect(p.raccourci).toBe(true);
    expect(p.texte.length).toBeLessThan('Rotule D'.length);
    expect(p.texte.endsWith('…')).toBe(true);
  });

  // CE TEST-CI EST LE SEUL QUI DISTINGUE « pas = 0 » DE « pas += 0 ».
  // Les autres passent avec les deux versions. Ici le texte COMPLET ne tient à
  // aucun décalage, mais le texte RACCOURCI tient à sa place NOMINALE : il faut
  // donc rejouer les décalages depuis zéro après avoir raccourci.
  // Avec le contexte factice à 6 px par caractère, « Rotule D » fait 48 px et
  // « Rotule… » 42 ; une zone débutant à x=55 bloque le premier partout et
  // laisse passer le second en x=10, puisque 10+42=52 reste avant 55.
  it('après raccourcissement, les petits décalages sont REJOUÉS depuis zéro', () => {
    const aDroite = {
      boite: { x0: 55, y0: -1e6, x1: 1e6, y1: 1e6 },
      arc: { x: 1e6, y: 1e6, r: 1, lw: 1 },
    };
    const p = M._mkrPlaceLegende(CTX, 'Rotule D', { x: 0, y: 0 }, { x: 1, y: 0 }, 10, 10, [
      aDroite,
    ]);
    expect(p.texte).toBe('Rotule…');
    expect(p.x).toBe(10); // place nominale retrouvée, pas un grand décalage
    expect(p.decale).toBe(false);
    expect(p.raccourci).toBe(true);
  });

  it('une légende libre reste à sa place nominale', () => {
    const p = M._mkrPlaceLegende(CTX, 'Rotule D', { x: 0, y: 0 }, { x: 1, y: 0 }, 10, 10, []);
    expect(p).toMatchObject({ texte: 'Rotule D', x: 10, y: 0, decale: false, raccourci: false });
  });
});

// ─── LES ÉTIQUETTES VIVENT À L'EXTÉRIEUR ────────────────────────────────────
//
// DEUX CONFIGURATIONS DISTINCTES, et il ne faut pas les confondre :
//
//   « jambes presque droites » — relevé de points #272-B, déviations de 3,6° et
//   0,07°, jambes écartées d'environ 200 px. UN arc sort à l'extérieur, l'autre
//   reste à l'intérieur. Utile pour la jambe quasi droite, mais il n'exerce PAS
//   le cas qui a produit le défaut.
//
//   « capture de Scio » — celle qui a montré le chevauchement. Genoux tournés
//   vers l'intérieur, déviations de 9,0° et 19,9°, LES DEUX arcs à l'extérieur.
//   C'est la configuration où l'ancienne règle envoyait toutes les légendes se
//   rejoindre au milieu. RELEVÉ APPROXIMATIF : mesuré sur une copie d'écran
//   affichée à 1400 px puis converti vers 1920 — ce ne sont pas des positions
//   de marqueurs relevées dans le logiciel.
function ctxFactice() {
  const c = {
    font: '',
    measureText: (t) => {
      const px = parseFloat(/([\d.]+)px/.exec(c.font)?.[1] ?? '10');
      return { width: t.length * px * 0.55 };
    },
  };
  return c;
}

const W = 1920;
const PX_ANG = 19.5;
const PX_LBL = Math.max(8, (W / 60) * 0.55); // 17,6
const R_PT = Math.max(2, (W / 288) * 0.55); // 3,667
const ECART = Math.max(4, W / 240); // 8

const CONFIG_SCIO = [
  { name: 'EIAS D', side: 'D', x: 887, y: 244 },
  { name: 'Rotule D', side: 'D', x: 939, y: 539 },
  { name: 'Tarse D', side: 'D', x: 946, y: 946 },
  { name: 'EIAS G', side: 'G', x: 1271, y: 248 },
  { name: 'Rotule G', side: 'G', x: 1207, y: 539 },
  { name: 'Tarse G', side: 'G', x: 1261, y: 951 },
];
const CONFIG_DROITES = [
  { name: 'EIAS D', side: 'D', x: 902, y: 33 },
  { name: 'Rotule D', side: 'D', x: 887, y: 247 },
  { name: 'Tarse D', side: 'D', x: 885, y: 501 },
  { name: 'EIAS G', side: 'G', x: 1093, y: 31 },
  { name: 'Rotule G', side: 'G', x: 1090, y: 223 },
  { name: 'Tarse G', side: 'G', x: 1086, y: 501 },
];
const TEXTES = new Map([
  ['D', '9.2°'],
  ['G', '20.3°'],
]);

function dispose(marqueurs) {
  const ctx = ctxFactice();
  const d = M._mkrDisposition(
    ctx,
    marqueurs.map((p) => ({ ...p })),
    W,
    TEXTES,
    PX_ANG,
    PX_LBL,
    R_PT,
    ECART
  );
  ctx.font = `bold ${PX_LBL}px DM Sans,sans-serif`;
  d.legendes.forEach((l) => {
    l.boite = M._mkrBoite(ctx, l.texte, l.x, l.y, l.aligne, PX_LBL);
  });
  return d;
}

describe('#271-B — capture de Scio : genoux vers l’intérieur, deux arcs dehors', () => {
  it('les deux arcs sortent bien à l’extérieur (préalable des cas suivants)', () => {
    const d = dispose(CONFIG_SCIO);
    for (const side of ['D', 'G']) {
      const g = d.geo.get(side);
      expect(g.creux.bx * g.ext.x, 'jambe ' + side).toBeGreaterThan(0);
    }
    expect(d.geo.get('D').ext.x).toBe(-1);
    expect(d.geo.get('G').ext.x).toBe(1);
  });

  it('toutes les légendes sont du côté extérieur de leur jambe', () => {
    const d = dispose(CONFIG_SCIO);
    expect(d.legendes).toHaveLength(6);
    for (const l of d.legendes) {
      const pt = CONFIG_SCIO.find((p) => p.name === l.nom);
      const ext = d.geo.get(l.side).ext.x;
      expect((l.x - pt.x) * ext, l.nom + ' est du mauvais côté').toBeGreaterThan(0);
    }
  });

  it('aucune légende de la jambe D ne recoupe une légende de la jambe G', () => {
    const d = dispose(CONFIG_SCIO);
    const D = d.legendes.filter((l) => l.side === 'D');
    const G = d.legendes.filter((l) => l.side === 'G');
    for (const a of D) {
      for (const b of G) {
        expect(M._mkrBoitesSeCoupent(a.boite, b.boite), a.nom + ' recoupe ' + b.nom).toBe(false);
      }
    }
  });

  // ATTENTE CHANGÉE PAR #271-C, explicitement et non par un échec silencieux :
  // la valeur vivant désormais DANS le disque, se ranger « après la valeur »
  // poserait la légende à l'intérieur de l'arc, par-dessus lui. C'est le RAYON
  // qui fait référence.
  it('les DEUX légendes de rotule commencent au-delà du RAYON de l’arc', () => {
    const d = dispose(CONFIG_SCIO);
    for (const side of ['D', 'G']) {
      const val = d.valeurs.find((v) => v.side === side);
      const rot = d.legendes.find((l) => l.nom === 'Rotule ' + side);
      const ext = d.geo.get(side).ext.x;
      expect(rot.arcDehors, 'rotule ' + side).toBe(true);
      expect(val.dehors, 'la valeur tient dans son disque').toBe(false);
      expect(rot.x, 'rotule ' + side).toBeCloseTo(val.arc.x + ext * (val.arc.r + ECART), 6);
      expect(rot.y).toBeCloseTo(val.arc.y, 6);
      expect(M._mkrBoitesSeCoupent(rot.boite, val.boite), 'rotule ' + side).toBe(false);
    }
  });

  it('la garde controlatérale ne se déclenche pas', () => {
    const d = dispose(CONFIG_SCIO);
    for (const l of d.legendes) {
      expect(l.decale, l.nom + ' a dû être décalée').toBe(false);
      expect(l.raccourci, l.nom + ' a dû être raccourcie').toBe(false);
    }
  });
});

describe('#271-B — jambes presque droites (relevé #272-B)', () => {
  it('l’extérieur vient de la position des deux groupes, pas du cadre', () => {
    const d = dispose(CONFIG_DROITES);
    expect(d.geo.get('D').ext.x).toBe(-1);
    expect(d.geo.get('G').ext.x).toBe(1);
  });

  it('un patient décentré dans le cadre ne change pas l’extérieur', () => {
    // Les deux groupes poussés au-delà du milieu de l’image : un calcul par la
    // moitié du cadre leur donnerait le MÊME côté. Celui-ci ne le fait pas.
    const d = dispose(CONFIG_DROITES.map((p) => ({ ...p, x: p.x + 700 })));
    expect(d.geo.get('D').ext.x).toBe(-1);
    expect(d.geo.get('G').ext.x).toBe(1);
  });

  it('ici UN seul arc sort dehors — d’où l’insuffisance de ce cas', () => {
    const d = dispose(CONFIG_DROITES);
    const dehors = ['D', 'G'].filter((s) => {
      const g = d.geo.get(s);
      return g.creux.bx * g.ext.x > 0;
    });
    expect(dehors).toEqual(['G']);
  });

  it('les légendes restent du côté extérieur de leur jambe', () => {
    const d = dispose(CONFIG_DROITES);
    for (const l of d.legendes) {
      const pt = CONFIG_DROITES.find((p) => p.name === l.nom);
      const ext = d.geo.get(l.side).ext.x;
      expect((l.x - pt.x) * ext, l.nom).toBeGreaterThan(0);
    }
  });
});

// ─── #271-C : LA VALEUR VIT DANS SON DEMI-CERCLE ────────────────────────────
//
// TROISIÈME CAPTURE DE SCIO — les deux genoux pointent vers l'EXTÉRIEUR, donc
// les deux arcs passent à l'INTÉRIEUR, entre les jambes, et leurs valeurs se
// retrouvaient face à face au milieu. Vérifié : rotules à 245 px, arcs de 80 px,
// 85 px libres, recouvrement de 38,0 px sous l'ancienne règle.
//
// RELEVÉ APPROXIMATIF : mesuré à l'œil sur une copie d'écran affichée à 1384 px
// puis converti vers 1920. Ce ne sont pas des positions relevées dans le
// logiciel. Les textes sont ceux RÉELLEMENT DESSINÉS, signe compris — le moins
// est porté par D, pas par G ; l'encadré, lui, affiche « 1.9° » sans signe.
const CONFIG_GENOUX_DEHORS = [
  { name: 'EIAS D', side: 'D', x: 906, y: 169 },
  { name: 'Rotule D', side: 'D', x: 920, y: 541 },
  { name: 'Tarse D', side: 'D', x: 945, y: 899 },
  { name: 'EIAS G', side: 'G', x: 1142, y: 162 },
  { name: 'Rotule G', side: 'G', x: 1165, y: 542 },
  { name: 'Tarse G', side: 'G', x: 1106, y: 896 },
];
const TEXTES_DEHORS = new Map([
  ['D', '-1.9°'],
  ['G', '12.7°'],
]);
const R2_BASE = Math.max(16, W / 24); // 80

function disposeAvec(marqueurs, textes) {
  const ctx = ctxFactice();
  const d = M._mkrDisposition(
    ctx,
    marqueurs.map((p) => ({ ...p })),
    W,
    textes,
    PX_ANG,
    PX_LBL,
    R_PT,
    ECART
  );
  ctx.font = `bold ${PX_LBL}px DM Sans,sans-serif`;
  d.legendes.forEach((l) => {
    l.boite = M._mkrBoite(ctx, l.texte, l.x, l.y, l.aligne, PX_LBL);
  });
  return d;
}

// Rapproche A et C du sommet B pour raccourcir les segments sans changer
// l'angle — donc sans changer le côté du creux.
function segmentsCourts(marqueurs, longueur) {
  const out = [];
  for (const side of ['D', 'G']) {
    const g = marqueurs.filter((m) => m.side === side);
    const B = g[1];
    for (const p of g) {
      if (p === B) {
        out.push({ ...p });
        continue;
      }
      const dx = p.x - B.x,
        dy = p.y - B.y,
        n = Math.hypot(dx, dy);
      out.push({ ...p, x: B.x + (dx / n) * longueur, y: B.y + (dy / n) * longueur });
    }
  }
  return out;
}

describe('#271-C — troisième capture : genoux dehors, arcs dedans', () => {
  it('les deux arcs passent bien à l’intérieur (préalable)', () => {
    const d = disposeAvec(CONFIG_GENOUX_DEHORS, TEXTES_DEHORS);
    for (const side of ['D', 'G']) {
      const g = d.geo.get(side);
      expect(g.creux.bx * g.ext.x, 'jambe ' + side).toBeLessThan(0);
    }
  });

  it('chaque valeur est entièrement contenue dans le disque de son arc', () => {
    const d = disposeAvec(CONFIG_GENOUX_DEHORS, TEXTES_DEHORS);
    for (const v of d.valeurs) {
      expect(v.dehors, v.side + ' s’est repliée dehors').toBe(false);
      const coins = [
        [v.boite.x0, v.boite.y0],
        [v.boite.x1, v.boite.y0],
        [v.boite.x0, v.boite.y1],
        [v.boite.x1, v.boite.y1],
      ];
      for (const [cx, cy] of coins) {
        const dist = Math.hypot(cx - v.arc.x, cy - v.arc.y);
        expect(dist, v.side + ' déborde de son disque').toBeLessThanOrEqual(v.arc.r - v.arc.lw);
      }
    }
  });

  it('les deux valeurs d’angle ne se recoupent pas', () => {
    const d = disposeAvec(CONFIG_GENOUX_DEHORS, TEXTES_DEHORS);
    const [a, b] = d.valeurs;
    expect(M._mkrBoitesSeCoupent(a.boite, b.boite)).toBe(false);
  });

  it('aucune valeur ne recouvre la bande d’un segment de sa jambe', () => {
    const d = disposeAvec(CONFIG_GENOUX_DEHORS, TEXTES_DEHORS);
    const demiBande = M._mkrSegW(W) / 2;
    for (const v of d.valeurs) {
      const g = d.geo.get(v.side);
      const demiDiag = Math.hypot((v.boite.x1 - v.boite.x0) / 2, PX_ANG / 2);
      const dist = Math.hypot(v.x - g.B.x, v.y - g.B.y) * g.creux.sinDemi;
      expect(dist, v.side + ' est sur une bande').toBeGreaterThanOrEqual(demiBande + demiDiag);
    }
  });
});

describe('#271-C — repli quand le texte ne tient pas', () => {
  const COURT = () => segmentsCourts(CONFIG_GENOUX_DEHORS, 90);

  it('un texte long sur segments courts repasse DEHORS', () => {
    const d = disposeAvec(
      COURT(),
      new Map([
        ['D', '-123.4°'],
        ['G', '-123.4°'],
      ])
    );
    for (const v of d.valeurs) expect(v.dehors, v.side).toBe(true);
  });

  it('valeur dehors ET arc dehors : la légende de rotule ne recoupe pas la valeur', () => {
    // Genoux vers l'INTÉRIEUR (capture précédente) : les arcs sortent. Avec des
    // segments courts et un texte long, la valeur se replie sur cette même
    // bissectrice extérieure — là où la légende de rotule se range.
    const d = disposeAvec(
      segmentsCourts(CONFIG_SCIO, 90),
      new Map([
        ['D', '-123.4°'],
        ['G', '-123.4°'],
      ])
    );
    for (const side of ['D', 'G']) {
      const val = d.valeurs.find((v) => v.side === side);
      const rot = d.legendes.find((l) => l.nom === 'Rotule ' + side);
      expect(val.dehors, 'valeur ' + side).toBe(true);
      expect(rot.arcDehors, 'arc ' + side).toBe(true);
      expect(M._mkrBoitesSeCoupent(rot.boite, val.boite), 'rotule ' + side).toBe(false);
    }
  });
});

describe('#271-C — MLA : arche sans jambe controlatérale', () => {
  // Arche d'environ 140°, groupe sans côté. Valeur à trois chiffres : la norme
  // en MLA, pas un pire cas.
  const arche = (L) => {
    const th = (140 * Math.PI) / 180;
    return [
      // u et v font entre eux exactement th : demi-angle pris depuis la
      // VERTICALE, donc sin sur x et cos sur y. L inverse donnait 40 deg.
      { name: 'Tête M1', side: '', x: 960 - L * Math.sin(th / 2), y: 600 - L * Math.cos(th / 2) },
      { name: 'Naviculaire', side: '', x: 960, y: 600 },
      { name: 'Calca', side: '', x: 960 + L * Math.sin(th / 2), y: 600 - L * Math.cos(th / 2) },
    ];
  };
  const T = new Map([['', '143.2°']]);

  // PRÉALABLE : sans lui, tout ce qui suit porterait sur une arche de 40°.
  // C'est l'erreur qu'a commise la première version de ce constructeur.
  it('l’arche fabriquée forme bien 140° et le groupe sans côté est traité', () => {
    const pts = arche(200);
    const B = pts[1];
    const u = { x: pts[0].x - B.x, y: pts[0].y - B.y };
    const v = { x: pts[2].x - B.x, y: pts[2].y - B.y };
    const th =
      (Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) /
      Math.PI;
    expect(th).toBeCloseTo(140, 1);
    const d = disposeAvec(pts, T);
    // Le groupe de côté '' doit produire une géométrie ET une valeur.
    expect(d.geo.has('')).toBe(true);
    expect(d.valeurs).toHaveLength(1);
    expect(d.valeurs[0].side).toBe('');
    expect(d.legendes).toHaveLength(3);
  });

  it('segments longs : la valeur tient dans l’arc, qui s’agrandit', () => {
    const d = disposeAvec(arche(200), T);
    const v = d.valeurs[0];
    expect(v.dehors).toBe(false);
    expect(v.agrandi).toBe(true);
    expect(v.arc.r).toBeGreaterThan(R2_BASE);
  });

  it('segments courts : la valeur se replie hors de l’arc', () => {
    const d = disposeAvec(arche(90), T);
    expect(d.valeurs[0].dehors).toBe(true);
  });

  it('l’arc agrandi ne dépasse jamais 0,9 × la longueur du segment', () => {
    for (const L of [90, 100, 120, 200, 400]) {
      const d = disposeAvec(arche(L), T);
      const v = d.valeurs[0];
      if (v.arc.r > R2_BASE) {
        expect(v.arc.r, 'L=' + L).toBeLessThanOrEqual(M.MKR_ARC_PART_SEGMENT * L + 1e-6);
      }
    }
  });
});
