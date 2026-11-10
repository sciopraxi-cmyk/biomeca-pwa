// Web Worker : tout le calcul lourd est ici ; le fil principal ne bloque jamais.
import { traiterMessageA } from '../calcul/pipeline.js';

const etat = { dernier: null, scan: null, plantaire: null };
self.onmessage = async (e) => {
  const id = e.data && e.data.id;
  try {
    const r = await traiterMessageA(e.data, etat);
    const transferts = [];
    if (r.positions) {
      // copies : l'original reste dans l'état du worker (un transfert le viderait)
      r.positions = r.positions.slice();
      r.indices = r.indices.slice();
      transferts.push(r.positions.buffer, r.indices.buffer);
    }
    for (const dico of [r.pieds, r.affichage]) {
      if (!dico) continue;
      for (const k of Object.keys(dico)) if (dico[k] && dico[k].positions) {
        dico[k] = { ...dico[k], positions: dico[k].positions.slice(), indices: dico[k].indices.slice() };
        transferts.push(dico[k].positions.buffer, dico[k].indices.buffer);
      }
    }
    if (r.stl) transferts.push(r.stl);
    if (r.buffer) transferts.push(r.buffer);
    self.postMessage({ id, ok: true, ...r }, transferts);
  } catch (err) {
    self.postMessage({ id, ok: false, erreur: String(err && err.message ? err.message : err), code: err && err.code ? String(err.code) : undefined });
  }
};
