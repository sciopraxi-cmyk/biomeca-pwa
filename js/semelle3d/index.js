// Semelle 3D — côté Verticy : ouvre la vue 3D en plein écran (iframe de même origine) et relaie l'enregistrement.
// Chargé à la demande par un import dynamique ; aucune dépendance. La page app.html garde son propre calcul (Web Worker).
// Contrat des messages : voir « V1 : pont avec Verticy » à la fin de vue/viewer.js.

export function ouvrirSemelle3D({ etat = null, version = '', onEnregistrer, onFermer } = {}) {
  if (typeof onEnregistrer !== 'function') throw new Error('ouvrirSemelle3D : onEnregistrer est obligatoire');
  const fond = document.createElement('div');
  fond.id = 'semelle3d-plein-ecran';
  fond.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#f5f8fe;display:flex;';
  const cadre = document.createElement('iframe');
  cadre.title = 'Plan de semelles 3D';
  cadre.style.cssText = 'border:0;width:100%;height:100%;display:block;background:#f5f8fe;';
  cadre.src = new URL('./app.html', import.meta.url).href.split('?')[0] + '?hote=1' + (version ? '&v=' + encodeURIComponent(version) : '');
  fond.appendChild(cadre);
  let ferme = false;

  function fermer() {
    if (ferme) return;
    ferme = true;
    window.removeEventListener('message', recevoir);
    fond.remove();
    document.documentElement.style.overflow = ancienOverflow;
    if (typeof onFermer === 'function') onFermer();
  }
  const ancienOverflow = document.documentElement.style.overflow;
  const repondre = (msg) => { try { cadre.contentWindow.postMessage({ s3d: true, ...msg }, location.origin); } catch (_e) { /* iframe déjà fermée */ } };

  async function recevoir(ev) {
    if (ev.origin !== location.origin || ev.source !== cadre.contentWindow || !ev.data || ev.data.s3d !== true) return;
    const m = ev.data;
    if (m.type === 'pret') repondre({ type: 'init', etat });
    else if (m.type === 'fermer') fermer();
    else if (m.type === 'enregistrer') {
      try { await onEnregistrer({ etat: m.etat, resume: m.resume, png: m.png, largeur: m.largeur, hauteur: m.hauteur, cote: m.cote, generique: m.generique }); repondre({ type: 'enregistre', ok: true }); }
      catch (err) { repondre({ type: 'enregistre', ok: false, erreur: err && err.message ? String(err.message) : 'erreur' }); }
    }
  }
  window.addEventListener('message', recevoir);
  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(fond);
  return { fermer, cadre };
}
