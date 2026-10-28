// Mannequin postural 3D — hypothèses de mécanisme lésionnel (fonctions pures, sans WebGL).
// À partir des valeurs des curseurs, on liste les règles du document « Mécanismes lésionnels » qui se déclenchent :
// chaîne ascendante, chaîne descendante, risques de blessure, compensations pouvant aggraver, muscles, tests de
// confirmation, niveau de preuve et sources. Ce sont des HYPOTHÈSES À CONFIRMER par l'examen clinique, jamais un
// diagnostic (règlement UE 2017/745) ; les seuils d'activation sont des paramètres à calibrer par le praticien.
import { REGLES, SOURCES, PRUDENCE } from './mecanismes-data.js?v=v302';
import { PAR_ID } from './parametres.js?v=v302';

export { SOURCES, PRUDENCE, REGLES };

// Seuils du cabinet (Paramètres → « Seuils — analyse posturale », enregistrés côté serveur) : quand une règle a une
// clé de seuil équivalente (ex. « face.valgumVarum »), la valeur du cabinet remplace le seuil par défaut du logiciel.
let SEUILS = null;
export function definirSeuils(t) {
  SEUILS = t && typeof t === 'object' ? t : null;
}
export function seuilCabinet(cle) {
  if (!SEUILS || !cle) return null;
  const v = cle.split('.').reduce((o, k) => (o == null ? o : o[k]), SEUILS);
  return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null;
}
// seuil effectif d'un terme : la valeur du cabinet (en valeur absolue) prend le signe de l'opérateur
function seuilTerme(t) {
  const c = seuilCabinet(t.s);
  if (c == null) return t.v;
  return t.op === '<=' || t.op === '<' ? -c : c;
}

const ORDRE_NIVEAU = { F: 0, M: 1, f: 2, CC: 3 };
export const LIBELLE_NIVEAU = {
  F: 'preuve forte',
  M: 'preuve modérée',
  f: 'preuve faible',
  CC: 'consensus clinique (non démontré)',
};
const COMBINEES = new Set(['R35', 'R36', 'R37', 'R38', 'R43', 'R49', 'R51']);

function ok(x, op, v) {
  if (x == null || !isFinite(x)) return false;
  switch (op) {
    case '>=':
      return x >= v;
    case '>':
      return x > v;
    case '<=':
      return x <= v;
    case '<':
      return x < v;
    case 'abs>=':
      return Math.abs(x) >= v;
    case 'abs<':
      return Math.abs(x) < v;
    default:
      return false;
  }
}
const val = (valeurs, id) => Number(valeurs && valeurs[id]) || 0;
const fmt = (id, v) => {
  const c = PAR_ID[id];
  if (!c) return id + ' ' + v;
  const mot = (v < 0 ? c.fin[0] : c.fin[1]) || '';
  return c.label + ' : ' + (mot ? mot + ' ' : '') + Math.abs(v) + ' ' + c.unite;
};
const nettoyerTitre = (t) => t.replace(/_/g, ' ');

