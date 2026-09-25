// #273 — Témoin des déclarations CSS qui PILOTENT du comportement.
//
// POURQUOI CE FICHIER EXISTE. Deux fois pendant #273, un commentaire a été
// refermé par un */ au milieu d'un autre commentaire. Le texte suivant se
// retrouve alors hors commentaire, à l'intérieur d'une règle : l'analyseur le
// lit comme une déclaration invalide et l'ignore JUSQU'AU PROCHAIN
// POINT-VIRGULE — donc il avale la déclaration qui suit.
//
// Le défaut est invisible à l'écran quand un repli existe des deux côtés :
// --vid-left-min-part a un repli 0.3333 dans la feuille ET dans le script, si
// bien que tout continue de fonctionner alors que la déclaration unique censée
// piloter les deux n'existe plus. C'est exactement le motif « un rendu tronqué
// ne doit pas avoir l'air normal ».
//
// UN grep NE SUFFIRAIT PAS : dans le cas fautif, le texte
// « --vid-left-min-part: 0.3333; » est toujours présent dans le fichier. Il
// faut analyser comme un navigateur — retirer les commentaires, puis découper
// les déclarations — pour voir qu'elle a été absorbée.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const FEUILLE = readFileSync(join(RACINE, 'css', 'biomeca.css'), 'utf8');

// Retire les commentaires comme le ferait un analyseur CSS : du premier /*
// jusqu'au premier */ qui suit, sans imbrication — CSS n'en connaît pas.
function sansCommentaires(css) {
  let out = '';
  let i = 0;
  for (;;) {
    const d = css.indexOf('/*', i);
    if (d === -1) return out + css.slice(i);
    out += css.slice(i, d);
    const f = css.indexOf('*/', d + 2);
    if (f === -1) return out; // commentaire jamais refermé : tout le reste est avalé
    i = f + 2;
  }
}

// Contenu du bloc d'un sélecteur, accolades équilibrées.
function corpsDeRegle(css, selecteur) {
  const i = css.indexOf(selecteur);
  if (i === -1) return null;
  const o = css.indexOf('{', i);
  if (o === -1) return null;
  let prof = 0;
  for (let k = o; k < css.length; k++) {
    if (css[k] === '{') prof++;
    else if (css[k] === '}') {
      prof--;
      if (prof === 0) return css.slice(o + 1, k);
    }
  }
  return null;
}

// Les noms de propriété réellement déclarés dans un corps de règle.
function proprietes(corps) {
  return corps
    .split(';')
    .map((d) => {
      const c = d.indexOf(':');
      return c === -1 ? null : d.slice(0, c).trim();
    })
    .filter((p) => p !== null && p !== '');
}

// Déclarations dont dépend du code : le script les relit, ou une autre règle
// les consomme. Si l'une disparaît, un repli masque la panne.
const PILOTES = [{ selecteur: '#mode-video{', propriete: '--vid-left-min-part', valeur: '0.3333' }];

// Tout */ rencontré HORS commentaire, avec son numéro de ligne.
//
// COMPTER LES /* ET LES */ NE MARCHERAIT PAS : « /* » dans le texte d'un
// commentaire est valide et compterait un ouvrant de trop. CSS n'imbrique pas
// les commentaires — le premier */ ferme, quoi qu'il y ait entre. L'invariant
// est donc : aucun */ en dehors.
//
// LIMITE CONNUE : un */ à l'intérieur d'une chaîne CSS — content: "*/" — serait
// signalé à tort. La feuille n'en contient pas ; le jour où elle en contiendra,
// c'est ici qu'il faudra ajouter la gestion des chaînes.
function fermantsOrphelins(css) {
  const orphelins = [];
  const ligneDe = (i) => css.slice(0, i).split('\n').length;
  let i = 0;
  for (;;) {
    const d = css.indexOf('/*', i);
    const f = css.indexOf('*/', i);
    if (f !== -1 && (d === -1 || f < d)) {
      orphelins.push(ligneDe(f));
      i = f + 2;
      continue;
    }
    if (d === -1) return orphelins;
    const fin = css.indexOf('*/', d + 2);
    if (fin === -1) return orphelins; // commentaire non refermé : autre défaut
    i = fin + 2;
  }
}

describe('#273 — déclarations CSS qui pilotent du comportement', () => {
  it('aucun */ hors commentaire dans la feuille', () => {
    expect(fermantsOrphelins(FEUILLE), 'lignes portant un */ orphelin').toEqual([]);
  });

  it('le témoin repère un */ hors commentaire et donne sa ligne', () => {
    const ancre = '#vid-left{';
    expect(FEUILLE).toContain(ancre); // l'ancre existe : le contrôle n'est pas vide
    const cassee = FEUILLE.replace(ancre, '*/\n' + ancre);
    const trouves = fermantsOrphelins(cassee);
    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toBe(cassee.slice(0, cassee.indexOf('*/\n' + ancre)).split('\n').length);
  });

  for (const { selecteur, propriete, valeur } of PILOTES) {
    it(`${propriete} est DÉCLARÉE dans ${selecteur} (pas seulement présente dans le texte)`, () => {
      const corps = corpsDeRegle(sansCommentaires(FEUILLE), selecteur);
      expect(corps, `règle ${selecteur} introuvable`).not.toBeNull();
      expect(proprietes(corps)).toContain(propriete);
      const m = corps.match(new RegExp(propriete.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+)'));
      expect(m && m[1].trim()).toBe(valeur);
    });
  }

  // CONTRÔLE POSITIF — le témoin doit savoir échouer. On rejoue exactement le
  // défaut : un */ surnuméraire inséré dans le commentaire qui précède la
  // déclaration. Le texte reste présent, mais la déclaration est absorbée.
  it('le témoin détecte un */ surnuméraire qui absorbe la déclaration', () => {
    const { selecteur, propriete } = PILOTES[0];
    const marque = 'ELLE EST DÉCLARÉE ICI ET NULLE PART AILLEURS';
    expect(FEUILLE).toContain(marque); // l'ancre existe : le contrôle n'est pas vide
    const cassee = FEUILLE.replace(marque, '*/ ' + marque);

    const corps = corpsDeRegle(sansCommentaires(cassee), selecteur);
    expect(corps).not.toBeNull();
    // Le texte est toujours là — un grep serait rassuré à tort…
    expect(cassee).toContain(propriete + ': 0.3333');
    // …mais la déclaration, elle, a disparu.
    expect(proprietes(corps)).not.toContain(propriete);
  });
});
