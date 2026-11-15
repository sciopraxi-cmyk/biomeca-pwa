// Écrivain 3MF (exports multi-imprimantes), sans dépendance : archive zip « stockée » (ecrireZip) + modèle XML du noyau 3MF (unités en millimètres).
// Un <object> par pièce (base, devant, éléments, recouvrement) : un logiciel de découpe multi-matières affecte une matière à chaque objet ;
// <basematerials> porte le nom (et la couleur) du matériau PODAXIA de chaque pièce. Le STL ne portait ni matière ni dureté : ici le nom du matériau suit le volume.
import { ecrireZip } from './zip.js';

const enc = new TextEncoder();
const xml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nb = (v) => String(Number(Number(v).toFixed(4)));
const couleurValide = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : '#C9C9C9');

// pieces : [{ nom, mesh: { positions, indices }, materiau_libelle, shore, couleur_hex }] ; renvoie un ArrayBuffer (.3mf).
export function ecrire3MF(pieces, { titre = 'Semelle', date = new Date() } = {}) {
  if (!Array.isArray(pieces) || pieces.length === 0) throw new RangeError('3mf : au moins une pièce');
  const matieres = [], indexMat = new Map();
  const cleMat = (p) => (p.materiau_libelle ? p.materiau_libelle + '|' + (p.shore ?? '') : 'sans');
  for (const p of pieces) {
    const cle = cleMat(p);
    if (!indexMat.has(cle)) { indexMat.set(cle, matieres.length); matieres.push({ nom: p.materiau_libelle ? p.materiau_libelle + (Number.isFinite(p.shore) ? ' (Shore A ' + p.shore + ')' : '') : 'Matériau non choisi', couleur: couleurValide(p.couleur_hex) }); }
  }
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push('<model unit="millimeter" xml:lang="fr-FR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">');
  L.push(' <metadata name="Title">' + xml(titre) + '</metadata>');
  L.push(' <metadata name="Designer">Verticy — Semelle 3D</metadata>');
  L.push(' <metadata name="CreationDate">' + xml((date instanceof Date ? date : new Date()).toISOString().slice(0, 10)) + '</metadata>');
  L.push(' <resources>');
  L.push('  <basematerials id="1">');
  for (const m of matieres) L.push('   <base name="' + xml(m.nom) + '" displaycolor="' + m.couleur + '"/>');
  L.push('  </basematerials>');
  pieces.forEach((p, i) => {
    const { positions, indices } = p.mesh;
    L.push('  <object id="' + (i + 2) + '" name="' + xml(p.nom) + '" type="model" pid="1" pindex="' + indexMat.get(cleMat(p)) + '">');
    L.push('   <mesh>');
    L.push('    <vertices>');
    for (let k = 0; k < positions.length; k += 3) L.push('     <vertex x="' + nb(positions[k]) + '" y="' + nb(positions[k + 1]) + '" z="' + nb(positions[k + 2]) + '"/>');
    L.push('    </vertices>');
    L.push('    <triangles>');
    for (let k = 0; k < indices.length; k += 3) L.push('     <triangle v1="' + indices[k] + '" v2="' + indices[k + 1] + '" v3="' + indices[k + 2] + '"/>');
    L.push('    </triangles>');
    L.push('   </mesh>');
    L.push('  </object>');
  });
  L.push(' </resources>');
  L.push(' <build>');
  pieces.forEach((p, i) => L.push('  <item objectid="' + (i + 2) + '"/>'));
  L.push(' </build>');
  L.push('</model>');
  const types = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
  return ecrireZip([
    { nom: '[Content_Types].xml', donnees: enc.encode(types) },
    { nom: '_rels/.rels', donnees: enc.encode(rels) },
    { nom: '3D/3dmodel.model', donnees: enc.encode(L.join('\n')) },
  ], date, { chemins: true });
}