// ── Titre d'une règle automatique, recalculé avec les seuils RÉELLEMENT appliqués (seuil du cabinet s'il existe).
const SYM = { '>=': '≥', '>': '>', '<=': '≥', '<': '>', 'abs>=': '≥', 'abs<': '<' };
function idCurseur(t) {
  return t.id || t.base + '_D';
}
function texteGroupe(termes) {
  const c = PAR_ID[idCurseur(termes[0])];
  if (!c) return idCurseur(termes[0]);
  const lab = c.court || c.label;
  const parts = termes.map((t) => {
    const mag = Math.abs(seuilTerme(t));
    const neg = t.op === '<=' || t.op === '<';
    const abs = t.op.startsWith('abs');
    const mot = abs ? 'écart' : (neg ? c.fin[0] : c.fin[1]) || '';
    return { mot, txt: SYM[t.op] + ' ' + mag };
  });
  const mots = [...new Set(parts.map((x) => x.mot).filter(Boolean))];
  const unite = c.unite ? (c.unite === '°' ? '°' : ' ' + c.unite) : '';
  return (
    lab +
    ' : ' +
    (mots.length ? mots.join('/') + ' ' : '') +
    parts.map((x) => x.txt).join(' et ') +
    unite
  );
}
function groupes(termes) {
  const m = new Map();
  for (const t of termes) {
    const k = idCurseur(t);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return [...m.values()].map(texteGroupe);
}
export function titreRegle(r) {
  const c = r.cond;
  if (!c) return nettoyerTitre(r.titre);
  const bloc = [];
  if (c.lat) bloc.push(groupes(c.lat).join(' + '));
  if (c.sym)
    bloc.push(
      c.sym
        .map((t) => {
          const k = PAR_ID[t.base + '_D'];
          return (
            (k ? k.court : t.base) +
            ' : asymétrie D/G ≥ ' +
            seuilTerme(t) +
            (k && k.unite ? k.unite : '')
          );
        })
        .join(' + ')
    );
  if (c.glob) bloc.push(groupes(c.glob).join(' + '));
  if (c.anyGlob) bloc.push('(' + groupes(c.anyGlob).join(' OU ') + ')');
  if (c.any) bloc.push('(' + groupes(c.any).join(' OU ') + ')');
  if (c.bascule === 'ipsi') bloc.push('bascule du bassin ≥ 3° du même côté');
  return bloc.filter(Boolean).join(' + ');
}

export function evaluer(valeurs) {
  const res = [];
  for (const r of REGLES) {
    const c = r.cond;
    if (!c) continue;
    const decl = [];
    let cotes = null;
    let valide = true;
    if (c.lat) {
      const sides = [];
      for (const S of ['D', 'G']) {
        const termes = c.lat.every((t) => ok(val(valeurs, t.base + '_' + S), t.op, seuilTerme(t)));
        let bas = true;
        if (c.bascule === 'ipsi') {
          const b = val(valeurs, 'bassin_bascule');
          bas = S === 'D' ? b >= 3 : b <= -3;
        }
        if (termes && bas) sides.push(S);
      }
      if (!sides.length) valide = false;
      else {
        cotes = sides;
        for (const S of sides)
          for (const t of c.lat) decl.push(fmt(t.base + '_' + S, val(valeurs, t.base + '_' + S)));
        if (c.bascule === 'ipsi') decl.push(fmt('bassin_bascule', val(valeurs, 'bassin_bascule')));
      }
    }
    if (valide && c.sym) {
      for (const t of c.sym) {
        const d = val(valeurs, t.base + '_D'),
          g = val(valeurs, t.base + '_G');
        if (Math.abs(d - g) >= seuilTerme(t)) {
          decl.push(
            fmt(t.base + '_D', d) +
              ' / ' +
              fmt(t.base + '_G', g) +
              ' (asymétrie ' +
              Math.abs(d - g) +
              ')'
          );
          cotes = [d > g ? 'D' : 'G'];
        } else valide = false;
      }
    }
    if (valide && c.glob) {
      for (const t of c.glob) {
        if (!ok(val(valeurs, t.id), t.op, seuilTerme(t))) {
          valide = false;
          break;
        }
        decl.push(fmt(t.id, val(valeurs, t.id)));
      }
    }
    if (valide && c.any) {
      const hit = c.any.filter((t) =>
        ['D', 'G'].some((S) => ok(val(valeurs, t.base + '_' + S), t.op, seuilTerme(t)))
      );
      if (!hit.length) valide = false;
      else
        for (const t of hit)
          for (const S of ['D', 'G'])
            if (ok(val(valeurs, t.base + '_' + S), t.op, seuilTerme(t)))
              decl.push(fmt(t.base + '_' + S, val(valeurs, t.base + '_' + S)));
    }
    if (valide && c.anyGlob) {
      const hit = c.anyGlob.filter((t) => ok(val(valeurs, t.id), t.op, seuilTerme(t)));
      if (!hit.length) valide = false;
      else for (const t of hit) decl.push(fmt(t.id, val(valeurs, t.id)));
    }
    if (valide && c.coteDe) {
      // le côté retenu est celui du patient le plus chargé (valeur > 0 : droit)
      const v = val(valeurs, c.coteDe);
      cotes = [v > 0 ? 'D' : 'G'];
    }
    if (!valide) continue;
    res.push({ regle: r, cotes, declencheurs: [...new Set(decl)], combinee: COMBINEES.has(r.id) });
  }
  res.sort(
    (a, b) =>
      (b.combinee ? 1 : 0) - (a.combinee ? 1 : 0) ||
      (ORDRE_NIVEAU[a.regle.niveau] ?? 9) - (ORDRE_NIVEAU[b.regle.niveau] ?? 9) ||
      a.regle.id.localeCompare(b.regle.id)
  );
  return res;
}

// Synthèse : pathologies les plus citées (toutes règles déclenchées) et nombre de chaînes
export function synthese(res) {
  const compte = new Map();
  for (const h of res) for (const p of h.regle.patho) compte.set(p, (compte.get(p) || 0) + 1);
  const top = [...compte.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
  return { nbHypotheses: res.length, pathologies: top };
}

// Règles non évaluées automatiquement (contexte clinique nécessaire : douleur, sport, chaussage, tests…)
export function reglesManuelles() {
  return REGLES.filter((r) => !r.cond).map((r) => ({ id: r.id, titre: nettoyerTitre(r.titre) }));
}

const esc = (t) =>
  String(t == null ? '' : t).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const COUL = { F: '#166534', M: '#92400e', f: '#9a3412', CC: '#475569' };

function libelleCotes(h) {
  if (!h.cotes) return '';
  if (h.cotes.length === 2) return ' — bilatéral';
  return ' — côté ' + (h.cotes[0] === 'D' ? 'droit' : 'gauche');
}
function ligne(titre, texte) {
  return texte && texte.length && texte !== '—'
    ? '<div style="margin:2px 0"><b>' +
        esc(titre) +
        ' :</b> ' +
        esc(Array.isArray(texte) ? texte.join(', ') : texte) +
        '</div>'
    : '';
}

// HTML d'une hypothèse ; ouvert = détails dépliés (rapport) ou repliés (écran)
export function htmlHypothese(h, { ouvert = false, coche = false, retenue = false } = {}) {
  const r = h.regle;
  const badges = r.niveaux
    .map(
      (n) =>
        '<span style="display:inline-block;border-radius:10px;padding:0 7px;font-size:10px;font-weight:700;color:#fff;background:' +
        (COUL[n] || '#475569') +
        ';margin-left:4px">' +
        esc(n) +
        '</span>'
    )
    .join('');
  const srcs = r.sources
    .map(
      (s) =>
        esc(s) +
        (SOURCES[s] && SOURCES[s].statut ? ' (' + esc(SOURCES[s].statut.toLowerCase()) + ')' : '')
    )
    .join(' ; ');
  const corps =
    '<div style="font-size:11px;line-height:1.45;margin-top:4px">' +
    ligne('Constat', h.declencheurs) +
    ligne('Mécanisme — chaîne ascendante', r.asc) +
    ligne('Mécanisme — chaîne descendante', r.desc) +
    ligne('Risques de blessure', r.patho) +
    (r.asc || r.desc
      ? '<div style="margin:2px 0"><b>Risque d’aggravation :</b> sans prise en charge, la compensation peut se propager le long de la chaîne (' +
        esc([r.asc, r.desc].filter((x) => x && x !== '—').join(' ; ')) +
        ').</div>'
      : '') +
    ligne('Muscles souvent raccourcis / hypertoniques', r.musclesH) +
    ligne('Muscles souvent inhibés / allongés', r.musclesI) +
    ligne('Tests pour confirmer', r.tests) +
    '<div style="margin:2px 0"><b>Niveau de preuve :</b> ' +
    esc(r.preuve) +
    '</div>' +
    '<div style="margin:2px 0;color:#64748b"><b>Sources :</b> ' +
    (srcs || 'aucune (consensus clinique)') +
    '</div></div>';
  const titre =
    '<b>' + esc(r.id) + '</b> · ' + esc(titreRegle(h.regle)) + esc(libelleCotes(h)) + badges;
  if (ouvert)
    return (
      '<div style="border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;margin:6px 0;break-inside:avoid">' +
      '<div style="font-size:12px">' +
      titre +
      '</div>' +
      corps +
      '</div>'
    );
  const case_ = coche
    ? '<label class="m3d-inc" style="margin-right:8px;white-space:nowrap"><input type="checkbox" data-meca="' +
      esc(r.id) +
      '"' +
      (retenue ? ' checked' : '') +
      '> Inclure au rapport</label>'
    : '';
  return (
    '<details class="m3d-hyp" data-id="' +
    esc(r.id) +
    '"><summary>' +
    case_ +
    titre +
    '</summary>' +
    corps +
    '</details>'
  );
}

export function htmlPrudence() {
  return (
    '<div style="font-size:10.5px;color:#7c2d12;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:6px 8px;margin:6px 0">' +
    '<b>Aide à la réflexion clinique, pas un diagnostic.</b> ' +
    esc(PRUDENCE[1] || '') +
    ' ' +
    esc(PRUDENCE[4] || '') +
    ' ' +
    esc(PRUDENCE[3] || '') +
    '</div>'
  );
}

export function htmlSynthese(res) {
  if (!res.length) return '';
  const s = synthese(res);
  return (
    '<div style="font-size:11px;margin:4px 0"><b>' +
    s.nbHypotheses +
    ' hypothèse' +
    (s.nbHypotheses > 1 ? 's' : '') +
    '</b>' +
    (s.pathologies.length
      ? ' · risques les plus cités : ' +
        s.pathologies.map((p) => esc(p[0]) + ' (' + p[1] + ')').join(', ')
      : '') +
    '</div>'
  );
}

// Bloc pour le rapport (tout déplié) : UNIQUEMENT les hypothèses retenues par le praticien (et encore déclenchées) ;
// chaîne vide si aucune n'est retenue.
export function htmlRapport(valeurs, retenues) {
  const ids = new Set(Array.isArray(retenues) ? retenues : []);
  const res = evaluer(valeurs).filter((h) => ids.has(h.regle.id));
  if (!res.length) return '';
  return htmlPrudence() + res.map((h) => htmlHypothese(h, { ouvert: true })).join('');
}
