

// ══════════════════════════════════════════════════════
// SUPABASE AUTH — BioMéca PWA
// ══════════════════════════════════════════════════════
const SUPA_URL = 'https://tzivizoacdyopwfzerrb.supabase.co';
const SUPA_KEY = 'sb_publishable_aE4_BZYwz6bGGvby4XXAgw_k8ULnrYh';

let pwaUser = null;

// ─── Client Supabase léger (sans SDK) ───
const supa = {
  async signIn(email, password) {
    const res = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },

  async signUp(email, password, metadata) {
    const res = await fetch(SUPA_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email, password, data: metadata })
    });
    return res.json();
  },

  async signOut(token) {
    await fetch(SUPA_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token }
    });
  },

  async getUser(token) {
    const res = await fetch(SUPA_URL + '/auth/v1/user', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token }
    });
    return res.json();
  },

  async getUserRecord(token, email) {
    const res = await fetch(SUPA_URL + '/rest/v1/user_data?email=eq.' + encodeURIComponent(email) + '&select=*', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token }
    });
    if(!res.ok) return null;
    const rows = await res.json();
    return rows && rows.length > 0 ? rows[0] : null;
  },

  async updateLicence(token, email) {
    const res = await fetch(SUPA_URL + '/rest/v1/user_data?email=eq.' + encodeURIComponent(email), {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ licence_payee: true })
    });
    return res.ok;
  },

  async loadData(token, table) {
    const res = await fetch(SUPA_URL + '/rest/v1/' + table + '?select=*', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    });
    if(!res.ok) return [];
    return res.json();
  },

  async saveData(token, table, data) {
    const headers = {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    };
    // Essayer PATCH d'abord (mise à jour de la ligne existante)
    const patchHeaders = Object.assign({}, headers, {'Prefer': 'return=representation,count=exact'});
    const patch = await fetch(SUPA_URL + '/rest/v1/' + table + '?user_id=eq.' + data.user_id, {
      method: 'PATCH',
      headers: patchHeaders,
      body: JSON.stringify({ data: data.data, updated_at: data.updated_at })
    });
    if(patch.ok) {
      const patched = await patch.json();
      if(patched && patched.length > 0) return true; // ligne mise à jour
    }
    // Si la ligne n'existe pas encore, faire un POST (insertion)
    const post = await fetch(SUPA_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    if(!post.ok) {
      const err = await post.text();
      console.error('Supabase saveData error', post.status, err);
    }
    return post.ok;
  }
};

// ─── Session persistante ───
function savePwaSession(token, user) {
  try {
    sessionStorage.setItem('bm_token', token);
    sessionStorage.setItem('bm_user', JSON.stringify(user));
  } catch(e) {}
}

function loadPwaSession() {
  try {
    const token = sessionStorage.getItem('bm_token');
    const user = JSON.parse(sessionStorage.getItem('bm_user') || 'null');
    return { token, user };
  } catch(e) { return { token: null, user: null }; }
}

function clearPwaSession() {
  try {
    sessionStorage.removeItem('bm_token');
    sessionStorage.removeItem('bm_user');
  } catch(e) {}
}

// ─── Login ───
async function pwaLogin() {
  const email = document.getElementById('pwa-email').value.trim();
  const pwd = document.getElementById('pwa-pwd').value;
  const errEl = document.getElementById('pwa-login-err');
  const btn = document.getElementById('pwa-login-btn');
  errEl.style.display = 'none';

  if(!email || !pwd) {
    errEl.textContent = 'Veuillez remplir tous les champs.';
    errEl.style.display = 'block'; return;
  }

  btn.disabled = true; btn.textContent = 'Connexion...';

  try {
    const data = await supa.signIn(email, pwd);
    if(data.access_token) {
      const isAdmin = email.toLowerCase() === 'admin@sciopraxi.fr';
      pwaUser = { email, token: data.access_token, id: data.user?.id, isAdmin, user_metadata: data.user?.user_metadata || {} };
      savePwaSession(data.access_token, pwaUser);
      await onPwaLoginSuccess();
    } else {
      errEl.textContent = data.error_description || data.msg || 'Email ou mot de passe incorrect.';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Se connecter';
    }
  } catch(e) {
    errEl.textContent = 'Erreur de connexion. Vérifiez votre connexion internet.';
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Se connecter';
  }
}

// ─── Après login réussi ───
async function onPwaLoginSuccess() {
  document.getElementById('pwa-login').style.display = 'none';
  document.getElementById('biomeca-app').style.display = '';
  showAdminPanelIfNeeded();
  nav('pg-patients');
  setTimeout(checkTrialStatus, 500);

  // Afficher onglet Paramètres si admin
  const paramsBtn = document.getElementById('tn-params');
  if(paramsBtn) paramsBtn.style.display = pwaUser?.isAdmin ? '' : 'none';

  // Afficher nom dans la topbar
  const tbName = document.getElementById('tb-name');
  if(tbName && !patients.length) tbName.textContent = 'Aucun patient';

  // Recharger user_metadata frais depuis Supabase
  try {
    const freshUser = await supa.getUser(pwaUser.token);
    if(freshUser?.user_metadata) {
      pwaUser.user_metadata = freshUser.user_metadata;
    }
  } catch(e) {}
  // Charger les données depuis Supabase
  await loadSupabaseData();
}

// ─── Chargement des données ───
async function loadSupabaseData() {
  if(!pwaUser?.token) return;

  try {
    // Charger patients depuis Supabase (table user_data)
    const rows = await supa.loadData(pwaUser.token, 'user_data');
    const myRow = rows.find(r => r.user_id === pwaUser.id);
    if(myRow && myRow.data) {
      const d = typeof myRow.data === 'string' ? JSON.parse(myRow.data) : myRow.data;
      patients = d.patients || [];
      praticiens = d.praticiens || [];
      // Appliquer les droits depuis user_metadata Supabase (fraîches)
      try {
        const freshUser = await supa.getUser(pwaUser.token);
        const freshMeta = freshUser?.user_metadata || {};
        pwaUser.user_metadata = freshMeta;
        window._userDroits = freshMeta.droits || 'all';
      } catch(e) {
        window._userDroits = pwaUser?.user_metadata?.droits || 'all';
      }
    } else {
      patients = [];
      praticiens = [];
    }
    // Migration : anciens bilans (p.bilans[]) → p.bilansSport[]
    let migrated = false;
    patients.forEach(p => {
      if(p.bilans && p.bilans.length > 0 && !p.bilansSport) {
        p.bilansSport = p.bilans.map((b,i) => ({
          label: b.label || ('Sportif Contrôle ' + (i+1)),
          type: i===0 ? 'initial' : 'controle',
          date: b.date || '',
          mesures: b.mesures || {},
          bilanData: b.bilanData || {}
        }));
        migrated = true;
      }
      // Migrer bilan initial (p.mesures) s'il existe et pas encore dans bilansSport
      if(p.mesures && Object.keys(p.mesures).length > 0) {
        if(!p.bilansSport) p.bilansSport = [];
        const hasInitial = p.bilansSport.some(b => b.type === 'initial');
        if(!hasInitial) {
          p.bilansSport.unshift({
            label: 'Sportif Initial',
            type: 'initial',
            date: p.bilanInitialDate || '',
            mesures: JSON.parse(JSON.stringify(p.mesures)),
            bilanData: JSON.parse(JSON.stringify(p.bilanData||{}))
          });
          migrated = true;
        }
      }
    });
    if(migrated) { console.log('Migration bilans OK'); savePatients(); }
  } catch(e) {
    // Fallback localStorage si Supabase indisponible
    patients = JSON.parse(localStorage.getItem('bm4-patients-pwa') || '[]');
    praticiens = JSON.parse(localStorage.getItem('bm4-praticiens-pwa') || '[]');
  }

  currentPatient = null; bilanData = {};
  renderPatientList();
  renderPratList();
  populatePratSelect();
  if(patients.length > 0) selectPatient(patients[patients.length - 1]);
}

// ─── Sauvegarde vers Supabase ───
async function saveToSupabase() {
  if(!pwaUser?.token) return;
  const data = { patients, praticiens };
  try {
    const ok = await supa.saveData(pwaUser.token, 'user_data', {
      user_id: pwaUser.id,
      data: data,
      updated_at: new Date().toISOString()
    });
    if(!ok) {
      localStorage.setItem('bm4-patients-pwa', JSON.stringify(patients));
      localStorage.setItem('bm4-praticiens-pwa', JSON.stringify(praticiens));
    }
  } catch(e) {
    localStorage.setItem('bm4-patients-pwa', JSON.stringify(patients));
    localStorage.setItem('bm4-praticiens-pwa', JSON.stringify(praticiens));
  }
}

// ─── Déconnexion ───
// ─── Admin: gestion utilisateurs ───
async function adminCreateUser() {
  const email = document.getElementById('admin-email').value.trim();
  const pwd = document.getElementById('admin-pwd').value.trim();
  const nom = document.getElementById('admin-nom').value.trim();
  const prenom = document.getElementById('admin-prenom').value.trim();
  const acces = document.getElementById('admin-acces').value;
  const errEl = document.getElementById('admin-create-err');
  const okEl = document.getElementById('admin-create-ok');
  const btn = document.getElementById('admin-create-btn');
  errEl.style.display = 'none'; okEl.style.display = 'none';
  if(!email || !pwd) { errEl.textContent = 'Email et mot de passe requis.'; errEl.style.display = 'block'; return; }
  if(pwd.length < 8) { errEl.textContent = 'Mot de passe trop court (min. 8 caractères).'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Création...';
  try {
    const data = await supa.signUp(email, pwd, { nom, prenom, acces });
    if(data.id || data.user?.id) {
      okEl.textContent = `✓ Accès créé pour ${email} (${acces}). Un email de confirmation a été envoyé.`;
      okEl.style.display = 'block';
      document.getElementById('admin-email').value = '';
      document.getElementById('admin-pwd').value = '';
      document.getElementById('admin-nom').value = '';
      document.getElementById('admin-prenom').value = '';
      // Rafraîchir la liste des utilisateurs autorisés
      setTimeout(() => renderParamsPratList(), 1000);
    } else {
      errEl.textContent = data.msg || data.error_description || 'Erreur lors de la création.';
      errEl.style.display = 'block';
    }
  } catch(e) {
    errEl.textContent = 'Erreur réseau.';
    errEl.style.display = 'block';
  }
  btn.disabled = false; btn.textContent = "Créer l'accès";
}


// Afficher panneau admin si admin
function showAdminPanelIfNeeded() {
  if(pwaUser?.isAdmin) {
    const panel = document.getElementById('admin-panel');
    if(panel) panel.style.display = 'block';
  }
}

async function changePassword() {
  const pwd = document.getElementById('mc-new-pwd').value;
  const msg = document.getElementById('mc-pwd-msg');
  if(!pwd || pwd.length < 8) {
    msg.textContent = 'Minimum 8 caractères.';
    msg.style.color = '#e74c3c';
    msg.style.display = 'block'; return;
  }
  try {
    const r = await fetch(SUPA_URL + '/auth/v1/user', {
      method: 'PUT',
      headers: {'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+pwaUser.token},
      body: JSON.stringify({ password: pwd })
    });
    const d = await r.json();
    if(d.id) {
      msg.textContent = '✓ Mot de passe modifié avec succès.';
      msg.style.color = '#2ecc71';
      document.getElementById('mc-new-pwd').value = '';
    } else {
      msg.textContent = d.msg || 'Erreur lors de la modification.';
      msg.style.color = '#e74c3c';
    }
    msg.style.display = 'block';
  } catch(e) {
    msg.textContent = 'Erreur réseau.';
    msg.style.color = '#e74c3c';
    msg.style.display = 'block';
  }
}

function showMonCompte() {
  const modal = document.getElementById('modal-mon-compte');
  if(!modal) return;
  modal.style.display = 'flex';
  loadAbonnementInfo();
  // Remplir les infos
  const meta = pwaUser?.user_metadata || {};
  const nom = meta.nom || '';
  const prenom = meta.prenom || '';
  const titre = meta.titre || '';
  const cabinet = meta.cabinet || '';
  const email = pwaUser?.email || '';
  const acces = meta.acces || 'standard';
  // Avatar
  const init = ((prenom||nom||email)[0]||'?').toUpperCase();
  document.getElementById('mc-avatar').textContent = init;
  document.getElementById('mc-nom').textContent = (prenom + ' ' + nom).trim() || email;
  document.getElementById('mc-email').textContent = email;
  document.getElementById('mc-titre').textContent = titre;
  // Formule
  const formules = {
    gratuit: {label:'Gratuit (illimité)', desc:'Accès complet offert'},
    essai: {label:'Essai 14 jours', desc:'Accès complet temporaire'},
    postural: {label:'Bilan postural — 20€/mois', desc:'Module postural uniquement'},
    sport: {label:'Podologie du sport — 40€/mois', desc:'Module sport + analyse cinématique'},
    duo: {label:'Duo — 35€/mois', desc:'2 modules au choix'},
    integral: {label:'Intégral — 70€/mois', desc:'Les 3 modules complets'}
  };
  const f = formules[acces] || {label: acces, desc:''};
  document.getElementById('mc-formule').textContent = f.label;
  document.getElementById('mc-formule-desc').textContent = f.desc;
  // Cabinet
  document.getElementById('mc-cabinet').innerHTML = cabinet ?
    '<div>🏥 ' + cabinet + '</div>' :
    '<div style="color:var(--mut);font-size:12px;">Aucun cabinet renseigné</div>';
}

function closeMonCompte() {
  const modal = document.getElementById('modal-mon-compte');
  if(modal) modal.style.display = 'none';
}

function checkTrialStatus() {
  const meta = pwaUser?.user_metadata || {};
  const acces = meta.acces || '';
  if(acces !== 'essai') {
    const b = document.getElementById('trial-banner');
    if(b) b.style.display = 'none';
    return;
  }
  // Si pas de trial_start, on considère que l'essai commence maintenant
  const trialStart = meta.trial_start ? new Date(meta.trial_start) : new Date();
  // Si pas de trial_start défini, mettre à jour dans Supabase
  if(!meta.trial_start && pwaUser?.token) {
    const ts = new Date().toISOString();
    meta.trial_start = ts;
    fetch(SUPA_URL+'/auth/v1/user', {method:'PUT',
      headers:{'Content-Type':'application/json','apikey':SUPA_KEY,'Authorization':'Bearer '+pwaUser.token},
      body:JSON.stringify({data:{...meta, trial_start:ts}})
    }).catch(()=>{});
  }
  const diffDays = Math.floor((new Date() - trialStart) / 86400000);
  const remaining = 14 - diffDays;
  const banner = document.getElementById('trial-banner');
  const bannerText = document.getElementById('trial-banner-text');
  const overlay = document.getElementById('trial-expired-overlay');
  if(remaining <= 0) {
    if(banner) banner.style.display = 'none';
    if(overlay) { overlay.style.display = 'flex'; }
  } else {
    if(overlay) overlay.style.display = 'none';
    if(banner) {
      banner.style.display = 'block';
      if(bannerText) bannerText.textContent = remaining === 1 ? "Dernier jour d'essai !" : "Essai gratuit — " + remaining + " jours restants";
      if(remaining <= 3) banner.style.background = '#e74c3c';
    }
  }
}

async function pwaLogout() {
  if(!sessionStorage.getItem('skip_logout_confirm')) {
    if(!confirm('Se déconnecter ?')) return;
  }
  sessionStorage.removeItem('skip_logout_confirm');
  if(pwaUser?.token) {
    try { await supa.signOut(pwaUser.token); } catch(e) {}
  }
  clearPwaSession();
  pwaUser = null;
  patients = []; praticiens = []; currentPatient = null; bilanData = {};
  renderPatientList();
  document.getElementById('biomeca-app').style.display = 'none';
  document.getElementById('pwa-login').style.display = 'flex';
  // Scroll vers tarifs si demandé
  if(sessionStorage.getItem('scroll_tarifs')) {
    sessionStorage.removeItem('scroll_tarifs');
    setTimeout(function() {
      var el = document.getElementById('lp-pricing-section');
      if(el) el.scrollIntoView({behavior:'smooth'});
    }, 300);
  }
  document.getElementById('pwa-email').value = '';
  document.getElementById('pwa-pwd').value = '';
  document.getElementById('pwa-login-btn').disabled = false;
  document.getElementById('pwa-login-btn').textContent = 'Se connecter';
  const mc = document.getElementById('modal-mon-compte');
  if(mc) mc.style.display = 'none';
  const tb = document.getElementById('trial-banner');
  if(tb) tb.style.display = 'none';
  const ov = document.getElementById('trial-expired-overlay');
  if(ov) ov.style.display = 'none';
  nav('pg-sport');
}

// ─── Init PWA ───
async function initPWA() {
  // Vérifier session existante
  const session = loadPwaSession();
  if(session.token && session.user) {
    try {
      const userData = await supa.getUser(session.token);
      if(userData.id) {
        const isAdmin = session.user.email?.toLowerCase() === 'admin@sciopraxi.fr';
        pwaUser = { ...session.user, token: session.token, isAdmin, user_metadata: session.user?.user_metadata || {} };
        await onPwaLoginSuccess();
        return;
      }
    } catch(e) {}
  }
  // Pas de session valide: afficher le login
  document.getElementById('pwa-login').style.display = 'flex';
  enumerateCameras('vcam-select');
  enumerateCameras('cam-select');
}

initPWA();





// ─── Service Worker ───
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js', { scope: './' })
      .then(reg => {
        if (reg.waiting) console.info('[SW] new version waiting');
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          sw && sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              console.info('[SW] update available — refresh to apply');
            }
          });
        });
      })
      .catch(err => console.warn('[SW] registration failed:', err));
  });
}



// ══════════════════════════════════════════════════════
// ÉTAT GLOBAL
// ══════════════════════════════════════════════════════
let patients = JSON.parse(localStorage.getItem('bm4-patients')||'[]');
let praticiens = JSON.parse(localStorage.getItem('bm4-praticiens')||'[]');
let currentPatient = null;
// Index du bilan dans currentPatient.bilansSport actuellement ouvert pour édition.
// null = pas de bilan historique ouvert (mode "bilan courant" ou nouveau bilan).
// Set par ouvrirBilanSport, reset par creerBilanSport et selectPatient.
let currentOpenedBilanIdx = null;
let currentTestId = null;
let testMode = 'photo';

// Caméra live (photo)
let camStream = null, animId = null;
let autoLive = false;
let sensThr = 200;

// Caméra vidéo
let vidStream = null, mediaRec = null, recChunks = [], isRecording = false;
let vAutoDetect = false;

// Marqueurs - structure bilatérale
// liveMarkers = [{name, color, side:'D'|'G'|'', x, y}, ...]
let liveMarkers = [];
let vidMarkers = [];
let selectedMkrIdx = -1;
let isDragging = false;
let isVidDragging = false;
let selectedVidMkrIdx = -1;

// Photos et frames
// photoSlots = [{label, side:'D'|'G'|'', dataUrl, angle}, ...]
let photoSlots = [];
let capturedFrames = []; // [{time, dataUrl, angleD, angleG, markersSnapshot}]
let selectedFrameIdx = -1;

// Images morphostatiques originales (extraites du PDF bilan)
const MORPHO_IMAGES = {
  get 'morpho-face'(){ return document.getElementById('imgjs-morpho-face')?.src||''; },
  get 'morpho-face2'(){ return document.getElementById('imgjs-morpho-face2')?.src||''; },
  get 'morpho-profilG'(){ return document.getElementById('imgjs-morpho-profilG')?.src||''; },
  get 'morpho-profilD'(){ return document.getElementById('imgjs-morpho-profilD')?.src||''; },
};
// PIEDS_IMAGE récupéré dynamiquement depuis le DOM

// ══════════════════════════════════════════════════════
// CONFIG TESTS
// ══════════════════════════════════════════════════════
const TESTS = {
  // KFPPA : 6 marqueurs (3D + 3G), 4 photos (repos D, repos G, dyn D, dyn G)
  'kfppa-marche': {
    name:'KFPPA Marche', mode:'video', view:'face',
    note:'Vue face · 4 km/h · Marqueurs bilatéraux (EIAS→Rotule→Tarse) · 2 frames : repos bipodal + plantigrade unipodal',
    markers:'genou-bi', div:5, normeMin:3, normeMax:7,
    photoLabels:['Station bipodale','Valgum dynamique unipodal G','Valgum dynamique unipodal D'],
    photoSides:['','G','D'], showPhotoSlots:true, kfppaPhotos:true, minFrames:2,
    frameLabels:['Repos bipodal','Phase plantigrade (dynamique)'],
    target:'Genou', clinicalLabel:'KFPPA (valgus dynamique du genou)',
    measures:[
      { key:'kfppa', label:'KFPPA Marche (valgus dynamique du genou)', norm:'60-140 %', interpretFn:'kfppa' },
    ],
  },
  'kfppa-course': {
    name:'KFPPA Course', mode:'video', view:'face',
    note:'Vue face · 8 km/h · Marqueurs bilatéraux (EIAS→Rotule→Tarse) · 2 frames : repos + phase appui',
    markers:'genou-bi', div:8.5, normeMin:5, normeMax:12,
    photoLabels:['Station bipodale','Valgum dynamique unipodal G','Valgum dynamique unipodal D'],
    photoSides:['','G','D'], showPhotoSlots:true, kfppaPhotos:true, minFrames:2,
    frameLabels:['Repos bipodal','Phase appui (dynamique)'],
    target:'Genou', clinicalLabel:'KFPPA (valgus dynamique du genou)',
    measures:[
      { key:'kfppa', label:'KFPPA Course (valgus dynamique du genou)', norm:'60-140 %', interpretFn:'kfppa' },
    ],
  },
  'kfppa-sldj': {
    name:'KFPPA SLDJ', mode:'video', view:'face',
    note:'Vue face · Chute 30 cm · Marqueurs bilatéraux · 2 frames : repos + réception',
    markers:'genou-bi', div:7.5, normeMin:5, normeMax:10,
    photoLabels:['Station bipodale','Valgum dynamique unipodal G','Valgum dynamique unipodal D'],
    photoSides:['','G','D'], showPhotoSlots:true, kfppaPhotos:true, minFrames:2,
    frameLabels:['Repos bipodal','Réception saut'],
    target:'Genou', clinicalLabel:'KFPPA (valgus dynamique du genou)',
    measures:[
      { key:'kfppa', label:'KFPPA SLDJ (valgus dynamique sur drop jump)', norm:'60-140 %', interpretFn:'kfppa' },
    ],
  },
  // MLA : 3 marqueurs par pied, 2 photos par pied = 4 photos
  'mla-marche': {
    name:'MLA Marche', mode:'video', view:'profil',
    note:'Vue profil · 2 photos par pied (attaque/propulsion + écrasement)',
    markers:'mla', normDiv:20, propNorm:125, ecrNorm:145,
    photoLabels:['Attaque/Propulsion pied D','Écrasement pied D','Attaque/Propulsion pied G','Écrasement pied G'],
    photoSides:['D','D','G','G'], showPhotoSlots:true, mlaTest:true,
    target:'Pied', clinicalLabel:'MLA (ressort médio-pied)',
    measures:[
      { key:'mla', label:'MLA Marche (ressort médio-pied)', norm:'≥ 66 %', interpretFn:'gen' },
    ],
  },
  'mla-course': {
    name:'MLA Course', mode:'video', view:'profil',
    note:'Vue profil · 2 photos par pied (attaque/propulsion + écrasement)',
    markers:'mla', normDiv:30, propNorm:120, ecrNorm:150,
    photoLabels:['Attaque/Propulsion pied D','Écrasement pied D','Attaque/Propulsion pied G','Écrasement pied G'],
    photoSides:['D','D','G','G'], showPhotoSlots:true, mlaTest:true,
    target:'Pied', clinicalLabel:'MLA (ressort médio-pied)',
    measures:[
      { key:'mla', label:'MLA Course (ressort médio-pied)', norm:'≥ 66 %', interpretFn:'gen' },
    ],
  },
  // Verrouillage : 4 marqueurs jambier+calca, vue dos, 2 photos (neutre + pointe)
  'verrou': {
    name:'Verrouillage AP', mode:'video', view:'dos',
    note:'Vue dos · 4 photos : statique D, statique G, pointe D, pointe G · Inversion=+ Éversion=−',
    markers:'ap-bi', normVerrou:10,
    photoLabels:['Statique bipodal D','Statique bipodal G','Pointe pieds D','Pointe pieds G'],
    photoSides:['D','G','D','G'], showPhotoSlots:true,
    frameLabels:['Statique bipodal','Pointe pieds'],
    target:'Pied', clinicalLabel:'Verrouillage AP (arrière-pied)',
    measures:[
      { key:'rf',     label:'Capacité de verrouillage de l\'arrière-pied', norm:'≥ 66 %', interpretFn:'gen' },
      { key:'mollet', label:'Force du mollet',                              norm:'≥ 66 %', interpretFn:'gen' },
    ],
  },
  // Mobilité : 2 photos (inversion + éversion)
  'mobilite': {
    name:'Mobilité AP', mode:'video', view:'dos',
    note:'Vue dos · 2 photos : inversion max + éversion max · Inversion=+ / Éversion=− · D+G simultané',
    markers:'ap-bi', normMob:30,
    photoLabels:['Inversion forcée bipodal','Éversion forcée bipodal'],
    photoSides:['',''], mobiliteAP:true, showPhotoSlots:true,
    frameLabels:['Inversion forcée','Éversion forcée'],
    target:'Pied', clinicalLabel:'Mobilité AP (arrière-pied)',
    measures:[
      { key:'mob', label:'Mobilité AP (mobilité arrière-pied)', norm:'≥ 66 %', interpretFn:'gen' },
    ],
  },
  // Amorti/Propulsion : 6 photos (3 phases × 2 pieds)
  'amorti-marche': {
    name:'Amorti/Propulsion Marche', mode:'video', view:'dos',
    note:'Vue dos · 3 phases × 2 pieds · Marche 4 km/h · Capturer 3 frames puis assigner aux slots',
    markers:'ap-bi', normAm:8, minFrames:3,
    photoLabels:['Attaque taligrade G','Attaque taligrade D','Phase plantigrade G','Phase plantigrade D','Phase digitigrade G','Phase digitigrade D'],
    photoSides:['G','D','G','D','G','D'],
    frameLabels:['Attaque taligrade','Phase plantigrade','Phase digitigrade'],
    showPhotoSlots:true,
    target:'Pied', clinicalLabel:'Amorti/Propulsion (cinétique arrière-pied)',
    measures:[
      { key:'am', label:'Amorti à la marche (cinétique arrière-pied)',     norm:'≥ 66 %', interpretFn:'gen' },
      { key:'pr', label:'Propulsion à la marche (cinétique arrière-pied)', norm:'≥ 66 %', interpretFn:'gen' },
    ],
  },
  'amorti-course': {
    name:'Amorti/Propulsion Course', mode:'video', view:'dos',
    note:'Vue dos · 3 phases × 2 pieds · Course 8 km/h · Capturer 3 frames puis assigner aux slots',
    markers:'ap-bi', normAm:12, minFrames:3,
    photoLabels:['Attaque taligrade G','Attaque taligrade D','Phase plantigrade G','Phase plantigrade D','Phase digitigrade G','Phase digitigrade D'],
    photoSides:['G','D','G','D','G','D'],
    frameLabels:['Attaque taligrade','Phase plantigrade','Phase digitigrade'],
    showPhotoSlots:true,
    target:'Pied', clinicalLabel:'Amorti/Propulsion (cinétique arrière-pied)',
    measures:[
      { key:'am', label:'Amorti à la course (cinétique arrière-pied)',     norm:'≥ 66 %', interpretFn:'gen' },
      { key:'pr', label:'Propulsion à la course (cinétique arrière-pied)', norm:'≥ 66 %', interpretFn:'gen' },
    ],
  },
};

// ══════════════════════════════════════════════════════
// MEASURE COMPUTERS — calcul du ratio par mesure (1.0 = 100%)
// Sépare la logique de calcul de la config TESTS pour permettre
// une boucle générique de génération des conclusions.
// ══════════════════════════════════════════════════════
const MEASURE_COMPUTERS = {
  // KFPPA : recompute live depuis photos (cohérent avec rendu actuel)
  kfppa: (t, data, side) => {
    const _bip = data.photos?.find(p => p.side === '');
    const _uni = data.photos?.find(p => p.side === side);
    const _toI = (v) => v == null ? null : (v > 90 ? 180 - v : v);
    const _bd = _toI(side === 'D' ? _bip?.angleD : _bip?.angleG);
    const _ud = _toI(_uni?.angle);
    const _delta = (_bd != null && _ud != null) ? (_ud - _bd) : _toI(side === 'D' ? data.deltaD : data.deltaG);
    return (_delta != null) ? _delta / t.div : null;
  },
  // MLA : ratio persisté OU fallback recompute depuis photos (mirror du render L4470-4476)
  mla: (t, data, side) => {
    const persisted = side === 'D' ? data.pctD : data.pctG;
    if (persisted != null && !isNaN(persisted)) return persisted;
    const ph = (data.photos || []).filter(p => p.side === side);
    const prop = ph[0]?.angle, ecr = ph[1]?.angle;
    return (prop != null && ecr != null) ? (ecr - prop) / (t.normDiv || 20) : null;
  },
  // Verrouillage RF : pointe / normVerrou
  rf: (t, data, side) => {
    const ph = (data.photos || []).filter(p => p.side === side);
    const pointe = ph[1]?.angle;
    return (pointe != null) ? pointe / t.normVerrou : null;
  },
  // Verrouillage Mollet : (pointe - stat) / normVerrou
  mollet: (t, data, side) => {
    const ph = (data.photos || []).filter(p => p.side === side);
    const stat = ph[0]?.angle, pointe = ph[1]?.angle;
    return (stat != null && pointe != null) ? (pointe - stat) / t.normVerrou : null;
  },
  // Mobilité : (inv - év) / normMob (photos bilatérales side='', mirror du render L4415-4416)
  mob: (t, data, side) => {
    const ph = data.photos || [];
    const inv = side === 'D' ? ph[0]?.angleD : ph[0]?.angleG;
    const ev  = side === 'D' ? ph[1]?.angleD : ph[1]?.angleG;
    return (inv != null && ev != null) ? (inv - ev) / t.normMob : null;
  },
  // Amorti : persisté OU fallback recompute depuis photos (mirror du render L4480-4485)
  am: (t, data, side) => {
    const persisted = side === 'D' ? data.amD : data.amG;
    if (persisted != null && !isNaN(persisted)) return persisted;
    const ph2 = (data.photos || []).filter(p => p.side === side);
    const talV = ph2[0]?.angle, planV = ph2[1]?.angle;
    return (talV != null && planV != null) ? Math.abs(talV - planV) / t.normAm : null;
  },
  // Propulsion : persisté OU fallback recompute depuis photos (mirror du render L4480-4486)
  pr: (t, data, side) => {
    const persisted = side === 'D' ? data.prD : data.prG;
    if (persisted != null && !isNaN(persisted)) return persisted;
    const ph2 = (data.photos || []).filter(p => p.side === side);
    const planV = ph2[1]?.angle, digV = ph2[2]?.angle;
    return (planV != null && digV != null) ? Math.abs(digV - planV) / t.normAm : null;
  },
};

// ══════════════════════════════════════════════════════
// MARQUEURS BILATÉRAUX
// ══════════════════════════════════════════════════════
const MARKER_TEMPLATES = {
  'genou-bi': [
    // Droite (bleu)
    {name:'EIAS D',    color:'#4a9eff', side:'D'},
    {name:'Rotule D',  color:'#3ecf72', side:'D'},
    {name:'Tarse D',   color:'#f5a623', side:'D'},
    // Gauche (teintes différentes)
    {name:'EIAS G',    color:'#60afff', side:'G'},
    {name:'Rotule G',  color:'#6edfaa', side:'G'},
    {name:'Tarse G',   color:'#ffc04a', side:'G'},
  ],
  'mla': [
    {name:'CAp',  color:'#f04060', side:''},
    {name:'TN',   color:'#a78bfa', side:''},
    {name:'FMHp', color:'#ec4899', side:''},
  ],
  'ap-bi': [
    // Droite (point 1=supérieur → 4=inférieur)
    {name:'Milieu mollet D',          color:'#f5a623', side:'D'},
    {name:'Jonction musculo-tend. D', color:'#93c5fd', side:'D'},
    {name:'Calca supérieur D',        color:'#8892a4', side:'D'},
    {name:'Calca inférieur D',        color:'#8892a4', side:'D'},
    // Gauche
    {name:'Milieu mollet G',          color:'#ffc04a', side:'G'},
    {name:'Jonction musculo-tend. G', color:'#b0d8ff', side:'G'},
    {name:'Calca supérieur G',        color:'#aab0bc', side:'G'},
    {name:'Calca inférieur G',        color:'#aab0bc', side:'G'},
  ],
};

function cloneMarkers(type) {
  const tmpl = MARKER_TEMPLATES[type] || MARKER_TEMPLATES['mla'];
  return tmpl.map(m => ({...m, x:null, y:null}));
}

function getMkrsBySet(markers, targetSet) {
  // Retourne les 3 marqueurs d'un côté (set = 'D' ou 'G') ou tous si side=''
  if (!targetSet) return markers;
  return markers.filter(m => m.side === targetSet);
}

// ══════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════
function nav(id) {
  // Déplacer toutes les pages orphelines dans .main
  const mainEl = document.querySelector('.main');
  if(mainEl) {
    document.querySelectorAll('.page').forEach(pg => {
      if(pg.parentElement !== mainEl) mainEl.appendChild(pg);
    });
  }
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });
  document.querySelectorAll('.tnav button').forEach(b => b.classList.remove('act'));
  if(mainEl) mainEl.scrollTop = 0;
  window.scrollTo({top:0, behavior:'instant'});
  setTimeout(() => {
    if(mainEl) mainEl.scrollTop = 0;
    window.scrollTo({top:0, behavior:'instant'});
  }, 50);
  const pg = document.getElementById(id);
  if (pg) { pg.classList.add('active'); pg.style.display = 'block'; }
  const map = {
    'pg-patients':'tn-patients',
    'pg-praticiens':'tn-praticiens','pg-params':'tn-params',
    'pg-sport':'tn-patients','pg-posturo':'tn-patients'
  };
  if (map[id]) { const b=document.getElementById(map[id]); if(b) b.classList.add('act'); }
  if(id === 'pg-rapport') buildRapport();
  if(id === 'pg-patients') { renderPatientList(); populatePratSelect(); }
  if(id === 'pg-praticiens') renderPratList();
  if(id === 'pg-params') renderParamsPratList();
  if(id === 'pg-sport') {
    // Mettre à jour le sous-titre avec le patient courant
    const sub = document.getElementById('sport-sub');
    if(sub && currentPatient) sub.textContent = 'Patient : '+currentPatient.prenom+' '+currentPatient.nom+' · '+(currentPatient.sport||'—');
    // Mettre à jour info posturo aussi
    const pinfo = document.getElementById('posturo-patient-info');
    if(pinfo && currentPatient) pinfo.textContent = 'Patient : '+currentPatient.prenom+' '+currentPatient.nom;
  }
  if(id === 'pg-posturo') {
    const pinfo = document.getElementById('posturo-patient-info');
    if(pinfo && currentPatient) pinfo.textContent = 'Patient : '+currentPatient.prenom+' '+currentPatient.nom+' · '+(currentPatient.sport||'—');
  }
  if(id === 'pg-bilan-posturo') {
    injectBilanPosturoPage();
    // Forcer la visibilité après injection dynamique
    const pgPost = document.getElementById('pg-bilan-posturo');
    if(pgPost) {
      pgPost.classList.add('active');
      pgPost.style.height = 'auto';
      pgPost.style.visibility = 'visible';
      pgPost.style.overflow = 'visible';
    }
    showPosturoSection(0);
    setTimeout(loadPosturoBilan, 50);
  }
  if(id === 'pg-bilan') {
    setTimeout(() => {
      clearBilanFields();
      // 1. Initialiser les canvas morpho (taille + setupDrawCanvas)
      ['morpho-face','morpho-face2','morpho-profilG','morpho-profilD'].forEach(id => initMorphoCanvas(id));
      // 2. Charger les données du bilan
      setTimeout(() => {
        loadBilan();
        // 3. Initialiser canvas pieds APRÈS loadBilan (bilanData disponible)
        const pc = document.getElementById('pieds-canvas');
        if(pc) { drawPiedsTemplate(currentPatient?.bilanData?._pieds); }
      }, 200);
      // 4. Restaurer les dessins directement (pas via restoreCanvas)
      setTimeout(() => {
        const bd = currentPatient?.bilanData || {};
        const pairs = [
          ['morpho-face','_morpho_face'],
          ['morpho-face2','_morpho_face2'],
          ['morpho-profilG','_morpho_profilG'],
          ['morpho-profilD','_morpho_profilD']
        ];
        pairs.forEach(([canvasId, key]) => {
          if(!bd[key]) return;
          const cvs = document.getElementById(canvasId);
          if(!cvs || cvs.width === 0) return;
          const img = new Image();
          img.onload = () => {
            const dpr = window.devicePixelRatio || 1;
            cvs.getContext('2d').drawImage(img, 0, 0, cvs.width/dpr, cvs.height/dpr);
          };
          img.src = bd[key];
        });
        // pieds restaurés dans drawPiedsTemplate
      }, 500);
    }, 80);
  }
}

// Affiche un encart redirectionnel — la gestion utilisateurs est désormais
// effectuée exclusivement depuis le dashboard Supabase (sécurité : la clé
// admin legacy n'est plus exposée côté client). Voir incident 2026-04-28.
function renderParamsPratList() {
  const el = document.getElementById('params-prat-list');
  if(!el) return;
  el.innerHTML = `
    <div style="font-size:13px;color:var(--mut);line-height:1.6;padding:12px 14px;background:var(--card);border:1px solid var(--bord);border-radius:8px;">
      La gestion des utilisateurs (création, modification, droits, accès) s'effectue
      désormais directement sur le dashboard Supabase pour des raisons de sécurité.
      Cliquez sur le bouton <strong>« 🔗 Ouvrir Supabase Users »</strong> ci-dessus pour y accéder.
    </div>`;
}

function setPraticienDroits(pratIdx, droits) {
  if(!praticiens[pratIdx]) return;
  praticiens[pratIdx].droits = droits;
  savePatients();
  renderPatientList();
}

function switchCaptureMode(mode) {
  document.getElementById('mode-photo').style.display = mode==='photo'?'':'none';
  document.getElementById('mode-video').style.display = mode==='video'?'':'none';
  document.getElementById('sw-photo').className = mode==='photo'?'btn btn-blue':'btn';
  document.getElementById('sw-video').className = mode==='video'?'btn btn-blue':'btn';
}

function launchTest(testId) {
  if (!currentPatient) { alert('Sélectionnez d\'abord un patient.'); nav('pg-patients'); return; }
  const t = TESTS[testId]; if (!t) return;
  currentTestId = testId;
  testMode = t.mode;

  // Init marqueurs
  liveMarkers = cloneMarkers(t.markers);
  vidMarkers = cloneMarkers(t.markers);
  selectedMkrIdx = -1; isDragging = false;
  selectedVidMkrIdx = -1; isVidDragging = false;

  // Init photos - charger les données sauvegardées si elles existent
  const savedData = currentPatient?.mesures?.[testId];
  if(savedData && savedData.photos && savedData.photos.length) {
    photoSlots = savedData.photos.map((p,i) => ({
      label: p.label || (t.photoLabels[i]||'Photo '+(i+1)),
      side: p.side || (t.photoSides?.[i]||''),
      dataUrl: p.dataUrl || null,
      angle: p.angle !== undefined ? p.angle : null,
      angleD: p.angleD !== undefined ? p.angleD : null,
      angleG: p.angleG !== undefined ? p.angleG : null
    }));
    // Compléter si slots manquants
    while(photoSlots.length < t.photoLabels.length) {
      const i = photoSlots.length;
      photoSlots.push({label:t.photoLabels[i]||'Photo '+(i+1), side:t.photoSides?.[i]||'', dataUrl:null, angle:null});
    }
  } else {
    photoSlots = t.photoLabels.map((l,i) => ({
      label:l, side: t.photoSides?.[i]||'', dataUrl:null, angle:null
    }));
  }

  // Charger frames sauvegardées
  if(savedData && savedData.frames && savedData.frames.length) {
    capturedFrames = savedData.frames.map(f => ({
      time: f.time||0, dataUrl: f.dataUrl||null,
      angD: f.angD!==undefined?f.angD:null,
      angG: f.angG!==undefined?f.angG:null,
      markers: f.markers||[]
    }));
  } else {
    capturedFrames = [];
  }
  selectedFrameIdx = -1;

  // Mise à jour UI
  document.getElementById('cap-name').textContent = t.name;
  document.getElementById('cap-note').textContent = t.note;
  document.getElementById('cap-mode-badge').textContent = t.mode==='video'?'Vidéo':'Photo';
  document.getElementById('cap-pt-badge').textContent = currentPatient.prenom+' '+currentPatient.nom;
  document.getElementById('cap-mkr-title').textContent = `Marqueurs (${liveMarkers.length})`;
  document.getElementById('mode-photo').style.display = (t.mode==='photo'||t.mode==='both')?'':'none';
  document.getElementById('mode-video').style.display = (t.mode==='video'||t.mode==='both')?'':'none';
  // Pour mode 'both': montrer onglets de switch
  const hasBoth = t.mode==='both';
  document.getElementById('mode-switch-row').style.display = hasBoth?'flex':'none';
  if(!hasBoth && t.mode==='video') {
    document.getElementById('mode-photo').style.display='none';
    document.getElementById('mode-video').style.display='';
  }

  renderMkrList();
  renderPhotoGrid();
  renderFrameStrip();
  updateResults();

  // Afficher les slots photos dans le mode vidéo si showPhotoSlots
  const vidSlotsEl = document.getElementById('vid-photo-slots');
  const vidGridEl = document.getElementById('vid-photo-grid');
  if(vidSlotsEl && vidGridEl) {
    if(t.showPhotoSlots && testMode === 'video') {
      vidSlotsEl.style.display = '';
      renderVidPhotoGrid();
    } else {
      vidSlotsEl.style.display = 'none';
    }
  }

  // Pré-remplir le sélecteur de caméra photo
  if(testMode === 'photo') {
    setTimeout(() => enumerateCameras('cam-select'), 300);
  }
  nav('pg-capture');
}

// ══════════════════════════════════════════════════════
// PATIENTS
// ══════════════════════════════════════════════════════
function savePatients() {
  localStorage.setItem('bm4-patients', JSON.stringify(patients));
  saveToSupabase();
}

function editPatient(idx) {
  const p = patients[idx];
  if(!p) return;
  // Créer une modale de modification
  let modal = document.getElementById('edit-patient-modal');
  if(modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'edit-patient-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:24px;width:90%;max-width:500px;max-height:90vh;overflow-y:auto;">
      <div style="font-weight:700;font-size:16px;color:#2a7a4e;margin-bottom:16px;">✏️ Modifier le patient</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Nom *</div><input class="inp" id="ep-nom" value="${p.nom||''}"/></div>
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Prénom *</div><input class="inp" id="ep-prenom" value="${p.prenom||''}"/></div>
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Date de naissance</div><input class="inp" type="date" id="ep-ddn" value="${p.ddn||''}"/></div>
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Latéralité</div>
          <select class="inp" id="ep-lat">
            <option ${(p.lat||'Droitier')==='Droitier'?'selected':''}>Droitier</option>
            <option ${p.lat==='Gaucher'?'selected':''}>Gaucher</option>
            <option ${p.lat==='Ambidextre'?'selected':''}>Ambidextre</option>
          </select></div>
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Poids (kg)</div><input class="inp" id="ep-poids" value="${p.poids||''}"/></div>
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Taille (cm)</div><input class="inp" id="ep-taille" value="${p.taille||''}"/></div>
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Sport/Activité</div><input class="inp" id="ep-sport" value="${p.sport||''}"/></div>
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Métier</div><input class="inp" id="ep-metier" value="${p.metier||''}"/></div>
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Email</div><input class="inp" id="ep-email" value="${p.email||''}"/></div>
        <div><div style="font-size:10px;color:#888;margin-bottom:3px;">Téléphone</div><input class="inp" id="ep-tel" value="${p.tel||''}"/></div>
        <div style="grid-column:1/-1;"><div style="font-size:10px;color:#888;margin-bottom:3px;">Motif</div><input class="inp" id="ep-motif" value="${p.motif||''}"/></div>
        <div style="grid-column:1/-1;"><div style="font-size:10px;color:#888;margin-bottom:3px;">Praticien</div>
          <select class="inp" id="ep-prat">
            ${praticiens.map(pr => `<option value="${pr.id}" ${p.pratId===pr.id?'selected':''}>${pr.nom||''} ${pr.prenom||''} — ${pr.titre||''}</option>`).join('')}
          </select></div>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn" style="flex:1;background:#2a7a4e;" onclick="saveEditPatient(${idx})">💾 Sauvegarder</button>
        <button class="btn" style="flex:1;background:#888;" onclick="document.getElementById('edit-patient-modal').remove()">Annuler</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function saveEditPatient(idx) {
  const p = patients[idx];
  if(!p) return;
  const nom = document.getElementById('ep-nom').value.trim();
  const prenom = document.getElementById('ep-prenom').value.trim();
  if(!nom||!prenom){alert('Nom et prénom obligatoires.');return;}
  p.nom = nom; p.prenom = prenom;
  p.ddn = document.getElementById('ep-ddn').value;
  p.sport = document.getElementById('ep-sport').value;
  p.poids = document.getElementById('ep-poids').value;
  p.taille = document.getElementById('ep-taille').value;
  p.motif = document.getElementById('ep-motif').value;
  p.metier = document.getElementById('ep-metier').value;
  p.lat = document.getElementById('ep-lat').value;
  p.email = document.getElementById('ep-email')?.value||'';
  p.tel = document.getElementById('ep-tel')?.value||'';
  p.pratId = document.getElementById('ep-prat').value;
  savePatients();
  document.getElementById('edit-patient-modal')?.remove();
  renderPatientList();
}

// ── MODAL NOUVEAU PATIENT ──
function openNewPatientModal() {
  // Créer la modal si elle n'existe pas
  let modal = document.getElementById('modal-new-patient');
  if(!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-new-patient';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    modal.innerHTML = `
      <div style="background:var(--card);border-radius:14px;padding:24px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="font-size:16px;font-weight:700;">Nouveau patient</div>
          <button onclick="closeNewPatientModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--mut);">✕</button>
        </div>
        <div class="g2">
          <div><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Nom *</div><input class="inp" id="np-nom" placeholder="Nom"/></div>
          <div><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Prénom *</div><input class="inp" id="np-prenom" placeholder="Prénom"/></div>
          <div><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Date de naissance</div><input class="inp" id="np-ddn" type="date"/></div>
          <div><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Sport et/ou activité</div><input class="inp" id="np-sport" placeholder="Trail, running..."/></div>
          <div><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Latéralité</div><select class="inp" id="np-lat"><option>Droitier</option><option>Gaucher</option></select></div>
          <div><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Poids (kg)</div><input class="inp" id="np-poids" type="number" placeholder="70"/></div>
          <div><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Taille (cm)</div><input class="inp" id="np-taille" type="number" placeholder="175"/></div>
          <div><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Métier / Profession</div><input class="inp" id="np-metier" placeholder="Kiné, coureur amateur..."/></div>
          <div style="grid-column:1/-1;"><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Praticien</div><select class="inp" id="np-prat"><option value="">— Choisir —</option></select></div>
        </div>
        <div style="margin-top:10px;"><div style="font-size:10px;color:var(--mut);margin-bottom:3px;">Motif / antécédents</div><textarea class="inp" id="np-motif" rows="2" placeholder="Douleur genou, entorses..."></textarea></div>
        <div id="np-err" style="display:none;color:var(--red);font-size:11px;margin-top:5px;padding:5px 8px;background:var(--red-d);border-radius:var(--rs);"></div>
        <button class="btn btn-blue btn-full" style="margin-top:12px;" onclick="createPatient()">✓ Créer le dossier</button>
      </div>`;
    document.body.appendChild(modal);
    // Fermer en cliquant dehors
    modal.addEventListener('click', e => { if(e.target === modal) closeNewPatientModal(); });
  }
  modal.style.display = 'flex';
  populatePratSelect();
}

function closeNewPatientModal() {
  const modal = document.getElementById('modal-new-patient');
  if(modal) modal.style.display = 'none';
}

function createPatient() {
  const nom = document.getElementById('np-nom').value.trim();
  const prenom = document.getElementById('np-prenom').value.trim();
  const errEl = document.getElementById('np-err');
  if (!nom || !prenom) { errEl.textContent='⚠ Nom et prénom obligatoires.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none';
  const pratId = document.getElementById('np-prat').value;
  const p = {
    id:Date.now(), nom, prenom,
    ddn:document.getElementById('np-ddn').value,
    sport:document.getElementById('np-sport').value,
    metier:document.getElementById('np-metier')?.value||'',
    typeBilan:document.getElementById('np-type-bilan')?.value||'initial',
    lat:document.getElementById('np-lat').value,
    poids:document.getElementById('np-poids').value,
    taille:document.getElementById('np-taille').value,
    pratId, motif:document.getElementById('np-motif').value,
    date:new Date().toLocaleDateString('fr-FR'), mesures:{}
  };
  patients.push(p); savePatients();
  selectPatient(p);
  ['np-nom','np-prenom','np-ddn','np-sport','np-poids','np-taille','np-motif'].forEach(id=>{document.getElementById(id).value='';});
  closeNewPatientModal();
  nav('pg-patients');
}

function selectPatient(p) {
  currentOpenedBilanIdx = null;
  currentPatient = p;
  const init = ((p.prenom||'?')[0]+(p.nom||'?')[0]).toUpperCase();
  if(document.getElementById('tb-av')) document.getElementById('tb-av').textContent = init;
  if(document.getElementById('tb-name')) document.getElementById('tb-name').textContent = p.prenom+' '+p.nom;
  if(document.getElementById('home-sub')) document.getElementById('home-sub').textContent = 'Patient : '+p.prenom+' '+p.nom+' · '+(p.sport||'—');
  if(document.getElementById('sport-sub')) document.getElementById('sport-sub').textContent = 'Patient : '+p.prenom+' '+p.nom+' · '+(p.sport||'—');
  if(document.getElementById('posturo-patient-info')) document.getElementById('posturo-patient-info').textContent = 'Patient : '+p.prenom+' '+p.nom+' · '+(p.sport||'—');
  bilanData = p.bilanData ? JSON.parse(JSON.stringify(p.bilanData)) : {};
  clearBilanFields();
  loadBilan();
}

function clearBilanFields() {
  document.querySelectorAll('.bilan-field').forEach(el => {
    if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = '';
  });
  document.querySelectorAll('#pg-bilan input[type=radio]').forEach(el => el.checked = false);
  document.querySelectorAll('#pg-bilan input[type=checkbox]').forEach(el => el.checked = false);
  const canvasIds = ['morpho-face','morpho-face2','morpho-profilG','morpho-profilD'];
  canvasIds.forEach(id => {
    const c = document.getElementById(id);
    if(c) { c._history=[]; c._baseSnapshot=null; initMorphoCanvas(id); }
  });
  const pc = document.getElementById('pieds-canvas');
  if(pc) { pc._history=[]; pc._baseSnapshot=null; drawPiedsTemplate(); }
}

function deletePatient(i) {
  if(!confirm('Supprimer ce patient ?')) return;
  if(currentPatient && currentPatient.id===patients[i].id) currentPatient=null;
  patients.splice(i,1); savePatients(); renderPatientList();
}

function renderPatientList() {
  const el = document.getElementById('pt-list-el');
  const search = (document.getElementById('pt-search')?.value||'').toLowerCase().trim();
  if (!patients.length) { el.innerHTML='<div style="font-size:12px;color:var(--mut);padding:8px 0;">Aucun patient.</div>'; return; }
  const filtered = patients.filter(p => {
    if(!search) return true;
    return (p.prenom+' '+p.nom).toLowerCase().includes(search);
  });
  if(!filtered.length) { el.innerHTML='<div style="font-size:12px;color:var(--mut);padding:8px 0;">Aucun résultat.</div>'; return; }

  const droits = window._userDroits || pwaUser?.user_metadata?.droits || 'all';
  const canSport = droits === 'all' || droits === 'sport';
  const canPosturo = droits === 'all' || droits === 'posturo';

  el.innerHTML = filtered.map(p => {
    const i = patients.indexOf(p);
    const init = ((p.prenom||'?')[0]+(p.nom||'?')[0]).toUpperCase();
    const age = p.ddn ? Math.floor((Date.now()-new Date(p.ddn))/31557600000)+' ans' : '—';
    const prat = praticiens.find(pr=>pr.id==p.pratId);

    // Bilans existants
    const bilansSport = p.bilansSport || [];
    const bilansPosturo = p.bilansPosturo || [];

    const bilansSportHtml = bilansSport.length ? `
      <div style="margin-top:10px;">
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.35);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Bilans sportifs</div>
        ${bilansSport.map((b,bi) => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(55,138,221,0.06);border:1px solid rgba(55,138,221,0.15);border-radius:8px;margin-bottom:5px;">
          <div style="width:6px;height:6px;border-radius:50%;background:#378ADD;flex-shrink:0;"></div>
          <span style="font-size:12px;color:rgba(255,255,255,0.85);flex:1;">${b.label}</span>
          <span style="font-size:10px;color:rgba(255,255,255,0.3);margin-right:6px;">${b.date}</span>
          <button onclick="ouvrirBilanSport(${i},${bi})" style="border:none;padding:5px 12px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;background:#185FA5;color:#fff;">Ouvrir</button>
          <button onclick="supprimerBilanSport(${i},${bi})" style="background:none;border:none;color:rgba(240,64,96,0.7);font-size:12px;cursor:pointer;padding:4px 6px;">✕</button>
        </div>`).join('')}
      </div>` : '';

    const bilansPosturoHtml = bilansPosturo.length ? `
      <div style="margin-top:10px;">
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.35);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Bilans posturaux</div>
        ${bilansPosturo.map((b,bi) => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(45,212,191,0.06);border:1px solid rgba(45,212,191,0.15);border-radius:8px;margin-bottom:5px;">
          <div style="width:6px;height:6px;border-radius:50%;background:#2dd4bf;flex-shrink:0;"></div>
          <span style="font-size:12px;color:rgba(255,255,255,0.85);flex:1;">${b.label}</span>
          <span style="font-size:10px;color:rgba(255,255,255,0.3);margin-right:6px;">${b.date}</span>
          <button onclick="ouvrirBilanPosturo(${i},${bi})" style="border:none;padding:5px 12px;border-radius:5px;font-size:11px;font-weight:700;cursor:pointer;background:#1D9E75;color:#fff;">Ouvrir</button>
          <button onclick="supprimerBilanPosturo(${i},${bi})" style="background:none;border:none;color:rgba(240,64,96,0.7);font-size:12px;cursor:pointer;padding:4px 6px;">✕</button>
        </div>`).join('')}
      </div>` : '';

    // Modules bilans
    const modPosturo = `
      <div style="border-radius:12px;overflow:hidden;background:#0d4a32;border:1px solid #1a7a52;">
        <div style="height:80px;display:flex;align-items:center;justify-content:center;position:relative;">
          <div style="position:absolute;width:70px;height:70px;border-radius:50%;background:radial-gradient(circle,rgba(45,212,191,0.35),transparent);"></div>
          <span style="font-size:42px;position:relative;z-index:1;">🧍</span>
        </div>
        <div style="padding:10px 12px;">
          <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:2px;">Bilan postural</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:8px;">Étude posture · 9 sections</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
            ${canPosturo
              ? `<button onclick="creerBilanPosturo(${i},'initial')" style="border:none;padding:7px 0;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:#2dd4bf;color:#04342C;">Initial</button>
                 <button onclick="creerBilanPosturo(${i},'controle')" style="border:none;padding:7px 0;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:#fff;color:#0d4a32;">Contrôle</button>`
              : `<button disabled style="border:none;padding:7px 0;border-radius:6px;font-size:11px;font-weight:700;cursor:not-allowed;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);grid-column:1/-1;">Non disponible</button>`}
          </div>
        </div>
      </div>`;

    const modSport = `
      <div style="border-radius:12px;overflow:hidden;background:#0d2e5c;border:1px solid #1a4a8a;">
        <div style="height:80px;display:flex;align-items:center;justify-content:center;position:relative;">
          <div style="position:absolute;width:70px;height:70px;border-radius:50%;background:radial-gradient(circle,rgba(55,138,221,0.35),transparent);"></div>
          <span style="font-size:42px;position:relative;z-index:1;">🏃</span>
        </div>
        <div style="padding:10px 12px;">
          <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:2px;">Podologie du sport</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:8px;">Analyse cinématique</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
            ${canSport
              ? `<button onclick="creerBilanSport(${i},'initial')" style="border:none;padding:7px 0;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:#378ADD;color:#fff;">Initial</button>
                 <button onclick="creerBilanSport(${i},'controle')" style="border:none;padding:7px 0;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;background:#fff;color:#0d2e5c;">Contrôle</button>`
              : `<button disabled style="border:none;padding:7px 0;border-radius:6px;font-size:11px;font-weight:700;cursor:not-allowed;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);grid-column:1/-1;">Non disponible</button>`}
          </div>
        </div>
      </div>`;

    const modPodo = `
      <div style="border-radius:12px;overflow:hidden;background:#2d1060;border:1px solid #4a1a9a;opacity:0.7;">
        <div style="height:80px;display:flex;align-items:center;justify-content:center;position:relative;">
          <div style="position:absolute;width:70px;height:70px;border-radius:50%;background:radial-gradient(circle,rgba(167,139,250,0.4),transparent);"></div>
          <span style="font-size:42px;position:relative;z-index:1;">👶</span>
        </div>
        <div style="padding:10px 12px;">
          <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:2px;">Podopédiatrie</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.5);margin-bottom:6px;">Bilan pédiatrique</div>
          <div style="display:inline-block;font-size:9px;background:rgba(167,139,250,0.2);color:#CCC8F8;border:1px solid rgba(167,139,250,0.4);padding:2px 7px;border-radius:8px;margin-bottom:6px;font-weight:600;">Prochainement</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;">
            <button disabled style="border:none;padding:7px 0;border-radius:6px;font-size:11px;font-weight:700;cursor:not-allowed;background:rgba(167,139,250,0.3);color:#fff;opacity:0.5;">Initial</button>
            <button disabled style="border:none;padding:7px 0;border-radius:6px;font-size:11px;font-weight:700;cursor:not-allowed;background:#fff;color:#2d1060;opacity:0.5;">Contrôle</button>
          </div>
        </div>
      </div>`;

    return `
    <div style="margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:${bilansSport.length||bilansPosturo.length?'12px 12px 0 0':'12px'};">
        <div class="av" style="width:44px;height:44px;flex-shrink:0;">${init}</div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;color:#fff;">${p.prenom} ${p.nom}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px;">${age} · ${p.sport||'—'}${prat?' · '+prat.nom:''}</div>
        </div>
        <button onclick="editPatient(${i})" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;">✏️</button>
        <button onclick="deletePatient(${i})" style="background:rgba(240,64,96,0.08);border:1px solid rgba(240,64,96,0.2);color:#f04060;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:13px;">✕</button>
      </div>
      <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-top:none;border-radius:0 0 12px 12px;padding:14px;">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:${bilansSport.length||bilansPosturo.length?'4px':'0'};">
          ${modPosturo}${modSport}${modPodo}
        </div>
        ${bilansPosturoHtml}${bilansSportHtml}
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
// PRATICIENS
// ══════════════════════════════════════════════════════
function savePraticiens() {
  localStorage.setItem('bm4-praticiens', JSON.stringify(praticiens));
  saveToSupabase();
}

function createPraticien() {
  const nom = document.getElementById('pr-nom').value.trim();
  if (!nom) { alert('Nom obligatoire.'); return; }
  const pr = {
    id:Date.now(), nom,
    titre:document.getElementById('pr-titre').value,
    cabinet:document.getElementById('pr-cabinet').value,
    tel:document.getElementById('pr-tel').value,
    adresse:document.getElementById('pr-adresse').value,
    email:document.getElementById('pr-email').value,
  };
  praticiens.push(pr); savePraticiens();
  ['pr-nom','pr-titre','pr-cabinet','pr-tel','pr-adresse','pr-email'].forEach(id=>{document.getElementById(id).value='';});
  renderPratList(); populatePratSelect();
  alert(`✓ Praticien enregistré : ${pr.nom}`);
}

function deletePraticien(i) {
  if(!confirm('Supprimer ce praticien ?')) return;
  praticiens.splice(i,1); savePraticiens(); renderPratList(); populatePratSelect();
}




function createBilanInitial(patIdx) {
  const p = patients[patIdx];
  if(!p) return;
  selectPatient(p);
  p.bilanInitialDate = new Date().toLocaleDateString('fr-FR');
  savePatients();
  renderPatientList();
  nav('pg-sport');
}

function createBilanControle(patIdx) {
  const p = patients[patIdx];
  if(!p) return;
  // Sauvegarder l'état actuel du bilan comme historique
  if(!p.bilans) p.bilans = [];
  const num = p.bilans.length + 1;
  const bilan = {
    label: 'Bilan de contrôle ' + num,
    date: new Date().toLocaleDateString('fr-FR'),
    mesures: JSON.parse(JSON.stringify(p.mesures||{})),
    bilanData: JSON.parse(JSON.stringify(p.bilanData||{}))
  };
  p.bilans.push(bilan);
  // Réinitialiser les mesures pour le nouveau bilan
  p.mesures = {};
  p.bilanData = {};
  savePatients();
  selectPatient(p);
  renderPatientList();
  nav('pg-sport');
}

function loadBilanFromHistory(patIdx, bilanIdx) {
  const p = patients[patIdx];
  if(!p || !p.bilans || !p.bilans[bilanIdx]) return;
  const bilan = p.bilans[bilanIdx];
  selectPatient(p);
  currentPatient.mesures = bilan.mesures;
  currentPatient.bilanData = bilan.bilanData;
  nav('pg-rapport');
}

// ---- NOUVEAU SYSTÈME BILANS ----

function creerBilanSport(patIdx, type) {
  const p = patients[patIdx];
  if(!p) return;
  // Sauvegarder bilan courant si données existantes
  if(p.mesures && Object.keys(p.mesures).length > 0) {
    if(!p.bilansSport) p.bilansSport = [];
    const num = p.bilansSport.length + 1;
    p.bilansSport.push({
      label: type === 'initial' ? 'Sportif Initial' : 'Sportif Contrôle ' + num,
      type: type,
      date: new Date().toLocaleDateString('fr-FR'),
      mesures: JSON.parse(JSON.stringify(p.mesures||{})),
      bilanData: JSON.parse(JSON.stringify(p.bilanData||{}))
    });
  }
  // Nouveau bilan vide
  p.mesures = {};
  p.bilanData = {};
  p.currentBilanType = 'sport';
  p.currentBilanSousType = type;
  savePatients();
  currentOpenedBilanIdx = null;
  selectPatient(p);
  nav('pg-sport');
}

function ouvrirBilanSport(patIdx, bilanIdx) {
  const p = patients[patIdx];
  if(!p) return;
  const bilan = p.bilansSport?.[bilanIdx];
  if(!bilan) {
    // Bilan courant
    currentOpenedBilanIdx = null;
    selectPatient(p);
    nav('pg-sport');
    return;
  }
  selectPatient(p);
  currentPatient.mesures = JSON.parse(JSON.stringify(bilan.mesures||{}));
  currentPatient.bilanData = JSON.parse(JSON.stringify(bilan.bilanData||{}));
  currentOpenedBilanIdx = bilanIdx;
  nav('pg-sport');
}

function creerBilanPosturo(patIdx, type) {
  const p = patients[patIdx];
  if(!p) return;
  // Sauvegarder bilan posturo courant si données existantes
  if(p.bilanDataPosturo && Object.keys(p.bilanDataPosturo).length > 0) {
    if(!p.bilansPosturo) p.bilansPosturo = [];
    const num = p.bilansPosturo.length + 1;
    p.bilansPosturo.push({
      label: type === 'initial' ? 'Posturo Initial' : 'Posturo Contrôle ' + num,
      type: type,
      date: new Date().toLocaleDateString('fr-FR'),
      bilanDataPosturo: JSON.parse(JSON.stringify(p.bilanDataPosturo||{}))
    });
  }
  p.bilanDataPosturo = {};
  p.currentBilanType = 'posturo';
  p.currentBilanSousType = type;
  savePatients();
  currentOpenedBilanIdx = null;
  selectPatient(p);
  nav('pg-bilan-posturo');
}

function supprimerBilanSport(patIdx, bilanIdx) {
  const p = patients[patIdx];
  if(!p) return;
  const bilan = p.bilansSport?.[bilanIdx];
  if(!bilan) return;
  if(!confirm('Supprimer le bilan "' + bilan.label + '" du ' + bilan.date + ' ? Cette action est irréversible.')) return;
  p.bilansSport.splice(bilanIdx, 1);
  savePatients();
  renderPatientList();
}

function supprimerBilanPosturo(patIdx, bilanIdx) {
  const p = patients[patIdx];
  if(!p) return;
  const bilan = p.bilansPosturo?.[bilanIdx];
  if(!bilan) return;
  if(!confirm('Supprimer le bilan "' + bilan.label + '" du ' + bilan.date + ' ? Cette action est irréversible.')) return;
  p.bilansPosturo.splice(bilanIdx, 1);
  savePatients();
  renderPatientList();
}

function ouvrirBilanPosturo(patIdx, bilanIdx) {
  const p = patients[patIdx];
  if(!p) return;
  const bilan = p.bilansPosturo?.[bilanIdx];
  if(!bilan) {
    selectPatient(p);
    nav('pg-bilan-posturo');
    return;
  }
  selectPatient(p);
  currentPatient.bilanDataPosturo = JSON.parse(JSON.stringify(bilan.bilanDataPosturo||{}));
  currentOpenedBilanIdx = null;
  // Réinitialiser le canvas pour forcer recalcul taille
  const oldCanvas = document.getElementById('posturo-body-canvas');
  if(oldCanvas) { oldCanvas.width = 0; oldCanvas.height = 0; oldCanvas._baseSnapshot = null; oldCanvas._history = []; }
  nav('pg-bilan-posturo');
  setTimeout(() => {
    loadPosturoBilan();
    showPosturoSection(0);
  }, 300);
  // Restauration neuro4 après recréation du DOM section 4
  setTimeout(() => {
    const dn = currentPatient?.bilanDataPosturo?.neuro4;
    if(!dn) return;
    Object.entries(dn).forEach(([key, val]) => {
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const onch = cb.getAttribute('onchange') || '';
        if(onch.includes("'"+key+"'")) cb.checked = !!val;
      });
      if(typeof val === 'string' && val !== '') {
        document.querySelectorAll('input[type="radio"]').forEach(r => {
          const onch = r.getAttribute('onchange') || '';
          if(onch.includes("'"+key+"'") && r.value === val) r.checked = true;
        });
      }
    });
  }, 800);
}
function renderPratList() {
  const el = document.getElementById('prat-list-el');
  if (!praticiens.length) { el.innerHTML='<div style="font-size:12px;color:var(--mut);padding:8px 0;">Aucun praticien.</div>'; return; }
  el.innerHTML = praticiens.map((pr,i) => `
    <div class="prat-row">
      <div style="flex:1;"><div style="font-size:12px;font-weight:500;">${pr.nom}</div>
      <div style="font-size:10px;color:var(--mut);">${pr.titre||''}${pr.cabinet?' · '+pr.cabinet:''}${pr.adresse?' · '+pr.adresse:''}</div></div>
      <button class="btn" style="font-size:11px;" onclick="editPraticien(${i})">✏️</button>
      <button class="btn" style="color:var(--red);font-size:11px;" onclick="deletePraticien(${i})">✕</button>
    </div>`).join('');
}

function editPraticien(i) {
  const pr = praticiens[i];
  if(!pr) return;
  // Remplir le formulaire avec les données existantes
  document.getElementById('pr-nom').value = pr.nom || '';
  document.getElementById('pr-titre').value = pr.titre || '';
  document.getElementById('pr-cabinet').value = pr.cabinet || '';
  document.getElementById('pr-tel').value = pr.tel || '';
  document.getElementById('pr-adresse').value = pr.adresse || '';
  document.getElementById('pr-email').value = pr.email || '';
  // Changer le bouton en mode édition
  const btn = document.querySelector('#pg-praticiens button[onclick*="createPraticien"]');
  if(btn) {
    btn.textContent = '✓ Modifier le praticien';
    btn.onclick = () => saveEditPraticien(i);
  }
  // Scroller vers le formulaire
  document.getElementById('np-prat-nom').scrollIntoView({behavior:'smooth'});
}

function saveEditPraticien(i) {
  const pr = praticiens[i];
  if(!pr) return;
  pr.nom = document.getElementById('pr-nom').value.trim();
  pr.titre = document.getElementById('pr-titre').value.trim();
  pr.cabinet = document.getElementById('pr-cabinet').value.trim();
  pr.tel = document.getElementById('pr-tel').value.trim();
  pr.adresse = document.getElementById('pr-adresse').value.trim();
  pr.email = document.getElementById('pr-email').value.trim();
  savePatients();
  renderPratList();
  // Remettre le bouton en mode création
  const btn = document.querySelector('#pg-praticiens button[onclick*="saveEditPraticien"]');
  if(btn) { btn.textContent = '✓ Enregistrer le praticien'; btn.onclick = createPraticien; }
  ['pr-nom','pr-titre','pr-cabinet','pr-tel','pr-adresse','pr-email'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
}

function populatePratSelect() {
  const sel = document.getElementById('np-prat');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Choisir —</option>' +
    praticiens.map(pr => `<option value="${pr.id}">${pr.nom}</option>`).join('');
}

// ══════════════════════════════════════════════════════
// RENDU MARQUEURS
// ══════════════════════════════════════════════════════
function renderMkrList() {
  const markers = testMode==='video' ? vidMarkers : liveMarkers;
  const selIdx = testMode==='video' ? selectedVidMkrIdx : selectedMkrIdx;
  document.getElementById('cap-mkr-list').innerHTML = markers.map((m,i) => `
    <div class="mkr-item ${selIdx===i?'sel':''}" onclick="selectMkr(${i})">
      <div class="mkr-dot" style="background:${m.color};"></div>
      ${m.side?`<span class="mkr-side ${m.side}">${m.side}</span>`:''}
      <span style="flex:1;font-size:11px;font-weight:500;">${m.name}</span>
      <span style="font-size:9px;color:var(--dim);font-family:var(--fm);">${m.x!==null?`${Math.round(m.x)},${Math.round(m.y)}`:'—'}</span>
      <span>${m.x!==null?'<span class="badge bg">✓</span>':'<span class="badge bd">—</span>'}</span>
      ${m.x!==null?`<button onclick="event.stopPropagation();clearMkr(${i})" style="border:none;background:none;cursor:pointer;color:var(--red);font-size:11px;">✕</button>`:''}
    </div>`).join('');
}

function selectMkr(i) {
  if (testMode==='video') selectedVidMkrIdx=i; else selectedMkrIdx=i;
  renderMkrList();
}
function clearMkr(i) {
  if (testMode==='video') { vidMarkers[i].x=null; vidMarkers[i].y=null; }
  else { liveMarkers[i].x=null; liveMarkers[i].y=null; }
  renderMkrList(); updateResults();
}
function resetAllMarkers() {
  const t=TESTS[currentTestId]; if(!t) return;
  liveMarkers=cloneMarkers(t.markers); selectedMkrIdx=-1; isDragging=false;
  vidMarkers=cloneMarkers(t.markers); selectedVidMkrIdx=-1; isVidDragging=false;
  renderMkrList(); updateResults();
}

// ══════════════════════════════════════════════════════
// PHOTO GRID
// ══════════════════════════════════════════════════════
function renderVidPhotoGrid() {
  const t = TESTS[currentTestId]; if(!t || !t.showPhotoSlots) return;
  const el = document.getElementById('vid-photo-grid'); if(!el) return;

  if(t.kfppaPhotos || t.mobiliteAP) {
    let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    photoSlots.forEach((slot, i) => { html += vidPhotoSlotHTML(slot, i); });
    html += '</div>';
    el.innerHTML = html;
    return;
  }
  if(t.mlaTest) {
    // MLA : 2 colonnes (pied D et pied G)
    const slotsD=photoSlots.map((s,i)=>({...s,idx:i})).filter(s=>s.side==='D');
    const slotsG=photoSlots.map((s,i)=>({...s,idx:i})).filter(s=>s.side==='G');
    let html='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
    html+='<div><div style="font-size:10px;font-weight:700;color:#4a9eff;margin-bottom:5px;">🦶 Pied Droit</div><div style="display:flex;flex-direction:column;gap:5px;">';
    slotsD.forEach(slot=>{ html+=vidPhotoSlotHTML(slot,slot.idx); });
    html+='</div></div>';
    html+='<div><div style="font-size:10px;font-weight:700;color:#3ecf72;margin-bottom:5px;">🦶 Pied Gauche</div><div style="display:flex;flex-direction:column;gap:5px;">';
    slotsG.forEach(slot=>{ html+=vidPhotoSlotHTML(slot,slot.idx); });
    html+='</div></div></div>';
    el.innerHTML=html;
    return;
  }

  const slotsG = photoSlots.map((s,i)=>({...s,idx:i})).filter(s=>s.side==='G');
  const slotsD = photoSlots.map((s,i)=>({...s,idx:i})).filter(s=>s.side==='D');
  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
  html += '<div><div style="font-size:10px;font-weight:700;color:var(--green);margin-bottom:5px;">🦵 Pied Gauche</div><div style="display:flex;flex-direction:column;gap:5px;">';
  slotsG.forEach(slot => { html += vidPhotoSlotHTML(slot, slot.idx); });
  html += '</div></div>';
  html += '<div><div style="font-size:10px;font-weight:700;color:var(--blue);margin-bottom:5px;">🦵 Pied Droit</div><div style="display:flex;flex-direction:column;gap:5px;">';
  slotsD.forEach(slot => { html += vidPhotoSlotHTML(slot, slot.idx); });
  html += '</div></div></div>';
  el.innerHTML = html;
}


function vidPhotoSlotHTML(slot, idx) {
  if(slot.dataUrl) {
    return '<div style="position:relative;background:var(--surf);border:1px solid var(--bord);border-radius:var(--rs);overflow:hidden;">'
      + '<img src="'+slot.dataUrl+'" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;"/>'
      + (slot.angle !== null ? '<span style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.8);border:1px solid #FFD700;border-radius:2px;font-size:10px;font-weight:700;color:#FFD700;padding:1px 4px;font-family:var(--fm);">'+slot.angle.toFixed(1)+'°</span>' : '')
      + '<button onclick="deletePhotoSlot('+idx+');renderVidPhotoGrid();" style="position:absolute;top:3px;right:3px;background:rgba(200,30,30,.85);border:none;border-radius:2px;color:#fff;cursor:pointer;padding:0 4px;font-size:10px;">✕</button>'
      + '<span style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.7);font-size:9px;color:#fff;padding:2px 4px;">'+slot.label+'</span>'
      + '</div>';
  }
  return '<div style="background:var(--surf);border:1px dashed var(--bord);border-radius:var(--rs);aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;" onclick="captureVidPhotoSlot('+idx+')">'
    + '<span style="font-size:16px;">📷</span>'
    + '<span style="font-size:9px;color:var(--mut);margin-top:3px;text-align:center;padding:0 4px;">'+slot.label+'</span>'
    + '</div>';
}

function captureVidPhotoSlot(slotIdx) {
  const player = document.getElementById('vid-el');
  const vcanvas = document.getElementById('vid-canvas');
  if(!player || !vcanvas) { alert('Activez la caméra ou importez une vidéo.'); return; }
  const t = TESTS[currentTestId];
  const view = t?.view || 'dos';
  const slot = photoSlots[slotIdx];
  const side = slot?.side || '';

  // Filtrer les marqueurs selon le côté du slot
  // Pour MLA : pas de filtrage (tous les marqueurs sont sans side)
  let markersForPhoto = vidMarkers;
  if(side && t?.markers !== 'mla') {
    markersForPhoto = vidMarkers.filter(m => m.side === side);
  }

  const tmp = document.createElement('canvas');
  tmp.width = vcanvas.width; tmp.height = vcanvas.height;
  const ctx = tmp.getContext('2d');
  ctx.drawImage(player, 0, 0, vcanvas.width, vcanvas.height);
  drawOverlay(ctx, tmp, markersForPhoto, -1, view);
  const dataUrl = tmp.toDataURL('image/jpeg', 0.88);

  // Calculer l'angle selon le côté
  const rawAng = calcAngle3(markersForPhoto);
  // MLA : angle brut (pas de correction)
  // KFPPA : stocker incl (180-rawAng) sans signe latéral (signe appliqué à l'affichage)
  const mlaType = t?.markers==='mla' ? 'mla' : (t?.markers==='genou-bi' ? 'kfppa' : (t?.type||''));
  const corrAng = computeCorrectedAngle(rawAng, side, view, mlaType, markersForPhoto);
  photoSlots[slotIdx].dataUrl = dataUrl;
  photoSlots[slotIdx].angle = corrAng;

  // Mobilité AP : stocker angles D et G séparément
  if(t?.mobiliteAP) {
    const mkrD = vidMarkers.filter(m=>m.side==='D');
    const mkrG = vidMarkers.filter(m=>m.side==='G');
    // Signe anatomique réel : Inv=+ Ev=- selon direction du calca
    // Pied D: pointe droite=Inv(+), pointe gauche=Ev(-)
    // Pied G: pointe gauche=Inv(+), pointe droite=Ev(-)
    photoSlots[slotIdx].angleD = computeCorrectedAngle(calcAngle3(mkrD),'D',view,t?.type||'',mkrD);
    photoSlots[slotIdx].angleG = computeCorrectedAngle(calcAngle3(mkrG),'G',view,t?.type||'',mkrG);
  }

  // KFPPA photo bipodale : calculer angleD et angleG séparément
  if(t?.kfppaPhotos && !side) {
    // Bipodal KFPPA : stocker angle brut (rawAng) côté D et G
    const mkrD = vidMarkers.filter(m=>m.side==='D');
    const mkrG = vidMarkers.filter(m=>m.side==='G');
    photoSlots[slotIdx].angleD = computeCorrectedAngle(calcAngle3(mkrD),'D',view,'kfppa',mkrD);
    photoSlots[slotIdx].angleG = computeCorrectedAngle(calcAngle3(mkrG),'G',view,'kfppa',mkrG);
  }

  renderVidPhotoGrid();
  updateResults();
}

function renderPhotoGrid() {
  const t = TESTS[currentTestId]; if(!t) return;
  const el = document.getElementById('photo-grid-container');
  // Grouper par côté
  const hasSides = photoSlots.some(s=>s.side);
  if (hasSides) {
    // Grouper D vs G
    const sidesOrder = [...new Set(t.photoSides.filter(s=>s))];
    let html = '';
    sidesOrder.forEach(side => {
      const slots = photoSlots.map((s,i)=>({...s,idx:i})).filter(s=>s.side===side);
      html += `<div class="photo-section">
        <div class="photo-section-title">
          <span class="side-label ${side==='D'?'side-D':'side-G'}">Pied ${side}</span>
        </div>
        <div class="photo-row">${slots.map(slot=>photoSlotHTML(slot,slot.idx)).join('')}</div>
      </div>`;
    });
    el.innerHTML = html;
  } else {
    el.innerHTML = `<div class="photo-row">${photoSlots.map((s,i)=>photoSlotHTML(s,i)).join('')}</div>`;
  }
}

function photoSlotHTML(slot, idx) {
  if (slot.dataUrl) {
    const clrAng = slot.angle!==null ? getAngleColor(slot.angle) : '#FFD700';
    return `<div class="photo-slot has-photo">
      <img src="${slot.dataUrl}"/>
      <button class="ph-del" onclick="deletePhotoSlot(${idx})">✕</button>
      ${slot.angle!==null?`<span class="ph-angle" style="color:${clrAng};border-color:${clrAng};">${slot.angle.toFixed(1)}°</span>`:''}
      <span class="ph-label">${slot.label}</span>
    </div>`;
  }
  return `<div class="photo-slot" onclick="capturePhotoSlot(${idx})">
    <span class="ph-icon">📷</span>
    <span class="ph-lbl-empty">${slot.label}</span>
  </div>`;
}

function deletePhotoSlot(i) {
  photoSlots[i].dataUrl=null; photoSlots[i].angle=null;
  renderPhotoGrid(); updateResults();
}

function resetPhotoSlots() {
  const t=TESTS[currentTestId]; if(!t) return;
  photoSlots=t.photoLabels.map((l,i)=>({label:l,side:t.photoSides[i]||'',dataUrl:null,angle:null}));
  renderPhotoGrid(); updateResults();
}

// Capturer la photo courante et l'assigner au slot
function capturePhotoSlot(slotIdx) {
  const canvas = document.getElementById('ph-canvas');
  if (!camStream) { alert('Activez la caméra.'); return; }
  const t = TESTS[currentTestId];
  const view = t?.view || 'face';
  const slot = photoSlots[slotIdx];
  const side = slot.side || '';
  const markersForPhoto = side ? liveMarkers.filter(m=>m.side===side) : liveMarkers;
  const tmp = document.createElement('canvas');
  tmp.width = canvas.width; tmp.height = canvas.height;
  const ctx = tmp.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  drawOverlay(ctx, tmp, markersForPhoto, -1, view);
  const dataUrl = tmp.toDataURL('image/jpeg', 0.88);
  const rawAng = calcAngle3(markersForPhoto);
  // MLA : angle brut (pas de correction)
  // KFPPA : stocker incl (180-rawAng) sans signe latéral (signe appliqué à l'affichage)
  const mlaType = t?.markers==='mla' ? 'mla' : (t?.markers==='genou-bi' ? 'kfppa' : (t?.type||''));
  const corrAng = computeCorrectedAngle(rawAng, side, view, mlaType, markersForPhoto);
  photoSlots[slotIdx].dataUrl = dataUrl;
  photoSlots[slotIdx].angle = corrAng;
  if(t && t.mobiliteAP) {
    const mkrD = liveMarkers.filter(m=>m.side==='D');
    const mkrG = liveMarkers.filter(m=>m.side==='G');
    photoSlots[slotIdx].angleD = computeCorrectedAngle(calcAngle3(mkrD),'D',view,t.type||'',mkrD);
    photoSlots[slotIdx].angleG = computeCorrectedAngle(calcAngle3(mkrG),'G',view,t.type||'',mkrG);
  }
  renderPhotoGrid(); updateResults();
}

// ══════════════════════════════════════════════════════
// CAMÉRA LIVE (mode photo)
// ══════════════════════════════════════════════════════
async function toggleCam() {
  if (camStream) { stopCam(); return; }
  try {
    const selCam = document.getElementById('cam-select')?.value;
    camStream = await navigator.mediaDevices.getUserMedia(selCam
      ? {video:{deviceId:{exact:selCam},width:{ideal:1280},height:{ideal:720}},audio:false}
      : {video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},audio:false});
    const canvas = document.getElementById('ph-canvas');
    const wrap = document.getElementById('ph-wrap');
    const vEl = document.createElement('video');
    vEl.srcObject=camStream; vEl.autoplay=true; vEl.playsInline=true;
    vEl.onloadedmetadata = () => {
      canvas.width=vEl.videoWidth||640; canvas.height=vEl.videoHeight||360;
      wrap.style.minHeight='auto';
      document.getElementById('ph-info').textContent=`${canvas.width}×${canvas.height}`;
      document.getElementById('btn-auto').style.display='';
      document.getElementById('btn-redetect').style.display='';
      document.getElementById('cam-st').textContent='Active'; document.getElementById('cam-st').className='badge bg';
      document.getElementById('btn-cam').textContent='⏹ Arrêter'; document.getElementById('btn-cam').className='btn btn-red';
      setupPhotoCanvas(vEl, canvas);
      startLiveDraw(vEl, canvas);
      // Démarrer auto-détection
      autoLive = true;
      document.getElementById('btn-auto').textContent='Auto : ON';
      document.getElementById('btn-auto').className='btn btn-green';
    };
  } catch(e) {
    document.getElementById('ph-info').textContent='⚠ Accès caméra refusé';
    document.getElementById('cam-st').textContent='Erreur'; document.getElementById('cam-st').className='badge br';
  }
}

function stopCam() {
  if(camStream) camStream.getTracks().forEach(t=>t.stop()); camStream=null;
  if(animId) cancelAnimationFrame(animId); animId=null;
  document.getElementById('btn-cam').textContent='Activer caméra'; document.getElementById('btn-cam').className='btn btn-green';
  document.getElementById('btn-auto').style.display='none';
  document.getElementById('cam-st').textContent='Inactive'; document.getElementById('cam-st').className='badge bd';
  autoLive = false;
}

function setupPhotoCanvas(vid, canvas) {
  canvas.onmousedown = e => {
    const {x,y} = canvasXY(e, canvas);
    const hit = findMarkerAt(x, y, liveMarkers, canvas.width);
    if (hit >= 0) { selectedMkrIdx=hit; isDragging=true; renderMkrList(); return; }
    // Placer le marqueur sélectionné ou le suivant libre
    const idx = selectedMkrIdx>=0 ? selectedMkrIdx : liveMarkers.findIndex(m=>m.x===null);
    if (idx>=0 && idx<liveMarkers.length) {
      liveMarkers[idx].x=x; liveMarkers[idx].y=y;
      const next = liveMarkers.findIndex((m,i)=>i>idx&&m.x===null);
      selectedMkrIdx = next>=0?next:-1;
      renderMkrList(); updateResults();
    }
  };
  canvas.onmousemove = e => {
    if (!isDragging || selectedMkrIdx<0) return;
    const {x,y}=canvasXY(e,canvas);
    liveMarkers[selectedMkrIdx].x=x; liveMarkers[selectedMkrIdx].y=y;
    renderMkrList(); updateResults();
  };
  canvas.onmouseup = () => isDragging=false;
  canvas.ontouchstart = e=>{e.preventDefault();const t=e.touches[0];canvas.onmousedown({clientX:t.clientX,clientY:t.clientY});};
  canvas.ontouchmove = e=>{e.preventDefault();const t=e.touches[0];canvas.onmousemove({clientX:t.clientX,clientY:t.clientY});};
  canvas.ontouchend = ()=>canvas.onmouseup();
}

function startLiveDraw(vid, canvas) {
  const ctx = canvas.getContext('2d');
  const view = TESTS[currentTestId]?.view || 'face';
  function draw() {
    animId = requestAnimationFrame(draw);
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    if (autoLive) {
      detectMarkersAuto(ctx, canvas, liveMarkers, view, ()=>{ renderMkrList(); updateResults(); });
    }
    drawOverlay(ctx, canvas, liveMarkers, selectedMkrIdx, view);
    updateAngleOverlay('ph-angles', liveMarkers, view);
    updateResults();
  }
  draw();
}

function toggleAutoLive() {
  autoLive=!autoLive;
  document.getElementById('btn-auto').textContent='Auto : '+(autoLive?'ON':'OFF');
  document.getElementById('btn-auto').className=autoLive?'btn btn-green':'btn';
}

function redetectMarkers() {
  // Réinitialiser les positions et relancer la détection blob sur tous les marqueurs
  liveMarkers.forEach(m => { m.x=null; m.y=null; });
  const canvas = document.getElementById('ph-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const view = TESTS[currentTestId]?.view || 'face';
  // Forcer la détection blob (pas le placement fixe) en passant markers avec x=null
  detectMarkersAuto(ctx, canvas, liveMarkers, view, ()=>{ renderMkrList(); updateResults(); });
}

// ══════════════════════════════════════════════════════
// CAMÉRA VIDÉO
// ══════════════════════════════════════════════════════

async function enumerateCameras(selectId) {
  try {
    // Demander permission d'abord pour avoir les labels
    await navigator.mediaDevices.getUserMedia({video:true}).then(s=>s.getTracks().forEach(t=>t.stop())).catch(()=>{});
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(d => d.kind === 'videoinput');
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = cameras.map((d, i) => {
      // Nettoyer le label : enlever les infos techniques
      let label = d.label || ('Caméra ' + (i+1));
      if(label.includes('(')) label = label.split('(')[0].trim();
      if(label.length > 30) label = label.substring(0, 30) + '…';
      return `<option value="${d.deviceId}">${label}</option>`;
    }).join('');
    if (current && cameras.find(d=>d.deviceId===current)) sel.value = current;
    // Si un stream est actif, sélectionner la caméra actuellement utilisée
    if(vidStream) {
      const activeTrack = vidStream.getVideoTracks()[0];
      if(activeTrack) {
        const settings = activeTrack.getSettings();
        if(settings.deviceId) {
          const opt = sel.querySelector(`option[value="${settings.deviceId}"]`);
          if(opt) sel.value = settings.deviceId;
        }
      }
    }
  } catch(e) { console.warn('enumerateCameras:', e); }
}

async function toggleVCam() {
  if(vidStream) { stopVCam(); return; }
  try {
    const selCam = document.getElementById('vcam-select')?.value;
    const constraints = {
      audio: false,
      video: selCam
        ? {deviceId:{exact:selCam}, width:{ideal:1280}, height:{ideal:720}}
        : {facingMode:'environment', width:{ideal:1280}, height:{ideal:720}}
    };
    vidStream=await navigator.mediaDevices.getUserMedia(constraints);
    const player=document.getElementById('vid-el');
    const vcanvas=document.getElementById('vid-canvas');
    player.srcObject=vidStream; player.play();
    player.onloadedmetadata=()=>{
      vcanvas.width=player.videoWidth||640; vcanvas.height=player.videoHeight||360;
      document.getElementById('vid-info').textContent=`Live ${vcanvas.width}×${vcanvas.height}`;
      document.getElementById('btn-vrec').style.display='';
      document.getElementById('btn-vauto').style.display='';
      document.getElementById('vcam-st').textContent='Live'; document.getElementById('vcam-st').className='badge bg';
      document.getElementById('btn-vcam').textContent='⏹ Arrêter'; document.getElementById('btn-vcam').className='btn btn-red';
      vAutoDetect=true; document.getElementById('btn-vauto').textContent='Auto : ON'; document.getElementById('btn-vauto').className='btn btn-green';
      setupVidCanvas(player,vcanvas);
      // Mettre à jour le sélecteur avec les vraies caméras disponibles
      enumerateCameras('vcam-select');
    };
  } catch(e) { document.getElementById('vid-info').textContent='⚠ Accès caméra refusé : '+e.message; }
}

function stopVCam() {
  if(vidStream) vidStream.getTracks().forEach(t=>t.stop()); vidStream=null;
  document.getElementById('btn-vcam').textContent='Activer caméra'; document.getElementById('btn-vcam').className='btn btn-green';
  document.getElementById('btn-vrec').style.display='none'; document.getElementById('btn-vauto').style.display='none';
  document.getElementById('vcam-st').textContent='Inactive'; document.getElementById('vcam-st').className='badge bd';
}

function loadVidFile(input) {
  const file=input.files[0]; if(!file) return;
  const player=document.getElementById('vid-el');
  const vcanvas=document.getElementById('vid-canvas');
  player.srcObject=null; player.src=URL.createObjectURL(file);
  player.onloadedmetadata=()=>{
    vcanvas.width=player.videoWidth||640; vcanvas.height=player.videoHeight||360;
    document.getElementById('vid-info').textContent=`${player.videoWidth}×${player.videoHeight} · ${player.duration.toFixed(1)}s`;
    document.getElementById('btn-vauto').style.display='';
    vAutoDetect=true; document.getElementById('btn-vauto').textContent='Auto : ON'; document.getElementById('btn-vauto').className='btn btn-green';
    document.getElementById('vcam-st').textContent='Vidéo'; document.getElementById('vcam-st').className='badge bb';
    setupVidCanvas(player,vcanvas);
  };
}

function setupVidCanvas(player, vcanvas) {
  const view = TESTS[currentTestId]?.view || 'face';
  vcanvas.onmousedown = e => {
    const {x,y}=canvasXY(e,vcanvas);
    const hit=findMarkerAt(x,y,vidMarkers,vcanvas.width);
    if(hit>=0){
      selectedVidMkrIdx=hit;isVidDragging=true;
      vAutoDetect=false;
      const bv=document.getElementById('btn-vauto');
      if(bv){bv.textContent='Auto : OFF';bv.className='btn';}
      renderMkrList();return;
    }
    const idx=selectedVidMkrIdx>=0?selectedVidMkrIdx:vidMarkers.findIndex(m=>m.x===null);
    if(idx>=0&&idx<vidMarkers.length){
      vidMarkers[idx].x=x; vidMarkers[idx].y=y;
      const next=vidMarkers.findIndex((m,i)=>i>idx&&m.x===null);
      selectedVidMkrIdx=next>=0?next:-1;
      renderMkrList(); updateResults();
    }
  };
  vcanvas.onmousemove=e=>{
    if(!isVidDragging||selectedVidMkrIdx<0)return;
    const{x,y}=canvasXY(e,vcanvas);
    vidMarkers[selectedVidMkrIdx].x=x; vidMarkers[selectedVidMkrIdx].y=y;
    renderMkrList(); updateResults();
    // Redessiner immédiatement (important en pause)
    const ctx2=vcanvas.getContext('2d');
    ctx2.drawImage(player,0,0,vcanvas.width,vcanvas.height);
    drawOverlay(ctx2,vcanvas,vidMarkers,selectedVidMkrIdx,TESTS[currentTestId]?.view||'face');
    updateAngleOverlay('vid-angles',vidMarkers,TESTS[currentTestId]?.view||'face');
  };
  vcanvas.onmouseup=()=>isVidDragging=false;
  vcanvas.ontouchstart=e=>{e.preventDefault();const t=e.touches[0];vcanvas.onmousedown({clientX:t.clientX,clientY:t.clientY});};
  vcanvas.ontouchmove=e=>{e.preventDefault();const t=e.touches[0];vcanvas.onmousemove({clientX:t.clientX,clientY:t.clientY});};
  vcanvas.ontouchend=()=>vcanvas.onmouseup();

  player.ontimeupdate=()=>{
    const ctx=vcanvas.getContext('2d');
    ctx.drawImage(player,0,0,vcanvas.width,vcanvas.height);
    if(vAutoDetect) detectMarkersAuto(ctx,vcanvas,vidMarkers,view,()=>{renderMkrList();updateResults();});
    drawOverlay(ctx,vcanvas,vidMarkers,selectedVidMkrIdx,view);
    updateAngleOverlay('vid-angles',vidMarkers,view);
    const t2=player.currentTime,d=player.duration||1;
    document.getElementById('time-disp').textContent=`${t2.toFixed(2)}/${d.toFixed(2)}s`;
    document.getElementById('timeline').value=Math.round(t2/d*1000);
    updateResults();
  };
}

function togglePlay(){const p=document.getElementById('vid-el');if(p.paused){p.play();document.getElementById('btn-play').textContent='⏸';}else{p.pause();document.getElementById('btn-play').textContent='▶';}}
function stepFrame(dir){const p=document.getElementById('vid-el');p.pause();p.currentTime=Math.max(0,Math.min(p.duration||0,p.currentTime+dir/30));document.getElementById('btn-play').textContent='▶';}
function seekVid(val){const p=document.getElementById('vid-el');if(p.duration)p.currentTime=(val/1000)*p.duration;}

function toggleRec() {
  if(!vidStream){alert('Activez la caméra live.');return;}
  if(isRecording){
    mediaRec.stop();isRecording=false;document.getElementById('btn-vrec').textContent='⏺ Rec';
  } else {
    recChunks=[];
    mediaRec=new MediaRecorder(vidStream);
    mediaRec.ondataavailable=e=>{if(e.data.size>0)recChunks.push(e.data);};
    mediaRec.onstop=()=>{
      const blob=new Blob(recChunks,{type:'video/webm'});
      const player=document.getElementById('vid-el'); const vcanvas=document.getElementById('vid-canvas');
      player.srcObject=null; player.src=URL.createObjectURL(blob);
      player.onloadedmetadata=()=>{
        vcanvas.width=player.videoWidth; vcanvas.height=player.videoHeight;
        document.getElementById('vid-info').textContent=`Enreg. · ${player.duration.toFixed(1)}s`;
        setupVidCanvas(player,vcanvas);
      };
    };
    mediaRec.start();isRecording=true;document.getElementById('btn-vrec').textContent='⏹ Stop';
  }
}

function toggleVAutoDetect(){
  vAutoDetect=!vAutoDetect;
  document.getElementById('btn-vauto').textContent='Auto : '+(vAutoDetect?'ON':'OFF');
  document.getElementById('btn-vauto').className=vAutoDetect?'btn btn-green':'btn';
}

// ══════════════════════════════════════════════════════
// CAPTURE FRAME VIDEO
// ══════════════════════════════════════════════════════
function captureFrame() {
  const player=document.getElementById('vid-el');
  const vcanvas=document.getElementById('vid-canvas');
  const view=TESTS[currentTestId]?.view||'face';
  // Créer snapshot
  const tmp=document.createElement('canvas');
  tmp.width=vcanvas.width; tmp.height=vcanvas.height;
  const ctx=tmp.getContext('2d');
  ctx.drawImage(player,0,0,vcanvas.width,vcanvas.height);
  drawOverlay(ctx,tmp,vidMarkers,-1,view);
  const dataUrl=tmp.toDataURL('image/jpeg',0.88);

  // Calculer angles D et G
  const mkrD=vidMarkers.filter(m=>m.side==='D');
  const mkrG=vidMarkers.filter(m=>m.side==='G');
  const rawD=calcAngle3(mkrD), rawG=calcAngle3(mkrG);
  const angD=mkrD.length>=3?computeCorrectedAngle(rawD,'D',view,TESTS[currentTestId]?.type||'',mkrD):null;
  const angG=mkrG.length>=3?computeCorrectedAngle(rawG,'G',view,TESTS[currentTestId]?.type||'',mkrG):null;

  capturedFrames.push({
    time:player.currentTime||0, dataUrl, angD, angG,
    markers:JSON.parse(JSON.stringify(vidMarkers))
  });
  renderFrameStrip(); updateResults();
}

function deleteFrame(i) {
  capturedFrames.splice(i,1);
  if(selectedFrameIdx>=capturedFrames.length) selectedFrameIdx=capturedFrames.length-1;
  renderFrameStrip(); updateResults();
}
function resetAllFrames() {
  if(!confirm('Effacer toutes les frames ?')) return;
  capturedFrames=[]; selectedFrameIdx=-1; renderFrameStrip(); updateResults();
}
function selectFrame(i) {
  selectedFrameIdx=i;
  vidMarkers=JSON.parse(JSON.stringify(capturedFrames[i].markers));
  renderMkrList(); renderFrameStrip(); updateResults();
}
function renderFrameStrip() {
  document.getElementById('frame-count').textContent=capturedFrames.length;
  document.getElementById('frames-strip').innerHTML=capturedFrames.map((f,i)=>`
    <div class="fthumb ${selectedFrameIdx===i?'sel':''}">
      <img src="${f.dataUrl}" onclick="selectFrame(${i})" style="cursor:pointer;"/>
      <button class="ft-del" onclick="event.stopPropagation();deleteFrame(${i})">✕</button>
      <div class="ft-info">${f.time.toFixed(2)}s${f.angD!==null?' D:'+f.angD.toFixed(1)+'°':''}${f.angG!==null?' G:'+f.angG.toFixed(1)+'°':''}</div>
    </div>`).join('');
}

// ══════════════════════════════════════════════════════
// DÉTECTION & DESSIN
// ══════════════════════════════════════════════════════
function canvasXY(e, canvas) {
  const rect=canvas.getBoundingClientRect();
  return {x:(e.clientX-rect.left)*canvas.width/rect.width, y:(e.clientY-rect.top)*canvas.height/rect.height};
}

function findMarkerAt(x, y, markers, cw) {
  const r=Math.max(14,cw/40);
  for(let i=markers.length-1;i>=0;i--){
    const m=markers[i]; if(m.x===null)continue;
    if(Math.hypot(m.x-x,m.y-y)<r) return i;
  }
  return -1;
}

// Détection automatique des marqueurs réfléchissants
function detectMarkersAuto(ctx, canvas, markers, view, cb) {
  // Placement automatique intelligent selon le type de test
  const W=canvas.width, H=canvas.height;
  const testId = currentTestId || '';
  const markersType = TESTS[testId]?.markers || '';

  // ─── KFPPA (vue face) : lignes verticales EIAS→Rotule→Tarse
  // Vue face : côté D de la personne = gauche de l'image, côté G = droite
  if(markersType === 'genou-bi') {
    const midX = W / 2;
    // Côté D : ligne verticale à gauche de l'image (x ~25% de W)
    const xD = W * 0.25;
    const xG = W * 0.75;
    // EIAS en haut (y ~20%), Rotule au centre (y ~50%), Tarse en bas (y ~80%)
    const yTop = H * 0.20, yMid = H * 0.50, yBot = H * 0.80;

    const placed = { D: [{x:xD,y:yTop},{x:xD,y:yMid},{x:xD,y:yBot}],
                     G: [{x:xG,y:yTop},{x:xG,y:yMid},{x:xG,y:yBot}] };
    ['D','G'].forEach(side => {
      const mkrs = markers.filter(m=>m.side===side);
      placed[side].forEach((pos,i) => {
        // Ne placer que si pas encore placé manuellement
        if(mkrs[i] && mkrs[i].x===null) { mkrs[i].x=pos.x; mkrs[i].y=pos.y; }
      });
    });
    if(cb) cb(); return;
  }

  // ─── MLA (vue profil) : angle à sommet supérieur FMHp - TN - CAp
  // Ordre dans le template : CAp, TN, FMHp
  // FMHp à gauche, TN au sommet (haut centre), CAp à droite
  if(markersType === 'mla') {
    const fmhp = markers.find(m=>m.name.startsWith('FMHp')||m.name==='FMHp');
    const tn   = markers.find(m=>m.name.startsWith('TN')||m.name==='TN');
    const cap  = markers.find(m=>m.name.startsWith('CAp')||m.name==='CAp');
    if(fmhp && tn && cap) {
      if(fmhp.x===null){fmhp.x=W*0.20;fmhp.y=H*0.65;}
      if(tn.x===null){tn.x=W*0.50;tn.y=H*0.30;}
      if(cap.x===null){cap.x=W*0.80;cap.y=H*0.65;}
    }
    if(cb) cb(); return;
  }

  // ─── AP-BI (vue dos) : lignes verticales point1→4
  // Vue dos : côté D = droite image, côté G = gauche image
  // Point 1 (Milieu mollet) en haut, point 4 (Calca inf) en bas
  if(markersType === 'ap-bi') {
    const xD = W * 0.70; // droite image = côté D personne (vue dos)
    const xG = W * 0.30; // gauche image = côté G personne (vue dos)
    const yStep = H * 0.20;
    const yStart = H * 0.20;

    ['D','G'].forEach(side => {
      const xPos = side==='D' ? xD : xG;
      const mkrs = markers.filter(m=>m.side===side);
      // Ne placer que si pas encore placé manuellement
      mkrs.forEach((m,i) => { if(m.x===null) { m.x = xPos; m.y = yStart + i * yStep; } });
    });
    if(cb) cb(); return;
  }

  // ─── Détection visuelle générique (blobs lumineux)
  const data=ctx.getImageData(0,0,W,H).data;
  const blobs=[]; const vis=new Uint8Array(W*H);
  for(let y=2;y<H-2;y+=2){
    for(let x=2;x<W-2;x+=2){
      const i=(y*W+x)*4;
      const br=(data[i]+data[i+1]+data[i+2])/3;
      const sat=Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2]);
      if(br>sensThr&&sat<45&&!vis[y*W+x]){
        let sx=0,sy2=0,cnt=0;const stack=[[x,y]];
        while(stack.length&&cnt<800){
          const[cx,cy]=stack.pop();
          if(cx<0||cy<0||cx>=W||cy>=H||vis[cy*W+cx])continue;
          const pi=(cy*W+cx)*4;
          const pb=(data[pi]+data[pi+1]+data[pi+2])/3;
          const ps=Math.max(data[pi],data[pi+1],data[pi+2])-Math.min(data[pi],data[pi+1],data[pi+2]);
          if(pb<sensThr-35||ps>55){vis[cy*W+cx]=1;continue;}
          vis[cy*W+cx]=1;sx+=cx;sy2+=cy;cnt++;
          stack.push([cx+2,cy],[cx-2,cy],[cx,cy+2],[cx,cy-2]);
        }
        if(cnt>3&&cnt<4000) blobs.push({x:sx/cnt,y:sy2/cnt,s:cnt});
      }
    }
  }

  const midX=W/2;
  if(view==='face'||view==='dos') {
    const blobsLeft=blobs.filter(b=>b.x<midX).sort((a,b2)=>a.y-b2.y);
    const blobsRight=blobs.filter(b=>b.x>=midX).sort((a,b2)=>a.y-b2.y);
    // Vue dos : D=droite image / Vue face : D=gauche image
    const blobsD = view==='dos' ? blobsRight : blobsLeft;
    const blobsG = view==='dos' ? blobsLeft  : blobsRight;
    const unplacedD=markers.filter(m=>m.side==='D'&&m.x===null);
    const unplacedG=markers.filter(m=>m.side==='G'&&m.x===null);
    blobsD.slice(0,unplacedD.length).forEach((b,i)=>{if(unplacedD[i]){unplacedD[i].x=b.x;unplacedD[i].y=b.y;}});
    blobsG.slice(0,unplacedG.length).forEach((b,i)=>{if(unplacedG[i]){unplacedG[i].x=b.x;unplacedG[i].y=b.y;}});
  } else {
    blobs.sort((a,b)=>a.y-b.y);
    const unplaced=markers.filter(m=>m.x===null);
    blobs.slice(0,unplaced.length).forEach((b,i)=>{if(unplaced[i]){unplaced[i].x=b.x;unplaced[i].y=b.y;}});
  }
  if(cb) cb();
}

// Dessin overlay avec SEGMENTS RECTANGULAIRES (style OPS)
function drawOverlay(ctx, canvas, markers, selIdx, view) {
  const W=canvas.width;
  const segW=Math.max(8,W/55); // largeur du rectangle segment

  // Dessiner segments par groupe (D et G)
  ['D','G',''].forEach(side=>{
    const grp=markers.filter(m=>m.side===side&&m.x!==null);
    if(grp.length<2) return;
    const col=side==='D'?'rgba(74,158,255,0.7)':side==='G'?'rgba(62,207,114,0.7)':'rgba(167,139,250,0.7)';
    // Dessiner rectangle entre chaque paire consécutive
    for(let i=0;i<grp.length-1;i++){
      drawSegmentRect(ctx,grp[i],grp[i+1],segW,col);
    }
  });

  // Points marqueurs
  markers.forEach((m,i)=>{
    if(m.x===null) return;
    const r=Math.max(6,W/72);
    const isSel=selIdx===i;
    ctx.save();
    ctx.beginPath(); ctx.arc(m.x,m.y,r+4,0,2*Math.PI);
    ctx.fillStyle=isSel?'rgba(245,166,35,.3)':'rgba(255,255,255,.15)'; ctx.fill();
    ctx.beginPath(); ctx.arc(m.x,m.y,r,0,2*Math.PI);
    ctx.fillStyle=m.color; ctx.fill();
    ctx.strokeStyle=isSel?'#f5a623':'#fff'; ctx.lineWidth=isSel?2.5:1.5; ctx.stroke();
    ctx.restore();
    ctx.fillStyle='#fff'; ctx.font=`bold ${Math.max(9,W/60)}px DM Sans,sans-serif`;
    ctx.fillText(m.name,m.x+r+3,m.y+3);
  });

  // Arc d'angle pour chaque groupe de 3
  ['D','G',''].forEach(side=>{
    const grp=markers.filter(m=>m.side===side&&m.x!==null);
    if(grp.length>=3){
      const ang=calcAngle3(grp);
      if(ang!==null){
        const B=grp.length>=4?grp[2]:grp[1]; // AP: sommet=CalcaSup(idx2), sinon centre
        const grpPts=grp;
        const _mlaT=TESTS[currentTestId]?.markers==='mla'?'mla':(TESTS[currentTestId]?.type||"");
        const corrAng=computeCorrectedAngle(ang, side, view, _mlaT, grpPts);
        const r2=Math.max(16,W/24);
        const a1=Math.atan2(grp[0].y-B.y,grp[0].x-B.x),a2=Math.atan2(grp[2].y-B.y,grp[2].x-B.x);
        const col=side==='D'?'#4a9eff':side==='G'?'#3ecf72':'#FFD700';
        ctx.save(); ctx.beginPath(); ctx.arc(B.x,B.y,r2,a1,a2,false);
        ctx.strokeStyle=col; ctx.lineWidth=2.5; ctx.stroke(); ctx.restore();
        ctx.fillStyle=col; ctx.font=`bold 13px DM Mono,monospace`;
        ctx.fillText(corrAng.toFixed(1)+'°',B.x+r2+4,B.y-3);
      }
    }
  });
}

// Dessiner un segment rectangulaire entre 2 points (style OPS)
function drawSegmentRect(ctx, p1, p2, w, color) {
  const dx=p2.x-p1.x, dy=p2.y-p1.y;
  const len=Math.sqrt(dx*dx+dy*dy);
  if(len<1) return;
  const nx=-dy/len*w/2, ny=dx/len*w/2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(p1.x+nx,p1.y+ny);
  ctx.lineTo(p2.x+nx,p2.y+ny);
  ctx.lineTo(p2.x-nx,p2.y-ny);
  ctx.lineTo(p1.x-nx,p1.y-ny);
  ctx.closePath();
  ctx.fillStyle=color; ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=1; ctx.stroke();
  ctx.restore();
}

// Overlay d'angles en haut à droite
function updateAngleOverlay(elId, markers, view) {
  const el=document.getElementById(elId); if(!el) return;
  let html='';
  ['D','G'].forEach(side=>{
    const grp=markers.filter(m=>m.side===side&&m.x!==null);
    if(grp.length>=3){
      const ang=calcAngle3(grp);
      if(ang!==null){
        const corr=computeCorrectedAngle(ang, side, view, TESTS[currentTestId]?.type||"");
        const clr=side==='D'?'blue':'';
        html+=`<span class="angle-tag ${clr}" style="${side==='G'?'border-color:#3ecf72;color:#3ecf72;':''}">${side}: ${corr.toFixed(1)}°</span>`;
      }
    }
  });
  // Si marqueurs sans side
  const grpNone=markers.filter(m=>m.side===''&&m.x!==null);
  if(grpNone.length>=3){
    const ang=calcAngle3(grpNone);
    if(ang!==null){
      const corr=computeCorrectedAngle(ang, '', view, TESTS[currentTestId]?.type||"");
      html+=`<span class="angle-tag">${corr.toFixed(1)}°</span>`;
    }
  }
  el.innerHTML=html;
}

// ══════════════════════════════════════════════════════
// CALCULS GÉOMÉTRIQUES
// ══════════════════════════════════════════════════════
function calcAngle3(pts) {
  const placed=pts.filter(p=>p.x!==null);
  if(placed.length<3) return null;
  const [A,B,C] = placed.length>=4 ? [placed[1],placed[2],placed[3]] : placed;
  const v1={x:A.x-B.x,y:A.y-B.y},v2={x:C.x-B.x,y:C.y-B.y};
  const dot=v1.x*v2.x+v1.y*v2.y;
  const mag=Math.sqrt((v1.x**2+v1.y**2)*(v2.x**2+v2.y**2));
  return mag===0?null:Math.acos(Math.max(-1,Math.min(1,dot/mag)))*180/Math.PI;
}

// Détecte si l'angle des points AP s'ouvre à droite (+) ou à gauche (-)
// Couleur spécifique KFPPA : <20%=rouge, 20-60%=orange, 60-140%=vert, 140-180%=orange, >180%=rouge
function clrKfppa(pct) {
  if(pct==null||isNaN(pct)) return 'var(--mut)';
  const p=Math.abs(pct)*100;
  if(p<20||p>180) return 'var(--red)';
  if(p<60||p>140) return 'var(--orange)';
  return 'var(--green)';
}

// Détecter valgus/varus pour KFPPA
// Vue face : genou D pointe droite = valgus(+), gauche = varus(-)
// Vue face : genou G pointe droite = varus(-), gauche = valgus(+)
function kfppaLabel(ang, side) {
  if(ang==null) return '—';
  const deg = Math.abs(ang).toFixed(1)+'°';
  // Convention incl : valeur positive = valgus pour les 2 côtés
  return ang>=0 ? 'Valgus +'+deg : 'Varus −'+deg;
}

function calcAngleSign(pts) {
  const placed=pts.filter(p=>p.x!==null);
  if(placed.length<2) return 1;
  if(placed.length>=3) {
    // Point central (Rotule pour KFPPA, CalcaSup pour AP)
    // Détecter si le point central est à droite ou gauche de la ligne top→bot
    const top=placed[0];   // EIAS ou Milieu mollet
    const mid=placed[1];   // Rotule ou Jonction musculo-tend.
    const bot=placed[placed.length-1]; // Tarse ou CalcaInf
    // Position de mid par rapport à la ligne top→bot
    // Produit vectoriel : (bot-top) × (mid-top)
    // En coordonnées écran (y vers le bas), cross>0 = mid à droite
    const cross=(bot.x-top.x)*(mid.y-top.y)-(bot.y-top.y)*(mid.x-top.x);
    return cross<0?1:-1; // cross<0 en écran = point à droite
  }
  const top=placed[0];
  const bot=placed[placed.length-1];
  return bot.x>top.x?1:-1;
}

// Calculer l'angle corrigé selon le contexte
// MLA: angle aigu brut (pas de correction)
// KFPPA: 180 - angle (valgum=+, varum=-)
// Arrière-pied: angle brut avec signe (inversion=+, éversion=-)
function computeCorrectedAngle(rawAng, side, view, testType, pts) {
  if(rawAng===null) return null;
  if(testType==='mla') return rawAng;
  const incl = 180 - rawAng;
  // KFPPA : utiliser incl (180-rawAng) sans correction de signe latéral
  if(testType==='kfppa') return incl;
  // Vue dos : utiliser le cross product pour détecter le sens réel
  // cross > 0 = calca penche à droite
  // Pied D : droite = inversion(+), gauche = éversion(-)
  // Pied G : droite = éversion(-), gauche = inversion(+)
  if(view==='dos' && pts) {
    const sign = calcAngleSign(pts);
    // calcAngleSign: +1 = calca penche à gauche, -1 = calca penche à droite
    // Pied D : penche droite(-1) = inversion(+), penche gauche(+1) = éversion(-)
    // Pied G : penche gauche(+1) = inversion(+), penche droite(-1) = éversion(-)
    if(side==='D') return -sign * incl; // D: droite(-1)=Inv(+) → inverser signe
    if(side==='G') return sign * incl;  // G: gauche(+1)=Inv(+) → même signe
    return incl;
  }
  if(view==='dos' && side==='G') return -incl;
  // Vue face (KFPPA) : genou D pointe droite=valgus(+), genou G pointe droite=varus(-)
  if(view==='face' && pts) {
    const sign=calcAngleSign(pts);
    if(side==='D') return sign*incl;
    if(side==='G') return -sign*incl;
  }
  return incl;
}

function getAngleColor(ang) {
  if(ang===null) return '#FFD700';
  return '#FFD700'; // Surcharge par le résultat si besoin
}

// ══════════════════════════════════════════════════════
// CALCULS BILATÉRAUX & RÉSULTATS
// ══════════════════════════════════════════════════════
function calcBilateral(markers, view, side) {
  const grp = markers.filter(m=>m.side===side&&m.x!==null);
  const ang = calcAngle3(grp);
  return computeCorrectedAngle(ang, side, view, TESTS[currentTestId]?.type||'', TESTS[currentTestId]?.type||"");
}

function updateResults() {
  const t=TESTS[currentTestId]; if(!t) return;
  const el=document.getElementById('cap-results'); if(!el) return;
  const view=t.view||'face';
  let html='';

  if(t.mode==='video') {
    // KFPPA : 2 frames nécessaires
    if(t.div!==undefined) {
      const pBip=photoSlots[0], pUniG=photoSlots[1], pUniD=photoSlots[2];
      const _ti=(v)=>v==null?null:(v>90?180-v:v);
      const bipD=_ti(pBip?.angleD), bipG=_ti(pBip?.angleG);
      const uniD=_ti(pUniD?.angle), uniG=_ti(pUniG?.angle);
      const angD=(uniD!=null&&bipD!=null)?uniD-bipD:null;
      const angG=(uniG!=null&&bipG!=null)?uniG-bipG:null;
      // Pour KFPPA, angD>0 = valgus dynamique (genou plus incliné en dynamique)
      const pctD=angD!=null?angD/t.div:null;
      const pctG=angG!=null?angG/t.div:null;
      if(angD!=null||angG!=null||pBip?.dataUrl||pUniG?.dataUrl||pUniD?.dataUrl){
        html=`<div class="res-side">
          <div class="res-side-card">
            <div class="rs-title" style="color:#4a9eff;">Genou Droit</div>
            <div style="font-size:9px;color:var(--mut);margin-top:4px;">Bipodal: <b>${kfppaLabel(bipD,'D')}</b> <span style="font-size:8px;">(Norme: 0°)</span></div>
            <div style="font-size:9px;color:var(--mut);">Unipodal: <b>${kfppaLabel(uniD,'D')}</b> <span style="font-size:8px;">(N: ${t.normeMin}°–${t.normeMax}° valgus)</span></div>
            <div style="font-size:10px;color:var(--mut);margin-top:4px;">Valgus dyn.: <b>${kfppaLabel(angD,'D')}</b> <span style="font-size:8px;">(N: ${t.normeMin}°–${t.normeMax}° = 60–140%)</span></div>
            <div class="rs-pct" style="color:${clrKfppa(pctD)};">${pctD!=null?Math.round(Math.abs(pctD)*100)+'%':'—'}</div>
          </div>
          <div class="res-side-card">
            <div class="rs-title" style="color:#3ecf72;">Genou Gauche</div>
            <div style="font-size:9px;color:var(--mut);margin-top:4px;">Bipodal: <b>${kfppaLabel(bipG,'G')}</b> <span style="font-size:8px;">(Norme: 0°)</span></div>
            <div style="font-size:9px;color:var(--mut);">Unipodal: <b>${kfppaLabel(uniG,'G')}</b> <span style="font-size:8px;">(N: ${t.normeMin}°–${t.normeMax}° valgus)</span></div>
            <div style="font-size:10px;color:var(--mut);margin-top:4px;">Valgus dyn.: <b>${kfppaLabel(angG,'G')}</b> <span style="font-size:8px;">(N: ${t.normeMin}°–${t.normeMax}° = 60–140%)</span></div>
            <div class="rs-pct" style="color:${clrKfppa(pctG)};">${pctG!=null?Math.round(Math.abs(pctG)*100)+'%':'—'}</div>
          </div>
        </div>`;
      } else {
        const angDlive=calcBilateral(vidMarkers,view,'D');
        const angGlive=calcBilateral(vidMarkers,view,'G');
        html=`<div class="res-side">${quickAngleCard('D',angDlive)}${quickAngleCard('G',angGlive)}</div>
          <div style="font-size:10px;color:var(--orange);margin-top:6px;">Capturez 3 photos : Bipodal · Unipodal G · Unipodal D</div>`;
      }
    }
    // Amorti/Propulsion : 3 frames
    else if(t.normAm!==undefined) {
      // Calculé via photoSlots ci-dessous
    }
  }
  // Résultats Mobilité/Verrouillage en mode video (photoSlots)
  if(t.mode==='video' && t.showPhotoSlots) {
    if(t.mlaTest) {
      // MLA : angle brut (pas 180-angle)
      const sD=photoSlots.filter(s=>s.side==='D');
      const sG=photoSlots.filter(s=>s.side==='G');
      const propD=sD[0]?.angle, ecrD=sD[1]?.angle;
      const propG=sG[0]?.angle, ecrG=sG[1]?.angle;
      const deltaD=(propD!=null&&ecrD!=null)?(ecrD-propD):null;
      const deltaG=(propG!=null&&ecrG!=null)?(ecrG-propG):null;
      const pctD=deltaD!=null?deltaD/t.normDiv:null;
      const pctG=deltaG!=null?deltaG/t.normDiv:null;
      const propNorm=t.propNorm, ecrNorm=t.ecrNorm, normDiv=t.normDiv;
      const hasAny=propD!=null||ecrD!=null||propG!=null||ecrG!=null;
      if(hasAny){
        html=`<div class="res-side">
          <div class="res-side-card">
            <div class="rs-title" style="color:#4a9eff;">Pied Droit</div>
            <div style="font-size:9px;color:var(--mut);margin-top:4px;">Att/Prop: <b>${propD!=null?propD.toFixed(1)+'°':'—'}</b> <span style="font-size:8px;">(Norme: ${propNorm}°)</span></div>
            <div style="font-size:9px;color:var(--mut);">Écrasement: <b>${ecrD!=null?ecrD.toFixed(1)+'°':'—'}</b> <span style="font-size:8px;">(Norme: ${ecrNorm}°)</span></div>
            <div style="font-size:10px;color:var(--mut);margin-top:4px;">Fonction amortisseur MLA: <b>${deltaD!=null?deltaD.toFixed(1)+'°':'—'}</b> <span style="font-size:8px;">(Norme: ${normDiv}°=100%)</span></div>
            <div class="rs-pct" style="color:${pctD!=null?clrGen(Math.abs(pctD)):'var(--mut)'};">${pctD!=null?Math.round(Math.abs(pctD)*100)+'%':'—'}</div>
          </div>
          <div class="res-side-card">
            <div class="rs-title" style="color:#3ecf72;">Pied Gauche</div>
            <div style="font-size:9px;color:var(--mut);margin-top:4px;">Att/Prop: <b>${propG!=null?propG.toFixed(1)+'°':'—'}</b> <span style="font-size:8px;">(Norme: ${propNorm}°)</span></div>
            <div style="font-size:9px;color:var(--mut);">Écrasement: <b>${ecrG!=null?ecrG.toFixed(1)+'°':'—'}</b> <span style="font-size:8px;">(Norme: ${ecrNorm}°)</span></div>
            <div style="font-size:10px;color:var(--mut);margin-top:4px;">Fonction amortisseur MLA: <b>${deltaG!=null?deltaG.toFixed(1)+'°':'—'}</b> <span style="font-size:8px;">(Norme: ${normDiv}°=100%)</span></div>
            <div class="rs-pct" style="color:${pctG!=null?clrGen(Math.abs(pctG)):'var(--mut)'};">${pctG!=null?Math.round(Math.abs(pctG)*100)+'%':'—'}</div>
          </div>
        </div>`;
      } else {
        html=`<div style="font-size:10px;color:var(--orange);text-align:center;padding:8px;">Capturez les 4 photos MLA</div>`;
      }
      el.innerHTML=html||el.innerHTML; return;
    } else if(t.normAm!==undefined) {
      const sD=photoSlots.filter(s=>s.side==='D');
      const sG=photoSlots.filter(s=>s.side==='G');
      const talD=sD[0]?.angle,planD=sD[1]?.angle,digD=sD[2]?.angle;
      const talG=sG[0]?.angle,planG=sG[1]?.angle,digG=sG[2]?.angle;
      const hasAny=talD!=null||planD!=null||digD!=null||talG!=null||planG!=null||digG!=null;
      if(hasAny){
        const amD=talD!=null&&planD!=null?Math.abs(talD-planD)/t.normAm:null;
        const prD=digD!=null&&planD!=null?Math.abs(digD-planD)/t.normAm:null;
        const amG=talG!=null&&planG!=null?Math.abs(talG-planG)/t.normAm:null;
        const prG=digG!=null&&planG!=null?Math.abs(digG-planG)/t.normAm:null;
        html=`<div class="res-side">
          ${amProCard('D',amD,prD,t.normAm,talD,planD,digD)}
          ${amProCard('G',amG,prG,t.normAm,talG,planG,digG)}
        </div>`;
      } else {
        html=`<div style="font-size:10px;color:var(--orange);text-align:center;padding:8px;">Capturez les 6 photos : Tal·Plan·Dig × D+G</div>`;
      }
      el.innerHTML=html||el.innerHTML; return;
    } else if(t.normVerrou!==undefined) {
      const sD=photoSlots.filter(s=>s.side==='D'),sG=photoSlots.filter(s=>s.side==='G');
      const statD=sD[0]?.angle,pointeD=sD[1]?.angle,statG=sG[0]?.angle,pointeG=sG[1]?.angle;
      const apV=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
      if(statD!=null||pointeD!=null||statG!=null||pointeG!=null){
        const rfD=pointeD!=null?pointeD/t.normVerrou:null;
        const molD=(pointeD!=null&&statD!=null)?(pointeD-statD)/t.normVerrou:null;
        const rfG=pointeG!=null?pointeG/t.normVerrou:null;
        const molG=(pointeG!=null&&statG!=null)?(pointeG-statG)/t.normVerrou:null;
        const rfDdeg3=pointeD!=null?Math.abs(pointeD).toFixed(1)+'°':'—';
        const rfGdeg3=pointeG!=null?Math.abs(pointeG).toFixed(1)+'°':'—';
        const molDdeg3=(pointeD!=null&&statD!=null)?Math.abs(pointeD-statD).toFixed(1)+'°':'—';
        const molGdeg3=(pointeG!=null&&statG!=null)?Math.abs(pointeG-statG).toFixed(1)+'°':'—';
        html=`<div class="res-side">
          <div class="res-side-card">
            <div class="rs-title" style="color:#4a9eff;">Pied Droit</div>
            <div style="font-size:9px;color:var(--mut);">Statique: <b>${apV(statD)}</b> <span style="font-size:8px;">(Norme: 0°)</span></div>
            <div style="font-size:9px;color:var(--mut);">Pointe: <b>${apV(pointeD)}</b> <span style="font-size:8px;">(Norme: Inv +10°)</span></div>
            <div style="font-size:10px;color:var(--mut);margin-top:4px;">Verrouillage RF: <b>${rfDdeg3}</b> <span style="font-size:8px;">(Norme: 10°=100%)</span></div>
            <div class="rs-pct" style="color:${rfD!=null?clrGen(Math.abs(rfD)):'var(--mut)'};">  ${rfD!=null?Math.round(Math.abs(rfD)*100)+'%':'—'}</div>
            <div style="font-size:10px;color:var(--mut);">Force mollet: <b>${molDdeg3}</b> <span style="font-size:8px;">(Norme: 10°=100%)</span></div>
            <div class="rs-pct" style="color:${molD!=null?clrGen(Math.abs(molD)):'var(--mut)'};">  ${molD!=null?Math.round(Math.abs(molD)*100)+'%':'—'}</div>
          </div>
          <div class="res-side-card">
            <div class="rs-title" style="color:#3ecf72;">Pied Gauche</div>
            <div style="font-size:9px;color:var(--mut);">Statique: <b>${apV(statG)}</b> <span style="font-size:8px;">(Norme: 0°)</span></div>
            <div style="font-size:9px;color:var(--mut);">Pointe: <b>${apV(pointeG)}</b> <span style="font-size:8px;">(Norme: Inv +10°)</span></div>
            <div style="font-size:10px;color:var(--mut);margin-top:4px;">Verrouillage RF: <b>${rfGdeg3}</b> <span style="font-size:8px;">(Norme: 10°=100%)</span></div>
            <div class="rs-pct" style="color:${rfG!=null?clrGen(Math.abs(rfG)):'var(--mut)'};">  ${rfG!=null?Math.round(Math.abs(rfG)*100)+'%':'—'}</div>
            <div style="font-size:10px;color:var(--mut);">Force mollet: <b>${molGdeg3}</b> <span style="font-size:8px;">(Norme: 10°=100%)</span></div>
            <div class="rs-pct" style="color:${molG!=null?clrGen(Math.abs(molG)):'var(--mut)'};">  ${molG!=null?Math.round(Math.abs(molG)*100)+'%':'—'}</div>
          </div>
        </div>`;
      } else html=`<div style="font-size:10px;color:var(--mut);text-align:center;padding:8px;">Capturez les 4 photos</div>`;
    } else if(t.mobiliteAP) {
      const p0=photoSlots[0],p1=photoSlots[1];
      const invD=p0?.angleD,evD=p1?.angleD,invG=p0?.angleG,evG=p1?.angleG;
      if(invD!=null||evD!=null||invG!=null||evG!=null){
        // Mobilité = (Inversion - Éversion) / norme
        // Inv=+ Ev=- donc (Inv - Ev) = Inv + |Ev| si Ev<0, ou Inv - Ev si Ev>0 (pas d'éversion)
        const mobD=(invD!=null&&evD!=null)?(invD-evD)/t.normMob:null;
        const mobG=(invG!=null&&evG!=null)?(invG-evG)/t.normMob:null;
        const mobDdeg2=mobD!=null?(invD-evD).toFixed(1)+'°':'—';
        const mobGdeg2=mobG!=null?(invG-evG).toFixed(1)+'°':'—';
        const apV3=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
        html=`<div class="res-side"><div class="res-side-card"><div class="rs-title" style="color:#4a9eff;">Pied Droit</div><div style="font-size:9px;color:var(--mut);">Inversion: <b>${apV3(invD)}</b> <span style="font-size:8px;">(Norme: Inv +20°)</span></div><div style="font-size:9px;color:var(--mut);">Éversion: <b>${apV3(evD)}</b> <span style="font-size:8px;">(Norme: Év −10°)</span></div><div style="font-size:10px;color:var(--mut);margin-top:4px;">Mobilité: <b>${mobDdeg2}</b> <span style="font-size:8px;">(Norme: 30°=100%)</span></div><div class="rs-pct" style="color:${mobD!=null?clrGen(Math.abs(mobD)):'var(--mut)'};">${mobD!=null?Math.round(Math.abs(mobD)*100)+'%':'—'}</div></div><div class="res-side-card"><div class="rs-title" style="color:#3ecf72;">Pied Gauche</div><div style="font-size:9px;color:var(--mut);">Inversion: <b>${apV3(invG)}</b> <span style="font-size:8px;">(Norme: Inv +20°)</span></div><div style="font-size:9px;color:var(--mut);">Éversion: <b>${apV3(evG)}</b> <span style="font-size:8px;">(Norme: Év −10°)</span></div><div style="font-size:10px;color:var(--mut);margin-top:4px;">Mobilité: <b>${mobGdeg2}</b> <span style="font-size:8px;">(Norme: 30°=100%)</span></div><div class="rs-pct" style="color:${mobG!=null?clrGen(Math.abs(mobG)):'var(--mut)'};">${mobG!=null?Math.round(Math.abs(mobG)*100)+'%':'—'}</div></div></div>`;
      } else html=`<div style="font-size:10px;color:var(--mut);text-align:center;padding:8px;">Capturez les 2 photos</div>`;
    }
    el.innerHTML=html||el.innerHTML;
    return;
  }
  // Mode photo
  if(t.normDiv!==undefined) {
    // MLA - angle brut (pas 180-valeur), calcul = écrasement - propulsion
    const slotsD=photoSlots.filter(s=>s.side==='D');
    const slotsG=photoSlots.filter(s=>s.side==='G');
    const propD=slotsD[0]?.angle,ecrD=slotsD[1]?.angle;
    const propG=slotsG[0]?.angle,ecrG=slotsG[1]?.angle;
    // deltaD = écrasement - propulsion (doit être positif = arche s'aplatit)
    const deltaD=(propD!=null&&ecrD!=null)?(ecrD-propD):null;
    const deltaG=(propG!=null&&ecrG!=null)?(ecrG-propG):null;
    const pctD=deltaD!==null?deltaD/t.normDiv:null;
    const pctG=deltaG!==null?deltaG/t.normDiv:null;
    html=`<div class="res-side">
      ${mlaCard('D',propD,ecrD,deltaD,pctD,t.normDiv)}
      ${mlaCard('G',propG,ecrG,deltaG,pctG,t.normDiv)}
    </div>`;
  } else if(t.normVerrou!==undefined) {
    // Verrouillage: 4 photos (statD, statG, pointeD, pointeG)
    const slotsD = photoSlots.filter(s=>s.side==='D');
    const slotsG = photoSlots.filter(s=>s.side==='G');
    const statD=slotsD[0]?.angle, pointeD=slotsD[1]?.angle;
    const statG=slotsG[0]?.angle, pointeG=slotsG[1]?.angle;
    // Calcul par pied: RF = pointe/10 ; Mollet = (pointe-stat)/10
    const rfD=pointeD!=null?pointeD/10:null, molD=(pointeD!=null&&statD!=null)?(pointeD-statD)/10:null;
    const rfG=pointeG!=null?pointeG/10:null, molG=(pointeG!=null&&statG!=null)?(pointeG-statG)/10:null;
    const apVv=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
    const rfDdeg=pointeD!=null?Math.abs(pointeD).toFixed(1)+'°':'—';
    const rfGdeg=pointeG!=null?Math.abs(pointeG).toFixed(1)+'°':'—';
    const molDdeg2=(pointeD!=null&&statD!=null)?Math.abs(pointeD-statD).toFixed(1)+'°':'—';
    const molGdeg2=(pointeG!=null&&statG!=null)?Math.abs(pointeG-statG).toFixed(1)+'°':'—';
    html=`<div class="res-side">
      <div class="res-side-card">
        <div class="rs-title" style="color:#4a9eff;">Pied Droit</div>
        <div style="font-size:9px;color:var(--mut);">Statique: <b>${apVv(statD)}</b> <span style="font-size:8px;">(Norme: 0°)</span></div>
        <div style="font-size:9px;color:var(--mut);">Pointe: <b>${apVv(pointeD)}</b> <span style="font-size:8px;">(Norme: Inv +10°)</span></div>
        <div style="font-size:10px;color:var(--mut);margin-top:4px;">Verrouillage RF: <b>${rfDdeg}</b> <span style="font-size:8px;">(Norme: 10°=100%)</span></div>
        <div class="rs-pct" style="color:${rfD!=null?clrGen(Math.abs(rfD)):'var(--mut)'};">  ${rfD!=null?Math.round(Math.abs(rfD)*100)+'%':'—'}</div>
        <div style="font-size:10px;color:var(--mut);">Force mollet: <b>${molDdeg2}</b> <span style="font-size:8px;">(Norme: 10°=100%)</span></div>
        <div class="rs-pct" style="color:${molD!=null?clrGen(Math.abs(molD)):'var(--mut)'};">  ${molD!=null?Math.round(Math.abs(molD)*100)+'%':'—'}</div>
      </div>
      <div class="res-side-card">
        <div class="rs-title" style="color:#3ecf72;">Pied Gauche</div>
        <div style="font-size:9px;color:var(--mut);">Statique: <b>${apVv(statG)}</b> <span style="font-size:8px;">(Norme: 0°)</span></div>
        <div style="font-size:9px;color:var(--mut);">Pointe: <b>${apVv(pointeG)}</b> <span style="font-size:8px;">(Norme: Inv +10°)</span></div>
        <div style="font-size:10px;color:var(--mut);margin-top:4px;">Verrouillage RF: <b>${rfGdeg}</b> <span style="font-size:8px;">(Norme: 10°=100%)</span></div>
        <div class="rs-pct" style="color:${rfG!=null?clrGen(Math.abs(rfG)):'var(--mut)'};">  ${rfG!=null?Math.round(Math.abs(rfG)*100)+'%':'—'}</div>
        <div style="font-size:10px;color:var(--mut);">Force mollet: <b>${molGdeg2}</b> <span style="font-size:8px;">(Norme: 10°=100%)</span></div>
        <div class="rs-pct" style="color:${molG!=null?clrGen(Math.abs(molG)):'var(--mut)'};">  ${molG!=null?Math.round(Math.abs(molG)*100)+'%':'—'}</div>
      </div>
    </div>`;
  } else if(t.normMob!==undefined) {
    // Mobilité AP : résultats D et G séparés
    const p0=photoSlots[0], p1=photoSlots[1];
    const invD=p0?.angleD, evD=p1?.angleD;
    const invG=p0?.angleG, evG=p1?.angleG;
    const hasD=invD!=null&&evD!=null, hasG=invG!=null&&evG!=null;
    if(hasD||hasG){
      const mobD=hasD?(invD-evD)/t.normMob:null;
      const mobG=hasG?(invG-evG)/t.normMob:null;
      const mobDdeg=hasD?(invD-evD).toFixed(1)+'°':'—';
      const mobGdeg=hasG?(invG-evG).toFixed(1)+'°':'—';
      const apV2=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
      html=`<div class="res-side">
        <div class="res-side-card">
          <div class="rs-title" style="color:#4a9eff;">Pied Droit</div>
          <div style="font-size:9px;color:var(--mut);margin-top:4px;">Inversion: <b>${apV2(invD)}</b> <span style="font-size:8px;">(Norme: Inv +20°)</span></div>
          <div style="font-size:9px;color:var(--mut);">Éversion: <b>${apV2(evD)}</b> <span style="font-size:8px;">(Norme: Év −10°)</span></div>
          <div style="font-size:10px;color:var(--mut);margin-top:4px;">Mobilité: <b>${mobDdeg}</b> <span style="font-size:8px;">(Norme: 30°=100%)</span></div>
          <div class="rs-pct" style="color:${mobD!=null?clrGen(Math.abs(mobD)):'var(--mut)'};">${mobD!=null?Math.round(Math.abs(mobD)*100)+'%':'—'}</div>
        </div>
        <div class="res-side-card">
          <div class="rs-title" style="color:#3ecf72;">Pied Gauche</div>
          <div style="font-size:9px;color:var(--mut);margin-top:4px;">Inversion: <b>${apV2(invG)}</b> <span style="font-size:8px;">(Norme: Inv +20°)</span></div>
          <div style="font-size:9px;color:var(--mut);">Éversion: <b>${apV2(evG)}</b> <span style="font-size:8px;">(Norme: Év −10°)</span></div>
          <div style="font-size:10px;color:var(--mut);margin-top:4px;">Mobilité: <b>${mobGdeg}</b> <span style="font-size:8px;">(Norme: 30°=100%)</span></div>
          <div class="rs-pct" style="color:${mobG!=null?clrGen(Math.abs(mobG)):'var(--mut)'};">${mobG!=null?Math.round(Math.abs(mobG)*100)+'%':'—'}</div>
        </div>
      </div>`;
    } else html=`<div style="font-size:10px;color:var(--mut);text-align:center;padding:8px;">Capturez les 2 photos (inversion + éversion)</div>`;
  }
  el.innerHTML = html || `<div style="font-size:10px;color:var(--mut);text-align:center;padding:8px;">Placez les marqueurs</div>`;
}

function sideResultCard(side, angDelta, pct, type, nMin, nMax, div) {
  const c=side==='D'?'#4a9eff':'#3ecf72';
  // Verrouillage AP
  if(t.normVerrou!==undefined){
    const photos=data.photos||[];
    const ph=photos.filter(p=>p.side===side);
    const stat=ph[0]?.angle, pointe=ph[1]?.angle;
    ang=pointe; pct=pointe!=null?pointe/t.normVerrou:null;
    const mol=(pointe!=null&&stat!=null)?(pointe-stat)/t.normVerrou:null;
    const apVv=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
    const cssVv=rp_cssColor(pct,false);
    const r2v=35,cv=2*Math.PI*r2v,fv=pct!=null?cv*Math.min(100,Math.max(0,Math.abs(pct)*100))/100:0;
    return `<div class="rp-side-block rp-side-${side}">
      <div class="rp-side-title">${side==='D'?'Côté Droit':'Côté Gauche'}</div>
      <div class="rp-gauge-photos">
        <div class="rp-gauge"><svg width="90" height="90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${r2v}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
          ${pct!=null?`<circle cx="40" cy="40" r="${r2v}" fill="none" stroke="${cssVv}" stroke-width="8" stroke-dasharray="${fv} ${cv}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
        </svg><div class="rp-gauge-inner">
          <div class="rp-gauge-pct" style="color:${cssVv};">${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'}</div>
          <div class="rp-gauge-deg">${ang!=null?Number(ang).toFixed(1)+'°':'—'}</div>
        </div></div>
        ${buildPrintPhotos(data,side,t)}
      </div>
      <div style="font-size:9px;margin-top:4px;">Stat: ${apVv(stat)} (N:0°) · Pointe: ${apVv(pointe)} (N:Inv+10°)</div>
      <div style="font-size:9px;">RF: ${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'} · Mollet: ${mol!=null?Math.round(Math.abs(mol)*100)+'%':'—'} (N:10°=100%)</div>
      <div style="text-align:center;margin-top:4px;">
        ${pct!=null?`<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;background:${Math.abs(pct)*100>=66?'#d4edda':Math.abs(pct)*100>=33?'#fff3cd':'#f8d7da'};color:${Math.abs(pct)*100>=66?'#155724':Math.abs(pct)*100>=33?'#856404':'#721c24'};">${Math.abs(pct)*100>=66?'Normal':Math.abs(pct)*100>=33?'Limite':'Hors norme'}</span>`:''}
        <div style="font-size:8px;color:#888;margin-top:3px;">Norme : Statique 0° · Pointe Inv+10° · RF 10°=100%</div>
      </div>
    </div>`;
  }
  // Mobilité AP
  if(t.normMob!==undefined){
    const photos=data.photos||[];
    const p0=photos[0], p1=photos[1];
    const invA=side==='D'?p0?.angleD:p0?.angleG;
    const evA=side==='D'?p1?.angleD:p1?.angleG;
    ang=(invA!=null&&evA!=null)?invA-evA:null;
    pct=ang!=null?ang/t.normMob:null;
    const apVm=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
    const cssM=rp_cssColor(pct,false);
    const r2m=35,cm=2*Math.PI*r2m,fm=pct!=null?cm*Math.min(100,Math.max(0,Math.abs(pct)*100))/100:0;
    return `<div class="rp-side-block rp-side-${side}">
      <div class="rp-side-title">${side==='D'?'Côté Droit':'Côté Gauche'}</div>
      <div class="rp-gauge-photos">
        <div class="rp-gauge"><svg width="90" height="90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${r2m}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
          ${pct!=null?`<circle cx="40" cy="40" r="${r2m}" fill="none" stroke="${cssM}" stroke-width="8" stroke-dasharray="${fm} ${cm}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
        </svg><div class="rp-gauge-inner">
          <div class="rp-gauge-pct" style="color:${cssM};">${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'}</div>
          <div class="rp-gauge-deg">${ang!=null?Number(ang).toFixed(1)+'°':'—'}</div>
        </div></div>
        ${buildPrintPhotos(data,'',t)}
      </div>
      <div style="font-size:9px;margin-top:4px;">Inv: ${apVm(invA)} (N:+20°) · Év: ${apVm(evA)} (N:−10°)</div>
      <div style="font-size:9px;">Mobilité: ${ang!=null?ang.toFixed(1)+'°':'—'} — ${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'} (N:30°=100%)</div>
      <div style="text-align:center;margin-top:4px;">
        ${pct!=null?`<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;background:${Math.abs(pct)*100>=66?'#d4edda':Math.abs(pct)*100>=33?'#fff3cd':'#f8d7da'};color:${Math.abs(pct)*100>=66?'#155724':Math.abs(pct)*100>=33?'#856404':'#721c24'};">${Math.abs(pct)*100>=66?'Normal':Math.abs(pct)*100>=33?'Limite':'Hors norme'}</span>`:''}
        <div style="font-size:8px;color:#888;margin-top:3px;">Norme : Inv +20° · Év −10° · Mobilité 30°=100%</div>
      </div>
    </div>`;
  }
  const pctVal=pct!==null?Math.round(pct*100):null;
  const clr=pct!==null?clrGenou(pct):'var(--mut)';
  return `<div class="res-side-card">
    <div class="rs-title" style="color:${c};">Genou ${side}</div>
    <div class="rs-val" style="color:${clr};">${angDelta!==null?angDelta.toFixed(1)+'°':'—'}</div>
    <div class="rs-pct" style="color:${clr};">${pctVal!==null?pctVal+'%':'—'}</div>
    ${pct!==null?badgeGenou(pct):'<span class="badge bd">—</span>'}
  </div>`;
}

function quickAngleCard(side, ang) {
  const c=side==='D'?'#4a9eff':'#3ecf72';
  return `<div class="res-side-card">
    <div class="rs-title" style="color:${c};">Côté ${side}</div>
    <div class="rs-val">${ang!==null?ang.toFixed(1)+'°':'—'}</div>
  </div>`;
}

function amProCard(side, am, pr, norm, a0, a1, a2) {
  const cl=side==='D'?'#4a9eff':'#3ecf72';
  const cAm=am!==null?clrGen(Math.abs(am)):'var(--mut)';
  const cPr=pr!==null?clrGen(Math.abs(pr)):'var(--mut)';
  const apV=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
  const isMarche=norm===8;
  const nTal=isMarche?'Norme: Inv +2°':'Norme: Inv +4°';
  const nPlan=isMarche?'Norme: Év −6°':'Norme: Év −8°';
  const nDig=isMarche?'Norme: Inv +2°':'Norme: Inv +4°';
  const nAm=isMarche?'Norme: 8° = 100%':'Norme: 12° = 100%';
  const nPr=isMarche?'Norme: 8° = 100%':'Norme: 12° = 100%';
  const amDeg=am!==null?(am*norm).toFixed(1)+'°':'—';
  const prDeg=pr!==null?(pr*norm).toFixed(1)+'°':'—';
  return `<div class="res-side-card">
    <div class="rs-title" style="color:${cl};">Pied ${side}</div>
    <div style="font-size:9px;color:var(--mut);margin-top:4px;">🦶 Taligrade: <b>${apV(a0)}</b> <span style="color:var(--mut);font-size:8px;">(${nTal})</span></div>
    <div style="font-size:9px;color:var(--mut);">🦶 Plantigrade: <b>${apV(a1)}</b> <span style="color:var(--mut);font-size:8px;">(${nPlan})</span></div>
    <div style="font-size:9px;color:var(--mut);">🦶 Digitigrade: <b>${apV(a2)}</b> <span style="color:var(--mut);font-size:8px;">(${nDig})</span></div>
    <div style="font-size:10px;color:var(--mut);margin-top:6px;">Amorti: <b>${amDeg}</b> <span style="font-size:8px;">(${nAm})</span></div>
    <div class="rs-pct" style="color:${cAm};">${am!==null?Math.round(Math.abs(am)*100)+'%':'—'}</div>
    <div style="font-size:10px;color:var(--mut);margin-top:3px;">Propulsion: <b>${prDeg}</b> <span style="font-size:8px;">(${nPr})</span></div>
    <div class="rs-pct" style="color:${cPr};">${pr!==null?Math.round(Math.abs(pr)*100)+'%':'—'}</div>
  </div>`;
}

function mlaCard(side, prop, ecr, delta, pct, norm) {
  const c=side==='D'?'#4a9eff':'#3ecf72';
  const clr=pct!==null?clrGen(pct):'var(--mut)';
  return `<div class="res-side-card">
    <div class="rs-title" style="color:${c};">Pied ${side}</div>
    <div style="font-size:9px;color:var(--mut);">Propulsion: ${prop!=null?prop.toFixed(1)+'°':'—'}</div>
    <div style="font-size:9px;color:var(--mut);">Écrasement: ${ecr!=null?ecr.toFixed(1)+'°':'—'}</div>
    <div style="font-size:10px;color:var(--mut);margin-top:3px;">Δ Écr−Prop: <span style="font-weight:700;color:${clr};">${delta!=null?delta.toFixed(1)+'°':'—'}</span></div>
    <div class="rs-pct" style="color:${clr};">${pct!==null?Math.round(pct*100)+'%':'—'}</div>
    ${pct!==null?badgeGen(pct):''}
  </div>`;
}

// ══════════════════════════════════════════════════════
// COULEURS & BADGES
// ══════════════════════════════════════════════════════
function clrGenou(p){if(isNaN(p)||p===null)return'var(--mut)';const v=p*100;if(v>=80&&v<=120)return'var(--green)';if(v>=50&&v<=150)return'var(--orange)';return'var(--red)';}
function clrGen(p){if(isNaN(p)||p===null)return'var(--mut)';const v=p*100;if(v>=66)return'var(--green)';if(v>=33)return'var(--orange)';return'var(--red)';}
function badgeGenou(p){if(p===null)return'<span class="badge bd">—</span>';const v=p*100;if(v>=80&&v<=120)return'<span class="badge bg">Normal</span>';if(v>=50&&v<=150)return'<span class="badge bo">Limite</span>';return'<span class="badge br">Hors norme</span>';}
function badgeGen(p){if(p===null)return'<span class="badge bd">—</span>';const v=p*100;if(v>=66)return'<span class="badge bg">Normal</span>';if(v>=33)return'<span class="badge bo">Limite</span>';return'<span class="badge br">Hors norme</span>';}

// ══════════════════════════════════════════════════════
// VALIDER & SAUVEGARDER
// ══════════════════════════════════════════════════════
function validateAndSave() {
  if(!currentPatient||!currentTestId){alert('Patient ou test manquant.');return;}
  const t=TESTS[currentTestId];
  const view=t.view||'face';
  let result={photos:[],frames:[],date:new Date().toLocaleString('fr-FR')};

  if(t.mode==='video'){
    result.frames=capturedFrames.map(f=>({time:f.time,angD:f.angD,angG:f.angG,dataUrl:f.dataUrl}));
    // Pour les tests video avec encadrés photos (Mobilité, Verrouillage, MLA, Amorti)
    if(t.showPhotoSlots && photoSlots.length) {
      result.photos=photoSlots.map(s=>({label:s.label,side:s.side,dataUrl:s.dataUrl,angle:s.angle,angleD:s.angleD,angleG:s.angleG}));
    }
    if(t.div!==undefined){
      // KFPPA : calcul depuis photoSlots (unipodalD et unipodalG vs bipodale)
      const slotsD=photoSlots.filter(s=>s.side==='D');
      const slotsG=photoSlots.filter(s=>s.side==='G');
      const bipodal=photoSlots.find(s=>s.side==='');
      const uniD=slotsD[0]; const uniG=slotsG[0];
      // KFPPA = angle unipodal - angle bipodal
      if(bipodal?.angle!=null && uniD?.angle!=null){
        result.deltaD=uniD.angle-bipodal.angle;
        result.pctD=result.deltaD/t.div;
      }
      if(bipodal?.angle!=null && uniG?.angle!=null){
        result.deltaG=uniG.angle-bipodal.angle;
        result.pctG=result.deltaG/t.div;
      }
      // Fallback sur capturedFrames
      if(result.deltaD==null && capturedFrames.length>=2){
        const f0=capturedFrames[0],f1=capturedFrames[1];
        result.deltaD=f1.angD!=null&&f0.angD!=null?f1.angD-f0.angD:null;
        result.deltaG=f1.angG!=null&&f0.angG!=null?f1.angG-f0.angG:null;
        result.pctD=result.deltaD!=null?result.deltaD/t.div:null;
        result.pctG=result.deltaG!=null?result.deltaG/t.div:null;
      }
    }
    if(t.normAm!==undefined){
      // Amorti : lire depuis photoSlots (TalG,TalD,PlanG,PlanD,DigG,DigD)
      const sD=photoSlots.filter(s=>s.side==='D');
      const sG=photoSlots.filter(s=>s.side==='G');
      const talD=sD[0]?.angle, planD=sD[1]?.angle, digD=sD[2]?.angle;
      const talG=sG[0]?.angle, planG=sG[1]?.angle, digG=sG[2]?.angle;
      if(talD!=null||planD!=null||digD!=null){
        result.amD=talD!=null&&planD!=null?Math.abs(talD-planD)/t.normAm:null;
        result.prD=digD!=null&&planD!=null?Math.abs(digD-planD)/t.normAm:null;
        result.phases={...result.phases||{}, D:{tal:talD,plan:planD,dig:digD}};
      }
      if(talG!=null||planG!=null||digG!=null){
        result.amG=talG!=null&&planG!=null?Math.abs(talG-planG)/t.normAm:null;
        result.prG=digG!=null&&planG!=null?Math.abs(digG-planG)/t.normAm:null;
        result.phases={...result.phases||{}, G:{tal:talG,plan:planG,dig:digG}};
      }
    }
  } else {
    result.photos=photoSlots.map(s=>({label:s.label,side:s.side,dataUrl:s.dataUrl,angle:s.angle,angleD:s.angleD,angleG:s.angleG}));
    if(t.normDiv!==undefined){
      const sD=result.photos.filter(s=>s.side==='D');
      const sG=result.photos.filter(s=>s.side==='G');
      const propD=sD[0]?.angle, ecrD=sD[1]?.angle;
      const propG=sG[0]?.angle, ecrG=sG[1]?.angle;
      // MLA: delta = écrasement - propulsion (angle brut, pas 180-valeur)
      if(propD!=null&&ecrD!=null){result.deltaD=ecrD-propD;result.pctD=result.deltaD/t.normDiv;}
      if(propG!=null&&ecrG!=null){result.deltaG=ecrG-propG;result.pctG=result.deltaG/t.normDiv;}
    }
    if(t.normVerrou!==undefined){
      // 4 photos: statD(0), statG(1), pointeD(2), pointeG(3)
      const photosD=result.photos.filter(p=>p.side==='D');
      const photosG=result.photos.filter(p=>p.side==='G');
      const statD=photosD[0]?.angle, pointeD=photosD[1]?.angle;
      const statG=photosG[0]?.angle, pointeG=photosG[1]?.angle;
      if(pointeD!=null){result.rfPctD=pointeD/10;if(statD!=null)result.molPctD=(pointeD-statD)/10;}
      if(pointeG!=null){result.rfPctG=pointeG/10;if(statG!=null)result.molPctG=(pointeG-statG)/10;}
      // Garder compatibilité
      result.rfPct=result.rfPctD; result.molPct=result.molPctD;
    }
    if(t.normMob!==undefined){
      const inv=result.photos[0]?.angle,ev=result.photos[1]?.angle;
      if(inv!=null&&ev!=null) result.mobPct=(Math.abs(inv)+Math.abs(ev))/t.normMob;
    }
  }

  if(!currentPatient.mesures) currentPatient.mesures={};
  currentPatient.mesures[currentTestId]=result;
  syncOpenedBilanToHistory();
  savePatients();
  alert(`✓ Sauvegardé : "${t.name}" pour ${currentPatient.prenom} ${currentPatient.nom}`);
  nav('pg-sport');
}

// ══════════════════════════════════════════════════════
// RAPPORT (aperçu)
// ══════════════════════════════════════════════════════

function printRapportPosturo() {
  const content = document.getElementById('rapport-posturo-body')?.innerHTML;
  if(!content) return;
  // Créer un iframe caché pour imprimer
  let iframe = document.getElementById('print-iframe');
  if(iframe) iframe.remove();
  iframe = document.createElement('iframe');
  iframe.id = 'print-iframe';
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Rapport Postural</title>
    <style>
      *{box-sizing:border-box;}
      body{font-family:Arial,sans-serif;font-size:11px;color:#222;background:#fff;margin:15mm 15mm 15mm 15mm;}
      /* Header */
      .rp-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:10px;border-bottom:3px solid #2a7a4e;}
      .rp-logo{height:50px;object-fit:contain;}
      .rp-prat{font-size:10px;color:#555;line-height:1.6;text-align:right;}
      .rp-prat-name{font-size:12px;font-weight:700;color:#222;}
      /* Titre rapport */
      .rp-title{font-size:16px;font-weight:700;color:#2a7a4e;text-align:center;margin-bottom:4px;}
      .rp-subtitle{font-size:10px;color:#888;text-align:center;margin-bottom:14px;}
      /* Info patient */
      .rp-pt-info{background:#f9f5ee;border:1px solid #e8d9b5;border-radius:8px;padding:10px 14px;margin-bottom:20px;font-size:10px;color:#555;}
      .rp-pt-name{font-size:14px;font-weight:700;color:#222;margin-bottom:4px;}
      /* Sections */
      .rp-section{margin-bottom:12px;border-radius:6px;overflow:hidden;border:1px solid #ddd;page-break-inside:avoid;}
      .rp-section-title{padding:6px 12px;color:#fff;font-weight:700;font-size:11px;letter-spacing:0.5px;}
      .rp-section-body{padding:8px 12px;}
      /* Lignes */
      .rp-item{display:flex;border-bottom:1px solid #f0f0f0;padding:6px 0;align-items:baseline;}
      .rp-item:last-child{border-bottom:none;}
      .rp-item-label{font-weight:700;color:#444;min-width:200px;width:200px;flex-shrink:0;font-size:10px;padding-right:12px;}
      .rp-item-value{color:#222;font-size:10px;flex:1;}
      .rp-section-body{padding:10px 14px;}
      .rp-section-title{padding:6px 12px;color:#fff;font-weight:700;font-size:11px;}
      .rp-section{margin-bottom:12px;border-radius:6px;overflow:hidden;border:1px solid #ddd;page-break-inside:avoid;}
      .rp-patient{background:#f9f5ee;border:1px solid #e8d9b5;border-radius:8px;padding:10px 14px;margin-bottom:20px;font-size:10px;}
      .rp-patient-name{font-size:14px;font-weight:700;color:#222;margin-bottom:6px;}
      /* Bonhommes */
      img{max-width:100%;height:auto;}
      /* Pied de page */
      .rp-footer{text-align:center;font-size:9px;color:#aaa;margin-top:20px;padding-top:8px;border-top:1px solid #eee;}
      /* Print */
      @media print{
        body{margin:10mm;}
        .rp-section{page-break-inside:avoid;}
        .no-print{display:none!important;}
        *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      }
    </style>
  </head><body>${content}    <div class="mm-sub" id="mm-sub"></div>
    <div id="mm-modules"></div>
    <button class="mm-btn-ok" id="mm-btn-ok" onclick="confirmerModules()">Continuer vers le paiement →</button>
    <button class="mm-btn-cancel" onclick="document.getElementById('modal-modules').style.display='none'">Annuler</button>
  </div>
</div>



<div id="modal-modules" style="display:none;">
  <div class="mm-box">
    <div class="mm-title" id="mm-title">Choisissez vos modules</div>

</body></html>`);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 800);
}

function buildRapportPosturo() {
  const p = currentPatient;
  if(!p) return;
  const d = p.bilanDataPosturo || {};
  const prat = praticiens.find(pr => pr.id == p.pratId) || {};
  const logo = document.getElementById('imgjs-logo-sciopraxi')?.src || '';

    let bodyHtml = `<style>\n    *{margin:0;padding:0;box-sizing:border-box;}\n    body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#1f2937;background:#fff;}\n    .rp-page{width:210mm;min-height:297mm;padding:0 0 15mm;margin:0 auto;}\n    @media print{.no-print{display:none!important;}.rp-page{padding:0;}}\n\n    /* HEADER */\n    .header{background:#0e1f38;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;margin-bottom:0;}\n    .logo{height:50px;object-fit:contain;}\n    .prat-info{text-align:right;font-size:9px;color:rgba(255,255,255,0.5);line-height:1.7;}\n    .prat-name{font-size:12px;font-weight:600;color:#fff;letter-spacing:0.3px;}\n\n    /* BAND */\n    .titre-rapport{background:#1a3a6e;padding:8px 24px;display:flex;justify-content:space-between;align-items:center;margin-bottom:0;}\n    .titre-rapport h1{font-size:9px;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:2px;text-transform:uppercase;}\n    .titre-rapport .sub{font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;}\n\n    /* PATIENT */\n    .patient-card{background:#f7f8fa;border-bottom:1px solid #eaeaea;padding:16px 24px;display:flex;align-items:center;gap:16px;margin-bottom:0;}\n    .patient-avatar{width:44px;height:44px;border-radius:50%;background:#0e1f38;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0;}\n    .patient-name{font-size:16px;font-weight:300;color:#0e1f38;letter-spacing:0.5px;}\n    .patient-details{font-size:10px;color:#6b7280;margin-top:3px;line-height:1.6;}\n    .patient-right{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;}\n    .pt-chip{font-size:9px;padding:2px 8px;border-radius:20px;background:#fff;border:1px solid #d1d5db;color:#374151;font-weight:500;}\n    .pt-chip-alert{background:#fef2f2;border-color:#fca5a5;color:#991b1b;}\n\n    /* METRICS */\n    .patient-metrics{display:flex;gap:8px;flex-shrink:0;}\n    .metric{background:#fff;border:1px solid #eaeaea;border-radius:6px;padding:8px 12px;text-align:center;min-width:52px;}\n    .metric-val{font-size:18px;font-weight:300;color:#0e1f38;line-height:1;}\n    .metric-lbl{font-size:8px;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;margin-top:2px;}\n\n    /* SECTIONS */\n    .section{margin:0;break-inside:avoid;padding:0 24px;}\n    .section-title{display:flex;align-items:center;gap:8px;padding:12px 0 8px;margin-top:16px;border-bottom:2px solid #0e1f38;}\n    .section-num{font-size:8px;font-weight:700;color:#fff;background:#0e1f38;width:18px;height:18px;border-radius:3px;display:flex;align-items:center;justify-content:center;flex-shrink:0;letter-spacing:0.5px;}\n    .section-label{font-size:10px;font-weight:700;color:#0e1f38;letter-spacing:2px;text-transform:uppercase;}\n    .section-line{flex:1;height:1px;background:#eaeaea;}\n    .section-body{padding:0;}\n\n    /* ROWS */\n    .item{display:flex;align-items:baseline;padding:7px 0;border-bottom:1px solid #f3f3f0;}\n    .item:last-child{border-bottom:none;}\n    .item-label{font-size:9px;font-weight:700;color:#9ca3af;min-width:180px;letter-spacing:0.5px;text-transform:uppercase;padding-top:1px;}\n    .item-value{flex:1;font-size:11px;color:#1f2937;line-height:1.4;}\n    .item-value-hl{flex:1;font-size:11px;color:#0e1f38;font-weight:600;line-height:1.4;}\n\n    /* TAGS */\n    .tag{display:inline-block;font-size:8px;padding:2px 7px;border-radius:3px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-right:3px;}\n    .tag-navy{background:#e8edf5;color:#0e1f38;}\n    .tag-ok{background:#ecfdf5;color:#065f46;}\n    .tag-warn{background:#fffbeb;color:#92400e;}\n    .tag-alert{background:#fef2f2;color:#991b1b;}\n\n    /* IMAGES */\n    .img-container{position:relative;text-align:center;}\n    .img-base{max-width:100%;border-radius:4px;}\n    .img-overlay{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;}\n\n    /* FOOTER */\n    .footer{background:#f7f8fa;border-top:2px solid #0e1f38;padding:10px 24px;display:flex;justify-content:space-between;align-items:center;margin-top:20px;}\n    .footer-brand{font-size:8px;font-weight:700;color:#0e1f38;letter-spacing:2px;text-transform:uppercase;}\n    .footer-info{font-size:8px;color:#9ca3af;letter-spacing:0.5px;}\n\n    .btn-print{position:fixed;bottom:20px;right:20px;background:#0e1f38;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;}\n  </style>`;
const sections = [];

  // 1. Anamnèse
  const anam = [];
  if(d.motif) anam.push(['Motif de consultation', d.motif]);
  if(d.activite) anam.push(['Activité physique', d.activite]);
  if(d.travail) anam.push(['Travail', d.travail]);
  if(d.atcd) anam.push(['Antécédents traumatiques', d.atcd]);
  if(d.appareillage) anam.push(['Appareillage', d.appareillage]);
  if(d.examens) anam.push(['Examens complémentaires', d.examens]);
  if(d.activiteQuot) anam.push(['Activité quotidienne', d.activiteQuot]);
  if(d.eva !== undefined && d.eva !== '') anam.push(['EVA Douleur', d.eva+'/10']);
  if(d.douleur) anam.push(['Douleur', d.douleur]);
  if(anam.length) sections.push({titre:'1. Anamnèse', items:anam, color:'#2a7a4e'});

  // 2. Morphostatique
  const morpho = [];
  if(d.comp1) morpho.push(['Compensation 1', d.comp1]);
  if(d.comp2) morpho.push(['Compensation 2', d.comp2]);
  if(d.comp3) morpho.push(['Compensation 3', d.comp3]);
  if(d.compCritique) morpho.push(['Point critique', d.compCritique]);
  if(d.prefMot) morpho.push(['Préférences motrices', d.prefMot]);
  if(d.rombergMorpho) morpho.push(['Romberg', d.rombergMorpho]);
  if(morpho.length) sections.push({titre:'2. Morphostatique', items:morpho, color:'#3498db'});

  // Silhouettes bonhommes: capturer chaque vue avec dessins
  if(d._bodyCanvas) {
    const bc = document.getElementById('posturo-body-canvas');
    const bcData = bc ? bc.toDataURL('image/png') : null;
    
    function makeComposite(imgEl, canvasData, w, h) {
      if(!imgEl) return null;
      try {
        const tmpC = document.createElement('canvas');
        tmpC.width = w || 300; tmpC.height = h || 500;
        const ctx = tmpC.getContext('2d');
        ctx.drawImage(imgEl, 0, 0, tmpC.width, tmpC.height);
        if(canvasData) {
          const img2 = new Image();
          img2.src = canvasData;
          ctx.drawImage(img2, 0, 0, tmpC.width, tmpC.height);
        }
        return tmpC.toDataURL('image/png');
      } catch(e) { return imgEl.src; }
    }
    
    const faceEl = document.getElementById('imgjs-morpho-face');
    const face2El = document.getElementById('imgjs-morpho-face2');
    const profilGEl = document.getElementById('imgjs-morpho-profilG');
    const profilDEl = document.getElementById('imgjs-morpho-profilD');
    const W = bc ? bc.width/4 : 300;
    const H = bc ? bc.height : 500;
    
    // Créer canvas partiel pour chaque vue (le canvas global est divisé en 4)
    function getCanvasSlice(canvasEl, sliceIdx, totalSlices) {
      if(!canvasEl) return null;
      try {
        const sliceW = canvasEl.width / totalSlices;
        const tmpC = document.createElement('canvas');
        tmpC.width = sliceW; tmpC.height = canvasEl.height;
        const ctx = tmpC.getContext('2d');
        ctx.drawImage(canvasEl, sliceIdx*sliceW, 0, sliceW, canvasEl.height, 0, 0, sliceW, canvasEl.height);
        return tmpC.toDataURL('image/png');
      } catch(e) { return null; }
    }
    
    const slice0 = getCanvasSlice(bc, 0, 4);
    const slice1 = getCanvasSlice(bc, 1, 4);
    const slice2 = getCanvasSlice(bc, 2, 4);
    const slice3 = getCanvasSlice(bc, 3, 4);
    
    function composite(imgEl, sliceData) {
      if(!imgEl) return null;
      try {
        const tmpC = document.createElement('canvas');
        tmpC.width = 300; tmpC.height = 500;
        const ctx = tmpC.getContext('2d');
        ctx.drawImage(imgEl, 0, 0, 300, 500);
        if(sliceData) {
          const img2 = new Image(); img2.src = sliceData;
          ctx.drawImage(img2, 0, 0, 300, 500);
        }
        return tmpC.toDataURL('image/png');
      } catch(e) { return imgEl?.src || null; }
    }
    
    // Utiliser d._bodyCanvas (données sauvegardées) pour découper en 4 vues
    function sliceDataUrl(dataUrl, sliceIdx, totalSlices) {
      if(!dataUrl) return null;
      try {
        const img = new Image();
        img.src = dataUrl;
        const tmp = document.createElement('canvas');
        const sw = Math.floor(img.naturalWidth / totalSlices) || 300;
        const sh = img.naturalHeight || 500;
        tmp.width = sw; tmp.height = sh;
        tmp.getContext('2d').drawImage(img, sliceIdx*sw, 0, sw, sh, 0, 0, sw, sh);
        return tmp.toDataURL('image/png');
      } catch(e) { return null; }
    }
    // Combiner image de fond + canvas dessins
    const imgIds = ['imgjs-morpho-profilD','imgjs-morpho-face2','imgjs-morpho-face','imgjs-morpho-profilG'];
    function compositeImgCanvas(imgId, canvasData, sliceIdx) {
      const imgEl = document.getElementById(imgId);
      if(!imgEl) return canvasData ? sliceDataUrl(canvasData, sliceIdx, 4) : null;
      try {
        const tmp = document.createElement('canvas');
        tmp.width = 300; tmp.height = 500;
        const ctx = tmp.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0,0,300,500);
        ctx.drawImage(imgEl, 0, 0, 300, 500);
        if(canvasData) {
          const cv2 = new Image(); cv2.src = canvasData;
          const sw = Math.floor((cv2.naturalWidth||1200)/4);
          const sh = cv2.naturalHeight||500;
          ctx.drawImage(cv2, sliceIdx*sw, 0, sw, sh, 0, 0, 300, 500);
        }
        return tmp.toDataURL('image/png');
      } catch(e) { return imgEl.src; }
    }
    {
      var bgIds3 = ['imgjs-morpho-profilG','imgjs-morpho-face2','imgjs-morpho-face','imgjs-morpho-profilD'];
      sections.push({titre:'2. Morphostatique — Silhouettes', color:'#3498db', type:'bonhommes',
        bodyCanvasData: d._bodyCanvas,
        bgIds: bgIds3,
        profilDImg: document.getElementById(bgIds3[0]) ? document.getElementById(bgIds3[0]).src : null,
        face2Img:   document.getElementById(bgIds3[1]) ? document.getElementById(bgIds3[1]).src : null,
        faceImg:    document.getElementById(bgIds3[2]) ? document.getElementById(bgIds3[2]).src : null,
        profilGImg: document.getElementById(bgIds3[3]) ? document.getElementById(bgIds3[3]).src : null
      });
    }
  }

  // 3. Bilan dynamique
  const dyn = [];
  if(d.bilanDyn) dyn.push(['Observations', d.bilanDyn]);
  if(d.course) dyn.push(['Examen de la course', d.course]);
  if(d.testFlexAnt) dyn.push(['Flexion antérieure', d.testFlexAnt+' cm']);
  if(d.flexDebout) dyn.push(['Flexion debout (Iliaque/pubis)', d.flexDebout]);
  if(d.flexAssis) dyn.push(['Flexion assis (Sacrum)', d.flexAssis]);
  if(d.testStab) dyn.push(['Stabilité arrière', d.testStab]);
  if(d.mobHanche==='oui') dyn.push(['Dysfonction hanche', '✓']);
  if(d.mobGenou==='oui') dyn.push(['Dysfonction genou', '✓']);
  if(d.mobPied==='oui') dyn.push(['Dysfonction pied', '✓']);
  if(d.mobBassin==='oui') dyn.push(['Dysfonction bassin', '✓']);
  if(d.tibiaFemur) dyn.push(['Tibia/fémur', d.tibiaFemur]);
  if(d.longMiDorsal) dyn.push(['Longueur MI dorsal', d.longMiDorsal]);
  if(d.branchesPub) dyn.push(['Branches pubiennes', d.branchesPub]);
  if(d.downing) dyn.push(['Downing test', d.downing]);
  if(d.longMiProc) dyn.push(['Longueur MI procubitus', d.longMiProc]);
  if(d.inegLong) dyn.push(['Inégalité longueur', d.inegLong]);
  if(d.inegType) dyn.push(['Type inégalité', d.inegType]);
  if(d.equilibre) dyn.push(['Équilibré', d.equilibre]);
  if(d.scoliose) dyn.push(['Scoliose', d.scoliose]);
  if(dyn.length) sections.push({titre:'3. Bilan dynamique', items:dyn, color:'#e74c3c'});

  // Images bonhommes

    // 4. Neuro-fonctionnel
  const neuro = [];
  if(d.neuro4) {
    const n = d.neuro4;

    // 1. Analyse posturale statique
    const aps = [];
    if(n['aps-epaule-g']) aps.push('Épaule G'); if(n['aps-epaule-d']) aps.push('Épaule D');
    if(n['aps-rot-g']) aps.push('Rot.épaule G'); if(n['aps-rot-d']) aps.push('Rot.épaule D');
    if(n['aps-coude-g']) aps.push('Flex.coude G'); if(n['aps-coude-d']) aps.push('Flex.coude D');
    if(n['aps-pron-g']) aps.push('Pron.poignet G'); if(n['aps-pron-d']) aps.push('Pron.poignet D');
    if(aps.length) neuro.push(['Analyse posturale statique', aps.join(', ')]);

    // 2. Critères de force
    const force = [];
    if(n['cf-ext-g']) force.push('Ext.poignet G'); if(n['cf-ext-d']) force.push('Ext.poignet D');
    if(n['cf-flex-g']) force.push('Flex.hanche G'); if(n['cf-flex-d']) force.push('Flex.hanche D');
    if(force.length) neuro.push(['Critères de force', force.join(', ')]);

    // 3. Analyse posturale dynamique
    const apd = [];
    if(n['apd-tronc-g']) apd.push('Pattern tronc G'); if(n['apd-tronc-d']) apd.push('Pattern tronc D');
    if(n['apd-cervelet-g']) apd.push('Pattern cervelet G'); if(n['apd-cervelet-d']) apd.push('Pattern cervelet D');
    if(n['apd-tete-g']) apd.push('Stab.tête G'); if(n['apd-tete-d']) apd.push('Stab.tête D');
    if(n['apd-membre-g']) apd.push('Membre sup G'); if(n['apd-membre-d']) apd.push('Membre sup D');
    if(apd.length) neuro.push(['Analyse posturale dynamique', apd.join(', ')]);

    // 4. Autres critères dynamiques
    const dynCrit = [];
    if(n['acd-flex-g']) dynCrit.push('Flex.poignet G'); if(n['acd-flex-d']) dynCrit.push('Flex.poignet D');
    if(n['acd-hyper-g']) dynCrit.push('Hyperext.genou G'); if(n['acd-hyper-d']) dynCrit.push('Hyperext.genou D');
    if(dynCrit.length) neuro.push(['Autres critères dynamiques', dynCrit.join(', ')]);

    // 5. Hypothèses
    if(n['po-hypo-tronc']) neuro.push(['Hypothèse', 'Tronc cérébral']);
    if(n['po-hypo-cervelet']) neuro.push(['Hypothèse', 'Cervelet']);

    // 6. Nerfs crâniens
    const ncPos = [];
    ['nc1','nc2','nc3','nc4','nc5','nc6','nc7','nc8','nc9','nc10','nc11','nc12'].forEach(nc => {
      if(n['nc-'+nc+'-g']) ncPos.push(nc.toUpperCase()+' G');
      if(n['nc-'+nc+'-d']) ncPos.push(nc.toUpperCase()+' D');
    });
    if(ncPos.length) neuro.push(['Nerfs crâniens', ncPos.join(', ')]);

    // 7. Vestibulaire (confluence)
    const vestNeuro = [];
    if(n['vest-ant-g']) vestNeuro.push('Antérieur G'); if(n['vest-ant-d']) vestNeuro.push('Antérieur D');
    if(n['vest-lat-g']) vestNeuro.push('Latéral G'); if(n['vest-lat-d']) vestNeuro.push('Latéral D');
    if(n['vest-post-g']) vestNeuro.push('Postérieur G'); if(n['vest-post-d']) vestNeuro.push('Postérieur D');
    if(vestNeuro.length) neuro.push(['Vestibulaire (confluence)', vestNeuro.join(', ')]);

    // 8. Vermis
    const vermis = [];
    if(n['vermis-sharp-g']) vermis.push('Sharp-Purser G'); if(n['vermis-sharp-d']) vermis.push('Sharp-Purser D');
    if(n['vermis-romberg-g']) vermis.push('Romberg 1 pied G'); if(n['vermis-romberg-d']) vermis.push('Romberg 1 pied D');
    if(vermis.length) neuro.push(['Vermis', vermis.join(', ')]);

    // 9. Proprio axe
    const axe = [];
    if(n['proprio-axe-tete']) axe.push('Tête');
    if(n['proprio-axe-corps']) axe.push('Corps');
    if(n['proprio-axe-bassin']) axe.push('Bassin');
    if(axe.length) neuro.push(['Proprio axe', axe.join(', ')]);

    // 10. Inter-hémisphérique
    const inter = [];
    if(n['inter-prec-g']) inter.push('Précision G'); if(n['inter-prec-d']) inter.push('Précision D');
    if(n['inter-coord-g']) inter.push('Coordination G'); if(n['inter-coord-d']) inter.push('Coordination D');
    if(inter.length) neuro.push(['Cervelet intermédiaire', inter.join(', ')]);

    // 11. Latéral cérébral
    const lat = [];
    if(n['lat-prec-g']) lat.push('Précision G'); if(n['lat-prec-d']) lat.push('Précision D');
    if(n['lat-coord-g']) lat.push('Coordination G'); if(n['lat-coord-d']) lat.push('Coordination D');
    if(lat.length) neuro.push(['Cervelet latéral', lat.join(', ')]);

    // 12. Proprioception
    const prop = [];
    if(n['prop-lent-g']) prop.push('FN lent G'); if(n['prop-lent-d']) prop.push('FN lent D');
    if(n['prop-rapide-g']) prop.push('FN rapide G'); if(n['prop-rapide-d']) prop.push('FN rapide D');
    if(n['prop-golgi-g']) prop.push('Golgi G'); if(n['prop-golgi-d']) prop.push('Golgi D');
    if(n['prop-paccini-g']) prop.push('Paccini G'); if(n['prop-paccini-d']) prop.push('Paccini D');
    if(n['prop-ruffini-d-g']) prop.push('Ruffini déc G'); if(n['prop-ruffini-d-d']) prop.push('Ruffini déc D');
    if(n['prop-ruffini-c-g']) prop.push('Ruffini comp G'); if(n['prop-ruffini-c-d']) prop.push('Ruffini comp D');
    if(n['prop-golgi-a-g']) prop.push('Golgi-A G'); if(n['prop-golgi-a-d']) prop.push('Golgi-A D');
    if(prop.length) neuro.push(['Proprioception', prop.join(', ')]);

    // 13. Réflexes archaïques
    const refls = [];
    ['ref-rpp','ref-rtp','ref-moro','ref-perez','ref-landau','ref-reptation'].forEach(r => {
      if(n[r+'-o']) refls.push(r.replace('ref-','').toUpperCase()+' O');
    });
    ['ref-rtac','ref-galant','ref-babinski','ref-plantaire','ref-palmaire','ref-babkin'].forEach(r => {
      if(n[r+'-g']) refls.push(r.replace('ref-','').toUpperCase()+' G');
      if(n[r+'-d']) refls.push(r.replace('ref-','').toUpperCase()+' D');
    });
    if(refls.length) neuro.push(['Réflexes archaïques', refls.join(', ')]);

    // 14. Récepteurs tactiles
    const rect = [];
    if(n['tact-merkel-g']) rect.push('Merkel G'); if(n['tact-merkel-d']) rect.push('Merkel D');
    if(n['tact-ruffini-g']) rect.push('Ruffini G'); if(n['tact-ruffini-d']) rect.push('Ruffini D');
    if(n['tact-pacini-g']) rect.push('Pacini G'); if(n['tact-pacini-d']) rect.push('Pacini D');
    if(n['tact-tnl-g']) rect.push('TNL G'); if(n['tact-tnl-d']) rect.push('TNL D');
    if(n['tact-meissner-g']) rect.push('Meissner G'); if(n['tact-meissner-d']) rect.push('Meissner D');
    if(n['tact-poils-g']) rect.push('Poils G'); if(n['tact-poils-d']) rect.push('Poils D');
    if(rect.length) neuro.push(['Récepteurs tactiles', rect.join(', ')]);
  }
    if(neuro.length) sections.push({titre:'4. Neuro-fonctionnel', items:neuro, color:'#8e44ad'});

  // 5. Système plantaire
  const plant = [];
  if(d.epines==='oui') plant.push(['Épines irritatives appui', 'Oui'+(d.epinesLoc?' — '+d.epinesLoc:'')]);
  else if(d.epines==='non') plant.push(['Épines irritatives', 'Non']);
  if(d.tactique) plant.push(['Tactique équilibration', d.tactique]);
  // Chaussure
  if(d.chaussureType) plant.push(['Type de chaussure', d.chaussureType]);
  const usures = [];
  if(d.usureInterne) usures.push('Interne');
  if(d.usureExterne) usures.push('Externe');
  if(d.usureContrefort) usures.push('Contrefort');
  if(usures.length) plant.push(['Usure chaussure', usures.join(', ')]);
  // Tests toniques
  const tests5 = [];
  if(d.testPouces) tests5.push('Pouces');
  if(d.testConvergence) tests5.push('Convergence');
  if(d.testScapulaire) tests5.push('Scapulaire');
  if(d.testNucale) tests5.push('Nucale');
  if(tests5.length) plant.push(['Tests toniques positifs', tests5.join(', ')]);
  // Parasites
  const parasites = [];
  if(d.paraPlantaire) parasites.push('Plantaire');
  if(d.paraYeux) parasites.push('Yeux');
  if(d.paraBuccale) parasites.push('Buccale');
  if(d.paraCicatrice) parasites.push('Cicatrice');
  if(d.paraVestibulaire) parasites.push('Vestibulaire');
  if(d.paraViscerale) parasites.push('Viscérale');
  if(parasites.length) plant.push(['Parasites détectés', parasites.join(', ')]);
  // Mono-appuis
  const monos = [];
  if(d.monoPiedG) monos.push('Pied G'); if(d.monoPiedD) monos.push('Pied D');
  if(d.monoGenouG) monos.push('Genou G'); if(d.monoGenouD) monos.push('Genou D');
  if(d.monoHancheG) monos.push('Hanche G'); if(d.monoHancheD) monos.push('Hanche D');
  if(monos.length) plant.push(['Mono-appui', monos.join(', ')]);
  if(plant.length) sections.push({titre:'5. Système plantaire', items:plant, color:'#f0a500'});

  // 6. Vestibulaire
  const vest = [];
  if(d.laterOui==='oui') {
    let latStr = (d.laterType||'');
    if(d.laterD) latStr += ' Droite'; else if(d.laterG) latStr += ' Gauche';
    vest.push(['Latéralisation', latStr]);
  }
  if(d.kleinRes) vest.push(['Test de DeKleyn', d.kleinRes]);
  if(d.ligamentsRes) vest.push(['Test ligaments', d.ligamentsRes]);
  if(d.rancurelRes) vest.push(['Test de Rancurel', d.rancurelRes]);
  if(d.headShaking) vest.push(['Head Shaking', d.headShaking]);
  if(d.headImpulse) vest.push(['Head Impulse', d.headImpulse]);
  if(d.babinski) vest.push(['Babinski-Weill', d.babinski]);
  if(d.unterburger) vest.push(['Unterburger', d.unterburger]);
  if(d.vertiges==='oui') vest.push(['Vertiges/nystagmus', 'Présents']);
  if(d.vppb==='oui') vest.push(['VPPB', 'Positif']);
  // CSC atteints
  const cscs = [];
  if(d.cscD) cscs.push('Latéral D'); if(d.cscG) cscs.push('Latéral G');
  if(d.cscAntD) cscs.push('Antérieur D'); if(d.cscAntG) cscs.push('Antérieur G');
  if(d.cscPostD) cscs.push('Postérieur D'); if(d.cscPostG) cscs.push('Postérieur G');
  if(cscs.length) vest.push(['CSC atteints', cscs.join(', ')]);
  if(d.clvf) vest.push(['CLVF', d.clvf]);
  if(d.pevs) vest.push(['PEVS', d.pevs]);
  if(d.semelleComp) vest.push(['Semelle compensation', d.semelleComp]);
  // Réorientation
  const reorVest = [];
  if(d.reorOrl) reorVest.push('ORL');
  if(d.reorKine) reorVest.push('Kiné');
  if(reorVest.length) vest.push(['Réorientation', reorVest.join(', ')]);
  if(vest.length) sections.push({titre:'6. Investigation vestibulaire', items:vest, color:'#8e44ad'});

  // 7. Buccal/Visuel
  const bucc = [];
  // Buccal
  if(d.mcpOuv==='oui') bucc.push(['MCP ouverture bouche', 'Améliorée (ATM secondaire)']);
  else if(d.mcpOuv==='non') bucc.push(['MCP ouverture bouche', 'Non améliorée']);
  if(d.serrage) {
    let serrageStr = d.serrage;
    if(d.serrage==='aggravation') {
      const aggr = [];
      if(d.aggrDents) aggr.push('Dents'); if(d.aggrAtm) aggr.push('ATM');
      if(aggr.length) serrageStr += ' ('+aggr.join(', ')+')';
    } else if(d.serrage==='amelioration') {
      const amel = [];
      if(d.amelioContact) amel.push('Contact'); if(d.amelioTension) amel.push('Tension');
      if(amel.length) serrageStr += ' ('+amel.join(', ')+')';
    }
    bucc.push(['Serrage', serrageStr]);
  }
  if(d.atmOrigine) bucc.push(['ATM origine', d.atmOrigine]);
  if(d.ouvMax) bucc.push(['Ouverture max', d.ouvMax]);
  if(d.deviation) bucc.push(['Déviation mandibulaire', d.deviation]);
  if(d.contractures) bucc.push(['Contractures', d.contractures]);
  if(d.douleurCaps) bucc.push(['Douleur capsulaire', d.douleurCaps]);
  if(d.ressaut==='oui') {
    let ressautStr = 'Présent';
    if(d.ressautDte) ressautStr += ' Droite'; if(d.ressautGauche) ressautStr += ' Gauche';
    bucc.push(['Ressaut ATM', ressautStr]);
  }
  const reorBuc = [];
  if(d.reorBucDentiste) reorBuc.push('Dentiste');
  if(d.reorBucOrtho) reorBuc.push('Orthodontiste');
  if(d.reorBucStomato) reorBuc.push('Stomatologue');
  if(d.reorBucKine) reorBuc.push('Kiné');
  if(reorBuc.length) bucc.push(['Réorientation buccale', reorBuc.join(', ')]);
  // Visuel
  if(d.visEntree) bucc.push(['Entrée visuelle', d.visEntree]);
  if(d.visLater==='oui') bucc.push(['Latéralisation visuelle', d.visLaterType||'Oui']);
  if(d.testAllongement) bucc.push(['Test allongement', d.testAllongement]);
  if(d.testRotNucale) bucc.push(['Test rotation nucale', d.testRotNucale]);
  const troubles = [];
  if(d.myopie) troubles.push('Myopie');
  if(d.hypermetropie) troubles.push('Hypermétropie');
  if(d.presbyte) troubles.push('Presbytie');
  if(d.astigmate) troubles.push('Astigmatisme');
  if(troubles.length) bucc.push(['Troubles visuels', troubles.join(', ')]);
  if(d.maddox) bucc.push(['Maddox', d.maddox]);
  if(d.coverTest) bucc.push(['Cover test', d.coverTest]);
  if(d.oeilDirect) bucc.push(['Œil directeur', d.oeilDirect]);
  const reorVis = [];
  if(d.reorVisOrthoptiste) reorVis.push('Orthoptiste');
  if(d.reorVisOphtalmo) reorVis.push('Ophtalmologue');
  if(d.reorVisOptom) reorVis.push('Optométriste');
  if(reorVis.length) bucc.push(['Réorientation visuelle', reorVis.join(', ')]);
  if(bucc.length) sections.push({titre:'7. Buccal / Visuel', items:bucc, color:'#2471a3'});

  // 8. Terrain/Synthèse
  const terr = [];
  const postures = [];
  if(d.postureAnt) postures.push('Antériorisation');
  if(d.posturePost) postures.push('Postériorisation');
  if(d.postureLater) postures.push('Latéralisation '+(d.postureLaterDir||''));
  if(postures.length) terr.push(['Posture globale', postures.join(', ')]);
  const chaines = [];
  if(d.chaineExt) chaines.push('Chaîne extension (PM)');
  if(d.chaineFlexion) chaines.push('Chaîne flexion (AM)');
  if(d.chaineFerm) chaines.push('Fermeture');
  if(d.chaineOuv) chaines.push('Ouverture');
  if(d.chaineStatOpt) chaines.push('Statique optimum');
  if(d.chaineStatDeg) chaines.push('Statique dégradée');
  if(chaines.length) terr.push(['Chaînes musculaires', chaines.join(', ')]);
  if(d.tensionPrincipal) terr.push(['Tension principale', d.tensionPrincipal]);
  if(d.biomecArticulaire) terr.push(['Biomécanique/Articulaire', d.biomecArticulaire]);
  if(terr.length) sections.push({titre:'8. Terrain du patient', items:terr, color:'#2a7a4e'});

  // Synthèse clinique (entre Terrain et Circuits)
  // 9. Traitements
  const trait = [];
  if(d.semellesDesc) trait.push(['Plan de semelles', d.semellesDesc]);
  // Circuits express — encadrés séparés par circuit
  const circLabels = ['Exercice 1','Exercice 2','Exercice 3','Exercice 4'];
  if(d._synthese && d._synthese.length > 0) {
    const synItems = [];
    d._synthese.forEach(function(s) {
      const titre = s.titre.replace(/^[^\w]+/,'');
      synItems.push([titre, s.items.join(' · ')]);
    });
    if(synItems.length) sections.push({titre:'8. Synthèse clinique', items:synItems, color:'#2a7a4e'});
  }

  ['c1','c2'].forEach(function(cx, ci) {
    const circItems = [];
    circLabels.forEach(function(lbl, i) {
      const key = cx+'_ex'+(i+1);
      const sys = (d['circ_'+key+'_sys']||[]).filter(Boolean);
      const sub = (d['circ_'+key+'_sub']||[]).filter(Boolean);
      const libre = d['circ_'+key] || '';
      if(sys.length || sub.length || libre) {
        let val = '';
        sys.forEach((s,j) => { if(s) val += s + (sub[j] ? ' → '+sub[j] : '') + ' | '; });
        if(libre) val += libre;
        circItems.push([lbl, val.replace(/\s*\|\s*$/,'')]);
      }
    });
    if(circItems.length) {
      sections.push({titre:'9. Circuit '+(ci+1), items:circItems, color:'#16a085'});
    }
  });
  if(d.materiaux && d.materiaux.length) trait.push(['Matériaux', d.materiaux.join(', ')]);
  if(d.recouvrement && d.recouvrement.length) trait.push(['Recouvrement', d.recouvrement.join(', ')]);
  const tests = [];
  const testLabels = ['Rotation nucale','Flexion antérieure','Extenseurs poignet','Stabilité monopodale','Force/stabilité arrière','Mobilité axe','Romberg','Morphostatique'];
  ['t1','t2','t3','t4','t5','t6','t7','t8'].forEach(function(t,i) {
    if(d['test_'+t]==='oui') tests.push(testLabels[i]+' ✅');
    else if(d['test_'+t]==='non') tests.push(testLabels[i]+' ❌');
  });
  if(tests.length) trait.push(['Tests avant/après', tests.join(' · ')]);
  if(d.prochaineRdv) trait.push(['Prochain RDV', new Date(d.prochaineRdv).toLocaleDateString('fr-FR')]);
  if(trait.length) sections.push({titre:'9. Traitements', items:trait, color:'#2a7a4e'});

  // Empreinte plantaire après section 5
  if(d._empreinte) {
    const s5idx = sections.findIndex(s => s.titre && s.titre.startsWith('5.'));
    const insertAt5 = s5idx >= 0 ? s5idx+1 : sections.length;
    sections.splice(insertAt5, 0, {titre:'5. Empreinte plantaire', color:'#f0a500', type:'empreinte', img: d._empreinte});
  }
  // Synthèse section 8
  // Plan de semelles (pieds) à la fin dans section 9
  if(d._feetCanvas) {
    // _feetCanvas contient déjà le composite fond+dessins
    sections.push({titre:'9. Plan de semelles', color:'#2a7a4e', type:'img',
      img: d._feetCanvas});
  }

  _buildRapportBody(p, d, prat, logo, sections);
}

function _buildRapportBody(p, d, prat, logo, sections) {
  // Résoudre les images bonhommes si nécessaire
  var bonhommesSection = sections.find(function(s){ return s.type === 'bonhommes' && s.bodyCanvasData; });

  
  if(bonhommesSection) {
    var bcImg = new Image();
    bcImg.onload = function() {
      var sw = Math.floor(bcImg.width/4);
      var sh = bcImg.height;
      var bgIds = bonhommesSection.bgIds || [];
      function makeSliceComposite(i) {
        var tmp = document.createElement('canvas');
        tmp.width = sw; tmp.height = sh;
        var ctx = tmp.getContext('2d');
        ctx.fillStyle='#fff'; ctx.fillRect(0,0,sw,sh);
        var bgEl = document.getElementById(bgIds[i]);
        if(bgEl && bgEl.naturalWidth>0) {
          // Image petite centrée dans le slice - même position que dans l'app
          var bgW = bgEl.naturalWidth; var bgH = bgEl.naturalHeight;
          var dx = (sw - bgW)/2; var dy = (sh - bgH)/2;
          ctx.drawImage(bgEl, dx, dy, bgW, bgH);
        }
        // Superposer les dessins - le canvas global a exactement la même taille
        ctx.drawImage(bcImg, i*sw, 0, sw, sh, 0, 0, sw, sh);
        return tmp.toDataURL('image/png');
      }
      bonhommesSection.profilDImg = makeSliceComposite(3);
      bonhommesSection.face2Img   = makeSliceComposite(1);
      bonhommesSection.faceImg    = makeSliceComposite(2);
      bonhommesSection.profilGImg = makeSliceComposite(0);
      bonhommesSection.bodyCanvasData = null;
      _doBuildRapport(p, d, prat, logo, sections);
    };
    bcImg.src = bonhommesSection.bodyCanvasData;
    return;
  }
  _doBuildRapport(p, d, prat, logo, sections);
}

function _doBuildRapport(p, d, prat, logo, sections) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR');
  const initiales = ((p.prenom||'?')[0]+(p.nom||'?')[0]).toUpperCase();
  const age = p.ddn ? Math.floor((Date.now()-new Date(p.ddn))/31557600000) : '';

  bodyHtml = '<style>\n    *{margin:0;padding:0;box-sizing:border-box;}\n    body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:11px;color:#1f2937;background:#fff;}\n    .rp-page{width:210mm;min-height:297mm;padding:0 0 15mm;margin:0 auto;}\n    @media print{.no-print{display:none!important;}.rp-page{padding:0;}}\n    .header{background:#0e1f38;padding:20px 24px;display:flex;justify-content:space-between;align-items:center;}\n    .logo{height:80px;object-fit:contain;}\n    .prat-info{text-align:right;font-size:9px;color:rgba(255,255,255,0.5);line-height:1.7;}\n    .prat-name{font-size:12px;font-weight:600;color:#fff;letter-spacing:0.3px;}\n    .titre-rapport{background:#1a3a6e;padding:8px 24px;display:flex;justify-content:space-between;align-items:center;}\n    .titre-rapport h1{font-size:9px;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:2px;text-transform:uppercase;}\n    .titre-rapport .sub{font-size:9px;color:rgba(255,255,255,0.4);letter-spacing:1px;}\n    .patient-card{background:#f7f8fa;border-bottom:1px solid #eaeaea;padding:16px 24px;display:flex;align-items:center;gap:16px;}\n    .patient-avatar{width:44px;height:44px;border-radius:50%;background:#0e1f38;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0;}\n    .patient-name{font-size:16px;font-weight:300;color:#0e1f38;letter-spacing:0.5px;}\n    .patient-details{font-size:10px;color:#6b7280;margin-top:3px;line-height:1.6;}\n    .patient-right{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;}\n    .pt-chip{font-size:9px;padding:2px 8px;border-radius:20px;background:#fff;border:1px solid #d1d5db;color:#374151;font-weight:500;}\n    .pt-chip-alert{background:#fef2f2;border-color:#fca5a5;color:#991b1b;}\n    .patient-metrics{display:flex;gap:8px;flex-shrink:0;}\n    .metric{background:#fff;border:1px solid #eaeaea;border-radius:6px;padding:8px 12px;text-align:center;min-width:52px;}\n    .metric-val{font-size:18px;font-weight:300;color:#0e1f38;line-height:1;}\n    .metric-lbl{font-size:8px;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;margin-top:2px;}\n    .section{margin:0;break-inside:avoid;padding:0 24px;}\n    .section-title{display:flex;align-items:center;gap:8px;padding:12px 0 8px;margin-top:16px;border-bottom:2px solid #0e1f38;}\n    .section-num{font-size:8px;font-weight:700;color:#fff;background:#0e1f38;width:18px;height:18px;border-radius:3px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}\n    .section-label{font-size:10px;font-weight:700;color:#0e1f38;letter-spacing:2px;text-transform:uppercase;}\n    .section-line{flex:1;height:1px;background:#eaeaea;}\n    .section-body{padding:0;}\n    .item{display:flex;align-items:baseline;padding:7px 0;border-bottom:1px solid #f3f3f0;}\n    .item:last-child{border-bottom:none;}\n    .item-label{font-size:9px;font-weight:700;color:#9ca3af;min-width:180px;letter-spacing:0.5px;text-transform:uppercase;}\n    .item-value{flex:1;font-size:11px;color:#1f2937;line-height:1.4;}\n    .item-value-hl{flex:1;font-size:11px;color:#0e1f38;font-weight:600;}\n    .tag{display:inline-block;font-size:8px;padding:2px 7px;border-radius:3px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-right:3px;}\n    .tag-navy{background:#e8edf5;color:#0e1f38;}\n    .tag-ok{background:#ecfdf5;color:#065f46;}\n    .tag-warn{background:#fffbeb;color:#92400e;}\n    .tag-alert{background:#fef2f2;color:#991b1b;}\n    .img-container{position:relative;text-align:center;}\n    .img-base{max-width:100%;border-radius:4px;}\n    .img-overlay{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;}\n    .footer{background:#f7f8fa;border-top:2px solid #0e1f38;padding:10px 24px;display:flex;justify-content:space-between;align-items:center;margin-top:20px;}\n    .footer-brand{font-size:8px;font-weight:700;color:#0e1f38;letter-spacing:2px;text-transform:uppercase;}\n    .footer-info{font-size:8px;color:#9ca3af;letter-spacing:0.5px;}\n    .btn-print{position:fixed;bottom:20px;right:20px;background:#0e1f38;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700;}\n  </style>';

  // HEADER
  bodyHtml += '<div class="rp-page">';
  bodyHtml += '<div class="header">';
  bodyHtml += '<img class="logo" src="'+logo+'" alt="Sciopraxi"/>';
  bodyHtml += '<div class="prat-info"><div class="prat-name">'+(prat.nom||'')+' '+(prat.prenom||'')+' — '+(prat.titre||'')+'</div>';
  if(prat.cabinet) bodyHtml += '<div>'+prat.cabinet+'</div>';
  if(prat.adresse) bodyHtml += '<div>'+prat.adresse+'</div>';
  if(prat.tel) bodyHtml += '<div>'+prat.tel+'</div>';
  if(prat.email) bodyHtml += '<div>'+prat.email+'</div>';
  bodyHtml += '</div></div>';

  // BANDEAU TITRE
  bodyHtml += '<div class="titre-rapport"><h1>Bilan Étude de la Posture</h1><div class="sub">Généré le '+dateStr+'</div></div>';

  // PATIENT
  bodyHtml += '<div class="patient-card">';
  bodyHtml += '<div class="patient-avatar">'+initiales+'</div>';
  bodyHtml += '<div style="flex:1;">';
  bodyHtml += '<div class="patient-name">'+p.prenom+' '+p.nom+'</div>';
  bodyHtml += '<div class="patient-details">';
  if(p.ddn) bodyHtml += 'Né(e) le '+new Date(p.ddn).toLocaleDateString('fr-FR');
  if(d.dateConsult) bodyHtml += ' · Bilan du '+new Date(d.dateConsult).toLocaleDateString('fr-FR');
  if(d.medecin) bodyHtml += ' · '+d.medecin;
  bodyHtml += '</div>';
  bodyHtml += '<div class="patient-right">';
  if(p.sport) bodyHtml += '<span class="pt-chip">'+p.sport+'</span>';
  if(p.metier) bodyHtml += '<span class="pt-chip">'+p.metier+'</span>';
  if(p.lat) bodyHtml += '<span class="pt-chip">'+p.lat+'</span>';
  if(d.eva) bodyHtml += '<span class="pt-chip pt-chip-alert">EVA '+d.eva+'/10</span>';
  bodyHtml += '</div></div>';
  bodyHtml += '<div class="patient-metrics">';
  if(age) bodyHtml += '<div class="metric"><div class="metric-val">'+age+'</div><div class="metric-lbl">ans</div></div>';
  if(p.poids) bodyHtml += '<div class="metric"><div class="metric-val">'+p.poids+'</div><div class="metric-lbl">kg</div></div>';
  if(p.taille) bodyHtml += '<div class="metric"><div class="metric-val">'+p.taille+'</div><div class="metric-lbl">cm</div></div>';
  bodyHtml += '</div></div>';

  // SECTIONS
  sections.forEach(function(s, sidx) {
    var num = (sidx+1 < 10 ? '0'+(sidx+1) : ''+(sidx+1));
    bodyHtml += '<div class="section">';
    bodyHtml += '<div class="section-title"><div class="section-num">'+num+'</div><div class="section-label">'+s.titre+'</div><div class="section-line"></div></div>';
    bodyHtml += '<div class="section-body">';
    if(s.type === 'bonhommes') {
      var labels4 = ['Profil D','Dos','Face','Profil G'];
      var imgs4 = [s.profilDImg, s.face2Img, s.faceImg, s.profilGImg];
      bodyHtml += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;padding:10px 0;">';
      imgs4.forEach(function(src, i) {
        bodyHtml += '<div style="text-align:center;">';
        bodyHtml += '<div style="font-size:9px;color:#9ca3af;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;">'+labels4[i]+'</div>';
        if(src) bodyHtml += '<img src="'+src+'" style="max-width:100%;border-radius:4px;"/>';
        bodyHtml += '</div>';
      });
      bodyHtml += '</div>';
    } else if(s.type === 'pieds') {
      if(s.piedsImg) {
        bodyHtml += '<div style="text-align:center;padding:10px 0;">';
        bodyHtml += '<img src="'+s.piedsImg+'" style="max-width:60%;border-radius:4px;display:block;margin:0 auto;"/>';
        bodyHtml += '</div>';
      }
    } else if(s.type === 'img') {
      if(s.img) bodyHtml += '<div style="text-align:center;padding:10px 0;"><img src="'+s.img+'" style="max-width:70%;border-radius:4px;display:block;margin:0 auto;"/></div>';
    } else if(s.type === 'empreinte') {
      if(s.img) bodyHtml += '<div style="text-align:center;padding:10px 0;"><img src="'+s.img+'" style="max-width:70%;border-radius:4px;display:block;margin:0 auto;"/></div>';
    } else if(s.type === 'image') {
      if(s.img) bodyHtml += '<div style="text-align:center;padding:10px 0;"><img src="'+s.img+'" style="max-height:200px;border-radius:4px;"/></div>';
    } else if(s.items) {
      function rpFormatVal(label, val) {
        if(!val || val==='') return '<span class="item-value">—</span>';
        var v = String(val).toLowerCase().trim();
        // Badges OUI/NON
        if(v==='oui') return '<span class="tag" style="background:#dcfce7;color:#166534;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">OUI</span>';
        if(v==='non') return '<span class="tag" style="background:#f1f5f9;color:#64748b;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">NON</span>';
        // Badges côtés
        if(v==='droite'||v==='droit') return '<span class="tag" style="background:#dbeafe;color:#1e40af;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">DROITE</span>';
        if(v==='gauche') return '<span class="tag" style="background:#ede9fe;color:#5b21b6;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">GAUCHE</span>';
        if(v==='neutre') return '<span class="tag" style="background:#f1f5f9;color:#475569;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">NEUTRE</span>';
        // Badges positif/negatif
        if(v==='positif') return '<span class="tag" style="background:#fef2f2;color:#991b1b;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">POSITIF</span>';
        if(v==='negatif'||v==='négatif') return '<span class="tag" style="background:#dcfce7;color:#166534;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">NÉGATIF</span>';
        // Badges tronc/cervelet
        if(v.includes('tronc')) return '<span class="tag" style="background:#fef2f2;color:#991b1b;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">'+val.toUpperCase()+'</span>';
        if(v.includes('cervelet')) return '<span class="tag" style="background:#dbeafe;color:#1e40af;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">'+val.toUpperCase()+'</span>';
        // Badges tonique/phasique
        if(v.includes('tonique')) return '<span class="tag" style="background:#e0f2fe;color:#075985;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">'+val.toUpperCase()+'</span>';
        if(v.includes('phasique')) return '<span class="tag" style="background:#fef9c3;color:#854d0e;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">'+val.toUpperCase()+'</span>';
        // Valeur numérique (cm, score)
        if(/^\d+/.test(v)) return '<span class="item-value-hl">'+val+'</span>';
        // Valeur checkmark
        if(v==='✓') return '<span class="tag" style="background:#dcfce7;color:#166534;font-size:9px;padding:2px 8px;border-radius:4px;font-weight:700;">✓ OUI</span>';
        // Valeur longue = texte normal
        return '<span class="item-value">'+val+'</span>';
      }
      s.items.forEach(function(item) {
        var label = item[0], val = item[1];
        bodyHtml += '<div class="item"><span class="item-label">'+label+'</span>'+rpFormatVal(label,val)+'</div>';
      });
    }
    bodyHtml += '</div></div>';
  });

  // FOOTER
  bodyHtml += '<div class="footer"><div class="footer-brand">Sciopraxi Bilans</div><div class="footer-info">Bilan Étude de la Posture · '+p.prenom+' '+p.nom+' · '+dateStr+'</div></div>';
  bodyHtml += '</div>';

  // Injecter dans un iframe isolé pour éviter les conflits CSS
  const body = document.getElementById('rapport-posturo-body');
  if(body) {
    body.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'width:100%;height:calc(100vh - 120px);border:none;';
    body.appendChild(iframe);
    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;">' + bodyHtml + '</body></html>');
    idoc.close();
  }
  nav('pg-rapport-posturo');

}

function buildRapport() {
  if(!currentPatient){
    document.getElementById('rpt-body').innerHTML='<div style="color:var(--mut);text-align:center;padding:20px;">Aucun patient sélectionné.</div>';
    return;
  }
  const p = currentPatient;
  document.getElementById('rpt-sub').textContent = p.prenom+' '+p.nom+' · '+(p.sport||'—')+' · '+p.date;

  const mesures = p.mesures || {};
  let html = '';

  // Section mesures biomécaniques
  if(Object.keys(mesures).length > 0) {
    html += '<div style="font-size:13px;font-weight:700;color:var(--blue);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--bord);">📐 Mesures Biomécaniques</div>';
    // Ordre d'affichage forcé : KFPPA marche→course→sldj en premier, puis le reste
const ordreAffichage=['kfppa-marche','kfppa-course','kfppa-sldj','verrou','mobilite','mla-marche','mla-course','amorti-marche','amorti-course'];
const mesuresTriees=Object.entries(mesures).sort(([a],[b])=>{
  const iA=ordreAffichage.indexOf(a), iB=ordreAffichage.indexOf(b);
  if(iA===-1&&iB===-1) return 0;
  if(iA===-1) return 1;
  if(iB===-1) return -1;
  return iA-iB;
});
mesuresTriees.forEach(([testId,data]) => {
      const t = TESTS[testId]; if(!t) return;
      const conclusions_tmp=[];
      const sectionHTML=buildPrintSection(t,data,conclusions_tmp);
      if(sectionHTML) html += '<div class="rpt-test-card" style="background:var(--card);border:1px solid var(--bord);border-radius:10px;padding:12px;margin-bottom:10px;">'+sectionHTML+'</div>';
    });
  }

  // Section bilan clinique - même contenu que le PDF
  const bd = p.bilanData || {};
  if(Object.keys(bd).length > 0) {
    const bilanHTML = buildBilanPrintSection(bd);
    if(bilanHTML) html += '<div style="margin-top:16px;">'+bilanHTML+'</div>';
  }

  if(!html) html = '<div style="color:var(--mut);text-align:center;padding:20px;font-size:13px;">Aucune donnée enregistrée pour ce patient.</div>';
  document.getElementById('rpt-body').innerHTML = html;
}

function buildTestPreview(t,data) {
  let html='<div class="g2" style="gap:12px;">';
  // Côté D
  html+=buildSidePreview('D',t,data);
  html+=buildSidePreview('G',t,data);
  html+='</div>';
  return html;
}

function buildSidePreview(side,t,data) {
  let pct=null,ang=null,label=side==='D'?'Côté Droit':'Côté Gauche';
  const sideC=side==='D'?'var(--blue)':'var(--green)';
  if(t.div!==undefined){
    // KFPPA : recalculer avec toIncl(180-rawAng si >90°) pour compatibilité
    const bipodal=data.photos?.find(p=>p.side==='');
    const uni=data.photos?.find(p=>p.side===side);
    const _toIncl=(v)=>v==null?null:(v>90?180-v:v);
    const bipAng=_toIncl(side==='D'?bipodal?.angleD:bipodal?.angleG);
    const uniAng=_toIncl(uni?.angle);
    console.log('KFPPA debug',side,'bipodal=',bipodal,'uni=',uni,'bipAng=',bipAng,'uniAng=',uniAng);
    if(bipAng!=null&&uniAng!=null){
      ang=uniAng-bipAng;
      pct=ang/t.div;
    } else {
      pct=side==='D'?data.pctD:data.pctG;
      ang=side==='D'?data.deltaD:data.deltaG;
      if(ang!=null) ang=_toIncl(ang)<ang?_toIncl(ang):ang;
    }
  }
  else if(t.normDiv!==undefined||t.mlaTest){
    pct=side==='D'?data.pctD:data.pctG;
    ang=side==='D'?data.deltaD:data.deltaG; // delta = écr - prop
    // Si pas de données calculées, recalculer depuis photos
    if((pct==null||isNaN(pct)) && data.photos?.length) {
      const ph=data.photos.filter(p=>p.side===side);
      const prop=ph[0]?.angle, ecr=ph[1]?.angle;
      if(prop!=null&&ecr!=null){ang=ecr-prop;pct=ang/(t.normDiv||20);}
    }
  }
  else if(t.normAm!==undefined){
    let am=side==='D'?data.amD:data.amG, pr=side==='D'?data.prD:data.prG;
    let talV=data.phases?.[side]?.tal, planV=data.phases?.[side]?.plan, digV=data.phases?.[side]?.dig;
    if((am==null||isNaN(am)) && data.photos?.length) {
      const ph2=data.photos.filter(p=>p.side===side);
      talV=ph2[0]?.angle; planV=ph2[1]?.angle; digV=ph2[2]?.angle;
      if(talV!=null&&planV!=null) am=Math.abs(talV-planV)/t.normAm;
      if(digV!=null&&planV!=null) pr=Math.abs(digV-planV)/t.normAm;
    }
    const _apVa=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
    const _cssAm=rp_cssColor(am,false), _cssPr=rp_cssColor(pr,false);
    const _r2=35,_circ=2*Math.PI*_r2;
    const _fillAm=am!=null?_circ*Math.min(100,Math.max(0,Math.abs(am)*100))/100:0;
    const _fillPr=pr!=null?_circ*Math.min(100,Math.max(0,Math.abs(pr)*100))/100:0;
    const _ph=buildPrintPhotos(data,side,t);
    return `<div class="rp-side-block rp-side-${side}">
      <div class="rp-side-title">${side==='D'?'Côté Droit':'Côté Gauche'}</div>
      <div style="font-size:9px;color:#888;margin-bottom:4px;">Taligrade: ${_apVa(talV)} · Plantigrade: ${_apVa(planV)} · Digitigrade: ${_apVa(digV)}</div>
      <div class="rp-gauge-photos">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div class="rp-gauge" style="width:80px;height:80px;">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="${_r2}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
              ${am!=null?`<circle cx="40" cy="40" r="${_r2}" fill="none" stroke="${_cssAm}" stroke-width="8" stroke-dasharray="${_fillAm} ${_circ}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
            </svg>
            <div class="rp-gauge-inner">
              <div class="rp-gauge-pct" style="color:${_cssAm};font-size:11px;">${am!=null?Math.round(Math.abs(am)*100)+'%':'—'}</div>
              <div class="rp-gauge-deg" style="font-size:7px;">Amorti</div>
            </div>
          </div>
          <div class="rp-gauge" style="width:80px;height:80px;">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="${_r2}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
              ${pr!=null?`<circle cx="40" cy="40" r="${_r2}" fill="none" stroke="${_cssPr}" stroke-width="8" stroke-dasharray="${_fillPr} ${_circ}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
            </svg>
            <div class="rp-gauge-inner">
              <div class="rp-gauge-pct" style="color:${_cssPr};font-size:11px;">${pr!=null?Math.round(Math.abs(pr)*100)+'%':'—'}</div>
              <div class="rp-gauge-deg" style="font-size:7px;">Propuls.</div>
            </div>
          </div>
        </div>
        ${_ph}
      </div>
      <div style="font-size:9px;margin-top:4px;">Amorti: <b style="color:${_cssAm};">${am!=null?Math.round(Math.abs(am)*100)+'%':'—'}</b> · Propulsion: <b style="color:${_cssPr};">${pr!=null?Math.round(Math.abs(pr)*100)+'%':'—'}</b> (N:${t.normAm}°=100%)</div>
    </div>`;
  } else if(t.normVerrou!==undefined||t.normMob!==undefined){
    const val=t.normVerrou!==undefined?data.rfPct:data.mobPct;
    pct=val;
  }
  // Verrouillage AP
  if(t.normVerrou!==undefined){
    const photos=data.photos||[];
    const ph=photos.filter(p=>p.side===side);
    const stat=ph[0]?.angle, pointe=ph[1]?.angle;
    ang=pointe; pct=pointe!=null?pointe/t.normVerrou:null;
    const mol=(pointe!=null&&stat!=null)?(pointe-stat)/t.normVerrou:null;
    const apVv=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
    const cssVv=rp_cssColor(pct,false);
    const r2v=35,cv=2*Math.PI*r2v,fv=pct!=null?cv*Math.min(100,Math.max(0,Math.abs(pct)*100))/100:0;
    return `<div class="rp-side-block rp-side-${side}">
      <div class="rp-side-title">${side==='D'?'Côté Droit':'Côté Gauche'}</div>
      <div class="rp-gauge-photos">
        <div class="rp-gauge"><svg width="90" height="90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${r2v}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
          ${pct!=null?`<circle cx="40" cy="40" r="${r2v}" fill="none" stroke="${cssVv}" stroke-width="8" stroke-dasharray="${fv} ${cv}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
        </svg><div class="rp-gauge-inner">
          <div class="rp-gauge-pct" style="color:${cssVv};">${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'}</div>
          <div class="rp-gauge-deg">${ang!=null?Number(ang).toFixed(1)+'°':'—'}</div>
        </div></div>
        ${buildPrintPhotos(data,side,t)}
      </div>
      <div style="font-size:9px;margin-top:4px;">Stat: ${apVv(stat)} (N:0°) · Pointe: ${apVv(pointe)} (N:Inv+10°)</div>
      <div style="font-size:9px;">RF: ${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'} · Mollet: ${mol!=null?Math.round(Math.abs(mol)*100)+'%':'—'} (N:10°=100%)</div>
      <div style="text-align:center;margin-top:4px;">
        ${pct!=null?`<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;background:${Math.abs(pct)*100>=66?'#d4edda':Math.abs(pct)*100>=33?'#fff3cd':'#f8d7da'};color:${Math.abs(pct)*100>=66?'#155724':Math.abs(pct)*100>=33?'#856404':'#721c24'};">${Math.abs(pct)*100>=66?'Normal':Math.abs(pct)*100>=33?'Limite':'Hors norme'}</span>`:''}
        <div style="font-size:8px;color:#888;margin-top:3px;">Norme : Statique 0° · Pointe Inv+10° · RF 10°=100%</div>
      </div>
    </div>`;
  }
  // Mobilité AP
  if(t.normMob!==undefined){
    const photos=data.photos||[];
    const p0=photos[0], p1=photos[1];
    const invA=side==='D'?p0?.angleD:p0?.angleG;
    const evA=side==='D'?p1?.angleD:p1?.angleG;
    ang=(invA!=null&&evA!=null)?invA-evA:null;
    pct=ang!=null?ang/t.normMob:null;
    const apVm=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
    const cssM=rp_cssColor(pct,false);
    const r2m=35,cm=2*Math.PI*r2m,fm=pct!=null?cm*Math.min(100,Math.max(0,Math.abs(pct)*100))/100:0;
    return `<div class="rp-side-block rp-side-${side}">
      <div class="rp-side-title">${side==='D'?'Côté Droit':'Côté Gauche'}</div>
      <div class="rp-gauge-photos">
        <div class="rp-gauge"><svg width="90" height="90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${r2m}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
          ${pct!=null?`<circle cx="40" cy="40" r="${r2m}" fill="none" stroke="${cssM}" stroke-width="8" stroke-dasharray="${fm} ${cm}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
        </svg><div class="rp-gauge-inner">
          <div class="rp-gauge-pct" style="color:${cssM};">${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'}</div>
          <div class="rp-gauge-deg">${ang!=null?Number(ang).toFixed(1)+'°':'—'}</div>
        </div></div>
        ${buildPrintPhotos(data,'',t)}
      </div>
      <div style="font-size:9px;margin-top:4px;">Inv: ${apVm(invA)} (N:+20°) · Év: ${apVm(evA)} (N:−10°)</div>
      <div style="font-size:9px;">Mobilité: ${ang!=null?ang.toFixed(1)+'°':'—'} — ${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'} (N:30°=100%)</div>
      <div style="text-align:center;margin-top:4px;">
        ${pct!=null?`<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;background:${Math.abs(pct)*100>=66?'#d4edda':Math.abs(pct)*100>=33?'#fff3cd':'#f8d7da'};color:${Math.abs(pct)*100>=66?'#155724':Math.abs(pct)*100>=33?'#856404':'#721c24'};">${Math.abs(pct)*100>=66?'Normal':Math.abs(pct)*100>=33?'Limite':'Hors norme'}</span>`:''}
        <div style="font-size:8px;color:#888;margin-top:3px;">Norme : Inv +20° · Év −10° · Mobilité 30°=100%</div>
      </div>
    </div>`;
  }
  const pctVal=pct!==null?Math.round(pct*100):null;
  const clr=t.div?clrGenou(pct):clrGen(pct);
  return `<div style="background:var(--surf);border:1px solid var(--bord);border-radius:var(--rs);padding:10px;">
    <div style="font-size:11px;font-weight:700;color:${sideC};margin-bottom:6px;">${label}</div>
    ${buildGaugeMini(pctVal,ang?ang.toFixed(1)+'°':'—',clr)}
    ${buildPhotoMini(data,side,t)}
  </div>`;
}

function buildGaugeMini(pctVal,degStr,cssC) {
  const cssColor=cssC==='var(--green)'?'#3ecf72':cssC==='var(--orange)'?'#f5a623':cssC==='var(--red)'?'#f04060':'#4a5568';
  const r=30,circ=2*Math.PI*r,fill=circ*Math.min(100,Math.max(0,pctVal||0))/100;
  return `<div style="position:relative;width:72px;height:72px;margin:0 auto 6px;">
    <svg width="72" height="72" viewBox="0 0 70 70"><circle cx="35" cy="35" r="${r}" fill="none" stroke="var(--bord)" stroke-width="7"/><circle cx="35" cy="35" r="${r}" fill="none" stroke="${cssColor}" stroke-width="7" stroke-dasharray="${fill} ${circ}" stroke-linecap="round" transform="rotate(-90,35,35)"/></svg>
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;line-height:1.1;">
      <div style="font-size:13px;font-weight:700;color:${cssColor};font-family:var(--fm);">${pctVal!==null?pctVal+'%':'—'}</div>
      <div style="font-size:9px;color:var(--mut);">${degStr}</div>
    </div>
  </div>`;
}

function buildPhotoMini(data,side,t) {
  const photos=(data.photos||[]).filter(p=>p.side===side||(!p.side&&side==='D'));
  const frames=(data.frames||[]);
  if(!photos.length&&!frames.length) return '';
  const items=photos.length?photos:frames.slice(0,2).map((f,i)=>({label:t.frameLabels?.[i]||'Frame '+(i+1),dataUrl:f.dataUrl,angle:side==='D'?f.angD:f.angG}));
  return `<div style="display:flex;gap:4px;margin-top:6px;">${items.slice(0,2).map(ph=>`
    <div style="flex:1;text-align:center;">
      ${ph?.dataUrl?`<img src="${ph.dataUrl}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:4px;border:1px solid var(--bord);"/>`
      :`<div style="aspect-ratio:4/3;background:var(--card);border:1px dashed var(--bord);border-radius:4px;"></div>`}
      <div style="font-size:9px;color:var(--mut);margin-top:2px;">${ph?.angle!=null?ph.angle.toFixed(1)+'°':ph?.label||''}</div>
    </div>`).join('')}</div>`;
}

// ══════════════════════════════════════════════════════
// RAPPORT PDF IMPRESSION
// ══════════════════════════════════════════════════════
function printReport() {
  if(!currentPatient){alert('Aucun patient sélectionné.');return;}
  // Sauvegarder automatiquement le bilan avant d'imprimer
  saveBilanSilent();
  const p=currentPatient;
  const prat=praticiens.find(pr=>pr.id==p.pratId);

  // En-tête praticien
  document.getElementById('rp-prat-block').innerHTML=prat?
    `<strong>${prat.nom}</strong>${prat.titre?'<br>'+prat.titre:''}<br>${prat.cabinet||''}${prat.adresse?'<br>'+prat.adresse:''}${prat.tel?'<br>'+prat.tel:''}${prat.email?'<br>'+prat.email:''}`
    :'<strong>BioMéca Podologie</strong>';

  // Infos patient
  const age=p.ddn?Math.floor((Date.now()-new Date(p.ddn))/31557600000)+' ans':'—';
  document.getElementById('rp-pt-info-block').innerHTML=`
    <div class="rp-pt-item"><strong>Patient</strong>${p.prenom} ${p.nom}</div>
    <div class="rp-pt-item"><strong>Âge · Latéralité</strong>${age} · ${p.lat||'—'}</div>
    <div class="rp-pt-item"><strong>Sport</strong>${p.sport||'—'}</div>
    <div class="rp-pt-item"><strong>Poids · Taille</strong>${p.poids||'—'} kg · ${p.taille||'—'} cm</div>
    <div class="rp-pt-item"><strong>Motif</strong>${p.motif||'—'}</div>
    <div class="rp-pt-item"><strong>Date</strong>${p.date}</div>`;

  const mesures=p.mesures||{};
  let sectionsHTML='';
  const conclusions=[];

  const ordreRapport=['kfppa-marche','kfppa-course','kfppa-sldj','verrou','mobilite','mla-marche','mla-course','amorti-marche','amorti-course'];
  const mesuresRapport=Object.entries(mesures).sort(([a],[b])=>{
    const iA=ordreRapport.indexOf(a),iB=ordreRapport.indexOf(b);
    if(iA===-1&&iB===-1)return 0; if(iA===-1)return 1; if(iB===-1)return -1; return iA-iB;
  });
  mesuresRapport.forEach(([testId,data])=>{
    const t=TESTS[testId]; if(!t) return;
    sectionsHTML+=buildPrintSection(t,data,conclusions);
  });

  // Conclusion générale
  let concluHTML='';
  if(conclusions.length){
    concluHTML=`<div class="rp-conclu"><strong style="display:block;margin-bottom:4px;">Mesures à signaler</strong>${conclusions.join('<br>')}</div>`;
  }

  const bilanSection = (typeof buildBilanPrintSection === 'function' && currentPatient && currentPatient.bilanData)
    ? buildBilanPrintSection(currentPatient.bilanData) : '';
  const fullContent = sectionsHTML + concluHTML + bilanSection;
  document.getElementById('rp-sections').innerHTML = fullContent.trim()
    ? fullContent
    : '<p style="color:#888;text-align:center;padding:20px;">Aucune mesure enregistrée pour ce patient.</p>';

  // Lancer l'impression via CSS @media print
  document.body.classList.add('printing');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('printing'), 100);
  }, 300);
}

function buildBilanPrintSection(bd) {
  if(!bd||!Object.keys(bd).length) return '';
  const f = (k,def) => (bd[k]!==undefined && bd[k]!=='' && bd[k]!==null) ? bd[k] : (def||'—');
  const yn = (k) => bd[k]==='oui'
    ? '<span style="background:#d4edda;color:#155724;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;">OUI</span>'
    : bd[k]==='non'
    ? '<span style="background:#f8d7da;color:#721c24;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;">NON</span>'
    : '<span style="color:#aaa;font-size:9px;">—</span>';
  const cb = (k) => bd[k]===true
    ? '<span style="background:#d4edda;color:#155724;padding:1px 5px;border-radius:3px;font-size:9px;">✓</span>'
    : '<span style="color:#ddd;font-size:9px;">☐</span>';
  const gdnRow = (lbl, prefix) =>
    '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;">'+lbl+'</td>'
    +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;">'+cb(prefix+'_G')+'</td>'
    +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;">'+cb(prefix+'_D')+'</td>'
    +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;">'+cb(prefix+'_N')+'</td></tr>';
  const gdRow = (lbl, prefix) =>
    '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;">'+lbl+'</td>'
    +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;">'+cb(prefix+'_G')+'</td>'
    +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;">'+cb(prefix+'_D')+'</td></tr>';
  const sec = (title) => '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#333;border-bottom:1px solid #c8a96e;padding-bottom:3px;margin:10px 0 6px;">' + title + '</div>';
  const tblHdr4 = (c1,c2,c3,c4,c5) => '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:8px;">'
    +'<tr style="background:#f5f0e8;"><th style="padding:3px 5px;border:1px solid #ddd;text-align:left;">'+c1+'</th>'
    +'<th style="padding:3px 5px;border:1px solid #ddd;">'+c2+'</th>'
    +'<th style="padding:3px 5px;border:1px solid #ddd;">'+c3+'</th>'
    +'<th style="padding:3px 5px;border:1px solid #ddd;">'+c4+'</th>'
    +(c5?'<th style="padding:3px 5px;border:1px solid #ddd;">'+c5+'</th>':'')+'</tr>';
  const tblHdrGDN = (title) => '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;">'
    +'<tr style="background:#f5f0e8;"><th style="padding:2px 5px;border:1px solid #ddd;text-align:left;">'+title+'</th>'
    +'<th style="padding:2px 5px;border:1px solid #ddd;">G</th>'
    +'<th style="padding:2px 5px;border:1px solid #ddd;">D</th>'
    +'<th style="padding:2px 5px;border:1px solid #ddd;">N</th></tr>';

  let h = '<div class="rp-section" style="page-break-before:always;">';
  h += '<div style="font-size:14px;font-weight:700;text-transform:uppercase;color:#c8a96e;border-bottom:2.5px solid #c8a96e;padding-bottom:6px;margin-bottom:14px;letter-spacing:.05em;">BILAN CLINIQUE PODOLOGIE DU SPORTIF</div>';

  // ─── ANAMNÈSE ───
  h += sec('Anamnèse');
  h += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:8px;">';
  [
    ['Sport(s) pratiqué(s) — type, fréquence, intensité, niveau','sport_detail'],
    ['Motif de consultation','motif_detail'],
    ['Localisation et horaire de la douleur (1er fois / récidive)','douleur'],
    ['Antécédents (personnel / familiaux)','antecedents'],
    ['Examens déjà réalisés','examens'],
    ['Hygiène de vie / quotidien','hygiene'],
    ['Notes complémentaires','notes_generales'],
  ].forEach(([lbl,k]) => {
    if(bd[k]) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-weight:600;background:#fafafa;width:32%;font-size:9px;">'+lbl+'</td><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;">'+bd[k]+'</td></tr>';
  });
  if(bd.ttt_podo) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-weight:600;background:#fafafa;font-size:9px;">Traitement podologique</td><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;">'+yn('ttt_podo')+(bd.ttt_podo_detail?' — '+bd.ttt_podo_detail:'')+'</td></tr>';
  h += '</table>';

  // ─── BILAN MORPHOSTATIQUE ───
  const hasMorpho = bd._morpho_face||bd._morpho_face2||bd._morpho_profilG||bd._morpho_profilD;
  if(hasMorpho||bd.chaine_musculaire) {
    h += sec('Bilan Morphostatique');
    if(hasMorpho) {
      h += '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:flex-end;">';
      [['_morpho_face','Face ant.'],['_morpho_face2','Face post.'],['_morpho_profilG','Profil G'],['_morpho_profilD','Profil D']].forEach(([k,lbl]) => {
        if(bd[k]) h += '<div style="text-align:center;flex:1;"><div style="font-size:8px;color:#888;margin-bottom:2px;">'+lbl+'</div><img src="'+bd[k]+'" style="max-width:100%;height:120px;object-fit:contain;border:1px solid #ddd;border-radius:4px;"/></div>';
      });
      h += '</div>';
    }
    if(bd.chaine_musculaire) h += '<p style="font-size:9px;"><strong>Hypothèse chaîne musculaire:</strong> '+bd.chaine_musculaire+'</p>';
  }

  // ─── EXAMEN EN CHARGE ───
  const hasCharge = bd.crete_iliaque||bd.eias_charge||bd.eips||bd.tfd||bd.tfa;
  const testFields = [
    ['Test de Romberg','test_romberg'],['Force extenseurs poignet','test_force_ext_poignet'],
    ['Force/stabilité arrière','test_force_stabilite'],['Flexion antérieure','test_flexion_ant'],
    ['Fukuda','test_fukuda'],['Stabilité monopodale cheville','test_stab_cheville'],
    ['Stabilité monopodale genou','test_stab_genou'],['Chaînes stabilisatrices','test_chaines_stab'],
    ['Stratégies équilibration','test_equilibration'],['Rotation nucale','test_rot_nucale'],
  ];
  const hasTests = testFields.some(([,k])=>bd[k]);
  if(hasCharge||hasTests) {
    h += sec('Examen en Charge');
    if(hasCharge) {
      h += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;">';
      [['Hauteur crête iliaque','crete_iliaque'],['EIAS','eias_charge'],['EIPS','eips'],['TFD','tfd'],['TFA','tfa']].forEach(([lbl,k]) => {
        if(bd[k]) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-weight:600;background:#fafafa;width:30%;font-size:9px;">'+lbl+'</td><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;">'+bd[k]+'</td></tr>';
      });
      h += '</table>';
    }
    if(hasTests) {
      h += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:8px;">';
      testFields.forEach(([lbl,k]) => {
        if(bd[k]) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-weight:600;background:#fafafa;width:40%;font-size:9px;">'+lbl+'</td><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;">'+bd[k]+'</td></tr>';
      });
      h += '</table>';
    }
  }

  // ─── ROTATION NUCALE ───
  const hasNucale = bd.rot_nucale_G_std||bd.rot_nucale_G_mousse||bd.rot_nucale_D_std||bd.rot_nucale_D_mousse;
  if(hasNucale) {
    h += sec('Test Rotation Nucale');
    h += tblHdr4('','Gauche Standard','Gauche Mousse','Droite Standard','Droite Mousse');
    h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;font-weight:600;">Rotation nucale</td>'
      +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f('rot_nucale_G_std')+'</td>'
      +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f('rot_nucale_G_mousse')+'</td>'
      +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f('rot_nucale_D_std')+'</td>'
      +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f('rot_nucale_D_mousse')+'</td></tr></table>';
  }

  // ─── MOBILITÉ AXE CORPOREL ───
  const mobZones = ['cervical','thoracique','lombaire','arc_inf'];
  const hasMob = mobZones.some(z => bd['mob_'+z+'_G_std']||bd['mob_'+z+'_D_std']);
  if(hasMob) {
    h += sec('Mobilité Axe Corporel');
    h += tblHdr4('Zone','Gauche Standard','Gauche Mousse','Droite Standard','Droite Mousse');
    [['Cervical','cervical'],['Thoracique','thoracique'],['Lombaire','lombaire'],['Arc Inférieur','arc_inf']].forEach(([lbl,z]) => {
      if(bd['mob_'+z+'_G_std']||bd['mob_'+z+'_D_std']||bd['mob_'+z+'_G_mousse']||bd['mob_'+z+'_D_mousse'])
        h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;font-weight:600;">'+lbl+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f('mob_'+z+'_G_std','')+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f('mob_'+z+'_G_mousse','')+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f('mob_'+z+'_D_std','')+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f('mob_'+z+'_D_mousse','')+'</td></tr>';
    });
    h += '</table>';
  }

  // ─── EXAMEN MANDIBULE ───
  const mandFields = [['Ouverture max 3 doigts','mandibule_ouverture'],['Déviation ouverture','mandibule_deviation'],['Contractures masticateurs','mandibule_contractures'],['Douleur capsulo-ligamentaire','mandibule_douleur'],['Ressaut méniscal','mandibule_ressaut']];
  const hasMand = mandFields.some(([,k])=>bd[k])||bd.mandibule_tonicite||bd.mandibule_notes;
  if(hasMand) {
    h += sec('Examen Mandibule');
    h += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;">';
    mandFields.forEach(([lbl,k]) => {
      if(bd[k]) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-weight:600;background:#fafafa;width:50%;font-size:9px;">'+lbl+'</td><td style="padding:2px 5px;border:1px solid #e0e0e0;">'+yn(k)+'</td></tr>';
    });
    if(bd.mandibule_tonicite) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-weight:600;background:#fafafa;font-size:9px;">Tests tonicité</td><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;">'+bd.mandibule_tonicite+'</td></tr>';
    h += '</table>';
    if(bd.mandibule_notes) h += '<p style="font-size:9px;"><strong>Observations:</strong> '+bd.mandibule_notes+'</p>';
  }

  // ─── EXAMEN STABILOMÉTRIQUE ───
  const stabFields = [['Surface','stabilo_surface'],['SYF/SYO×100','stabilo_ratio1'],['Quotient Romberg (moy:249)','stabilo_romberg'],['Quotient plantaire (moy:140)','stabilo_plantaire']];
  const hasStab = stabFields.some(([,k])=>bd[k+'_yo']||bd[k+'_yf'])||bd.stabilo_conclusion;
  if(hasStab) {
    h += sec('Examen Stabilométrique / Baropodométrique');
    h += tblHdr4('Paramètre','Yeux ouverts','Yeux fermés','YO Mousse','YF Mousse');
    stabFields.forEach(([lbl,k]) => {
      if(bd[k+'_yo']||bd[k+'_yf']||bd[k+'_yom']||bd[k+'_yfm'])
        h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;font-weight:600;">'+lbl+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f(k+'_yo','')+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f(k+'_yf','')+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f(k+'_yom','')+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f(k+'_yfm','')+'</td></tr>';
    });
    h += '</table>';
    if(bd.stabilo_conclusion) h += '<p style="font-size:9px;background:#f9f9f9;padding:5px 8px;border-radius:4px;"><strong>Conclusion:</strong> '+bd.stabilo_conclusion+'</p>';
  }

  // ─── NEUROLOGIE FONCTIONNELLE ───
  const hasNeuro = bd.neuro_hypothese||bd.neuro_notes||
    ['ps_epaule','ps_rot_epaule','ps_flex_coude','ps_pron_poignet'].some(k=>bd[k+'_G']||bd[k+'_D']);
  if(hasNeuro) {
    h += sec('Neurologie Fonctionnelle');
    if(bd.neuro_hypothese) h += '<p style="font-size:9px;margin-bottom:6px;"><strong>Hypothèse:</strong> '+(bd.neuro_hypothese==='tc'?'Tronc Cérébral':bd.neuro_hypothese==='cerv'?'Cervelet':'Mixte')+'</p>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">';
    // Nerfs crâniens
    h += '<div><div style="font-size:9px;font-weight:700;color:#c0392b;margin-bottom:3px;">Nerfs Crâniens</div>';
    h += tblHdrGDN('NC');
    ['Recapillarisation','NC1','NC2','NC3','NC4','NC5','NC6','NC7','NC8','NC9','NC10','NC11','NC12'].forEach(nc => {
      const k = 'nc'+(nc==='Recapillarisation'?'_recap':nc.replace('NC','').toLowerCase());
      if(bd[k+'_G']||bd[k+'_D']||bd[k+'_N']) h += gdnRow(nc, k);
    });
    if(bd.nc_total) h += '<tr><td colspan="4" style="padding:2px 5px;font-size:9px;border:1px solid #e0e0e0;"><strong>Total: '+bd.nc_total+'</strong></td></tr>';
    h += '</table></div>';
    // Vestibulaire
    h += '<div><div style="font-size:9px;font-weight:700;color:#2980b9;margin-bottom:3px;">Vestibulaire / Proprioception</div>';
    h += tblHdrGDN('Test');
    [['ROMBERG+CSC ANT','vest_csc_ant'],['ROMBERG+CSC LAT','vest_csc_lat'],['ROMBERG+CSC POST','vest_csc_post']].forEach(([lbl,k]) => {
      if(bd[k+'_G']||bd[k+'_D']||bd[k+'_N']) h += gdnRow(lbl, k);
    });
    [['FN LENT passif','prop_fn_lent'],['FN RAPIDE actif','prop_fn_rapide'],['GOLGI force iso','prop_golgi'],['PACCINI mvt précis','prop_paccini'],['RUFFINI Décompression','prop_ruffini_dec'],['RUFFINI Compression','prop_ruffini_com'],['GOLGI mvt forcé','prop_golgi_a']].forEach(([lbl,k]) => {
      if(bd[k+'_G']||bd[k+'_D']||bd[k+'_N']) h += gdnRow(lbl, k);
    });
    if(bd.vest_total) h += '<tr><td colspan="4" style="padding:2px 5px;font-size:9px;border:1px solid #e0e0e0;"><strong>Total: '+bd.vest_total+'</strong></td></tr>';
    h += '</table></div>';
    // Vermis / Cervelet
    h += '<div><div style="font-size:9px;font-weight:700;color:#27ae60;margin-bottom:3px;">Vermis / Cervelet</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:9px;">';
    [['SHARP.ROMBERG','vermis_sharp'],['ROMBERG 1 PIED','vermis_1pied']].forEach(([lbl,k]) => {
      if(bd[k]) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;">'+lbl+'</td><td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;">'+cb(k)+'</td></tr>';
    });
    [['Précision doigt-nez','cerv_prec_dg'],['Coordination mvt alt.','cerv_coord'],['Précision piano','cerv_piano'],['Go-No Go','cerv_gono']].forEach(([lbl,k]) => {
      if(bd[k+'_G']||bd[k+'_D']) h += gdRow(lbl, k);
    });
    if(bd.cerv_total) h += '<tr><td colspan="3" style="padding:2px 5px;font-size:9px;border:1px solid #e0e0e0;"><strong>Total: '+bd.cerv_total+'</strong></td></tr>';
    h += '</table></div></div>';
    // Réflexes archaïques
    const reflPairs = [['RPP','refl_rpp','RTAC','refl_rtac'],['RTP','refl_rtp','GALANT','refl_galant'],['MORO','refl_moro','BABINSKI','refl_babinski'],['PEREZ','refl_perez','PLANTAIRE','refl_plantaire'],['LANDAU','refl_landau','PALMAIRE','refl_palmaire'],['REPTATION','refl_reptation','BABKIN','refl_babkin']];
    const hasRefl = reflPairs.some(([,k1,,k2])=>bd[k1+'_O']||bd[k1+'_N']||bd[k2+'_G']||bd[k2+'_D']);
    if(hasRefl) {
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">';
      h += '<div><div style="font-size:9px;font-weight:700;margin-bottom:3px;">Réflexes Archaïques</div><table style="width:100%;border-collapse:collapse;font-size:9px;">';
      h += '<tr style="background:#f5f0e8;"><th style="padding:2px 5px;border:1px solid #ddd;"></th><th style="padding:2px 5px;border:1px solid #ddd;">O</th><th style="padding:2px 5px;border:1px solid #ddd;">N</th><th style="padding:2px 5px;border:1px solid #ddd;"></th><th style="padding:2px 5px;border:1px solid #ddd;">G</th><th style="padding:2px 5px;border:1px solid #ddd;">D</th><th style="padding:2px 5px;border:1px solid #ddd;">N</th></tr>';
      reflPairs.forEach(([l1,k1,l2,k2]) => {
        h += '<tr><td style="padding:1px 4px;border:1px solid #e0e0e0;font-size:8px;font-weight:600;">'+l1+'</td>'
          +'<td style="padding:1px 4px;border:1px solid #e0e0e0;text-align:center;">'+cb(k1+'_O')+'</td>'
          +'<td style="padding:1px 4px;border:1px solid #e0e0e0;text-align:center;">'+cb(k1+'_N')+'</td>'
          +'<td style="padding:1px 4px;border:1px solid #e0e0e0;font-size:8px;font-weight:600;">'+l2+'</td>'
          +'<td style="padding:1px 4px;border:1px solid #e0e0e0;text-align:center;">'+cb(k2+'_G')+'</td>'
          +'<td style="padding:1px 4px;border:1px solid #e0e0e0;text-align:center;">'+cb(k2+'_D')+'</td>'
          +'<td style="padding:1px 4px;border:1px solid #e0e0e0;text-align:center;">'+cb(k2+'_N')+'</td></tr>';
      });
      h += '</table></div>';
      // Récepteurs tactiles
      h += '<div><div style="font-size:9px;font-weight:700;margin-bottom:3px;">Récepteurs Tactiles</div>';
      h += tblHdrGDN('Récepteur');
      [['Merkel (toucher/pression)','rect_merkel'],['Ruffini (étirement)','rect_ruffini'],['Pacini (vibration)','rect_pacini'],['TNL (piquer)','rect_tnl'],['Meissner (caresse)','rect_meissner'],['Poils (mouvement)','rect_poils']].forEach(([lbl,k]) => {
        if(bd[k+'_G']||bd[k+'_D']||bd[k+'_N']) h += gdnRow(lbl, k);
      });
      h += '</table></div></div>';
    }
    if(bd.neuro_notes) h += '<p style="font-size:9px;margin-top:6px;background:#f9f9f9;padding:5px 8px;border-radius:4px;"><strong>Notes:</strong> '+bd.neuro_notes+'</p>';
  }

  // ─── TESTS SCHÉMAS MOTEURS ───
  const schemaTests = [["Extension","schema_extension"],["Supination Mbr inf.","schema_supination_inf"],["Supination Mbr sup.","schema_supination_sup"],["Pronation Mbr inf.","schema_pronation_inf"],["Ancrage Mbr inf.","schema_ancrage_inf"],["Pronation Mbr sup.","schema_pronation_sup"]];
  const hasSchema = schemaTests.some(([,k])=>bd[k+'_aerien']||bd[k+'_terrien']);
  if(hasSchema) {
    h += sec('Tests Schémas Moteurs');
    h += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;">'
      +'<tr style="background:#f5f0e8;"><th style="padding:2px 5px;border:1px solid #ddd;text-align:left;">Test</th><th style="padding:2px 5px;border:1px solid #ddd;">Aérien (/2)</th><th style="padding:2px 5px;border:1px solid #ddd;">Terrien (/2)</th></tr>';
    schemaTests.forEach(([lbl,k]) => {
      if(bd[k+'_aerien']||bd[k+'_terrien'])
        h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;">'+lbl+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f(k+'_aerien','')+'</td>'
          +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;font-size:9px;">'+f(k+'_terrien','')+'</td></tr>';
    });
    h += '</table>';
    if(bd.schema_moteur_conclusion) h += '<p style="font-size:9px;"><strong>Conclusion:</strong> '+bd.schema_moteur_conclusion+'</p>';
  }

  // ─── PLAN DE TRAITEMENT ───
  const c1 = [1,2,3,4].some(i=>bd['c1_ex'+i]);
  const c2 = [1,2,3,4].some(i=>bd['c2_ex'+i]);
  const ch = [1,2,3,4,5,6,7,8].some(i=>bd['ch_ex'+i]);
  if(c1||c2||ch||bd.semelles_description) {
    h += sec('Plan de Traitement');
    if(c1) {
      h += '<div style="margin-bottom:8px;"><div style="font-size:9px;font-weight:700;margin-bottom:3px;">Circuit Express 1 (Demi Tabata 2min)</div>';
      h += '<table style="width:100%;border-collapse:collapse;font-size:9px;">';
      [1,2,3,4].forEach(i => { if(bd['c1_ex'+i]) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;background:#fafafa;width:70px;">30s ex.'+i+'</td><td style="padding:2px 5px;border:1px solid #e0e0e0;">'+bd['c1_ex'+i]+'</td></tr>'; });
      h += '</table></div>';
    }
    if(c2) {
      h += '<div style="margin-bottom:8px;"><div style="font-size:9px;font-weight:700;margin-bottom:3px;">Circuit Express 2 (Demi Tabata 2min)</div>';
      h += '<table style="width:100%;border-collapse:collapse;font-size:9px;">';
      [1,2,3,4].forEach(i => { if(bd['c2_ex'+i]) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;background:#fafafa;width:70px;">30s ex.'+i+'</td><td style="padding:2px 5px;border:1px solid #e0e0e0;">'+bd['c2_ex'+i]+'</td></tr>'; });
      h += '</table></div>';
    }
    if(ch) {
      h += '<div style="margin-bottom:8px;"><div style="font-size:9px;font-weight:700;margin-bottom:3px;">Circuit Échauffement EMOM (8min)</div>';
      h += '<table style="width:100%;border-collapse:collapse;font-size:9px;">';
      [1,2,3,4,5,6,7,8].forEach(i => { if(bd['ch_ex'+i]) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;background:#fafafa;width:70px;">1min ex.'+i+'</td><td style="padding:2px 5px;border:1px solid #e0e0e0;">'+bd['ch_ex'+i]+'</td></tr>'; });
      h += '</table></div>';
    }
  }

  // ─── PLAN DE SEMELLES ───
  if(bd._pieds||bd.semelles_description) {
    h += sec('Plan de Semelles');
    if(bd._pieds) h += '<img src="'+bd._pieds+'" style="max-width:380px;width:100%;border:1px solid #ddd;border-radius:5px;display:block;margin-bottom:6px;"/>';
    if(bd.semelles_description) h += '<p style="font-size:9px;"><strong>Description:</strong> '+bd.semelles_description+'</p>';
  }

  // ─── TESTS AVANT / APRÈS ───
  const taKeys=[['ta_rotation','Rotation nucale'],['ta_flexion','Flexion antérieure'],['ta_force','Force extenseurs poignet'],['ta_stabilite','Stabilité monopodale'],['ta_fukuda','Fukuda'],['ta_force_arr','Force/stabilité arrière'],['ta_mobilite','Mobilité axe corporel'],['ta_romberg','Romberg'],['ta_plateforme','Appuis plateforme']];
  if(taKeys.some(([k])=>bd[k])) {
    h += sec('Tests Avant / Après');
    h += '<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;">'
      +'<tr style="background:#f5f0e8;"><th style="padding:2px 5px;border:1px solid #ddd;text-align:left;">Test amélioré</th><th style="padding:2px 5px;border:1px solid #ddd;">Résultat</th><th style="padding:2px 5px;border:1px solid #ddd;">Observations</th></tr>';
    taKeys.forEach(([k,lbl]) => {
      if(bd[k]) h += '<tr><td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;font-weight:600;">'+lbl+'</td>'
        +'<td style="padding:2px 5px;border:1px solid #e0e0e0;text-align:center;">'+yn(k)+'</td>'
        +'<td style="padding:2px 5px;border:1px solid #e0e0e0;font-size:9px;color:#555;">'+(bd[k+'_notes']||'')+'</td></tr>';
    });
    h += '</table>';
  }

  h += '</div>';
  return h;
}

// Construit le titre de section enrichi avec la nomenclature pédagogique.
// Ex.: t.name='KFPPA Marche' + clinicalLabel='KFPPA (valgus dynamique du genou)'
//   → 'KFPPA Marche — valgus dynamique du genou'
function sectionTitle(t) {
  const m = t.clinicalLabel ? t.clinicalLabel.match(/\(([^)]+)\)/) : null;
  return m && m[1] ? `${t.name} — ${m[1]}` : t.name;
}

function buildPrintSection(t, data, conclusions) {
  // ─── Conclusions auto : boucle générique sur t.measures ───
  // Pour chaque test, pour chaque mesure, pour chaque côté D/G :
  // calcule le ratio, applique interpret*(), pousse une ligne factuelle
  // si la classification n'est pas 'dans la norme'.
  // Le rendu HTML ci-dessous reste inchangé — on alimente juste la liste conclusions.
  (t.measures || []).forEach(m => {
    const compute = MEASURE_COMPUTERS[m.key];
    const interpret = m.interpretFn === 'kfppa' ? interpretKfppa : interpretGen;
    const isAbs = m.interpretFn !== 'kfppa'; // KFPPA conserve le signe (valgus/varus)
    if (!compute) return;
    ['D', 'G'].forEach(side => {
      const ratio = compute(t, data, side);
      if (ratio == null) return;
      const ratioForInterpret = isAbs ? Math.abs(ratio) : ratio;
      const classification = interpret(ratioForInterpret);
      if (classification === 'dans la norme' || classification === '—') return;
      const pct = Math.round((isAbs ? Math.abs(ratio) : ratio) * 100);
      const sideLabel = side === 'D' ? 'droit' : 'gauche';
      conclusions.push(`${t.target} ${sideLabel} · ${m.label} : ${pct} % (norme : ${m.norm}) — ${classification}`);
    });
  });

  const hasSides=t.div!==undefined||t.normDiv!==undefined||t.normAm!==undefined||t.mlaTest||t.normVerrou!==undefined||t.normMob!==undefined;
  let written='', sectionHTML='';

  if(hasSides) {
    sectionHTML+=`<div class="rp-section">
      <div class="rp-section-title">${sectionTitle(t)}</div>
      <div class="rp-side-grid">
        ${buildPrintSide('D',t,data)}
        ${buildPrintSide('G',t,data)}
      </div>`;

    // Texte clinique
    const lines=[];
    if(t.div!==undefined){
      // Recalculer depuis photos pour la synthèse
      const _bip=data.photos?.find(p=>p.side==='');
      const _uD=data.photos?.find(p=>p.side==='D');
      const _uG=data.photos?.find(p=>p.side==='G');
      const _toI=(v)=>v==null?null:(v>90?180-v:v);
      const _bdD=_toI(_bip?.angleD), _bdG=_toI(_bip?.angleG);
      const _udD=_toI(_uD?.angle), _udG=_toI(_uG?.angle);
      const _dD=(_bdD!=null&&_udD!=null)?_udD-_bdD:_toI(data.deltaD);
      const _dG=(_bdG!=null&&_udG!=null)?_udG-_bdG:_toI(data.deltaG);
      const _pD=_dD!=null?_dD/t.div:null;
      const _pG=_dG!=null?_dG/t.div:null;
      const pD=_pD,pG=_pG;
      const vD=pD!=null&&!isNaN(pD)?Math.round(pD*100):null,vG=pG!=null&&!isNaN(pG)?Math.round(pG*100):null;
      const normStr=`${t.normeMin}°–${t.normeMax}°`;
      if(vD!==null) lines.push(`<strong>Genou droit :</strong> KFPPA = ${data.deltaD?.toFixed(1)||'—'}° (${vD}%) — ${interpretKfppa(pD)}`);
      if(vG!==null) lines.push(`<strong>Genou gauche :</strong> KFPPA = ${data.deltaG?.toFixed(1)||'—'}° (${vG}%) — ${interpretKfppa(pG)}`);
      lines.push(`Norme physiologique : ${normStr}`);
    } else if(t.normDiv!==undefined||t.mlaTest){
      const vD=(data.pctD!=null&&!isNaN(data.pctD))?Math.round(data.pctD*100):null;
      const vG=(data.pctG!=null&&!isNaN(data.pctG))?Math.round(data.pctG*100):null;
      const normStr=t.normDiv?`Norme amortisseur: ${t.normDiv}° = 100% · Att/Prop: ${t.propNorm||'—'}° · Écrasement: ${t.ecrNorm||'—'}°`:'';
      if(normStr) lines.push(`<em style="color:#888;">${normStr}</em>`);
      if(vD!==null) lines.push(`<strong>Pied droit :</strong> Fonction amortisseur MLA = ${vD}% — ${interpretGen(data.pctD)}`);
      if(vG!==null) lines.push(`<strong>Pied gauche :</strong> Fonction amortisseur MLA = ${vG}% — ${interpretGen(data.pctG)}`);
    } else if(t.normAm!==undefined){
      const amD=data.amD!==null?Math.round(data.amD*100):null;
      const amG=data.amG!==null?Math.round(data.amG*100):null;
      const prD=data.prD!==null?Math.round(data.prD*100):null;
      const prG=data.prG!==null?Math.round(data.prG*100):null;
      lines.push(`<em style="color:#888;">Norme amorti/propulsion: ${t.normAm}°=100% · Tal: Inv+${t.normAm===8?2:4}° · Plan: Év-${t.normAm===8?6:8}° · Dig: Inv+${t.normAm===8?2:4}°</em>`);
      if(amD!==null) lines.push(`<strong>Pied droit :</strong> Amorti ${amD}% · Propulsion ${prD||'—'}%`);
      if(amG!==null) lines.push(`<strong>Pied gauche :</strong> Amorti ${amG}% · Propulsion ${prG||'—'}%`);
    }

    if(lines.length) written=`<div class="rp-written">${lines.join('<br>')}</div>`;
    sectionHTML+=written+'</div>';
  } else {
    // Tests AP : verrouillage, mobilité + photos
    const photos = data.photos || [];
    const photosD = photos.filter(p=>p.side==='D');
    const photosG = photos.filter(p=>p.side==='G');
    const lines=[];

    if(t.normVerrou!==undefined){
      // Verrouillage AP - données depuis photos sauvegardées
      const statD=photosD[0]?.angle, pointeD=photosD[1]?.angle;
      const statG=photosG[0]?.angle, pointeG=photosG[1]?.angle;
      const rfD=pointeD!=null?pointeD/t.normVerrou:null;
      const molD=(pointeD!=null&&statD!=null)?(pointeD-statD)/t.normVerrou:null;
      const rfG=pointeG!=null?pointeG/t.normVerrou:null;
      const molG=(pointeG!=null&&statG!=null)?(pointeG-statG)/t.normVerrou:null;
      const apV=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
      sectionHTML+=`<div class="rp-section"><div class="rp-section-title">${sectionTitle(t)}</div>
        <div class="rp-side-grid">
          <div><strong style="color:#185FA5;">Pied Droit</strong><br>
            Statique: ${apV(statD)} (N: 0°)<br>
            Pointe: ${apV(pointeD)} (N: Inv +10°)<br>
            Verrouillage RF: ${rfD!=null?Math.round(Math.abs(rfD)*100)+'%':'—'} (N: 10°=100%)<br>
            Force mollet: ${molD!=null?Math.round(Math.abs(molD)*100)+'%':'—'} (N: 10°=100%)
          </div>
          <div><strong style="color:#0B6B2C;">Pied Gauche</strong><br>
            Statique: ${apV(statG)} (N: 0°)<br>
            Pointe: ${apV(pointeG)} (N: Inv +10°)<br>
            Verrouillage RF: ${rfG!=null?Math.round(Math.abs(rfG)*100)+'%':'—'} (N: 10°=100%)<br>
            Force mollet: ${molG!=null?Math.round(Math.abs(molG)*100)+'%':'—'} (N: 10°=100%)
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          ${photos.map(p=>p.dataUrl?`<div style="text-align:center;"><img src="${p.dataUrl}" style="height:80px;border-radius:4px;border:1px solid #ccc;"><br><span style="font-size:8px;">${p.label}</span></div>`:'').join('')}
        <div style="background:#f9f9f9;border-left:3px solid #c8a96e;padding:8px 12px;margin-top:8px;font-size:10px;color:#333;line-height:1.6;">
        <em style="color:#888;">Norme: Statique 0deg - Pointe Inv+10deg - RF 10deg=100%</em><br>
        Pied droit: Stat: ${statD!=null?Math.abs(statD).toFixed(1)+'deg':'-'} - RF: ${rfD!=null?Math.round(Math.abs(rfD)*100)+'%':'-'} - Mollet: ${molD!=null?Math.round(Math.abs(molD)*100)+'%':'-'}<br>
        Pied gauche: Stat: ${statG!=null?Math.abs(statG).toFixed(1)+'deg':'-'} - RF: ${rfG!=null?Math.round(Math.abs(rfG)*100)+'%':'-'} - Mollet: ${molG!=null?Math.round(Math.abs(molG)*100)+'%':'-'}
      </div>
      </div>`;
      // Recalculer depuis photos si rfD/rfG null
      const _phD2=(data.photos||[]).filter(p=>p.side==='D');
      const _phG2=(data.photos||[]).filter(p=>p.side==='G');
      const _statD2=_phD2[0]?.angle,_pointeD2=_phD2[1]?.angle;
      const _statG2=_phG2[0]?.angle,_pointeG2=_phG2[1]?.angle;
      const _rfD2=_pointeD2!=null?_pointeD2/t.normVerrou:rfD;
      const _molD2=(_pointeD2!=null&&_statD2!=null)?(_pointeD2-_statD2)/t.normVerrou:molD;
      const _rfG2=_pointeG2!=null?_pointeG2/t.normVerrou:rfG;
      const _molG2=(_pointeG2!=null&&_statG2!=null)?(_pointeG2-_statG2)/t.normVerrou:molG;
      const _iV2=(p)=>p==null?'':Math.abs(p)*100>=66?'Dans la norme':'Hors norme - mauvais verrouillage';
      sectionHTML+=`<div class="rp-written"><strong>Pied droit:</strong> RF: ${_rfD2!=null?Math.round(Math.abs(_rfD2)*100)+'%':'-'} - Mollet: ${_molD2!=null?Math.round(Math.abs(_molD2)*100)+'%':'-'} - ${_iV2(_rfD2)}<br><strong>Pied gauche:</strong> RF: ${_rfG2!=null?Math.round(Math.abs(_rfG2)*100)+'%':'-'} - Mollet: ${_molG2!=null?Math.round(Math.abs(_molG2)*100)+'%':'-'} - ${_iV2(_rfG2)}</div>`;
    }
    else if(t.normMob!==undefined){
      // Mobilité AP
      const p0=photos[0], p1=photos[1];
      const invD=p0?.angleD, evD=p1?.angleD, invG=p0?.angleG, evG=p1?.angleG;
      const mobD=(invD!=null&&evD!=null)?(invD-evD)/t.normMob:null;
      const mobG=(invG!=null&&evG!=null)?(invG-evG)/t.normMob:null;
      const apV2=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
      sectionHTML+=`<div class="rp-section"><div class="rp-section-title">${sectionTitle(t)}</div>
        <div class="rp-side-grid">
          <div><strong style="color:#185FA5;">Pied Droit</strong><br>
            Inversion: ${apV2(invD)} (N: +20°)<br>
            Éversion: ${apV2(evD)} (N: −10°)<br>
            Mobilité: ${invD!=null&&evD!=null?(invD-evD).toFixed(1)+'°':'—'} — ${mobD!=null?Math.round(Math.abs(mobD)*100)+'%':'—'} (N: 30°=100%)
          </div>
          <div><strong style="color:#0B6B2C;">Pied Gauche</strong><br>
            Inversion: ${apV2(invG)} (N: +20°)<br>
            Éversion: ${apV2(evG)} (N: −10°)<br>
            Mobilité: ${invG!=null&&evG!=null?(invG-evG).toFixed(1)+'°':'—'} — ${mobG!=null?Math.round(Math.abs(mobG)*100)+'%':'—'} (N: 30°=100%)
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          ${photos.map(p=>p.dataUrl?`<div style="text-align:center;"><img src="${p.dataUrl}" style="height:80px;border-radius:4px;border:1px solid #ccc;"><br><span style="font-size:8px;">${p.label}</span></div>`:'').join('')}
        </div>
      </div>`;
      const _mobDpct=mobD!=null?Math.round(Math.abs(mobD)*100):null;
      const _mobGpct=mobG!=null?Math.round(Math.abs(mobG)*100):null;
      sectionHTML+=`<div class="rp-written">
        <em style="color:#888;">Norme : Inv +20° · Év −10° · Mobilité 30°=100%</em><br>
        <strong>Pied droit :</strong> Inv: ${apV2(invD)} · Év: ${apV2(evD)} · Mobilité: ${invD!=null&&evD!=null?(invD-evD).toFixed(1)+'°':'—'} (${_mobDpct!=null?_mobDpct+'%':'—'}) — ${mobD!=null?interpretGen(Math.abs(mobD)):'—'}<br>
        <strong>Pied gauche :</strong> Inv: ${apV2(invG)} - Ev: ${apV2(evG)} - Mobilite: ${invG!=null&&evG!=null?(invG-evG).toFixed(1)+'deg':'-'} (${_mobGpct!=null?_mobGpct+'%':'-'}) - ${mobG!=null?interpretGen(Math.abs(mobG)):'—'}
      </div></div>`;
      sectionHTML+=`<div class="rp-written"><strong>Pied droit :</strong> Mobilité : ${_mobDpct!=null?_mobDpct+'%':'—'} — ${mobD==null?'':Math.abs(mobD)*100>=66?'dans la norme':Math.abs(mobD)*100>=33?'valeur limite':'hors norme'}<br><strong>Pied gauche :</strong> Mobilité : ${_mobGpct!=null?_mobGpct+'%':'—'} — ${mobG==null?'':Math.abs(mobG)*100>=66?'dans la norme':Math.abs(mobG)*100>=33?'valeur limite':'hors norme'}</div>`;
    }
    else {
      sectionHTML+=buildPrintSingleSide(t,data);
    }
  }
  return sectionHTML;
}

function buildPrintSide(side, t, data) {
  const sideC=side==='D'?'#185FA5':'#0B6B2C';
  const sideLabel=side==='D'?'Côté Droit':'Côté Gauche';
  let pct=null,ang=null,_kfppaUniAng=null;

  if(t.div!==undefined){
    const bipodal=data.photos?.find(p=>p.side==='');
    const uni=data.photos?.find(p=>p.side===side);
    const _toIncl=(v)=>v==null?null:(v>90?180-v:v);
    const bipAng=_toIncl(side==='D'?bipodal?.angleD:bipodal?.angleG);
    const uniAng=_toIncl(uni?.angle);
    _kfppaUniAng=uniAng;
    if(bipAng!=null&&uniAng!=null){
      ang=uniAng-bipAng;
      pct=ang/t.div;
    } else {
      pct=side==='D'?data.pctD:data.pctG;
      ang=side==='D'?data.deltaD:data.deltaG;
      const _ti2=(v)=>v==null?null:(v>90?180-v:v);
      if(ang!=null) ang=_ti2(ang);
    }
  }
  else if(t.normDiv!==undefined||t.mlaTest){
    pct=side==='D'?data.pctD:data.pctG;
    ang=side==='D'?data.deltaD:data.deltaG; // delta = écr - prop
    // Si pas de données calculées, recalculer depuis photos
    if((pct==null||isNaN(pct)) && data.photos?.length) {
      const ph=data.photos.filter(p=>p.side===side);
      const prop=ph[0]?.angle, ecr=ph[1]?.angle;
      if(prop!=null&&ecr!=null){ang=ecr-prop;pct=ang/(t.normDiv||20);}
    }
  }
  else if(t.normAm!==undefined){
    let am=side==='D'?data.amD:data.amG, pr=side==='D'?data.prD:data.prG;
    let talV=data.phases?.[side]?.tal, planV=data.phases?.[side]?.plan, digV=data.phases?.[side]?.dig;
    if((am==null||isNaN(am)) && data.photos?.length) {
      const ph2=data.photos.filter(p=>p.side===side);
      talV=ph2[0]?.angle; planV=ph2[1]?.angle; digV=ph2[2]?.angle;
      if(talV!=null&&planV!=null) am=Math.abs(talV-planV)/t.normAm;
      if(digV!=null&&planV!=null) pr=Math.abs(digV-planV)/t.normAm;
    }
    const _apVa=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
    const _cssAm=rp_cssColor(am,false), _cssPr=rp_cssColor(pr,false);
    const _r2=35,_circ=2*Math.PI*_r2;
    const _fillAm=am!=null?_circ*Math.min(100,Math.max(0,Math.abs(am)*100))/100:0;
    const _fillPr=pr!=null?_circ*Math.min(100,Math.max(0,Math.abs(pr)*100))/100:0;
    const _ph=buildPrintPhotos(data,side,t);
    return `<div class="rp-side-block rp-side-${side}">
      <div class="rp-side-title">${side==='D'?'Côté Droit':'Côté Gauche'}</div>
      <div style="font-size:9px;color:#888;margin-bottom:4px;">Taligrade: ${_apVa(talV)} · Plantigrade: ${_apVa(planV)} · Digitigrade: ${_apVa(digV)}</div>
      <div class="rp-gauge-photos">
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div class="rp-gauge" style="width:80px;height:80px;">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="${_r2}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
              ${am!=null?`<circle cx="40" cy="40" r="${_r2}" fill="none" stroke="${_cssAm}" stroke-width="8" stroke-dasharray="${_fillAm} ${_circ}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
            </svg>
            <div class="rp-gauge-inner">
              <div class="rp-gauge-pct" style="color:${_cssAm};font-size:11px;">${am!=null?Math.round(Math.abs(am)*100)+'%':'—'}</div>
              <div class="rp-gauge-deg" style="font-size:7px;">Amorti</div>
            </div>
          </div>
          <div class="rp-gauge" style="width:80px;height:80px;">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="${_r2}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
              ${pr!=null?`<circle cx="40" cy="40" r="${_r2}" fill="none" stroke="${_cssPr}" stroke-width="8" stroke-dasharray="${_fillPr} ${_circ}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
            </svg>
            <div class="rp-gauge-inner">
              <div class="rp-gauge-pct" style="color:${_cssPr};font-size:11px;">${pr!=null?Math.round(Math.abs(pr)*100)+'%':'—'}</div>
              <div class="rp-gauge-deg" style="font-size:7px;">Propuls.</div>
            </div>
          </div>
        </div>
        ${_ph}
      </div>
      <div style="font-size:9px;margin-top:4px;">Amorti: <b style="color:${_cssAm};">${am!=null?Math.round(Math.abs(am)*100)+'%':'—'}</b> · Propulsion: <b style="color:${_cssPr};">${pr!=null?Math.round(Math.abs(pr)*100)+'%':'—'}</b> (N:${t.normAm}°=100%)</div>
    </div>`;
  }

  // Verrouillage AP
  if(t.normVerrou!==undefined){
    const photos=data.photos||[];
    const ph=photos.filter(p=>p.side===side);
    const stat=ph[0]?.angle, pointe=ph[1]?.angle;
    ang=pointe; pct=pointe!=null?pointe/t.normVerrou:null;
    const mol=(pointe!=null&&stat!=null)?(pointe-stat)/t.normVerrou:null;
    const apVv=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
    const cssVv=rp_cssColor(pct,false);
    const r2v=35,cv=2*Math.PI*r2v,fv=pct!=null?cv*Math.min(100,Math.max(0,Math.abs(pct)*100))/100:0;
    return `<div class="rp-side-block rp-side-${side}">
      <div class="rp-side-title">${side==='D'?'Côté Droit':'Côté Gauche'}</div>
      <div class="rp-gauge-photos">
        <div class="rp-gauge"><svg width="90" height="90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${r2v}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
          ${pct!=null?`<circle cx="40" cy="40" r="${r2v}" fill="none" stroke="${cssVv}" stroke-width="8" stroke-dasharray="${fv} ${cv}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
        </svg><div class="rp-gauge-inner">
          <div class="rp-gauge-pct" style="color:${cssVv};">${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'}</div>
          <div class="rp-gauge-deg">${ang!=null?Number(ang).toFixed(1)+'°':'—'}</div>
        </div></div>
        ${buildPrintPhotos(data,side,t)}
      </div>
      <div style="font-size:9px;margin-top:4px;">Stat: ${apVv(stat)} (N:0°) · Pointe: ${apVv(pointe)} (N:Inv+10°)</div>
      <div style="font-size:9px;">RF: ${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'} · Mollet: ${mol!=null?Math.round(Math.abs(mol)*100)+'%':'—'} (N:10°=100%)</div>
      <div style="text-align:center;margin-top:4px;">
        ${pct!=null?`<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;background:${Math.abs(pct)*100>=66?'#d4edda':Math.abs(pct)*100>=33?'#fff3cd':'#f8d7da'};color:${Math.abs(pct)*100>=66?'#155724':Math.abs(pct)*100>=33?'#856404':'#721c24'};">${Math.abs(pct)*100>=66?'Normal':Math.abs(pct)*100>=33?'Limite':'Hors norme'}</span>`:''}
        <div style="font-size:8px;color:#888;margin-top:3px;">Norme : Statique 0° · Pointe Inv+10° · RF 10°=100%</div>
      </div>
    </div>`;
  }
  // Mobilité AP
  if(t.normMob!==undefined){
    const photos=data.photos||[];
    const p0=photos[0], p1=photos[1];
    const invA=side==='D'?p0?.angleD:p0?.angleG;
    const evA=side==='D'?p1?.angleD:p1?.angleG;
    ang=(invA!=null&&evA!=null)?invA-evA:null;
    pct=ang!=null?ang/t.normMob:null;
    const apVm=(v)=>v==null?'—':(v>0?'Inv (+)':'Év (−)')+' '+Math.abs(v).toFixed(1)+'°';
    const cssM=rp_cssColor(pct,false);
    const r2m=35,cm=2*Math.PI*r2m,fm=pct!=null?cm*Math.min(100,Math.max(0,Math.abs(pct)*100))/100:0;
    return `<div class="rp-side-block rp-side-${side}">
      <div class="rp-side-title">${side==='D'?'Côté Droit':'Côté Gauche'}</div>
      <div class="rp-gauge-photos">
        <div class="rp-gauge"><svg width="90" height="90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${r2m}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
          ${pct!=null?`<circle cx="40" cy="40" r="${r2m}" fill="none" stroke="${cssM}" stroke-width="8" stroke-dasharray="${fm} ${cm}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
        </svg><div class="rp-gauge-inner">
          <div class="rp-gauge-pct" style="color:${cssM};">${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'}</div>
          <div class="rp-gauge-deg">${ang!=null?Number(ang).toFixed(1)+'°':'—'}</div>
        </div></div>
        ${buildPrintPhotos(data,'',t)}
      </div>
      <div style="font-size:9px;margin-top:4px;">Inv: ${apVm(invA)} (N:+20°) · Év: ${apVm(evA)} (N:−10°)</div>
      <div style="font-size:9px;">Mobilité: ${ang!=null?ang.toFixed(1)+'°':'—'} — ${pct!=null?Math.round(Math.abs(pct)*100)+'%':'—'} (N:30°=100%)</div>
      <div style="text-align:center;margin-top:4px;">
        ${pct!=null?`<span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:10px;font-weight:600;background:${Math.abs(pct)*100>=66?'#d4edda':Math.abs(pct)*100>=33?'#fff3cd':'#f8d7da'};color:${Math.abs(pct)*100>=66?'#155724':Math.abs(pct)*100>=33?'#856404':'#721c24'};">${Math.abs(pct)*100>=66?'Normal':Math.abs(pct)*100>=33?'Limite':'Hors norme'}</span>`:''}
        <div style="font-size:8px;color:#888;margin-top:3px;">Norme : Inv +20° · Év −10° · Mobilité 30°=100%</div>
      </div>
    </div>`;
  }
  const pctVal=pct!==null?Math.round(pct*100):null;
  const isGenou=t.div!==undefined;
  const cssC=rp_cssColor(pct,isGenou);
  const r=35,circ=2*Math.PI*r,fill=circ*Math.min(100,Math.max(0,pctVal||0))/100;
  const badgeCls=rp_badgeCls(pct,isGenou);
  const badgeTxt=rp_badgeTxt(pct,isGenou);
  const ph=buildPrintPhotos(data,side,t,_kfppaUniAng||undefined);

  return `<div class="rp-side-block rp-side-${side}">
    <div class="rp-side-title">${sideLabel}</div>
    <div class="rp-gauge-photos">
      <div class="rp-gauge">
        <svg width="90" height="90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="${r}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>
          ${pctVal!==null?`<circle cx="40" cy="40" r="${r}" fill="none" stroke="${cssC}" stroke-width="8" stroke-dasharray="${fill} ${circ}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
        </svg>
        <div class="rp-gauge-inner">
          <div class="rp-gauge-pct" style="color:${cssC};">${pctVal!==null?pctVal+'%':'—'}</div>
          <div class="rp-gauge-deg">${ang!=null?Number(ang).toFixed(1)+'°':'—'}</div>
        </div>
      </div>
      ${ph}
    </div>
    <div style="margin-top:4px;text-align:center;"><span class="${badgeCls}">${badgeTxt}</span></div>
    ${t.normeMin!==undefined?`<div class="rp-gauge-norm">Norme : ${t.normeMin}°–${t.normeMax}°</div>`:''}
  </div>`;
}

function buildPrintSingleSide(t,data) {
  const photos=(data.photos||[]);
  const isVerrou=t.normVerrou!==undefined;
  const val=isVerrou?data.rfPct:data.mobPct;
  const pctVal=val!==null&&val!==undefined?Math.round(val*100):null;
  const cssC=rp_cssColor(val,false);
  const r=35,circ=2*Math.PI*r,fill=circ*Math.min(100,Math.max(0,pctVal||0))/100;
  const phHTML=photos.slice(0,2).map((ph,i)=>`
    <div class="rp-photo-wrap">
      <div class="rp-photo-lbl">${ph.label}</div>
      ${ph.dataUrl?`<img src="${ph.dataUrl}"/>`:'<div class="rp-photo-empty">Pas de photo</div>'}
      ${ph.angle!=null?`<div class="rp-photo-ang" style="color:${cssC};">${ph.angle.toFixed(1)}°</div>`:''}
    </div>`).join('');
  return `<div class="rp-section">
    <div class="rp-section-title">${sectionTitle(t)}</div>
    <div class="rp-test-block">
      <div class="rp-gauge-photos">
        <div class="rp-gauge">
          <svg width="90" height="90" viewBox="0 0 80 80"><circle cx="40" cy="40" r="${r}" fill="none" stroke="#e0e0e0" stroke-width="8" transform="rotate(-90,40,40)"/>${pctVal!==null?`<circle cx="40" cy="40" r="${r}" fill="none" stroke="${cssC}" stroke-width="8" stroke-dasharray="${fill} ${circ}" stroke-linecap="round" transform="rotate(-90,40,40)"/>`:''}
          </svg>
          <div class="rp-gauge-inner"><div class="rp-gauge-pct" style="color:${cssC};">${pctVal!==null?pctVal+'%':'—'}</div><div class="rp-gauge-deg">${isVerrou?'Verr.':'Mob.'}</div></div>
        </div>
        ${phHTML}
      </div>
      ${isVerrou&&data.molPct!=null?`<div style="font-size:10px;margin-top:4px;">Force mollet : <strong style="color:${rp_cssColor(data.molPct,false)};">${Math.round(data.molPct*100)}%</strong></div>`:''}
    </div>
    ${(()=>{
      const photosD=(data.photos||[]).filter(p=>p.side==='D');
      const photosG=(data.photos||[]).filter(p=>p.side==='G');
      if(isVerrou){
        const statD=photosD[0]?.angle,pointeD=photosD[1]?.angle;
        const statG=photosG[0]?.angle,pointeG=photosG[1]?.angle;
        const rfD=pointeD!=null?pointeD/t.normVerrou:null;
        const molD=(pointeD!=null&&statD!=null)?(pointeD-statD)/t.normVerrou:null;
        const rfG=pointeG!=null?pointeG/t.normVerrou:null;
        const molG=(pointeG!=null&&statG!=null)?(pointeG-statG)/t.normVerrou:null;
        const iV=(p)=>{if(p==null)return'-';const v=Math.abs(p)*100;if(v>=66)return'dans la norme';if(v>=33)return'limite';return'hors norme - mauvais verrouillage';};
        const apVs=(v)=>v==null?'-':(v>0?'Inv (+)':'Ev (-)')+' '+Math.abs(v).toFixed(1)+'deg';
        return `<div style="background:#f9f9f9;border-left:3px solid #c8a96e;padding:8px 12px;margin-top:8px;font-size:10px;color:#333;line-height:1.6;">
          <em style="color:#888;">Norme: Statique 0deg - Pointe Inv+10deg - RF 10deg=100%</em><br>
          <strong>Pied droit:</strong> Stat: ${apVs(statD)} - Pointe: ${apVs(pointeD)} - RF: ${rfD!=null?Math.round(Math.abs(rfD)*100)+'%':'-'} - Mollet: ${molD!=null?Math.round(Math.abs(molD)*100)+'%':'-'} - ${iV(rfD)}<br>
          <strong>Pied gauche:</strong> Stat: ${apVs(statG)} - Pointe: ${apVs(pointeG)} - RF: ${rfG!=null?Math.round(Math.abs(rfG)*100)+'%':'-'} - Mollet: ${molG!=null?Math.round(Math.abs(molG)*100)+'%':'-'} - ${iV(rfG)}
        </div>`;
      } else {
        const p0=data.photos?.[0],p1=data.photos?.[1];
        const invD=p0?.angleD,evD=p1?.angleD,invG=p0?.angleG,evG=p1?.angleG;
        const mobD=(invD!=null&&evD!=null)?(invD-evD)/t.normMob:null;
        const mobG=(invG!=null&&evG!=null)?(invG-evG)/t.normMob:null;
        const iM=(p)=>{if(p==null)return'-';const v=Math.abs(p)*100;if(v>=66)return'dans la norme';if(v>=33)return'limite';return'hors norme - mobilite tres limitee';};
        const apVm=(v)=>v==null?'-':(v>0?'Inv (+)':'Ev (-)')+' '+Math.abs(v).toFixed(1)+'deg';
        return `<div style="background:#f9f9f9;border-left:3px solid #c8a96e;padding:8px 12px;margin-top:8px;font-size:10px;color:#333;line-height:1.6;">
          <em style="color:#888;">Norme: Inv +20deg - Ev -10deg - Mobilite 30deg=100%</em><br>
          <strong>Pied droit:</strong> Inv: ${apVm(invD)} - Ev: ${apVm(evD)} - Mobilite: ${invD!=null&&evD!=null?(invD-evD).toFixed(1)+'deg':'-'} (${mobD!=null?Math.round(Math.abs(mobD)*100)+'%':'-'}) - ${iM(mobD)}<br>
          <strong>Pied gauche:</strong> Inv: ${apVm(invG)} - Ev: ${apVm(evG)} - Mobilite: ${invG!=null&&evG!=null?(invG-evG).toFixed(1)+'deg':'-'} (${mobG!=null?Math.round(Math.abs(mobG)*100)+'%':'-'}) - ${iM(mobG)}
        </div>`;
      }
    })()}
    </div>`;
}

function buildPrintPhotos(data,side,t,angleOverride) {
  const allPhotos=data.photos||[];
  // Filtrer par côté si side est défini, sinon prendre toutes les photos sans côté
  const photos=side
    ? allPhotos.filter(p=>p.side===side)
    : allPhotos.filter(p=>!p.side);
  const frames=data.frames||[];
  let items=[];
  if(photos.length) {
    items=photos;
  } else if(frames.length) {
    items=frames.slice(0,3).map((f,i)=>({
      label:t.frameLabels?.[i]||'Frame '+(i+1),
      dataUrl:f.dataUrl,
      angle:side==='D'?f.angD:f.angG
    }));
  }
  if(!items.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;justify-content:flex-start;">
    ${items.map(ph=>ph?.dataUrl?`
      <div style="text-align:center;flex:0 0 auto;">
        <img src="${ph.dataUrl}" style="height:70px;width:auto;max-width:120px;object-fit:contain;border-radius:3px;border:1px solid #ddd;display:block;"/>
        <div style="font-size:7px;color:#666;margin-top:2px;">${ph.label||''}</div>
        ${ph?.angle!=null?`<div style="font-size:8px;font-weight:700;color:#333;">${Number(angleOverride!=null?angleOverride:ph.angle).toFixed(1)}°</div>`:''}
      </div>`:'').join('')}
  </div>`;
}

function rp_cssColor(p,genou){
  if(p===null||p===undefined)return'#aaa';
  const v=p*100;
  if(genou) return v>=60&&v<=140?'#1a7a3e':v>=20&&v<=180?'#856404':'#b30021';
  return v>=66?'#1a7a3e':v>=33?'#856404':'#b30021';
}
function rp_badgeCls(p,genou){
  if(p===null||p===undefined)return'rp-badge-r';
  const v=p*100;
  if(genou) return v>=60&&v<=140?'rp-badge-g':v>=20&&v<=180?'rp-badge-o':'rp-badge-r';
  return v>=66?'rp-badge-g':v>=33?'rp-badge-o':'rp-badge-r';
}
function rp_badgeTxt(p,genou){
  if(p===null||p===undefined)return'—';
  const v=p*100;
  if(genou) return v>=60&&v<=140?'Normal':v>=20&&v<=180?'Limite':'Hors norme';
  return v>=66?'Normal':v>=33?'Limite':'Hors norme';
}
function interpretKfppa(p){if(p===null)return'—';const v=p*100;if(v>=60&&v<=140)return'dans la norme';if(v>=20&&v<=180)return'valeur limite';return'hors norme';}
function interpretGen(p){if(p===null)return'—';const v=p*100;if(v>=66)return'dans la norme';if(v>=33)return'valeur limite';return'hors norme';}

// ══════════════════════════════════════════════════════
// BILAN CLINIQUE
// ══════════════════════════════════════════════════════
let bilanData = {};
let drawTool = 'pen';
let drawColor = '#e74c3c';
let drawSize = 4;
let curveDir = 1; // +1 = courbe droite, -1 = courbe gauche
let isDrawing = false;
let drawStart = {x:0,y:0};
let micRecognition = null;
let micActive = false;
let micTargetField = null;

// Silhouettes morphostatiques (dessin sur canvas avec bonhomme SVG)
const MORPHO_SVG_FACE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 200" width="120" height="200">
  <ellipse cx="60" cy="18" rx="14" ry="16" fill="#d4b896" stroke="#8b6914" stroke-width="1.2"/>
  <rect x="46" y="33" width="28" height="40" rx="6" fill="#d4b896" stroke="#8b6914" stroke-width="1.2"/>
  <line x1="46" y1="38" x2="22" y2="72" stroke="#8b6914" stroke-width="3" stroke-linecap="round"/>
  <line x1="74" y1="38" x2="98" y2="72" stroke="#8b6914" stroke-width="3" stroke-linecap="round"/>
  <line x1="52" y1="73" x2="45" y2="130" stroke="#8b6914" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="68" y1="73" x2="75" y2="130" stroke="#8b6914" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="45" y1="130" x2="40" y2="180" stroke="#8b6914" stroke-width="3" stroke-linecap="round"/>
  <line x1="75" y1="130" x2="80" y2="180" stroke="#8b6914" stroke-width="3" stroke-linecap="round"/>
  <line x1="40" y1="180" x2="30" y2="190" stroke="#8b6914" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="80" y1="180" x2="90" y2="190" stroke="#8b6914" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="60" y1="73" x2="60" y2="130" stroke="#8b6914" stroke-width="1.5" stroke-dasharray="2,2"/>
  <line x1="22" y1="110" x2="98" y2="110" stroke="#e74c3c" stroke-width="1.5"/>
</svg>`;

function initMorphoCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const parent = canvas.parentElement;
  if(!parent) return;
  const r = parent.getBoundingClientRect();
  if(r.width === 0) return;
  canvas.width = Math.round(r.width * window.devicePixelRatio);
  canvas.height = Math.round(r.height * window.devicePixelRatio);
  canvas.style.width = r.width + 'px';
  canvas.style.height = r.height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  canvas._history = []; canvas._baseSnapshot = null; canvas._tempSnap = null;
  // NB: les images sont maintenant dans le DOM via <img>, pas dans le canvas
  // On ne restaure plus l'ancien format (image+dessin fusionnés)
  setTimeout(() => { canvas._baseSnapshot = ctx.getImageData(0,0,canvas.width,canvas.height); }, 100);
  setupDrawCanvas(canvas, canvasId);
}

function drawSilhouetteFace(ctx, W, H) {
  const s=H/230, cx=W/2;
  ctx.save(); ctx.fillStyle='#d4b896'; ctx.strokeStyle='#8b6914'; ctx.lineWidth=1.5;
  ctx.translate(cx, H*0.04); ctx.scale(s*0.52, s*0.52);
  // Tête
  ctx.beginPath(); ctx.ellipse(0,0,26,30,0,0,2*Math.PI); ctx.fill(); ctx.stroke();
  // Cou
  ctx.beginPath(); ctx.rect(-8,28,16,16); ctx.fill(); ctx.stroke();
  // Tronc
  ctx.beginPath(); ctx.moveTo(-30,44); ctx.bezierCurveTo(-36,56,-36,100,-30,138); ctx.lineTo(30,138); ctx.bezierCurveTo(36,100,36,56,30,44); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Bras G
  ctx.beginPath(); ctx.moveTo(-30,48); ctx.bezierCurveTo(-52,70,-60,95,-54,118); ctx.lineTo(-42,114); ctx.bezierCurveTo(-48,92,-40,68,-26,52); ctx.fill(); ctx.stroke();
  // Bras D
  ctx.beginPath(); ctx.moveTo(30,48); ctx.bezierCurveTo(52,70,60,95,54,118); ctx.lineTo(42,114); ctx.bezierCurveTo(48,92,40,68,26,52); ctx.fill(); ctx.stroke();
  // Jambe G
  ctx.beginPath(); ctx.moveTo(-18,136); ctx.bezierCurveTo(-22,170,-22,195,-18,218); ctx.lineTo(-4,218); ctx.bezierCurveTo(0,195,0,170,-2,138); ctx.fill(); ctx.stroke();
  // Jambe D
  ctx.beginPath(); ctx.moveTo(18,136); ctx.bezierCurveTo(22,170,22,195,18,218); ctx.lineTo(4,218); ctx.bezierCurveTo(0,195,0,170,2,138); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawSilhouetteProfil(ctx, W, H, facingRight) {
  const s=H/240, cx=facingRight?W*0.52:W*0.48;
  ctx.save(); ctx.fillStyle='#d4b896'; ctx.strokeStyle='#8b6914'; ctx.lineWidth=1.8;
  ctx.translate(cx, H*0.03); ctx.scale(s*0.48, s*0.48);
  if(!facingRight) { ctx.scale(-1,1); }
  // Tête profil
  ctx.beginPath();
  ctx.moveTo(0,-15); ctx.bezierCurveTo(20,-15,30,0,28,18);
  ctx.bezierCurveTo(26,34,16,42,0,40); ctx.bezierCurveTo(-10,38,-14,26,-10,16);
  ctx.bezierCurveTo(-8,6,-4,-2,0,-15); ctx.fill(); ctx.stroke();
  // Nez
  ctx.beginPath(); ctx.moveTo(28,10); ctx.bezierCurveTo(36,12,36,24,28,24); ctx.fill(); ctx.stroke();
  // Cou
  ctx.beginPath(); ctx.moveTo(-4,40); ctx.lineTo(-2,58); ctx.lineTo(14,58); ctx.lineTo(12,40); ctx.fill(); ctx.stroke();
  // Tronc
  ctx.beginPath(); ctx.moveTo(-16,58); ctx.bezierCurveTo(-20,80,-20,120,-14,158); ctx.lineTo(22,158); ctx.bezierCurveTo(26,120,26,80,20,58); ctx.fill(); ctx.stroke();
  // Bras (derrière)
  ctx.beginPath(); ctx.moveTo(-12,62); ctx.bezierCurveTo(-24,86,-26,112,-20,136); ctx.lineTo(-8,132); ctx.bezierCurveTo(-14,110,-12,86,-2,66); ctx.fill(); ctx.stroke();
  // Jambe avant
  ctx.beginPath(); ctx.moveTo(2,156); ctx.bezierCurveTo(6,182,8,208,4,232); ctx.lineTo(18,232); ctx.bezierCurveTo(22,208,20,182,16,156); ctx.fill(); ctx.stroke();
  // Jambe arrière
  ctx.beginPath(); ctx.moveTo(-12,156); ctx.bezierCurveTo(-16,180,-16,204,-12,228); ctx.lineTo(0,228); ctx.bezierCurveTo(2,204,2,180,0,158); ctx.fill(); ctx.stroke();
  // Pied
  ctx.beginPath(); ctx.moveTo(4,230); ctx.bezierCurveTo(6,238,22,242,32,240); ctx.bezierCurveTo(36,238,30,230,22,230); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function setupDrawCanvas(canvas, canvasId) {
  if(!canvas._history) canvas._history = [];
  // Snapshot de base après le rendu initial (pour la gomme)
  setTimeout(() => {
    if(!canvas._baseSnapshot) {
      canvas._baseSnapshot = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    }
  }, 200);

  let drawing = false, startX = 0, startY = 0;

  const getPos = e => {
    const rect = canvas.getBoundingClientRect();
    const src2 = e.touches ? e.touches[0] : e;
    return {x: src2.clientX - rect.left, y: src2.clientY - rect.top};
  };

  canvas.onmousedown = e => {
    e.preventDefault();
    drawing = true;
    const p = getPos(e);
    startX = p.x; startY = p.y;
    // Sauvegarder snapshot temp pour preview pendant le dessin
    canvas._tempSnap = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
  };

  canvas.onmousemove = e => {
    if(!drawing) return;
    const ctx = canvas.getContext('2d');
    const p = getPos(e);

    if(drawTool === 'erase') {
      // Gomme douce: restaurer zone depuis snapshot de base
      const r = drawSize * 5;
      if(canvas._baseSnapshot) {
        // Méthode: copier depuis la base dans la zone gomme
        const base = canvas._baseSnapshot;
        const W = canvas.width, H = canvas.height;
        const x0 = Math.max(0, Math.round(p.x-r)), y0 = Math.max(0, Math.round(p.y-r));
        const w2 = Math.min(W-x0, r*2), h2 = Math.min(H-y0, r*2);
        if(w2 > 0 && h2 > 0) {
          // Extraire la zone de base et la remettre
          const tmp = document.createElement('canvas');
          tmp.width=W; tmp.height=H;
          tmp.getContext('2d').putImageData(base,0,0);
          // Effacer la zone dans le canvas courant
          ctx.save();
          ctx.clearRect(x0,y0,w2,h2);
          // Redessiner depuis la base dans cette zone
          ctx.drawImage(tmp, x0,y0,w2,h2, x0,y0,w2,h2);
          ctx.restore();
        }
      }
      return;
    }

    // Pour les outils vectoriels: restaurer le snapshot temp et redessiner
    if(canvas._tempSnap && drawTool !== 'erase') {
      ctx.putImageData(canvas._tempSnap, 0, 0);
    }

    ctx.strokeStyle = drawColor;
    ctx.fillStyle = drawColor;
    ctx.lineWidth = drawSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if(drawTool === 'line') {
      ctx.beginPath(); ctx.moveTo(startX,startY); ctx.lineTo(p.x,p.y); ctx.stroke();
    } else if(drawTool === 'arrow') {
      drawArrow(ctx, startX, startY, p.x, p.y, drawColor, drawSize);
    } else if(drawTool === 'arrow-curve') {
      drawArrowCurved(ctx, startX, startY, p.x, p.y, drawColor, drawSize);
    } else if(drawTool === 'circle') {
      const rx = Math.abs(p.x-startX)/2, ry = Math.abs(p.y-startY)/2;
      const cx2 = (startX+p.x)/2, cy2 = (startY+p.y)/2;
      ctx.beginPath(); ctx.ellipse(cx2, cy2, Math.max(rx,2), Math.max(ry,2), 0, 0, 2*Math.PI);
      ctx.stroke();
    }
  };

  canvas.onmouseup = () => {
    if(drawing) {
      // Sauvegarder dans l'historique UNIQUEMENT à la fin du trait
      const snapshot = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      canvas._history.push(snapshot);
      if(canvas._history.length > 30) canvas._history.shift();
    }
    drawing = false;
    canvas._tempSnap = null;
  };
  canvas.onmouseleave = () => { drawing = false; canvas._tempSnap = null; };
  canvas.ontouchstart = e => { e.preventDefault(); canvas.onmousedown({clientX:e.touches[0].clientX,clientY:e.touches[0].clientY,preventDefault:()=>{}}); };
  canvas.ontouchmove = e => { e.preventDefault(); canvas.onmousemove({clientX:e.touches[0].clientX,clientY:e.touches[0].clientY}); };
  canvas.ontouchend = () => { canvas.onmouseup(); };
}

function toggleCurveDir(btnId) {
  curveDir = curveDir === 1 ? -1 : 1;
  // Mettre à jour tous les boutons de direction de courbure
  document.querySelectorAll('[id^="btn-curve-dir"]').forEach(btn => {
    btn.textContent = curveDir === 1 ? '⟳ Droite' : '⟲ Gauche';
    btn.style.background = curveDir === 1 ? 'var(--blue-d)' : 'var(--purple)';
    btn.style.color = curveDir === 1 ? 'var(--blue)' : '#a78bfa';
    btn.style.borderColor = curveDir === 1 ? 'var(--blue)' : '#a78bfa';
  });
}

function drawArrowCurved(ctx, x1, y1, x2, y2, color, size) {
  const dx=x2-x1, dy=y2-y1;
  const len = Math.sqrt(dx*dx+dy*dy);
  // Perpendiculaire: (-dy, dx) = côté gauche du tracé ; (dy, -dx) = côté droit
  // curveDir = +1 → courbe vers la droite du tracé ; -1 → vers la gauche
  const perp = curveDir || 1;
  const cx=(x1+x2)/2 + (-dy/len)*len*0.3*perp;
  const cy=(y1+y2)/2 + ( dx/len)*len*0.3*perp;
  const angle=Math.atan2(y2-cy, x2-cx);
  const hLen=Math.max(10, len*0.22);
  ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=size; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.quadraticCurveTo(cx,cy,x2,y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2-hLen*Math.cos(angle-Math.PI/6), y2-hLen*Math.sin(angle-Math.PI/6));
  ctx.lineTo(x2-hLen*Math.cos(angle+Math.PI/6), y2-hLen*Math.sin(angle+Math.PI/6));
  ctx.closePath(); ctx.fill();
}

function drawArrow(ctx, x1, y1, x2, y2, color, size) {
  const angle = Math.atan2(y2-y1, x2-x1);
  const len = Math.sqrt((x2-x1)**2+(y2-y1)**2);
  const headLen = Math.max(10, len*0.25);
  ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=size; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2-headLen*Math.cos(angle-Math.PI/6), y2-headLen*Math.sin(angle-Math.PI/6));
  ctx.lineTo(x2-headLen*Math.cos(angle+Math.PI/6), y2-headLen*Math.sin(angle+Math.PI/6));
  ctx.closePath(); ctx.fill();
}

function setDrawTool(tool) {
  drawTool=tool;
  curveDir=1; // reset direction normale
  ['pen','arrow','erase'].forEach(t=>{
    const btn=document.getElementById('tool-'+t);
    if(btn) btn.className=t===tool?'btn btn-blue':'btn';
  });
}

function setDrawToolCurveInv() {
  drawTool='arrow-curve';
  curveDir=-1; // direction inversée
}

function clearAllMorpho() {
  ['morpho-face','morpho-face2','morpho-profilG','morpho-profilD'].forEach(id => {
    const c = document.getElementById(id);
    if(c) { c._history = []; c._baseSnapshot = null; c._tempSnap = null; }
    initMorphoCanvas(id);
  });
}

function undoMorpho() {
  const ids = ['morpho-face','morpho-face2','morpho-profilG','morpho-profilD'];
  for(const id of ids) {
    const c = document.getElementById(id);
    if(c && c._history && c._history.length > 0) {
      const prev = c._history.pop();
      c.getContext('2d').putImageData(prev, 0, 0);
      return;
    }
  }
}

function undoPieds() {
  const c = document.getElementById('pieds-canvas');
  if(c && c._history && c._history.length > 0) {
    const prev = c._history.pop();
    c.getContext('2d').putImageData(prev, 0, 0);
  }
}

function drawPiedsTemplate(savedData) {
  const canvas = document.getElementById('pieds-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
  canvas._history = []; canvas._baseSnapshot = null;

  const img = new Image();
  img.onload = () => {
    // Centrer et adapter l'image dans le canvas
    const scale = Math.min(canvas.width/img.width, (canvas.height-18)/img.height);
    const dw = img.width * scale, dh = img.height * scale;
    const dx = (canvas.width - dw) / 2, dy = 0;
    ctx.drawImage(img, dx, dy, dw, dh);
    // Labels
    ctx.fillStyle = '#555';
    ctx.font = 'bold 11px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Pied Gauche', canvas.width * 0.27, canvas.height - 2);
    ctx.fillText('Pied Droit', canvas.width * 0.73, canvas.height - 2);
    // Sauvegarder le snapshot de base
    canvas._baseSnapshot = ctx.getImageData(0,0,canvas.width,canvas.height);
    setupDrawCanvas(canvas);
    // Restaurer le dessin sauvegardé par-dessus le template
    if(savedData) {
      const saved = new Image();
      saved.onload = () => {
        ctx.drawImage(saved, 0, 0, canvas.width, canvas.height);
      };
      saved.src = savedData;
    }
  };
  img.src = document.getElementById('imgjs-pieds')?.src || '';
}

function drawFoot(ctx, ox, oy, mirror) {
  ctx.save();
  ctx.translate(ox, oy);
  if(mirror) { ctx.translate(145, 0); ctx.scale(-1,1); }
  ctx.fillStyle='#f0d9c0'; ctx.strokeStyle='#8b6530'; ctx.lineWidth=2;
  // Corps
  ctx.beginPath();
  ctx.moveTo(68,220); ctx.bezierCurveTo(28,212,14,182,12,148);
  ctx.bezierCurveTo(8,108,16,68,26,44); ctx.bezierCurveTo(38,18,56,5,74,4);
  ctx.bezierCurveTo(92,2,112,14,124,38); ctx.bezierCurveTo(136,62,138,98,136,128);
  ctx.bezierCurveTo(134,168,126,204,104,218); ctx.bezierCurveTo(94,224,80,226,68,220);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Talon
  ctx.beginPath(); ctx.ellipse(72,206,34,20,0,0,2*Math.PI);
  ctx.fillStyle='#e4cab0'; ctx.fill(); ctx.stroke();
  // Voute
  ctx.beginPath(); ctx.moveTo(22,152); ctx.bezierCurveTo(26,128,36,112,52,114);
  ctx.bezierCurveTo(62,116,66,134,64,158); ctx.fillStyle='#e0c4a0'; ctx.fill();
  // Orteils
  ctx.fillStyle='#f0d9c0';
  [[44,16,13,10],[64,8,10,8],[82,5,10,8],[99,8,9,7],[113,18,8,7]].forEach(([tx,ty,rw,rh])=>{
    ctx.beginPath(); ctx.ellipse(tx,ty,rw,rh,0,0,2*Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#ffeedd'; ctx.beginPath(); ctx.ellipse(tx,ty-rh*0.3,rw*0.6,rh*0.4,0,0,2*Math.PI); ctx.fill();
    ctx.fillStyle='#f0d9c0';
  });
  // Plis
  ctx.strokeStyle='#c4a882'; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(40,40); ctx.bezierCurveTo(56,36,76,34,94,38); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(38,56); ctx.bezierCurveTo(56,52,78,50,98,54); ctx.stroke();
  ctx.restore();
}

function setBilanField(field, value) {
  if(!bilanData) bilanData={};
  bilanData[field]=value;
  // Stocker aussi dans bilanDataPosturo si on est dans le contexte posturo
  const pgPosturo = document.getElementById('pg-bilan-posturo');
  if(pgPosturo && pgPosturo.classList.contains('active')) {
    if(!currentPatient) return;
    if(!currentPatient.bilanDataPosturo) currentPatient.bilanDataPosturo = {};
    if(!currentPatient.bilanDataPosturo.neuro4) currentPatient.bilanDataPosturo.neuro4 = {};
    currentPatient.bilanDataPosturo.neuro4[field] = value;
  }
}

// Synchronise les modifications du bilan en cours d'édition vers son entrée
// dans bilansSport[]. À appeler après chaque savePatients() qui touche
// currentPatient.mesures ou currentPatient.bilanData.
function syncOpenedBilanToHistory() {
  if (currentOpenedBilanIdx == null) return;
  if (!currentPatient || !currentPatient.bilansSport) return;
  const target = currentPatient.bilansSport[currentOpenedBilanIdx];
  if (!target) return;
  target.mesures = JSON.parse(JSON.stringify(currentPatient.mesures || {}));
  target.bilanData = JSON.parse(JSON.stringify(currentPatient.bilanData || {}));
}

function saveBilan() {
  if(!currentPatient) { alert('Aucun patient sélectionné.'); return; }
  if(!bilanData) bilanData = {};

  // 1. Capturer tous les champs texte/textarea (.bilan-field)
  document.querySelectorAll('.bilan-field').forEach(el => {
    const field = el.dataset.field;
    if(field) bilanData[field] = el.value || '';
  });

  // 2. Capturer tous les boutons radio du bilan (groupés par name)
  const radioGroups = {};
  document.querySelectorAll('#pg-bilan input[type=radio]').forEach(el => {
    if(el.checked && el.name) radioGroups[el.name] = el.value;
  });
  Object.assign(bilanData, radioGroups);

  // 3. Capturer toutes les checkboxes du bilan
  document.querySelectorAll('#pg-bilan input[type=checkbox]').forEach(el => {
    const onch = el.getAttribute('onchange') || '';
    const match = onch.match(/setBilanField\(['"]([^'"]+)['"]/);
    if(match) bilanData[match[1]] = el.checked;
  });

  // 4. Capturer les canvas morpho et pieds (seulement le dessin transparent)
  // Effacer les anciennes données JPEG (format obsolète)
  ['_morpho_face','_morpho_face2','_morpho_profilG','_morpho_profilD','_pieds'].forEach(k => {
    if(bilanData[k] && bilanData[k].startsWith('data:image/jpeg')) delete bilanData[k];
  });
  const saveCanvasDrawing = (id, key) => {
    const cv = document.getElementById(id);
    if(!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const W = cv.width, H = cv.height;
    // Canvas temp à la taille réelle du canvas (avec dpr)
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tctx = tmp.getContext('2d');
    tctx.clearRect(0, 0, W, H);
    tctx.drawImage(cv, 0, 0);
    // Rendre transparents les pixels noirs (fond vide du canvas)
    const imgData = tctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    for(let i = 0; i < d.length; i += 4) {
      const r=d[i], g=d[i+1], b=d[i+2], a=d[i+3];
      // Rendre transparent: pixels noirs (fond canvas vide) ET pixels blancs/quasi-blancs (fond image)
      if(a === 0 || (r < 10 && g < 10 && b < 10) || (r > 240 && g > 240 && b > 240)) d[i+3] = 0;
    }
    tctx.putImageData(imgData, 0, 0);
    // Sauvegarder à taille CSS (diviser par dpr) pour cohérence à la restauration
    const cssW = Math.round(W/dpr), cssH = Math.round(H/dpr);
    const out = document.createElement('canvas');
    out.width = cssW; out.height = cssH;
    out.getContext('2d').drawImage(tmp, 0, 0, W, H, 0, 0, cssW, cssH);
    bilanData[key] = out.toDataURL('image/png');
  };
  ['morpho-face','morpho-face2','morpho-profilG','morpho-profilD'].forEach(id => {
    saveCanvasDrawing(id, '_'+id.replace(/-/g,'_'));
  });
  // Sauvegarder pieds: soustraire le template pour ne garder que le dessin
  const pCanvas = document.getElementById('pieds-canvas');
  if(pCanvas && pCanvas._baseSnapshot) {
    const W = pCanvas.width, H = pCanvas.height;
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(pCanvas, 0, 0);
    const current = tctx.getImageData(0, 0, W, H);
    const base = pCanvas._baseSnapshot;
    const cd = current.data, bd2 = base.data;
    // Garder seulement les pixels différents du template
    for(let i = 0; i < cd.length; i += 4) {
      const dr = Math.abs(cd[i]-bd2[i]), dg = Math.abs(cd[i+1]-bd2[i+1]), db = Math.abs(cd[i+2]-bd2[i+2]);
      if(dr < 20 && dg < 20 && db < 20) cd[i+3] = 0; // pixel identique au template → transparent
    }
    tctx.putImageData(current, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    const out = document.createElement('canvas');
    out.width = Math.round(W/dpr); out.height = Math.round(H/dpr);
    out.getContext('2d').drawImage(tmp, 0, 0, W, H, 0, 0, out.width, out.height);
    bilanData._pieds = out.toDataURL('image/png');
  }

  currentPatient.bilanData = JSON.parse(JSON.stringify(bilanData));
  syncOpenedBilanToHistory();
  savePatients();
  alert('✓ Bilan clinique sauvegardé');
}

function loadBilan() {
  if(!currentPatient) return;
  bilanData = currentPatient.bilanData ? JSON.parse(JSON.stringify(currentPatient.bilanData)) : {};
  if(!Object.keys(bilanData).length) return;

  // Remplir les champs texte/textarea
  document.querySelectorAll('.bilan-field').forEach(el => {
    const field = el.dataset.field;
    if(field && bilanData[field] !== undefined) el.value = bilanData[field];
  });

  // Restaurer les boutons radio
  document.querySelectorAll('#pg-bilan input[type=radio]').forEach(el => {
    if(el.name && bilanData[el.name] !== undefined) {
      el.checked = (el.value === bilanData[el.name]);
    }
  });

  // Restaurer les checkboxes
  document.querySelectorAll('#pg-bilan input[type=checkbox]').forEach(el => {
    if(el.getAttribute('onchange')) {
      // Extraire le field depuis onchange="setBilanField('xxx', this.checked)"
      const match = el.getAttribute('onchange').match(/setBilanField\('([^']+)'/);
      if(match) {
        const field = match[1];
        el.checked = bilanData[field] === true;
      }
    }
  });

  // Restaurer les canvas depuis les dataURLs sauvegardées
  const restoreCanvas = (id, key) => {
    const cvs = document.getElementById(id);
    if(!cvs || !bilanData[key]) return;
    const img = new Image();
    img.onload = () => {
      const ctx = cvs.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const cssW = cvs.width/dpr, cssH = cvs.height/dpr;
      ctx.drawImage(img, 0, 0, cssW, cssH);
    };
    img.src = bilanData[key];
  };
  // Restaurer uniquement les dessins (les images de fond sont dans le DOM)
  // Les nouvelles sauvegardes contiennent juste le dessin transparent
  // Les anciennes sauvegardes (avec fond) sont ignorées car elles contiennent l'image en double
  // La restauration des canvas se fait séparément après initMorphoCanvas
}

function toggleDictaphone() {
  if(!('webkitSpeechRecognition' in window||'SpeechRecognition' in window)){
    alert('Dictaphone non supporté dans ce navigateur. Utilisez Chrome ou Edge.');return;
  }
  if(micActive) {
    micActive=false; if(micRecognition) micRecognition.stop();
    document.getElementById('mic-status').style.display='none';
    document.getElementById('btn-mic').className='btn';
    return;
  }
  micActive=true;
  document.getElementById('mic-status').style.display='block';
  document.getElementById('btn-mic').className='btn btn-red';
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  micRecognition=new SR();
  micRecognition.lang='fr-FR'; micRecognition.continuous=true; micRecognition.interimResults=false;
  micRecognition.onresult=e=>{
    const text=e.results[e.results.length-1][0].transcript;
    // Insérer dans le champ actif
    const active=document.activeElement;
    if(active&&(active.tagName==='TEXTAREA'||active.tagName==='INPUT')&&active.classList.contains('bilan-field')){
      active.value+=(active.value?' ':'')+text;
      setBilanField(active.dataset.field, active.value);
    }
  };
  micRecognition.onerror=()=>{micActive=false;document.getElementById('mic-status').style.display='none';};
  micRecognition.start();
}

function printBilan() {
  // Sauvegarder d'abord tous les champs
  saveBilanSilent();
  // Puis lancer l'impression du rapport complet
  setTimeout(() => printReport(), 200);
}

function saveBilanSilent() {
  // Même que saveBilan mais sans alert
  if(!currentPatient) return;
  if(!bilanData) bilanData = {};
  document.querySelectorAll('.bilan-field').forEach(el => {
    const field = el.dataset.field;
    if(field) bilanData[field] = el.value || '';
  });
  document.querySelectorAll('#pg-bilan input[type=radio]').forEach(el => {
    if(el.checked && el.name) bilanData[el.name] = el.value;
  });
  document.querySelectorAll('#pg-bilan input[type=checkbox]').forEach(el => {
    const onch = el.getAttribute('onchange') || '';
    const match = onch.match(/setBilanField\(['"]([^'"]+)['"]/);
    if(match) bilanData[match[1]] = el.checked;
  });
  ['morpho-face','morpho-face2','morpho-profilG','morpho-profilD'].forEach(id => {
    const c = document.getElementById(id);
    if(c) bilanData['_'+id.replace('-','_')] = c.toDataURL('image/jpeg', 0.85);
  });
  const pc = document.getElementById('pieds-canvas');
  if(pc) bilanData._pieds = pc.toDataURL('image/jpeg', 0.85);
  currentPatient.bilanData = JSON.parse(JSON.stringify(bilanData));
  syncOpenedBilanToHistory();
  savePatients();
}

function clearPiedsCanvas() {
  const c = document.getElementById('pieds-canvas');
  if(!c) return;
  c.getContext('2d').clearRect(0,0,c.width,c.height);
  drawPiedsTemplate();
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
renderPatientList();
renderPratList();
populatePratSelect();
if(patients.length>0) selectPatient(patients[patients.length-1]);
// Init bilan après un délai pour que le DOM soit prêt
setTimeout(()=>{
  ['morpho-face','morpho-face2','morpho-profilG','morpho-profilD'].forEach(id=>initMorphoCanvas(id));
  const piedsCanvas=document.getElementById('pieds-canvas');
  if(piedsCanvas){drawPiedsTemplate();setupDrawCanvas(piedsCanvas);}
  // Charger le bilan du patient courant
  if(currentPatient?.bilanData) loadBilan();
},300);

// ─── PWA Installation ───
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('pwa-install-btn');
  if(btn) btn.style.display = '';
});

async function installPWA() {
  if(!deferredPrompt) {
    alert("Sur iPhone/iPad : 1. Bouton Partager en bas 2. Sur l'ecran d'accueil 3. Ajouter");
    return;
  }
  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('pwa-install-btn').style.display = 'none';
}
window.addEventListener('appinstalled', () => {
  document.getElementById('pwa-install-btn').style.display = 'none';
  deferredPrompt = null;
});






// ══════════════════════════════════════════════════════
// BILAN POSTUROLOGIQUE — injection dynamique
// ══════════════════════════════════════════════════════

function injectBilanPosturoPage() {
  // Toujours recréer la page pour éviter les problèmes de canvas
  const existing = document.getElementById('pg-bilan-posturo');
  if(existing) existing.remove();
  const main = document.querySelector('.main');
  if(!main) return;
  const div = document.createElement('div');
  div.className = 'page';
  div.id = 'pg-bilan-posturo';
  div.innerHTML = getBilanPosturoHTML();
  main.appendChild(div);
}

function getBilanPosturoHTML() {
  return `<div style="padding:0 0 40px 0;max-width:860px;margin:0 auto;">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--bord);margin-bottom:16px;background:var(--bg);">
    <button onclick="nav('pg-patients')" style="background:none;border:none;color:var(--mut);font-size:13px;cursor:pointer;">← Patients</button>
    <div style="font-size:15px;font-weight:700;color:#2a7a4e;">🧍 Bilan Global de la Posture</div>
    <div style="display:flex;gap:6px;">
      <button class="btn" onclick="savePosturoBilan()" style="background:#2a7a4e;color:#fff;font-size:12px;padding:5px 12px;">💾 Sauvegarder</button>
      <button class="btn" onclick="buildRapportPosturo()" style="background:var(--blue);color:#fff;font-size:12px;padding:5px 12px;">📄 Rapport</button>
    </div>
  </div>
  <div style="display:flex;gap:4px;flex-wrap:wrap;padding:0 20px;margin-bottom:20px;" id="posturo-tabs">
    <button class="btn posturo-tab act" onclick="showPosturoSection(0)" id="ptab-0" style="font-size:11px;padding:4px 10px;">1. Anamnèse</button>
    <button class="btn posturo-tab" onclick="showPosturoSection(1)" id="ptab-1" style="font-size:11px;padding:4px 10px;">2. Morphostatique</button>
    <button class="btn posturo-tab" onclick="showPosturoSection(2)" id="ptab-2" style="font-size:11px;padding:4px 10px;">3. Bilan dynamique</button>
    <button class="btn posturo-tab" onclick="showPosturoSection(3)" id="ptab-3" style="font-size:11px;padding:4px 10px;">4. Neuro-fonctionnel</button>
    <button class="btn posturo-tab" onclick="showPosturoSection(4)" id="ptab-4" style="font-size:11px;padding:4px 10px;">5. Système plantaire</button>
    <button class="btn posturo-tab" onclick="showPosturoSection(5)" id="ptab-5" style="font-size:11px;padding:4px 10px;">6. Vestibulaire</button>
    <button class="btn posturo-tab" onclick="showPosturoSection(6)" id="ptab-6" style="font-size:11px;padding:4px 10px;">7. Buccal/Visuel</button>
    <button class="btn posturo-tab" onclick="showPosturoSection(7)" id="ptab-7" style="font-size:11px;padding:4px 10px;">8. Terrain/Synthèse</button>
    <button class="btn posturo-tab" onclick="showPosturoSection(8)" id="ptab-8" style="font-size:11px;padding:4px 10px;">9. Traitements</button>
  </div>

  <div class="posturo-section" id="psec-0" style="padding:0 20px;">

    <!-- Informations patient -->
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#2a7a4e;font-size:14px;margin-bottom:10px;">🧑‍⚕️ Informations patient</div>
      <div class="g2" style="margin-top:4px;">
        <div>
          <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin-bottom:3px;">👨‍⚕️ Médecin</div>
          <input class="inp" id="po-medecin" placeholder="Dr..." style="background:#fff;color:#222;"/>
        </div>
        <div>
          <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin-bottom:3px;">📅 Date de consultation</div>
          <input class="inp" id="po-date-consult" type="date" style="background:#fff;color:#222;"/>
        </div>
        <div>
          <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin-bottom:3px;">🏃 Activité physique</div>
          <input class="inp" id="po-activite" placeholder="Sport pratiqué..." style="background:#fff;color:#222;"/>
        </div>
        <div>
          <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin-bottom:3px;">💼 Travail</div>
          <input class="inp" id="po-travail" placeholder="Profession..." style="background:#fff;color:#222;"/>
        </div>
        <div>
          <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin-bottom:3px;">🩹 Antécédent traumatique</div>
          <input class="inp" id="po-atcd" placeholder="Fractures, entorses..." style="background:#fff;color:#222;"/>
        </div>
        <div>
          <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin-bottom:3px;">🦺 Appareillage</div>
          <input class="inp" id="po-appareillage" placeholder="Semelles, lunettes..." style="background:#fff;color:#222;"/>
        </div>
        <div style="grid-column:1/-1;">
          <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin-bottom:3px;">🔬 Examens complémentaires</div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <input class="inp" id="po-examens" placeholder="Radio, IRM..." style="flex:1;background:#fff;color:#222;"/>
            <div style="display:flex;gap:8px;">
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #2a7a4e;border-radius:20px;padding:4px 12px;color:#222;font-size:12px;">
                <input type="radio" name="po-1ere-intention" value="oui"/> 1ère intention : Oui
              </label>
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:4px 12px;color:#222;font-size:12px;">
                <input type="radio" name="po-1ere-intention" value="non"/> Non
              </label>
            </div>
          </div>
        </div>
        <div style="grid-column:1/-1;">
          <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin-bottom:3px;">🛋️ Activité quotidienne</div>
          <textarea class="inp" id="po-activite-quot" rows="2" placeholder="Sédentaire, actif..." style="background:#fff;color:#222;"></textarea>
        </div>
        <div style="grid-column:1/-1;">
          <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin-bottom:3px;">📋 Motif de consultation</div>
          <textarea class="inp" id="po-motif" rows="2" placeholder="Douleurs, inconfort..." style="background:#fff;color:#222;"></textarea>
        </div>
      </div>
    </div>

    <!-- Douleur -->
    <div style="background:linear-gradient(135deg,#fff0f0,#ffe8e8);border-left:4px solid #e74c3c;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#c0392b;font-size:14px;margin-bottom:10px;">🩺 Douleur</div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
        <span style="font-weight:600;color:#222;">Douleur :</span>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #e74c3c;border-radius:20px;padding:4px 12px;color:#222;">
          <input type="radio" name="po-douleur" value="oui"/> Oui
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:4px 12px;color:#222;">
          <input type="radio" name="po-douleur" value="non"/> Non
        </label>
      </div>
      <div style="background:linear-gradient(90deg,#4CAF50,#FFEB3B,#FF9800,#F44336);border-radius:10px;padding:12px 16px;">
        <div style="font-size:13px;font-weight:700;text-align:center;color:#222;margin-bottom:6px;">Échelle Visuelle Analogique</div>
        <input type="range" min="0" max="10" value="0" id="po-eva" oninput="document.getElementById('po-eva-val').textContent=this.value" style="width:100%;margin:8px 0;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#333;">
          <span>0 Très bien</span><span>2 Bénigne</span><span>4 Modéré</span><span>6 Intense</span><span>8 Très intense</span><span>10 Max</span>
        </div>
        <div style="text-align:center;font-size:16px;font-weight:700;color:#222;margin-top:6px;">Score : <span id="po-eva-val">0</span>/10</div>
      </div>
    </div>
  </div>

  <div class="posturo-section"  id="psec-1" style="padding:0 20px;display:none;">
    <div class="card" style="margin-bottom:16px;">
      <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;">
        <div style="font-weight:700;color:#2a7a4e;font-size:14px;">🧍 Bilan morphostatique — Silhouettes</div>
        <div style="font-size:11px;color:#555;margin-top:2px;">Dessinez directement sur les silhouettes</div>
      </div>
                  <div style="position:relative;margin:16px 0;">
        <div style="display:flex;gap:20px;background:#fff;border-radius:8px;border:1px solid var(--bord);padding:16px;align-items:flex-end;">
          <div style="flex:1;text-align:center;">
            <div style="font-size:10px;color:#2a7a4e;margin-bottom:6px;font-weight:600;">Profil D</div>
            <div style="background:#fff;border:1px solid #eee;border-radius:4px;padding:8px;min-height:200px;display:flex;align-items:center;justify-content:center;">
              <img src="assets/morpho-profil-gauche.png" style="max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto;"/>
            </div>
          </div>
          <div style="flex:1;text-align:center;">
            <div style="font-size:10px;color:#2a7a4e;margin-bottom:6px;font-weight:600;">Dos</div>
            <div style="background:#fff;border:1px solid #eee;border-radius:4px;padding:8px;min-height:200px;display:flex;align-items:center;justify-content:center;">
              <img src="assets/morpho-face-posterieure.png" style="max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto;"/>
            </div>
          </div>
          <div style="flex:1;text-align:center;">
            <div style="font-size:10px;color:#2a7a4e;margin-bottom:6px;font-weight:600;">Face</div>
            <div style="background:#fff;border:1px solid #eee;border-radius:4px;padding:8px;min-height:200px;display:flex;align-items:center;justify-content:center;">
              <img src="assets/morpho-face-anterieure.png" style="max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto;"/>
            </div>
          </div>
          <div style="flex:1;text-align:center;">
            <div style="font-size:10px;color:#8892a4;margin-bottom:6px;font-weight:500;">Profil G</div>
            <div style="background:#fff;border:1px solid #eee;border-radius:4px;padding:8px;min-height:200px;display:flex;align-items:center;justify-content:center;">
              <img src="assets/morpho-profil-droit.png" style="max-width:100%;max-height:200px;object-fit:contain;display:block;margin:0 auto;"/>
            </div>
          </div>
        </div>
        <canvas id="posturo-body-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair;border-radius:8px;background:transparent;"/>
      </div>
      <div style="background:linear-gradient(135deg,#f8f9fa,#eee);border-radius:10px;padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <button class="btn" id="ptool-pen" onclick="setDrawTool('line')" title="Trait droit">╱ Trait</button>
        <button class="btn" id="ptool-arrow" onclick="setDrawTool('arrow')" title="Flèche droite">→ Flèche</button>
        <button class="btn" id="ptool-arrow-curve" onclick="setDrawTool('arrow-curve')" title="Flèche courbée (gauche)">↪ Courbée</button>
        <button class="btn" id="btn-curve-inv-posturo-body" onclick="setDrawToolCurveInv()" title="Flèche courbée inversée">↩ Courbée</button>
        <button class="btn" id="ptool-circle" onclick="setDrawTool('circle')" title="Cercle/Ovale">○ Cercle</button>
        <button class="btn" id="ptool-erase" onclick="setDrawTool('erase')">🧹 Gomme</button>
        <select id="pdraw-color-sel-body" class="inp" style="width:85px;background:#fff;color:#222;" onchange="drawColor=this.value;">
          <option value="#e74c3c">🔴 Rouge</option>
          <option value="#2980b9">🔵 Bleu</option>
          <option value="#27ae60">🟢 Vert</option>
          <option value="#f39c12">🟠 Orange</option>
          <option value="#111111">⚫ Noir</option>
        </select>
        <select id="pdraw-size-sel-body" class="inp" style="width:100px;background:#fff;color:#222;" onchange="drawSize=+this.value;">
          <option value="2">✏️ Fin</option>
          <option value="4" selected>🖊️ Normal</option>
          <option value="8">🖌️ Épais</option>
        </select>
        <button class="btn btn-red" onclick="undoPosturoBody()">↩ Annuler</button>
      </div>
    </div>

    <!-- Compensations -->
    <div style="background:linear-gradient(135deg,#fff9f0,#fff3e0);border-left:4px solid #f0a500;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#b7740a;font-size:13px;margin-bottom:8px;">⚖️ Compensations</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <input class="inp" id="po-comp1" placeholder="Compensation 1..." style="background:#fff;color:#222;"/>
        <input class="inp" id="po-comp2" placeholder="Compensation 2..." style="background:#fff;color:#222;"/>
        <input class="inp" id="po-comp3" placeholder="Compensation 3..." style="background:#fff;color:#222;"/>
      </div>
      <div style="margin-top:8px;">
        <div style="font-size:10px;color:#b7740a;font-weight:600;margin-bottom:3px;">📍 Point compensation critique</div>
        <input class="inp" id="po-comp-critique" placeholder="..." style="background:#fff;color:#222;"/>
      </div>
    </div>

    <!-- Préférences motrices + Romberg -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
      <div style="background:linear-gradient(135deg,#f5eeff,#ede0ff);border-left:4px solid #8e44ad;border-radius:8px;padding:12px;">
        <div style="font-weight:700;color:#6c3483;font-size:13px;margin-bottom:8px;">🧠 Préférences motrices</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #8e44ad;border-radius:20px;padding:5px 14px;color:#222;">
            <input type="radio" name="po-pref-mot" value="tonique-aerien"/> 🌬️ Tonique-Aérien
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #8e44ad;border-radius:20px;padding:5px 14px;color:#222;">
            <input type="radio" name="po-pref-mot" value="phasique-terrien"/> 🌍 Phasique-Terrien
          </label>
        </div>
      </div>
      <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;">
        <div style="font-weight:700;color:#2471a3;font-size:13px;margin-bottom:8px;">🧪 Romberg</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;">
            <input type="checkbox" id="po-romberg-ant"/> Antériorisé
          </label>
          <div>
            <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;margin-bottom:6px;">
              <input type="checkbox" id="po-romberg-lat" onchange="toggleRomberg('lat',this.checked)"/> Latéralisé <span style="font-size:10px;color:#888;">(vestibulaire)</span>
            </label>
            <div id="po-romberg-lat-opts" style="display:none;gap:8px;margin-left:16px;">
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;font-size:11px;"><input type="radio" name="po-romberg-lat-dir" value="gauche"/> 👈 Gauche</label>
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;font-size:11px;"><input type="radio" name="po-romberg-lat-dir" value="droite"/> 👉 Droite</label>
            </div>
          </div>
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;">
            <input type="checkbox" id="po-romberg-post"/> Postériorisé <span style="font-size:10px;color:#888;">(émotionnel)</span>
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;">
            <input type="checkbox" id="po-romberg-oculaire"/> Adaptation oculaire
          </label>
          <div>
            <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;margin-bottom:6px;">
              <input type="checkbox" id="po-romberg-rot" onchange="toggleRomberg('rot',this.checked)"/> Rotation
            </label>
            <div id="po-romberg-rot-opts" style="display:none;gap:8px;margin-left:16px;">
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;font-size:11px;"><input type="radio" name="po-romberg-rot-dir" value="droite"/> 👉 Droite</label>
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;font-size:11px;"><input type="radio" name="po-romberg-rot-dir" value="gauche"/> 👈 Gauche</label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="posturo-section" id="psec-2" style="padding:0 20px;display:none;">

    <!-- Bilan dynamique -->
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#2a7a4e;font-size:14px;margin-bottom:8px;">🏃 Bilan dynamique</div>
      <textarea class="inp" id="po-bilan-dyn" rows="3" placeholder="Observations..." style="background:#fff;color:#222;"></textarea>
    </div>

    <!-- Tests dynamiques -->
    <div style="background:linear-gradient(135deg,#fff0f0,#ffe8e8);border-left:4px solid #e74c3c;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#c0392b;font-size:14px;margin-bottom:10px;">⚡ Tests dynamiques</div>
      <div style="display:flex;flex-direction:column;gap:10px;">

        <div style="background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#c0392b;font-weight:600;margin-bottom:4px;">🏃 Examen de la course <em style="font-weight:400;color:#888;">(si douleur à l'effort)</em></div>
          <input class="inp" id="po-course" placeholder="Observations..." style="background:#f9f9f9;color:#222;"/>
        </div>

        <div style="background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#c0392b;font-weight:600;margin-bottom:8px;">💪 Test de force extenseurs du poignet <span style="color:#e74c3c;">(Déficit)</span></div>
          ${[['Poignet droit','po-poignet-d'],['Poignet gauche','po-poignet-g']].map(([label,name]) => `
          <div style="margin-bottom:6px;">
            <div style="font-size:10px;color:#555;font-weight:500;margin-bottom:4px;">${label}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #e74c3c;border-radius:20px;padding:3px 10px;color:#222;font-size:11px;"><input type="radio" name="${name}" value="pas-de-force"/> Pas de force</label>
              <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #e74c3c;border-radius:20px;padding:3px 10px;color:#222;font-size:11px;"><input type="radio" name="${name}" value="faible"/> Force faible</label>
              <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #f39c12;border-radius:20px;padding:3px 10px;color:#222;font-size:11px;"><input type="radio" name="${name}" value="moderee"/> Force modérée</label>
              <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #27ae60;border-radius:20px;padding:3px 10px;color:#222;font-size:11px;"><input type="radio" name="${name}" value="tres-fort"/> Très fort</label>
            </div>
          </div>`).join('')}
        </div>

        <div style="background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#c0392b;font-weight:600;margin-bottom:8px;">🛡️ Test de force/stabilité arrière</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #e74c3c;border-radius:20px;padding:3px 10px;color:#222;font-size:11px;"><input type="radio" name="po-test-stab" value="forte-instabilite"/> Forte instabilité</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #e74c3c;border-radius:20px;padding:3px 10px;color:#222;font-size:11px;"><input type="radio" name="po-test-stab" value="petite-instabilite"/> Petite instabilité</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #27ae60;border-radius:20px;padding:3px 10px;color:#222;font-size:11px;"><input type="radio" name="po-test-stab" value="stable"/> Stable</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #27ae60;border-radius:20px;padding:3px 10px;color:#222;font-size:11px;"><input type="radio" name="po-test-stab" value="tres-stable"/> Très stable</label>
          </div>
        </div>

        <div style="background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#c0392b;font-weight:600;margin-bottom:6px;">↕️ Test de Flexion Antérieure</div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:12px;color:#222;font-weight:500;">Mesure de la distance doigt-sol :</span>
            <select id="po-test-flex-ant" class="inp" style="width:100px;background:#fff;color:#222;">
              <option value="">-- cm --</option>
              ${Array.from({length:81},(_,i)=>i).map(i=>'<option value="'+i+'">'+i+' cm</option>').join('')}
            </select>
          </div>
        </div>

        <div style="background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#c0392b;font-weight:600;margin-bottom:6px;">🧍 Test de flexion Debout <span style="color:#888;font-weight:400;">(Iliaque/pubis)</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #e74c3c;border-radius:20px;padding:4px 12px;color:#222;">
              <input type="radio" name="po-flex-debout" value="droite"/> Droite
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #e74c3c;border-radius:20px;padding:4px 12px;color:#222;">
              <input type="radio" name="po-flex-debout" value="gauche"/> Gauche
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:4px 12px;color:#222;">
              <input type="radio" name="po-flex-debout" value="neutre"/> Neutre
            </label>
          </div>
        </div>

        <div style="background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#c0392b;font-weight:600;margin-bottom:6px;">🪑 Test de flexion Assis <span style="color:#888;font-weight:400;">(Sacrum)</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #e74c3c;border-radius:20px;padding:4px 12px;color:#222;">
              <input type="radio" name="po-flex-assis" value="droite"/> Droite
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #e74c3c;border-radius:20px;padding:4px 12px;color:#222;">
              <input type="radio" name="po-flex-assis" value="gauche"/> Gauche
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:4px 12px;color:#222;">
              <input type="radio" name="po-flex-assis" value="neutre"/> Neutre
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Examen en décharge -->
    <div style="background:linear-gradient(135deg,#fff9f0,#fff3e0);border-left:4px solid #f0a500;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#b7740a;font-size:14px;margin-bottom:10px;">🦵 Examen en décharge — Tests mobilité <span style="color:#e74c3c;">(dysfonction)</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${[['🦴 Hanche','po-mob-hanche'],['🦵 Genou','po-mob-genou'],['🦶 Pied','po-mob-pied'],['🫁 Bassin','po-mob-bassin']].map(([label,name]) => `
        <div style="background:#fff;border:1px solid #f0d090;border-radius:8px;padding:8px 12px;">
          <div style="font-size:11px;color:#b7740a;font-weight:600;margin-bottom:6px;">${label}</div>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #f0a500;border-radius:20px;padding:3px 12px;color:#222;">
              <input type="radio" name="${name}" value="oui"/> Oui
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;">
              <input type="radio" name="${name}" value="non"/> Non
            </label>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Décubitus dorsal -->
    <div style="background:linear-gradient(135deg,#f5eeff,#ede0ff);border-left:4px solid #8e44ad;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#6c3483;font-size:14px;margin-bottom:10px;">🛏️ Examen en décubitus dorsal</div>
      <div class="g2">
        <!-- Tibia/fémur -->
        <div style="background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;grid-column:1/-1;">
          <div style="font-size:10px;color:#6c3483;font-weight:600;margin-bottom:6px;">🦴 Observation tibia/fémur <span style="color:#888;font-weight:400;">(ILMI anatomique)</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${[['D','d'],['G','g']].map(([label,side]) => `
            <div style="background:#f9f0ff;border:1px solid #d7bde2;border-radius:8px;padding:6px 10px;">
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;margin-bottom:6px;">
                <input type="checkbox" id="po-tf-${side}" onchange="toggleTF('${side}',this.checked)"/>
                <span style="font-weight:600;color:#6c3483;">${label === 'D' ? '👉 Droite' : '👈 Gauche'}</span>
              </label>
              <div id="po-tf-${side}-opts" style="display:none;flex-direction:column;gap:6px;">
                ${['femur','tibia'].map(os => `
                <div>
                  <label style="cursor:pointer;display:flex;align-items:center;gap:4px;margin-bottom:4px;">
                    <input type="checkbox" id="po-tf-${side}-${os}" onchange="toggleTFOs('${side}','${os}',this.checked)"/>
                    <span style="font-size:11px;font-weight:600;color:#222;">${os.charAt(0).toUpperCase()+os.slice(1)}</span>
                  </label>
                  <div id="po-tf-${side}-${os}-opts" style="display:none;gap:6px;margin-left:16px;">
                    <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #8e44ad;border-radius:20px;padding:2px 10px;font-size:11px;color:#222;"><input type="radio" name="po-tf-${side}-${os}-dir" value="court"/> Plus court</label>
                    <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #8e44ad;border-radius:20px;padding:2px 10px;font-size:11px;color:#222;"><input type="radio" name="po-tf-${side}-${os}-dir" value="long"/> Plus long</label>
                  </div>
                </div>`).join('')}
              </div>
            </div>`).join('')}
          </div>
        </div>

        <!-- Longueur MI dorsal -->
        <div style="background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;grid-column:1/-1;">
          <div style="font-size:10px;color:#6c3483;font-weight:600;margin-bottom:6px;">📏 Longueur membres inférieurs</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-dors" value="court" onchange="toggleLongMI('dors','court')"/> Plus court</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-dors" value="long" onchange="toggleLongMI('dors','long')"/> Plus long</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-dors" value="egal" onchange="toggleLongMI('dors','egal')"/> Même longueur</label>
          </div>
          <div id="po-long-mi-dors-opts" style="display:none;gap:8px;flex-wrap:wrap;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;background:#f9f0ff;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-dors-side" value="d"/> 👉 Droite</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;background:#f9f0ff;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-dors-side" value="g"/> 👈 Gauche</label>
          </div>
        </div>

        <!-- Hauteur branches pubiennes -->
        <div style="background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#6c3483;font-weight:600;margin-bottom:6px;">📐 Hauteur branches pubiennes</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${[['Droite','d'],['Gauche','g']].map(([label,side]) => `
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <label style="cursor:pointer;display:flex;align-items:center;gap:4px;background:#f9f0ff;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;">
                <input type="radio" name="po-pub" value="${side}" onchange="togglePub('${side}')"/> ${label}
              </label>
              <div id="po-pub-${side}-opts" style="display:none;gap:6px;">
                <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #8e44ad;border-radius:20px;padding:2px 10px;font-size:11px;color:#222;"><input type="radio" name="po-pub-dir" value="haut"/> Plus haut</label>
                <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #8e44ad;border-radius:20px;padding:2px 10px;font-size:11px;color:#222;"><input type="radio" name="po-pub-dir" value="bas"/> Plus bas</label>
              </div>
            </div>`).join('')}
          </div>
        </div>

        <!-- Downing test -->
        <div style="background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#6c3483;font-weight:600;margin-bottom:6px;">🔬 Downing test</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${[['Droite','d'],['Gauche','g']].map(([label,side]) => `
            <div>
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f9f0ff;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;width:fit-content;margin-bottom:4px;">
                <input type="checkbox" id="po-downing-${side}" onchange="toggleDowning('${side}',this.checked)"/> ${label}
              </label>
              <div id="po-downing-${side}-opts" style="display:none;flex-direction:column;gap:4px;margin-left:16px;">
                <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #8e44ad;border-radius:20px;padding:2px 10px;font-size:11px;color:#222;"><input type="radio" name="po-downing-${side}-res" value="post"/> Pas d'allongement (iliaque POST)</label>
                <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #8e44ad;border-radius:20px;padding:2px 10px;font-size:11px;color:#222;"><input type="radio" name="po-downing-${side}-res" value="ant"/> Pas de raccourcissement (iliaque ANT)</label>
              </div>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Procubitus -->
    <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;margin    <!-- Procubitus -->
    <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#2471a3;font-size:14px;margin-bottom:10px;">🫃 Examen procubitus</div>
      <div class="g2">
        <!-- Longueur MI procubitus -->
        <div style="background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:8px 12px;grid-column:1/-1;">
          <div style="font-size:10px;color:#2471a3;font-weight:600;margin-bottom:6px;">📏 Longueur membres inférieurs</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-proc" value="court" onchange="toggleLongMI('proc','court')"/> Plus court</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-proc" value="long" onchange="toggleLongMI('proc','long')"/> Plus long</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-proc" value="egal" onchange="toggleLongMI('proc','egal')"/> Même longueur</label>
          </div>
          <div id="po-long-mi-proc-opts" style="display:none;gap:8px;flex-wrap:wrap;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-proc-side" value="d"/> 👉 Droite</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-long-mi-proc-side" value="g"/> 👈 Gauche</label>
          </div>
        </div>
      </div>
    </div>

    <div style="height:8px;"></div>

    <!-- Conclusion examen en décharge -->
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#2a7a4e;font-size:14px;margin-bottom:10px;">📊 Conclusion examen en décharge</div>
      <div class="g2">
        <!-- Inégalité longueur -->
        <div style="background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#2471a3;font-weight:600;margin-bottom:6px;">📐 Inégalité longueur</div>
          <div style="display:flex;gap:8px;margin-bottom:6px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-ineg-long" value="oui" onchange="toggleIneg(true)"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-ineg-long" value="non" onchange="toggleIneg(false)"/> Non</label>
          </div>
          <div id="po-ineg-opts" style="display:none;gap:8px;flex-wrap:wrap;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-ineg-dir" value="court-d"/> Plus court à droite</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:4px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;font-size:11px;color:#222;"><input type="radio" name="po-ineg-dir" value="court-g"/> Plus court à gauche</label>
          </div>
        </div>

        <!-- Type -->
        <div style="background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#2471a3;font-weight:600;margin-bottom:6px;">🔤 Type</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="checkbox" id="po-ineg-struct"/> Structurelle</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="checkbox" id="po-ineg-comp"/> Compensatrice</label>
          </div>
        </div>
        <div style="background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:10px;color:#2471a3;font-weight:600;margin-bottom:6px;">⚖️ Équilibré</div>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-equilibre" value="oui"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-equilibre" value="non"/> Non</label>
          </div>
        </div>
        <div style="background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:8px 12px;grid-column:1/-1;">
          <div style="font-size:10px;color:#2471a3;font-weight:600;margin-bottom:6px;">🌀 Scoliose</div>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-scoliose" value="oui"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-scoliose" value="non"/> Non</label>
          </div>
        </div>

      </div>
    </div>
  </div>


<div class="posturo-section" id="psec-3" style="padding:0 20px;display:none;">
  <div class="card" style="margin-bottom:16px;overflow-x:auto;">
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:14px;">
      <div style="font-weight:700;color:#2a7a4e;font-size:14px;">🧠 Bilan neuro-fonctionnel</div>
    </div>

    <!-- ANALYSE POSTURALE STATIQUE + DYNAMIQUE -->
    <div style="border-radius:10px;overflow:hidden;margin-bottom:12px;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <tr>
        <td colspan="4" style="background:#ddd;font-weight:700;padding:4px 6px;border:1px solid #999;color:#222;">ANALYSE POSTURALE STATIQUE</td>
        <td style="background:#ddd;font-weight:700;text-align:center;padding:4px;border:1px solid #999;color:#222;">G</td>
        <td style="background:#ddd;font-weight:700;text-align:center;padding:4px;border:1px solid #999;color:#222;">D</td>
        <td style="background:#ddd;font-weight:700;text-align:center;padding:4px;border:1px solid #999;color:#222;">N</td>
        <td colspan="4" style="background:#ff0;color:#222;font-weight:700;text-align:center;padding:4px 6px;border:1px solid #999;color:#222;">ANALYSE POSTURALE DYNAMIQUE</td>
        <td style="background:#ff0;color:#222;font-weight:700;text-align:center;padding:4px;border:1px solid #999;">G</td>
        <td style="background:#ff0;color:#222;font-weight:700;text-align:center;padding:4px;border:1px solid #999;">D</td>
        <td style="background:#ff0;color:#222;font-weight:700;text-align:center;padding:4px;border:1px solid #999;">N</td>
      </tr>
      <tr>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;">Épaule + basse</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-epaule-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-epaule-d"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-epaule-n"/></td>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;background:#ff0;color:#222;">PATTERN TRONC CÉRÉBRAL (RIMS/REMI)</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-tronc-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-tronc-d"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-tronc-n"/></td>
      </tr>
      <tr>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;">Rotation interne épaule</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-rot-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-rot-d"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-rot-n"/></td>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;background:#ff0;color:#222;">PATTERN CERVELET (RIMS/RIMI)</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-cervelet-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-cervelet-d"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-cervelet-n"/></td>
      </tr>
      <tr>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;">Flexion du coude</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-coude-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-coude-d"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-coude-n"/></td>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;background:#ff0;color:#222;">Défaut stabilisation tête</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-tete-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-tete-d"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-tete-n"/></td>
      </tr>
      <tr>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;">Pronation du poignet</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-pron-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-pron-d"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="aps-pron-n"/></td>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;background:#ff0;color:#222;">Membre sup peu mobile</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-membre-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-membre-d"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="apd-membre-n"/></td>
      </tr>
      <!-- CRITÈRES DE FORCE -->
      <tr>
        <td colspan="4" style="background:#ddd;font-weight:700;padding:4px 6px;border:1px solid #999;color:#222;">CRITÈRES DE FORCE</td>
        <td style="background:#ddd;font-weight:700;text-align:center;padding:4px;border:1px solid #999;color:#222;">G</td>
        <td style="background:#ddd;font-weight:700;text-align:center;padding:4px;border:1px solid #999;color:#222;">D</td>
        <td style="border:1px solid #999;"></td>
        <td colspan="4" style="background:#ddd;font-weight:700;padding:4px 6px;border:1px solid #999;color:#222;">AUTRES CRITÈRES EN DYNAMIQUE</td>
        <td style="background:#ddd;font-weight:700;text-align:center;padding:4px;border:1px solid #999;color:#222;">G</td>
        <td style="background:#ddd;font-weight:700;text-align:center;padding:4px;border:1px solid #999;color:#222;">D</td>
        <td style="border:1px solid #999;"></td>
      </tr>
      <tr>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;">Faiblesse muscles extenseurs poignet</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="cf-ext-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="cf-ext-d"/></td>
        <td style="border:1px solid #ccc;"></td>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;">Flexion poignet et doigts</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="acd-flex-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="acd-flex-d"/></td>
        <td style="border:1px solid #ccc;"></td>
      </tr>
      <tr>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;">Faiblesse muscles Fléchisseurs de hanche</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="cf-flex-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="cf-flex-d"/></td>
        <td style="border:1px solid #ccc;"></td>
        <td colspan="4" style="padding:3px 6px;border:1px solid #ccc;">Hyperextension genou</td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="acd-hyper-g"/></td>
        <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="acd-hyper-d"/></td>
        <td style="border:1px solid #ccc;"></td>
      </tr>
    </table>
    </div>

    <!-- HYPOTHÈSE -->
    <div style="background:linear-gradient(135deg,#fff9f0,#fff3e0);border-left:4px solid #f0a500;border-radius:8px;padding:12px;margin-bottom:14px;">
      <div style="font-weight:700;color:#b7740a;margin-bottom:8px;">🎯 HYPOTHÈSE</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:8px;background:#fff;border:2px solid #e74c3c;border-radius:20px;padding:6px 16px;">
          <input type="checkbox" id="po-hypo-tronc" style="width:14px;height:14px;"/>
          <span style="color:#e74c3c;font-weight:700;">🔴 TRONC CÉRÉBRAL</span>
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:8px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:6px 16px;">
          <input type="checkbox" id="po-hypo-cervelet" style="width:14px;height:14px;"/>
          <span style="color:#3498db;font-weight:700;">🔵 CERVELET</span>
        </label>
      </div>
    </div>

    <!-- TABLEAU PRINCIPAL: TRONC / VESTIBULAIRE / CERVELET -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:12px;">

      <!-- COLONNE TRONC CÉRÉBRAL (rouge) -->
      <div style="border:2px solid #e74c3c;border-radius:10px;overflow:hidden;">
        <div style="background:#e74c3c;color:#fff;text-align:center;font-weight:700;padding:8px;font-size:12px;border-radius:4px 4px 0 0;letter-spacing:1px;">🔴 TRONC CÉRÉBRAL</div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <tr>
            <td colspan="2" style="background:#f8d7da;color:#222;font-weight:700;padding:3px 4px;border:1px solid #e74c3c;">NERFS CRÂNIENS</td>
            <td style="background:#f8d7da;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #e74c3c;">G</td>
            <td style="background:#f8d7da;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #e74c3c;">D</td>
            <td style="background:#f8d7da;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #e74c3c;">N</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:2px 4px;border:1px solid #f8d7da;">Recapillarisation</td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-recap-g"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-recap-d"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-recap-n"/></td>
          </tr>
          ${['NC1','NC2'].map(nc => `<tr>
            <td style="padding:2px 4px;border:1px solid #f8d7da;"></td>
            <td style="padding:2px 4px;border:1px solid #f8d7da;font-weight:600;">${nc}</td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-g"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-d"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-n"/></td>
          </tr>`).join('')}
          ${['NC3','NC4'].map(nc => `<tr>
            <td style="background:#f4a261;padding:2px 4px;border:1px solid #f8d7da;font-size:9px;color:#222;">Mésencéphale</td>
            <td style="padding:2px 4px;border:1px solid #f8d7da;font-weight:600;">${nc}</td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-g"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-d"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-n"/></td>
          </tr>`).join('')}
          ${['NC5','NC6','NC7','NC8'].map(nc => `<tr>
            <td style="background:#f4a261;padding:2px 4px;border:1px solid #f8d7da;font-size:9px;color:#222;">Pont de Varole</td>
            <td style="padding:2px 4px;border:1px solid #f8d7da;font-weight:600;">${nc}</td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-g"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-d"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-n"/></td>
          </tr>`).join('')}
          ${['NC9','NC10','NC11','NC12'].map(nc => `<tr>
            <td style="background:#f4a261;padding:2px 4px;border:1px solid #f8d7da;font-size:9px;color:#222;">Bulbe rachidien</td>
            <td style="padding:2px 4px;border:1px solid #f8d7da;font-weight:600;">${nc}</td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-g"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-d"/></td>
            <td style="text-align:center;border:1px solid #f8d7da;"><input type="checkbox" id="nc-${nc.toLowerCase()}-n"/></td>
          </tr>`).join('')}
          <tr style="background:#ddd;font-weight:700;color:#222;">
            <td colspan="2" style="text-align:center;padding:3px;border:1px solid #999;">TOTAL</td>
            <td style="text-align:center;border:1px solid #999;" id="nc-total-g">0</td>
            <td style="text-align:center;border:1px solid #999;" id="nc-total-d">0</td>
            <td style="border:1px solid #999;"></td>
          </tr>
        </table>
      </div>

      <!-- COLONNE VESTIBULAIRE -->
      <div style="border:2px solid #555;border-radius:10px;overflow:hidden;">
        <div style="background:#555;color:#fff;text-align:center;font-style:italic;font-weight:700;padding:8px;font-size:12px;border-radius:4px 4px 0 0;letter-spacing:1px;">⚡ CONFLUENCE DES DONNÉES</div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <tr>
            <td style="font-weight:700;padding:3px 4px;border:1px solid #ccc;">VESTIBULAIRE</td>
            <td style="font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;">G</td>
            <td style="font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;">D</td>
            <td style="font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;">N</td>
          </tr>
          ${[['ROMBERG + CSC ANT','vest-ant'],['ROMBERG + CSC LAT','vest-lat'],['ROMBERG + CSC POST','vest-post']].map(([label,id]) => `<tr>
            <td style="padding:2px 4px;border:1px solid #ccc;">${label}</td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="${id}-g"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="${id}-d"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="${id}-n"/></td>
          </tr>`).join('')}
          <tr><td colspan="4" style="background:#d4edda;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;color:#27ae60;">PROPRIOCEPTION</td></tr>
          <tr>
            <td style="background:#d4edda;color:#222;font-weight:700;padding:3px 4px;border:1px solid #ccc;">PRIORITAIRES</td>
            <td style="background:#d4edda;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;">G</td>
            <td style="background:#d4edda;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;">D</td>
            <td style="background:#d4edda;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;">N</td>
          </tr>
          ${[['FN LENT (M) E. passif','prop-lent'],['FN RAPIDE (M) E. actif','prop-rapide']].map(([label,id]) => `<tr>
            <td style="padding:2px 4px;border:1px solid #ccc;background:#d4edda;color:#222;">${label}</td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="${id}-g"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="${id}-d"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="${id}-n"/></td>
          </tr>`).join('')}
          ${[['GOLGI (M) force iso','prop-golgi'],['PACCINI (A) mvt précis','prop-paccini'],['RUFFINI (A) Décompression','prop-ruffini-d'],['RUFFINI (A) Compression','prop-ruffini-c'],['GOLGI (A) mvt forcé','prop-golgi-a']].map(([label,id]) => `<tr>
            <td style="padding:2px 4px;border:1px solid #ccc;">${label}</td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="${id}-g"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="${id}-d"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="${id}-n"/></td>
          </tr>`).join('')}
          <tr style="background:#ddd;font-weight:700;color:#222;">
            <td style="text-align:center;padding:3px;border:1px solid #999;">TOTAL</td>
            <td style="text-align:center;border:1px solid #999;" id="vest-total-g">0</td>
            <td style="text-align:center;border:1px solid #999;" id="vest-total-d">0</td>
            <td style="border:1px solid #999;"></td>
          </tr>
        </table>
      </div>

      <!-- COLONNE CERVELET (bleu) -->
      <div style="border:2px solid #3498db;border-radius:10px;overflow:hidden;">
        <div style="background:#3498db;color:#fff;text-align:center;font-weight:700;padding:8px;font-size:12px;border-radius:4px 4px 0 0;letter-spacing:1px;">🔵 CERVELET</div>
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <tr>
            <td style="background:#d6eaf8;color:#222;font-weight:700;padding:3px 4px;border:1px solid #3498db;">VERMIS</td>
            <td style="background:#d6eaf8;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #3498db;">G</td>
            <td style="background:#d6eaf8;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #3498db;">D</td>
            <td style="background:#d6eaf8;color:#222;font-weight:700;text-align:center;padding:3px;border:1px solid #3498db;">N</td>
          </tr>
          ${[['SHARP. ROMBERG','vermis-sharp'],['ROMBERG 1 PIED','vermis-romberg']].map(([label,id]) => `<tr>
            <td style="padding:2px 4px;border:1px solid #d6eaf8;background:#d6eaf8;color:#222;">${label}</td>
            <td style="text-align:center;border:1px solid #d6eaf8;"><input type="checkbox" id="${id}-g"/></td>
            <td style="text-align:center;border:1px solid #d6eaf8;"><input type="checkbox" id="${id}-d"/></td>
            <td style="text-align:center;border:1px solid #d6eaf8;"><input type="checkbox" id="${id}-n"/></td>
          </tr>`).join('')}
          <tr>
            <td style="padding:2px 4px;border:1px solid #d6eaf8;background:#d6eaf8;color:#222;">PROPRIO AXE <span style="font-size:9px;">X sur les parties du corps affectées</span></td>
            <td colspan="3" style="text-align:center;border:1px solid #d6eaf8;padding:2px;">
              <input type="checkbox" id="proprio-axe-tete" onchange="setBilanField('proprio-axe-tete',this.checked)" title="Tête"/> Tête
              <input type="checkbox" id="proprio-axe-corps" onchange="setBilanField('proprio-axe-corps',this.checked)" title="Corps"/> Corps
              <input type="checkbox" id="proprio-axe-bassin" onchange="setBilanField('proprio-axe-bassin',this.checked)" title="Bassin"/> Bassin
            </td>
          </tr>
          <tr>
            <td style="background:#f0a500;font-weight:700;padding:3px 4px;border:1px solid #3498db;color:#222;">INTER</td>
            <td style="background:#f0a500;font-weight:700;text-align:center;padding:3px;border:1px solid #3498db;color:#222;">G</td>
            <td style="background:#f0a500;font-weight:700;text-align:center;padding:3px;border:1px solid #3498db;color:#222;">D</td>
            <td style="background:#f0a500;font-weight:700;text-align:center;padding:3px;border:1px solid #3498db;color:#222;">N</td>
          </tr>
          ${[['Précision (doigt-nez)','inter-prec'],['Coordination (mvt alternatif)','inter-coord']].map(([label,id]) => `<tr>
            <td style="padding:2px 4px;border:1px solid #d6eaf8;">${label}</td>
            <td style="text-align:center;border:1px solid #d6eaf8;"><input type="checkbox" id="${id}-g"/></td>
            <td style="text-align:center;border:1px solid #d6eaf8;"><input type="checkbox" id="${id}-d"/></td>
            <td style="text-align:center;border:1px solid #d6eaf8;"><input type="checkbox" id="${id}-n"/></td>
          </tr>`).join('')}
          <tr>
            <td style="background:#f0a500;font-weight:700;padding:3px 4px;border:1px solid #3498db;color:#222;">LATÉRAL</td>
            <td style="background:#f0a500;font-weight:700;text-align:center;padding:3px;border:1px solid #3498db;color:#222;">G</td>
            <td style="background:#f0a500;font-weight:700;text-align:center;padding:3px;border:1px solid #3498db;color:#222;">D</td>
            <td style="background:#f0a500;font-weight:700;text-align:center;padding:3px;border:1px solid #3498db;color:#222;">N</td>
          </tr>
          ${[['Précision (piano)','lat-prec'],['Coordination (Go-No Go)','lat-coord']].map(([label,id]) => `<tr>
            <td style="padding:2px 4px;border:1px solid #d6eaf8;">${label}</td>
            <td style="text-align:center;border:1px solid #d6eaf8;"><input type="checkbox" id="${id}-g"/></td>
            <td style="text-align:center;border:1px solid #d6eaf8;"><input type="checkbox" id="${id}-d"/></td>
            <td style="text-align:center;border:1px solid #d6eaf8;"><input type="checkbox" id="${id}-n"/></td>
          </tr>`).join('')}
          <tr style="background:#ddd;font-weight:700;color:#222;">
            <td style="text-align:center;padding:3px;border:1px solid #999;">TOTAL</td>
            <td style="text-align:center;border:1px solid #999;" id="cerv-total-g">0</td>
            <td style="text-align:center;border:1px solid #999;" id="cerv-total-d">0</td>
            <td style="border:1px solid #999;"></td>
          </tr>
        </table>
      </div>
    </div>

    <!-- RÉFLEXES ARCHAÏQUES + RÉCEPTEURS TACTILES -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <!-- RÉFLEXES ARCHAÏQUES -->
      <table style="border-collapse:collapse;font-size:10px;width:100%;border-radius:10px;overflow:hidden;">
        <tr><td colspan="8" style="background:#8e44ad;color:#fff;font-weight:700;text-align:center;padding:8px;border:1px solid #8e44ad;font-size:12px;letter-spacing:1px;">🟣 RÉFLEXES ARCHAÏQUES</td></tr>
        <tr>
          <td style="background:#ddd;font-weight:700;padding:3px 4px;border:1px solid #ccc;color:#222;">PRIORITAIRES</td>
          <td style="background:#ddd;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;color:#222;">O</td>
          <td style="background:#ddd;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;color:#222;">N</td>
          <td style="border:1px solid #ccc;"></td>
          <td style="background:#ddd;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;color:#222;">G</td>
          <td style="background:#ddd;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;color:#222;">D</td>
          <td style="background:#ddd;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;color:#222;">N</td>
        </tr>
        ${[
          ['RPP','#e8d5f5',true],['RTP','#e8d5f5',true],['MORO','#e8d5f5',true],
          ['PEREZ','#fff',true],['LANDAU','#fff',true],['REPTATION','#fff',true]
        ].map(([label,bg,prio],i) => {
          const id = label.toLowerCase().replace(/\s/g,'-');
          const reflex = ['RTAC','GALANT','BABINSKI','PLANTAIRE','PALMAIRE','BABKIN'][i];
          const rid = reflex.toLowerCase();
          return `<tr>
            <td style="padding:2px 4px;border:1px solid #ccc;background:${bg};color:#222;">${label}</td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="ref-${id}-o"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="ref-${id}-n"/></td>
            <td style="padding:2px 4px;border:1px solid #ccc;">${reflex}</td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="ref-${rid}-g"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="ref-${rid}-d"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="ref-${rid}-n"/></td>
          </tr>`;
        }).join('')}
      </table>

      <!-- RÉCEPTEURS TACTILES -->
      <table style="border-collapse:collapse;font-size:10px;width:100%;border-radius:10px;overflow:hidden;">
        <tr><td colspan="4" style="background:#f0a500;color:#fff;font-weight:700;text-align:center;padding:8px;border:1px solid #f0a500;font-size:12px;letter-spacing:1px;">🟠 RÉCEPTEURS TACTILES</td></tr>
        <tr>
          <td style="background:#ddd;font-weight:700;padding:3px 4px;border:1px solid #ccc;color:#222;">PRIORITAIRES</td>
          <td style="background:#ddd;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;color:#222;">G</td>
          <td style="background:#ddd;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;color:#222;">D</td>
          <td style="background:#ddd;font-weight:700;text-align:center;padding:3px;border:1px solid #ccc;color:#222;">N</td>
        </tr>
        ${[
          ['Merkel (Toucher/pression)','#f0a500'],
          ['Ruffini (Étirement)','#f0a500'],
          ['Pacini (vibration)','#f0a500'],
          ['TNL (piquer)','#f0a500'],
          ['Meissner (caresse coton)','#fff'],
          ['Poils (mouvement)','#fff']
        ].map(([label,bg]) => {
          const id = label.split(' ')[0].toLowerCase();
          return `<tr>
            <td style="padding:2px 4px;border:1px solid #ccc;background:${bg==='#f0a500'?'#fdebd0':bg};color:#222;">${label}</td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="tact-${id}-g"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="tact-${id}-d"/></td>
            <td style="text-align:center;border:1px solid #ccc;"><input type="checkbox" id="tact-${id}-n"/></td>
          </tr>`;
        }).join('')}
      </table>
    </div>

  </div>
</div>

  <div class="posturo-section" id="psec-4" style="padding:0 20px;display:none;">
  <div class="card" style="margin-bottom:16px;">
    <div class="stitle" style="color:#2a7a4e;margin-bottom:16px;">🦶 Investigation du système plantaire</div>

    <!-- Épines irritatives -->
    <div style="background:linear-gradient(135deg,#fff9f0,#fff3e0);border-left:4px solid #f0a500;border-radius:8px;padding:12px;margin-bottom:12px;color:#222;">
      <div style="font-weight:600;margin-bottom:8px;color:#b7740a;">🌵 Présences épines irritatives d'appui plantaire</div>
      <div style="display:flex;gap:12px;margin-bottom:8px;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #f0a500;border-radius:20px;padding:4px 14px;color:#222;">
          <input type="radio" name="po-epines" id="po-epines-oui" value="oui"/>
          <span style="font-weight:600;color:#b7740a;">Oui</span>
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:4px 14px;color:#222;">
          <input type="radio" name="po-epines" id="po-epines-non" value="non"/>
          <span style="font-weight:600;color:#666;">Non</span>
        </label>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:500;">📍 Localisation :</span>
        <input class="inp" id="po-epines-loc" placeholder="Préciser..." style="flex:1;background:#fff;color:#222;"/>
      </div>
    </div>

    <!-- Examen empreinte -->
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;color:#222;">
      <div style="font-weight:600;margin-bottom:10px;color:#2a7a4e;">👣 Examen empreinte et morpho plantaire</div>
      <input type="file" id="po-empreinte-file" accept="image/*" style="display:none;" onchange="previewEmpreinte(this)"/>
      <input type="file" id="po-empreinte-cam" accept="image/*" capture="environment" style="display:none;" onchange="previewEmpreinte(this)"/>
      <div id="po-empreinte-preview" style="text-align:center;margin-bottom:10px;">
        <img id="po-empreinte-img" style="max-width:100%;max-height:220px;display:none;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);"/>
      </div>
      <div id="po-empreinte-video-wrap" style="display:none;margin-bottom:10px;">
        <video id="po-empreinte-video" autoplay playsinline style="width:100%;max-height:220px;border-radius:10px;background:#000;color:#222;"></video>
        <div style="display:flex;gap:8px;margin-top:8px;justify-content:center;">
          <button class="btn" onclick="captureEmpreinte()" style="padding:10px 20px;font-size:13px;border-radius:8px;">📸 Capturer</button>
          <button class="btn" onclick="stopEmpreinteCamera()" style="padding:10px 20px;font-size:13px;border-radius:8px;background:#888;color:#222;">✕ Annuler</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        <button onclick="startEmpreinteCamera()" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 8px;background:#fff;border:2px solid #2a7a4e;border-radius:10px;cursor:pointer;font-size:11px;font-weight:600;color:#2a7a4e;">
          <span style="font-size:24px;">📷</span>Caméra ordi
        </button>
        <button onclick="document.getElementById('po-empreinte-cam').click()" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 8px;background:#fff;border:2px solid #3498db;border-radius:10px;cursor:pointer;font-size:11px;font-weight:600;color:#3498db;">
          <span style="font-size:24px;">📱</span>Caméra mobile
        </button>
        <button onclick="document.getElementById('po-empreinte-file').click()" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 8px;background:#fff;border:2px solid #8e44ad;border-radius:10px;cursor:pointer;font-size:11px;font-weight:600;color:#8e44ad;">
          <span style="font-size:24px;">🖼️</span>Depuis l'ordi
        </button>
      </div>
      <div style="text-align:center;margin-top:8px;">
        <button id="po-empreinte-del" onclick="deleteEmpreinte()" style="display:none;padding:8px 16px;background:#e74c3c;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;">🗑 Supprimer la photo</button>
      </div>
    </div>

    <!-- Examen chaussure -->
    <div style="background:linear-gradient(135deg,#f8f0ff,#f0e8ff);border-left:4px solid #8e44ad;border-radius:8px;padding:12px;margin-bottom:12px;color:#222;">
      <div style="font-weight:600;margin-bottom:8px;color:#6c3483;">👟 Examen de la chaussure</div>
      <div style="margin-bottom:8px;">
        <div style="font-weight:500;margin-bottom:6px;color:#555;">Usure :</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:5px 14px;color:#222;">
            <input type="checkbox" id="po-usure-interne"/> Interne
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:5px 14px;color:#222;">
            <input type="checkbox" id="po-usure-externe"/> Externe
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:5px 14px;color:#222;">
            <input type="checkbox" id="po-usure-contrefort"/> Contrefort
          </label>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-weight:500;color:#555;">Type porté régulièrement :</span>
        <input class="inp" id="po-chaussure-type" placeholder="Ex: running, cuir, talon..." style="flex:1;background:#fff;color:#222;"/>
      </div>
    </div>

    <!-- Tactique équilibration -->
    <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;margin-bottom:12px;color:#222;">
      <div style="font-weight:600;margin-bottom:8px;color:#2471a3;">⚖️ Tactique d'équilibration</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 16px;color:#222;">
          <input type="radio" name="po-tactique" id="po-tact-cheville" value="cheville"/>
          <span style="font-weight:600;color:#2471a3;">🦶 Cheville</span>
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 16px;color:#222;">
          <input type="radio" name="po-tactique" id="po-tact-mixte" value="mixte"/>
          <span style="font-weight:600;color:#2471a3;">↕️ Mixte</span>
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 16px;color:#222;">
          <input type="radio" name="po-tactique" id="po-tact-hanche" value="hanche"/>
          <span style="font-weight:600;color:#2471a3;">🦴 Hanche</span>
        </label>
      </div>
    </div>

    <!-- Tests toniques -->
    <div style="background:linear-gradient(135deg,#fff0f0,#ffe8e8);border-left:4px solid #e74c3c;border-radius:8px;padding:12px;margin-bottom:12px;color:#222;">
      <div style="font-weight:600;margin-bottom:8px;color:#c0392b;">💪 Tests toniques</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 10px;color:#222;">
          <input type="checkbox" id="po-test-pouces"/>
          <span>👍 Test des pouces montants</span>
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 10px;color:#222;">
          <input type="checkbox" id="po-test-convergence"/>
          <span>🔄 Convergence podale</span>
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 10px;color:#222;">
          <input type="checkbox" id="po-test-scapulaire"/>
          <span>🫁 Scapulaire de Dupas</span>
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 10px;color:#222;">
          <input type="checkbox" id="po-test-nucale"/>
          <span>🔃 Rotation nucale</span>
        </label>
      </div>
    </div>

    <!-- Recherche parasites -->
    <div style="background:linear-gradient(135deg,#f0fff4,#e0f8e8);border-left:4px solid #27ae60;border-radius:8px;padding:12px;margin-bottom:12px;color:#222;">
      <div style="font-weight:600;margin-bottom:8px;color:#1e8449;">🔍 Recherche parasite(s) / entrée(s)</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:7px 10px;color:#222;">
          <input type="checkbox" id="po-para-plantaire"/> 🦶 Plantaire
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:7px 10px;color:#222;">
          <input type="checkbox" id="po-para-yeux"/> 👁️ Yeux
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:7px 10px;color:#222;">
          <input type="checkbox" id="po-para-buccale"/> 🦷 Buccale
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:7px 10px;color:#222;">
          <input type="checkbox" id="po-para-cicatrice"/> 🩹 Cicatrice
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:7px 10px;color:#222;">
          <input type="checkbox" id="po-para-vestibulaire"/> 👂 Vestibulaire
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:7px 10px;color:#222;">
          <input type="checkbox" id="po-para-viscerale"/> 🫀 Zone viscérale
        </label>
      </div>
    </div>

    <!-- Test stabilité monopodal -->
    <div style="background:linear-gradient(135deg,#fffaf0,#fff5e0);border-left:4px solid #f39c12;border-radius:8px;padding:12px;margin-bottom:12px;color:#222;">
      <div style="font-weight:600;margin-bottom:8px;color:#d68910;">🧍 Test de stabilité monopodal <span style="color:#e74c3c;">(déficit)</span></div>
      <table style="border-collapse:collapse;font-size:13px;width:auto;">
        <tr>
          <th style="padding:6px 20px;border:1px solid #f0c070;background:#fdebd0;color:#222;"></th>
          <th style="padding:6px 20px;border:1px solid #f0c070;background:#fdebd0;text-align:center;color:#222;">G</th>
          <th style="padding:6px 20px;border:1px solid #f0c070;background:#fdebd0;text-align:center;color:#222;">D</th>
        </tr>
        <tr>
          <td style="padding:8px 20px;border:1px solid #f0c070;font-weight:600;">🦶 Pied</td>
          <td style="text-align:center;border:1px solid #f0c070;padding:8px 20px;"><input type="checkbox" id="po-mono-pied-g"/></td>
          <td style="text-align:center;border:1px solid #f0c070;padding:8px 20px;"><input type="checkbox" id="po-mono-pied-d"/></td>
        </tr>
        <tr>
          <td style="padding:8px 20px;border:1px solid #f0c070;font-weight:600;">🦵 Genou</td>
          <td style="text-align:center;border:1px solid #f0c070;padding:8px 20px;"><input type="checkbox" id="po-mono-genou-g"/></td>
          <td style="text-align:center;border:1px solid #f0c070;padding:8px 20px;"><input type="checkbox" id="po-mono-genou-d"/></td>
        </tr>
        <tr>
          <td style="padding:8px 20px;border:1px solid #f0c070;font-weight:600;">🦴 Hanche</td>
          <td style="text-align:center;border:1px solid #f0c070;padding:8px 20px;"><input type="checkbox" id="po-mono-hanche-g"/></td>
          <td style="text-align:center;border:1px solid #f0c070;padding:8px 20px;"><input type="checkbox" id="po-mono-hanche-d"/></td>
        </tr>
      </table>
    </div>

    <!-- Épreuve alignement -->
    <div style="background:linear-gradient(135deg,#f5eeff,#ede0ff);border-left:4px solid #8e44ad;border-radius:8px;padding:12px;margin-bottom:12px;color:#222;">
      <div style="font-weight:600;margin-bottom:4px;color:#6c3483;">🎯 Épreuve de l'alignement articulaire sous contrainte en 3 temps <span style="color:#e74c3c;">(déficit)</span></div>
      <div style="font-size:10px;font-style:italic;color:#888;margin-bottom:8px;">(réalisé si antécédent traumatique / si perte stabilité monopodal en charge) (exclusion : stratégie équilibration autour de la hanche ou mixte avancée)</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;color:#222;">
          <input type="checkbox" id="po-align-axe"/> ✅ Axe articulaire en place dans schéma corporel
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;color:#222;">
          <input type="checkbox" id="po-align-inf"/> ⬇️ Déséquilibre inférieur
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;color:#222;">
          <input type="checkbox" id="po-align-sup"/> ⬆️ Déséquilibre supérieur
        </label>
      </div>
    </div>

  </div>
</div>
  <div class="posturo-section" id="psec-5" style="padding:0 20px;display:none;">
  <div class="card" style="margin-bottom:16px;">
    <div class="stitle" style="color:#2a7a4e;margin-bottom:4px;">👂 Investigation du système vestibulaire</div>
    <div style="font-size:11px;font-style:italic;color:#888;margin-bottom:16px;">(si retrouvé prioritaire sur test tonique ou Romberg)</div>

    <!-- Latéralisation -->
    <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:600;color:#2471a3;margin-bottom:8px;">🎯 Latéralisation du patient</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="display:flex;gap:10px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-later" id="po-later-oui" value="oui" onchange="toggleLateralisation(true)"/> Oui
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-later" id="po-later-non" value="non" onchange="toggleLateralisation(false)"/> <span style="font-style:italic;">Non <span style="font-size:10px;">(pas d'investigation)</span></span>
          </label>
        </div>
        <div id="po-later-options" style="display:flex;gap:8px;flex-wrap:wrap;opacity:1;transition:opacity 0.2s;">
          <span style="font-weight:500;color:#222;">:</span>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-later-type" id="po-later-local" value="local"/> Local
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-later-type" id="po-later-regional" value="regional"/> Régional
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-later-type" id="po-later-global" value="global"/> Global
          </label>
          <span style="color:#ccc;font-weight:300;">|</span>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #e74c3c;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="checkbox" id="po-later-d"/> D
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #e74c3c;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="checkbox" id="po-later-g"/> G
          </label>
        </div>
      </div>
    </div>

    <!-- Tests prévention -->
    <div style="background:linear-gradient(135deg,#fff0f0,#ffe8e8);border-left:4px solid #e74c3c;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:600;color:#c0392b;margin-bottom:8px;">🔴 Tests prévention</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${[['Test de DeKleyn','po-klein'],['Test des ligaments alaires','po-ligaments'],['Test de Rancurel','po-rancurel']].map(([label,id]) => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 12px;">
          <span style="font-weight:500;color:#222;">- ${label}</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #e74c3c;border-radius:20px;padding:3px 12px;color:#222;">
              <input type="radio" name="${id}" value="positif"/> ✅ Positif
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;">
              <input type="radio" name="${id}" value="negatif"/> ❌ Négatif
            </label>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Tests vestibulaires -->
    <div style="background:linear-gradient(135deg,#f5eeff,#ede0ff);border-left:4px solid #8e44ad;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:600;color:#6c3483;margin-bottom:8px;">🌀 Tests vestibulaires</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;">
          <span style="font-weight:500;color:#222;">- Head Shaking Test → nystagmus</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-headshaking" value="oui"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-headshaking" value="non"/> Non</label>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;">
          <span style="font-weight:500;color:#222;">- Head Impulse Test → saccade</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-headimpulse" value="oui"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-headimpulse" value="non"/> Non</label>
          </div>
        </div>
      </div>
    </div>

    <!-- Tests stato-kinétiques -->
    <div style="background:linear-gradient(135deg,#f0fff4,#e0f8e8);border-left:4px solid #27ae60;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:600;color:#1e8449;margin-bottom:8px;">🚶 Tests stato-kinétiques</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;">
          <div style="font-weight:500;color:#222;margin-bottom:6px;">- Étoile de Babinski-Weil →</div>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #27ae60;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-babinski" value="D"/> Déviation D</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #27ae60;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-babinski" value="G"/> Déviation G</label>
          </div>
        </div>
        <div style="background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;">
          <div style="font-weight:500;color:#222;margin-bottom:6px;">- Unterburger →</div>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #27ae60;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-unterburger" value="D"/> Déviation D</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #27ae60;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-unterburger" value="G"/> Déviation G</label>
          </div>
        </div>
      </div>
    </div>

    <!-- Vertiges / VPPB -->
    <div style="background:linear-gradient(135deg,#fffaf0,#fff5e0);border-left:4px solid #f39c12;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:600;color:#d68910;margin-bottom:8px;">💫 Vertiges & VPPB</div>
      <!-- Vertiges -->
      <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #f0c070;border-radius:8px;padding:8px 12px;margin-bottom:8px;">
        <span style="font-weight:500;color:#222;">Présence de vertiges / nystagmus</span>
        <div style="display:flex;gap:8px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #f39c12;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-vertiges" value="oui"/> Oui</label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-vertiges" value="non"/> Non</label>
        </div>
      </div>
      <!-- VPPB -->
      <div style="background:#fff;border:1px solid #f0c070;border-radius:8px;padding:8px 12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-weight:500;color:#222;">VPPB <span style="font-size:10px;font-style:italic;">(si nystagmus)</span></span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #f39c12;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-vppb" id="po-vppb-oui" value="oui" onchange="document.getElementById('po-vppb-detail').style.display='flex'"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-vppb" id="po-vppb-non" value="non" onchange="document.getElementById('po-vppb-detail').style.display='none'"/> Non</label>
          </div>
        </div>
        <div id="po-vppb-detail" style="display:none;flex-wrap:wrap;gap:8px;margin-top:8px;">
          ${[['CSC D','po-csc-d'],['CSC G','po-csc-g'],['CSC Ant G','po-csc-antg'],['CSC Ant D','po-csc-antd'],['CSC Post D','po-csc-postd'],['CSC Post G','po-csc-postg']].map(([label,id]) => `
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff9e6;border:2px solid #f39c12;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="checkbox" id="${id}"/> ${label}
          </label>`).join('')}
        </div>
      </div>
    </div>

    <!-- Manœuvre libératrice CLVF -->
    <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:600;color:#2471a3;margin-bottom:8px;">🔬 Manœuvre libératrice</div>
      <!-- CLVF -->
      <div style="background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:10px 12px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span style="font-weight:700;color:#222;">CLVF</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-clvf" value="oui" onchange="toggleCLVF(true)"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-clvf" value="non" onchange="toggleCLVF(false)"/> Non</label>
          </div>
        </div>
        <!-- Typage canalaire + PEVS -->
        <div id="po-clvf-detail" style="display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px;opacity:1;transition:opacity 0.2s;">
          <span style="font-weight:500;color:#222;">Typage canalaire :</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-pevs" value="D"/> PEVS D</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="radio" name="po-pevs" value="G"/> PEVS G</label>
          </div>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="checkbox" id="po-canal-ant"/> Ant</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="checkbox" id="po-canal-post"/> Post</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:3px 12px;color:#222;"><input type="checkbox" id="po-canal-lat"/> Lat</label>
          </div>
        </div>
        <!-- Manœuvre -->
        <div id="po-clvf-manoeuvre" style="opacity:1;transition:opacity 0.2s;">
          <span style="font-weight:500;color:#222;margin-bottom:6px;display:block;">Manœuvre libératrice :</span>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${[['Semont','po-man-semont'],['Epley','po-man-epley'],['Epley inversé','po-man-epley-inv'],['Lempert','po-man-lempert']].map(([label,id]) => `
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:4px 14px;color:#222;">
              <input type="checkbox" id="${id}"/> ${label}
            </label>`).join('')}
          </div>
        </div>
      </div>
      <!-- Réorientation -->
      <div style="background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:10px 12px;">
        <span style="font-weight:500;color:#222;margin-bottom:6px;display:block;">Réorientation :</span>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;">
            <input type="checkbox" id="po-reor-orl"/> 🏥 ORL
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#eaf4ff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;">
            <input type="checkbox" id="po-reor-kine"/> 🏃 Kinésithérapeute (rééducation vestibulaire)
          </label>
        </div>
      </div>
    </div>

    <!-- Semelle compensation -->
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span style="font-weight:600;color:#2a7a4e;">🦶 Mise en place d'une semelle de compensation</span>
        <div style="display:flex;gap:8px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #2a7a4e;border-radius:20px;padding:4px 14px;color:#222;"><input type="radio" name="po-semelle-comp" value="oui"/> Oui</label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:4px 14px;color:#222;"><input type="radio" name="po-semelle-comp" value="non"/> Non</label>
        </div>
      </div>
    </div>

  </div>
</div>
  <div class="posturo-section" id="psec-6" style="padding:0 20px;display:none;">
  <div class="card" style="margin-bottom:16px;">
    <div class="stitle" style="color:#2a7a4e;margin-bottom:4px;">🦷 Investigation entrée buccale</div>
    <div style="font-size:11px;font-style:italic;color:#888;margin-bottom:16px;">(si retrouvé prioritaire sur test tonique ou Romberg)</div>

    <!-- MCP -->
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#2a7a4e;font-size:13px;margin-bottom:10px;">🔄 Manœuvre de Convergence Podale (MCP)</div>

      <!-- Test 1: Amélioration ouverture bouche -->
      <div style="background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:10px;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:600;color:#2a7a4e;margin-bottom:6px;">Amélioration ouverture de bouche <span style="color:#888;font-weight:400;">(ATM secondaire)</span></div>
        <div style="display:flex;gap:8px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #2a7a4e;border-radius:20px;padding:4px 14px;color:#222;">
            <input type="radio" name="po-mcp-ouv" value="oui"/> Oui
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:4px 14px;color:#222;">
            <input type="radio" name="po-mcp-ouv" value="non"/> Non
          </label>
        </div>
      </div>

      <!-- Test 2: Serrage de dent -->
      <div style="background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:10px;">
        <div style="font-size:11px;font-weight:600;color:#2a7a4e;margin-bottom:6px;">Serrage de dent</div>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;">
            <input type="radio" name="po-serrage" id="po-serrage-aggrav" value="aggravation" onchange="toggleSerrage('aggravation')"/> Aggravation
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;">
            <input type="radio" name="po-serrage" id="po-serrage-amelio" value="amelioration" onchange="toggleSerrage('amelioration')"/> Amélioration
          </label>
        </div>
        <!-- Sous-options aggravation -->
        <div id="po-serrage-aggrav-opts" style="display:none;flex-wrap:wrap;gap:8px;margin-top:4px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;">
            <input type="checkbox" id="po-aggr-dents"/> 🦷 Dents réactogènes
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;">
            <input type="checkbox" id="po-aggr-atm"/> 🦴 ATM*
          </label>
        </div>
        <!-- Sous-options amélioration -->
        <div id="po-serrage-amelio-opts" style="display:none;flex-wrap:wrap;gap:8px;margin-top:4px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;">
            <input type="checkbox" id="po-amelio-contact"/> 🦷 Défaut de contact dentaire
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;">
            <input type="checkbox" id="po-amelio-tension"/> 🧠 Tensions intracrâniennes
          </label>
        </div>
      </div>
    </div>

    <!-- ATM origine -->
    <div style="background:linear-gradient(135deg,#fff9f0,#fff3e0);border-left:4px solid #f0a500;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#b7740a;font-size:13px;margin-bottom:8px;">🦴 ATM* — Articulation Temporo-Mandibulaire : origine</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #f0a500;border-radius:20px;padding:5px 16px;color:#222;">
          <input type="radio" name="po-atm-origine" value="musculaire"/> 💪 Musculaire
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #f0a500;border-radius:20px;padding:5px 16px;color:#222;">
          <input type="radio" name="po-atm-origine" value="reductible"/> ↩️ Réductible
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #f0a500;border-radius:20px;padding:5px 16px;color:#222;">
          <input type="radio" name="po-atm-origine" value="irreductible"/> 🔒 Irréductible
        </label>
      </div>
    </div>

    <!-- Examen mandibule -->
    <div style="background:linear-gradient(135deg,#f5eeff,#ede0ff);border-left:4px solid #8e44ad;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#6c3483;font-size:13px;margin-bottom:10px;">🦷 Examen de la mandibule</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${[
          ['Ouverture maximale 3 doigts','po-ouv-max'],
          ['Déviation à l\'ouverture de bouche','po-deviation'],
          ['Contractures des muscles masticateurs','po-contractures'],
          ['Douleur capsulo-ligamentaire (palpation)','po-douleur-caps']
        ].map(([label,name]) => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;">
          <span style="font-weight:500;color:#222;font-size:12px;">- ${label}</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="${name}" value="oui"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="${name}" value="non"/> Non</label>
          </div>
        </div>`).join('')}

        <!-- Ressaut méniscal -->
        <div style="background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span style="font-weight:500;color:#222;font-size:12px;">- Ressaut méniscal</span>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-ressaut" value="oui" onchange="toggleRessaut(true)"/> Oui</label>
              <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-ressaut" value="non" onchange="toggleRessaut(false)"/> Non</label>
              <div id="po-ressaut-opts" style="display:flex;gap:8px;opacity:1;transition:opacity 0.2s;">
                <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f5eeff;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="checkbox" id="po-ressaut-dte"/> Droite</label>
                <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f5eeff;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="checkbox" id="po-ressaut-gauche"/> Gauche</label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Réorientation -->
    <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;">
      <div style="font-weight:700;color:#2471a3;font-size:13px;margin-bottom:8px;">🏥 Réorientation</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;">
          <input type="checkbox" id="po-reor-buc-dentiste"/> 🦷 Dentiste
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;">
          <input type="checkbox" id="po-reor-buc-ortho"/> 😁 Orthodontiste
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;">
          <input type="checkbox" id="po-reor-buc-stomato"/> 🏥 Stomatologue
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;">
          <input type="checkbox" id="po-reor-buc-kine"/> 🏃 Kinésithérapeute
        </label>
      </div>
    </div>


    <!-- SÉPARATEUR -->
    <div style="border-top:2px dashed #ccc;margin:16px 0;"></div>

    <!-- ENTRÉE VISUELLE -->
    <div style="font-weight:700;color:#2a7a4e;font-size:14px;margin-bottom:4px;">👁️ Investigation entrée visuelle</div>
    <div style="font-size:11px;font-style:italic;color:#888;margin-bottom:12px;">(si retrouvé prioritaire sur test tonique ou Romberg)</div>

    <!-- Latéralisation -->
    <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#2471a3;font-size:13px;margin-bottom:8px;">🎯 Latéralisation / inclinaison / rotation du patient</div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="display:flex;gap:8px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-vis-later" value="oui" onchange="toggleVisLater(true)"/> Oui
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #ccc;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-vis-later" value="non" onchange="toggleVisLater(false)"/> <span style="font-style:italic;">Non <span style="font-size:10px;">(pas d'investigation)</span></span>
          </label>
        </div>
        <div id="po-vis-later-opts" style="display:flex;gap:8px;flex-wrap:wrap;opacity:1;transition:opacity 0.2s;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-vis-later-type" value="local"/> Local
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-vis-later-type" value="regional"/> Régional
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 12px;color:#222;">
            <input type="radio" name="po-vis-later-type" value="general"/> Général
          </label>
        </div>
      </div>
    </div>

    <!-- Tests stato-oculaire -->
    <div style="background:linear-gradient(135deg,#f5eeff,#ede0ff);border-left:4px solid #8e44ad;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#6c3483;font-size:13px;margin-bottom:8px;">🔬 Tests stato-oculaire</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${[['Test allongement brachial','po-test-allongement'],['Test rotation nucale','po-test-rot-nucale']].map(([label,name]) => `
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #d7bde2;border-radius:8px;padding:8px 12px;">
          <span style="font-weight:500;color:#222;font-size:12px;">- ${label} →</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #e74c3c;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="${name}" value="positif"/> ✅ Positif</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="${name}" value="negatif"/> ❌ Négatif</label>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <!-- Entrée visuelle primaire/secondaire -->
    <div style="background:linear-gradient(135deg,#fff9f0,#fff3e0);border-left:4px solid #f0a500;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#b7740a;font-size:13px;margin-bottom:8px;">👁️ Entrée visuelle</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #f0a500;border-radius:20px;padding:5px 16px;color:#222;">
          <input type="radio" name="po-vis-entree" value="primaire"/> Primaire
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #f0a500;border-radius:20px;padding:5px 16px;color:#222;">
          <input type="radio" name="po-vis-entree" value="secondaire"/> Secondaire
        </label>
      </div>

      <!-- Réfraction -->
      <div style="background:#fff;border:1px solid #f0d090;border-radius:8px;padding:10px;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:600;color:#b7740a;margin-bottom:6px;">- Réfraction :</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${[['Myopie','po-myopie'],['Hypermétropie','po-hypermetropie'],['Presbyte','po-presbyte'],['Astigmate','po-astigmate']].map(([label,id]) => `
          <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff9e6;border:2px solid #f0a500;border-radius:20px;padding:4px 12px;color:#222;font-size:12px;">
            <input type="checkbox" id="${id}"/> ${label}
          </label>`).join('')}
        </div>
      </div>

      <!-- Œil directeur / dominant -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <div style="background:#fff;border:1px solid #f0d090;border-radius:8px;padding:10px;">
          <div style="font-size:11px;font-weight:600;color:#b7740a;margin-bottom:6px;">👁️ Œil directeur</div>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #f0a500;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-oeil-direct" value="droit"/> Droit</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #f0a500;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-oeil-direct" value="gauche"/> Gauche</label>
          </div>
        </div>
        <div style="background:#fff;border:1px solid #f0d090;border-radius:8px;padding:10px;">
          <div style="font-size:11px;font-weight:600;color:#b7740a;margin-bottom:6px;">👁️ Œil dominant</div>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #f0a500;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-oeil-domin" value="droit"/> Droit</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #f0a500;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-oeil-domin" value="gauche"/> Gauche</label>
          </div>
        </div>
      </div>
    </div>

    <!-- Tests oculaires -->
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#2a7a4e;font-size:13px;margin-bottom:10px;">🔭 Tests oculaires</div>

      <!-- Convergence oculaire -->
      <div style="background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:10px;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:600;color:#2a7a4e;margin-bottom:6px;">- Manœuvre de convergence oculaire</div>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#f0faf4;border:2px solid #2a7a4e;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;">
          <input type="checkbox" id="po-conv-oculaire"/> Défaut de convergence
        </label>
      </div>

      <!-- Maddox + Cover test -->
      ${[['Maddox','po-maddox'],['Cover test','po-cover']].map(([label,name]) => `
      <div style="background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span style="font-size:11px;font-weight:600;color:#2a7a4e;">- ${label}</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #2a7a4e;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="${name}" value="orthophorie"/> Orthophorie</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #e74c3c;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="${name}" value="heterophorie"/> Hétérophorie</label>
          </div>
        </div>
      </div>`).join('')}

      <!-- Hétérophorie horizontale -->
      <div style="background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:10px;margin-bottom:8px;">
        <div style="font-size:11px;font-weight:600;color:#2a7a4e;margin-bottom:8px;">• Hétérophorie horizontale</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:11px;color:#222;min-width:80px;">Unilatéral →</span>
            <span style="font-size:11px;color:#555;">Conséquence posturale :</span>
            <input class="inp" id="po-hetero-h-uni" placeholder="..." style="flex:1;background:#f9f9f9;color:#222;font-size:11px;"/>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-size:11px;color:#222;min-width:80px;">Bilatéral →</span>
            <span style="font-size:11px;color:#555;">Conséquence posturale :</span>
            <input class="inp" id="po-hetero-h-bi" placeholder="..." style="flex:1;background:#f9f9f9;color:#222;font-size:11px;"/>
          </div>
        </div>
      </div>

      <!-- Hétérophorie verticale -->
      <div style="background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:10px;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:600;color:#2a7a4e;">• Hétérophorie verticale → Conséquence posturale :</span>
          <input class="inp" id="po-hetero-v" placeholder="..." style="flex:1;background:#f9f9f9;color:#222;font-size:11px;"/>
        </div>
      </div>
    </div>

    <!-- Traitement orthopédique -->
    <div style="background:linear-gradient(135deg,#fff0f0,#ffe8e8);border-left:4px solid #e74c3c;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#c0392b;font-size:13px;margin-bottom:8px;">🏥 Traitement</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 12px;">
          <span style="font-weight:500;color:#222;font-size:12px;">Mise en place traitement orthopédique</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #e74c3c;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-trait-ortho" value="oui"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-trait-ortho" value="non"/> Non</label>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #f5b7b1;border-radius:8px;padding:8px 12px;">
          <span style="font-weight:500;color:#222;font-size:12px;">Fiche exercice</span>
          <div style="display:flex;gap:8px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #e74c3c;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-fiche-ex" value="oui"/> Oui</label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;border:2px solid #ccc;border-radius:20px;padding:3px 12px;color:#222;font-size:12px;"><input type="radio" name="po-fiche-ex" value="non"/> Non</label>
          </div>
        </div>
      </div>
    </div>

    <!-- Réorientation visuelle -->
    <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;">
      <div style="font-weight:700;color:#2471a3;font-size:13px;margin-bottom:8px;">🏥 Réorientation</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;">
          <input type="checkbox" id="po-reor-vis-orthoptiste"/> 👁️ Orthoptiste
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;">
          <input type="checkbox" id="po-reor-vis-ophtalmo"/> 🔭 Ophtalmologiste
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;">
          <input type="checkbox" id="po-reor-vis-optom"/> 👓 Optométriste
        </label>
      </div>
    </div>
  </div>
</div>
  <div class="posturo-section" id="psec-7" style="padding:0 20px;display:none;">
  <div class="card" style="margin-bottom:16px;">
    <div class="stitle" style="color:#2a7a4e;margin-bottom:16px;">🌿 Terrain du patient</div>

    <!-- 1. Postural -->
    <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:#222;">1 – <span style="color:#3498db;">P</span>ostural</div>

      <div style="font-weight:600;color:#222;margin-bottom:8px;font-size:12px;">Posture :</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;">
          <input type="checkbox" id="po-posture-ant"/> Antériorisation globale
        </label>
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;">
          <input type="checkbox" id="po-posture-post"/> Postériorisation globale
        </label>
        <div>
          <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;margin-bottom:6px;">
            <input type="checkbox" id="po-posture-later" onchange="togglePostureLater(this.checked)"/> Latéralisation globale
          </label>
          <div id="po-posture-later-opts" style="display:none;flex-wrap:wrap;gap:8px;margin-left:16px;">
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 14px;color:#222;">
              <input type="radio" name="po-posture-later-dir" value="gauche"/> 👈 Gauche
            </label>
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #3498db;border-radius:20px;padding:4px 14px;color:#222;">
              <input type="radio" name="po-posture-later-dir" value="droite"/> 👉 Droite
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Neuro-musculaire -->
    <div style="background:linear-gradient(135deg,#fff9f0,#fff3e0);border-left:4px solid #f0a500;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:#222;">2 – <span style="color:#f0a500;">N</span>euro-musculaire / <span style="color:#f0a500;">P</span>ropioceptif / <span style="color:#f0a500;">C</span>hainiste</div>

      <div style="font-weight:600;color:#222;margin-bottom:8px;font-size:12px;">Posture en excès :</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${[
          ['Chaine extension (PM)','po-chaine-ext'],
          ['Chaine de flexion (AM)','po-chaine-flex'],
          ['Chaine de fermeture (PL)','po-chaine-ferm'],
          ["Chaine d'ouverture (AL)",'po-chaine-ouv'],
          ['Chaine statique optimisée (PA)','po-chaine-stat-opt'],
          ['Chaine statique dégradée (AP)','po-chaine-stat-deg']
        ].map(([label,id]) => `
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;background:#fff;border:2px solid #f0a500;border-radius:20px;padding:5px 14px;color:#222;width:fit-content;">
          <input type="checkbox" id="${id}"/> ${label}
        </label>`).join('')}
      </div>
    </div>

    <!-- 3. Biomécanique -->
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:#222;">3 – <span style="color:#2a7a4e;">B</span>iomécanique / <span style="color:#f0a500;">A</span>rticulaire</div>
      <textarea class="inp" id="po-biomec-articulaire" rows="4" placeholder="Observations biomécanique et articulaire..." style="background:#fff;color:#222;"></textarea>
    </div>

  </div>

  <!-- Bilan synthèse -->
  <div class="card" style="margin-bottom:16px;">
    <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;color:#2a7a4e;font-size:14px;margin-bottom:4px;">📋 Bilan synthèse</div>
      <div style="font-size:11px;color:#555;margin-bottom:10px;">Compilation automatique des éléments positifs du bilan</div>
      <button onclick="genererSynthese()" style="background:linear-gradient(135deg,#2a7a4e,#27ae60);color:#fff;border:none;border-radius:8px;padding:10px 20px;font-weight:700;cursor:pointer;font-size:13px;">
        ✨ Générer la synthèse
      </button>
    </div>
    <div id="po-synthese-result" style="display:none;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:16px;">
      <div id="po-synthese-content" style="font-size:12px;color:#222;line-height:1.8;"></div>
    </div>
  </div>

</div>
  <div class="posturo-section" id="psec-8" style="padding:0 20px;display:none;">
    <div class="card" style="margin-bottom:16px;">
      <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:12px;margin-bottom:12px;">
        <div style="font-weight:700;color:#2a7a4e;font-size:14px;">🦶 Plan de semelles</div>
      </div>
      <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin:8px 0 4px;">📝 Description</div>
      <textarea class="inp" id="po-semelles-desc" rows="3" placeholder="Description du plan de semelles..." style="background:#fff;color:#222;"></textarea>
      <div style="font-size:10px;color:#2a7a4e;font-weight:600;margin:10px 0 4px;">✏️ Dessin sur les pieds</div>
      <div style="position:relative;margin:8px 0;background:#fff;border-radius:8px;border:1px solid var(--bord);padding:8px;text-align:center;">
        <img id="posturo-feet-img" src="assets/plan-semelles-schema-plantaire.png" style="width:80%;max-width:400px;display:block;margin:0 auto;"/>
        <canvas id="posturo-feet-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair;border-radius:8px;"/>
      </div>
      <div style="background:linear-gradient(135deg,#f8f9fa,#eee);border-radius:10px;padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <button class="btn" id="ptool-pen-feet" onclick="setDrawTool('line')">╱ Trait</button>
        <button class="btn" id="ptool-arrow-feet" onclick="setDrawTool('arrow')">→ Flèche</button>
        <button class="btn" id="ptool-arrow-curve-feet" onclick="setDrawTool('arrow-curve')">↪ Courbée</button>
        <button class="btn" id="btn-curve-inv-posturo-feet" onclick="setDrawToolCurveInv()">↩ Courbée</button>
        <button class="btn" id="ptool-circle-feet" onclick="setDrawTool('circle')">○ Cercle</button>
        <button class="btn" id="ptool-erase-feet" onclick="setDrawTool('erase')">🧹 Gomme</button>
        <select id="pdraw-color-sel-feet" class="inp" style="width:85px;background:#fff;color:#222;" onchange="drawColor=this.value;">
          <option value="#e74c3c">🔴 Rouge</option>
          <option value="#2980b9">🔵 Bleu</option>
          <option value="#27ae60">🟢 Vert</option>
          <option value="#f39c12">🟠 Orange</option>
          <option value="#111111">⚫ Noir</option>
        </select>
        <select id="pdraw-size-sel-feet" class="inp" style="width:100px;background:#fff;color:#222;" onchange="drawSize=+this.value;">
          <option value="2">✏️ Fin</option>
          <option value="4" selected>🖊️ Normal</option>
          <option value="8">🖌️ Épais</option>
        </select>
        <button class="btn btn-red" onclick="undoPosturoFeet()">↩ Annuler</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
        <div style="background:linear-gradient(135deg,#fff9f0,#fff3e0);border-left:4px solid #f0a500;border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:#b7740a;font-weight:600;margin-bottom:6px;">🧱 Matériaux</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${['EVA','PE','Résine','Mouse','Autre'].map(v => `
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #f0a500;border-radius:20px;padding:3px 12px;color:#222;font-size:11px;">
              <input type="checkbox" name="po-materiaux" value="${v}"/> ${v}
            </label>`).join('')}
          </div>
        </div>
        <div style="background:linear-gradient(135deg,#f5eeff,#ede0ff);border-left:4px solid #8e44ad;border-radius:8px;padding:10px;">
          <div style="font-size:11px;color:#6c3483;font-weight:600;margin-bottom:6px;">🎨 Recouvrement</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${['EVA','Microfibre','Peaucerie naturelle'].map(v => `
            <label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff;border:2px solid #8e44ad;border-radius:20px;padding:3px 12px;color:#222;font-size:11px;">
              <input type="checkbox" name="po-recouvrement" value="${v}"/> ${v}
            </label>`).join('')}
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border-left:4px solid #3498db;border-radius:8px;padding:12px;margin-bottom:12px;">
        <div style="font-weight:700;color:#2471a3;font-size:14px;">🏋️ Circuits d'exercices</div>
      </div>
      <div style="margin-top:10px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <!-- Circuit 1 -->
          <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border:2px solid #2a7a4e;border-radius:10px;overflow:hidden;">
            <div style="background:#2a7a4e;color:#fff;text-align:center;padding:8px;font-size:12px;font-weight:700;">⚡ CIRCUIT EXPRESS 1 — 2 min</div>
            <div style="padding:10px;display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:6px 8px;">
                  <span style="font-size:10px;color:#2a7a4e;font-weight:700;">30s (20/10) — Exercice 1</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <input class="inp" id="po-c1-ex1-libre" placeholder="✏️ Libre..." style="font-size:11px;background:#fff;color:#222;flex:1;min-width:80px;"/>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:6px 8px;">
                  <span style="font-size:10px;color:#2a7a4e;font-weight:700;">30s (20/10) — Exercice 2</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <input class="inp" id="po-c1-ex2-libre" placeholder="✏️ Libre..." style="font-size:11px;background:#fff;color:#222;flex:1;min-width:80px;"/>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:6px 8px;">
                  <span style="font-size:10px;color:#2a7a4e;font-weight:700;">30s (20/10) — Exercice 3</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <input class="inp" id="po-c1-ex3-libre" placeholder="✏️ Libre..." style="font-size:11px;background:#fff;color:#222;flex:1;min-width:80px;"/>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:6px 8px;">
                  <span style="font-size:10px;color:#2a7a4e;font-weight:700;">30s (20/10) — Exercice 4</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <input class="inp" id="po-c1-ex4-libre" placeholder="✏️ Libre..." style="font-size:11px;background:#fff;color:#222;flex:1;min-width:80px;"/>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- Circuit 2 -->
          <div style="background:linear-gradient(135deg,#eaf4ff,#dceeff);border:2px solid #3498db;border-radius:10px;overflow:hidden;">
            <div style="background:#3498db;color:#fff;text-align:center;padding:8px;font-size:12px;font-weight:700;">⚡ CIRCUIT EXPRESS 2 (demi Tabata) — 2 min</div>
            <div style="padding:10px;display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:6px 8px;">
                  <span style="font-size:10px;color:#3498db;font-weight:700;">30s (20/10) — Exercice 1</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <input class="inp" id="po-c2-ex1-libre" placeholder="✏️ Libre..." style="font-size:11px;background:#fff;color:#222;flex:1;min-width:80px;"/>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:6px 8px;">
                  <span style="font-size:10px;color:#3498db;font-weight:700;">30s (20/10) — Exercice 2</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <input class="inp" id="po-c2-ex2-libre" placeholder="✏️ Libre..." style="font-size:11px;background:#fff;color:#222;flex:1;min-width:80px;"/>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:6px 8px;">
                  <span style="font-size:10px;color:#3498db;font-weight:700;">30s (20/10) — Exercice 3</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <input class="inp" id="po-c2-ex3-libre" placeholder="✏️ Libre..." style="font-size:11px;background:#fff;color:#222;flex:1;min-width:80px;"/>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #aed6f1;border-radius:8px;padding:6px 8px;">
                  <span style="font-size:10px;color:#3498db;font-weight:700;">30s (20/10) — Exercice 4</span>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <select class="inp exo-sys" style="font-size:10px;background:#fff;color:#222;" onchange="updateExerciceSubMenu(this)">                      <option value="">-- Système --</option>
                      <option value="systeme-visuel">👁️ Système visuel</option>
                      <option value="systeme-vestibulaire">👂 Système vestibulaire</option>
                      <option value="systeme-somesthesique">🤸 Système somesthésique</option>
                      <option value="reeduc-pied">🦶 Rééducation du pied</option>
                      <option value="systeme-mandibulaire">🦷 Système mandibulaire</option>
                      <option value="reeduc-terrain">🏃 Rééducation terrain moteur</option>
                      <option value="reeduc-chaines">⛓️ Rééducation chaînes musculaires</option>
                      <option value="reflexes-archaiques">🧠 Réflexes archaïques</option>
                      <option value="exercices-respi">🌬️ Exercices respiratoires</option>
                      <option value="reeduc-posturale">🧍 Rééducation posturale</option>
                      <option value="reeduc-articulaire">🦴 Rééducation articulaire</option>
                    </select>
                    <input class="inp" id="po-c2-ex4-libre" placeholder="✏️ Libre..." style="font-size:11px;background:#fff;color:#222;flex:1;min-width:80px;"/>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div style="background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #27ae60;border-radius:8px;padding:12px;margin-bottom:12px;">
        <div style="font-weight:700;color:#1e8449;font-size:14px;">✅ Tests avant/après</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;"><span style="font-size:12px;color:#222;font-weight:500;">Test de Rotation nucale amélioré</span><div style="display:flex;gap:8px;"><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t1" value="oui"/> ✅ Oui</label><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t1" value="non"/> ❌ Non</label></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;"><span style="font-size:12px;color:#222;font-weight:500;">Test de Flexion antérieur amélioré</span><div style="display:flex;gap:8px;"><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t2" value="oui"/> ✅ Oui</label><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t2" value="non"/> ❌ Non</label></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;"><span style="font-size:12px;color:#222;font-weight:500;">Test extenseurs du poignet amélioré</span><div style="display:flex;gap:8px;"><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t3" value="oui"/> ✅ Oui</label><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t3" value="non"/> ❌ Non</label></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;"><span style="font-size:12px;color:#222;font-weight:500;">Test stabilité monopodale amélioré</span><div style="display:flex;gap:8px;"><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t4" value="oui"/> ✅ Oui</label><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t4" value="non"/> ❌ Non</label></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;"><span style="font-size:12px;color:#222;font-weight:500;">Test Force/stabilité arrière amélioré</span><div style="display:flex;gap:8px;"><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t5" value="oui"/> ✅ Oui</label><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t5" value="non"/> ❌ Non</label></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;"><span style="font-size:12px;color:#222;font-weight:500;">Test mobilité axe corporel amélioré</span><div style="display:flex;gap:8px;"><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t6" value="oui"/> ✅ Oui</label><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t6" value="non"/> ❌ Non</label></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;"><span style="font-size:12px;color:#222;font-weight:500;">Test de Romberg amélioré</span><div style="display:flex;gap:8px;"><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t7" value="oui"/> ✅ Oui</label><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t7" value="non"/> ❌ Non</label></div></div>
        <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid #a9dfbf;border-radius:8px;padding:8px 12px;"><span style="font-size:12px;color:#222;font-weight:500;">Amélioration morphostatique améliorée</span><div style="display:flex;gap:8px;"><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#f0faf4;border:2px solid #27ae60;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t8" value="oui"/> ✅ Oui</label><label style="cursor:pointer;display:flex;align-items:center;gap:5px;background:#fff5f5;border:2px solid #e74c3c;border-radius:20px;padding:4px 14px;color:#222;font-size:12px;font-weight:600;"><input type="radio" name="po-t8" value="non"/> ❌ Non</label></div></div>
      </div>
      <div style="margin-top:12px;background:linear-gradient(135deg,#f0faf4,#e8f8ee);border-left:4px solid #2a7a4e;border-radius:8px;padding:10px;">
        <div style="font-size:11px;color:#2a7a4e;font-weight:600;margin-bottom:6px;">📅 Prochain RDV</div>
        <input class="inp" id="po-prochain-rdv" type="date" style="background:#fff;color:#222;"/>
      </div>
    </div>
  </div>
</div>`;
}

function startEmpreinteCamera() {
  const wrap = document.getElementById('po-empreinte-video-wrap');
  const video = document.getElementById('po-empreinte-video');
  if(!wrap || !video) return;
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
    .then(stream => {
      video.srcObject = stream;
      wrap.style.display = 'block';
    })
    .catch(() => navigator.mediaDevices.getUserMedia({video:true})
      .then(stream => { video.srcObject = stream; wrap.style.display = 'block'; })
    );
}
function stopEmpreinteCamera() {
  const video = document.getElementById('po-empreinte-video');
  const wrap = document.getElementById('po-empreinte-video-wrap');
  if(video?.srcObject) { video.srcObject.getTracks().forEach(t=>t.stop()); video.srcObject=null; }
  if(wrap) wrap.style.display = 'none';
}
function captureEmpreinte() {
  const video = document.getElementById('po-empreinte-video');
  if(!video) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const img = document.getElementById('po-empreinte-img');
  if(img) { img.src = dataUrl; img.style.display = 'block'; }
  const del = document.getElementById('po-empreinte-del');
  if(del) del.style.display = 'inline-block';
  if(currentPatient?.bilanDataPosturo) currentPatient.bilanDataPosturo._empreinte = dataUrl;
  stopEmpreinteCamera();
}
function deleteEmpreinte() {
  const img = document.getElementById('po-empreinte-img');
  if(img) { img.src=''; img.style.display='none'; }
  const del = document.getElementById('po-empreinte-del');
  if(del) del.style.display='none';
  if(currentPatient?.bilanDataPosturo) delete currentPatient.bilanDataPosturo._empreinte;
}
function previewEmpreinte(input) {
  if(!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('po-empreinte-img');
    if(img) { img.src = e.target.result; img.style.display = 'block'; }
    if(currentPatient?.bilanDataPosturo) currentPatient.bilanDataPosturo._empreinte = e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}
function toggleRomberg(type, checked) {
  const opts = document.getElementById('po-romberg-'+type+'-opts');
  if(!opts) return;
  opts.style.display = checked ? 'flex' : 'none';
  if(!checked) document.querySelectorAll('input[name="po-romberg-'+type+'-dir"]').forEach(function(r){ r.checked=false; });
}
function togglePostureLater(checked) {
  const opts = document.getElementById('po-posture-later-opts');
  if(!opts) return;
  opts.style.display = checked ? 'flex' : 'none';
  if(!checked) document.querySelectorAll('input[name="po-posture-later-dir"]').forEach(r => r.checked = false);
}

function genererSynthese() {
  savePosturoBilan();
  const d = currentPatient?.bilanDataPosturo || {};
  // DEBUG: afficher neuro4
  console.log('neuro4:', JSON.stringify(d.neuro4));
  const sections = [];

  // Anamnèse
  const motif = document.getElementById('po-motif')?.value;
  const eva = document.getElementById('po-eva-val')?.textContent;
  if(motif) sections.push({titre:'🩺 Anamnèse', items:['Motif: '+motif, 'EVA: '+eva+'/10']});

  // Morphostatique
  const morphoItems = [];
  const comp1 = document.getElementById('po-comp1')?.value;
  const comp2 = document.getElementById('po-comp2')?.value;
  const comp3 = document.getElementById('po-comp3')?.value;
  const compCrit = document.getElementById('po-comp-critique')?.value;
  if(comp1) morphoItems.push('Compensation 1: '+comp1);
  if(comp2) morphoItems.push('Compensation 2: '+comp2);
  if(comp3) morphoItems.push('Compensation 3: '+comp3);
  if(compCrit) morphoItems.push('Point critique: '+compCrit);
  const prefMot = document.querySelector('input[name="po-pref-mot"]:checked')?.value;
  if(prefMot) morphoItems.push('Préférences motrices: '+prefMot);
  const rombergAnt = document.getElementById('po-romberg-ant')?.checked;
  const rombergLat = document.getElementById('po-romberg-lat')?.checked;
  const rombergLatDir = document.querySelector('input[name="po-romberg-lat-dir"]:checked')?.value;
  const rombergPost = document.getElementById('po-romberg-post')?.checked;
  const rombergOcul = document.getElementById('po-romberg-oculaire')?.checked;
  const rombergRot = document.getElementById('po-romberg-rot')?.checked;
  const rombergRotDir = document.querySelector('input[name="po-romberg-rot-dir"]:checked')?.value;
  const romParts = [];
  if(rombergAnt) romParts.push('Antérieur');
  if(rombergLat) romParts.push('Latéral'+(rombergLatDir?' '+rombergLatDir:''));
  if(rombergPost) romParts.push('Postérieur');
  if(rombergOcul) romParts.push('Oculaire');
  if(rombergRot) romParts.push('Rotation'+(rombergRotDir?' '+rombergRotDir:''));
  if(romParts.length) morphoItems.push('Romberg: '+romParts.join(', '));
  if(morphoItems.length) sections.push({titre:'🧍 Morphostatique', items:morphoItems});

  // Bilan dynamique
  const dynItems = [];
  const flexDebout = document.querySelector('input[name="po-flex-debout"]:checked')?.value;
  if(flexDebout) dynItems.push('Flexion debout: '+flexDebout);
  const flexAssis = document.querySelector('input[name="po-flex-assis"]:checked')?.value;
  if(flexAssis) dynItems.push('Flexion assis: '+flexAssis);
  const stab = document.querySelector('input[name="po-test-stab"]:checked')?.value;
  if(stab) dynItems.push('Stabilité arrière: '+stab);
  ['hanche','genou','pied','bassin'].forEach(function(art) {
    const v = document.querySelector('input[name="po-mob-'+art+'"]:checked')?.value;
    if(v === 'oui') dynItems.push('Dysfonction '+art);
  });
  if(dynItems.length) sections.push({titre:'🏃 Bilan dynamique', items:dynItems});

  // Neuro-fonctionnel (depuis d.neuro4 sauvegardé)
  const neuroItems = [];
  if(currentPatient?.bilanDataPosturo?.neuro4) {
    const n = currentPatient.bilanDataPosturo.neuro4;
    // Posture statique (anciennes clés)
    const aps = [];
    if(n['aps-epaule-g']) aps.push('Épaule G'); if(n['aps-epaule-d']) aps.push('Épaule D');
    if(n['aps-rot-g']) aps.push('Rot.épaule G'); if(n['aps-rot-d']) aps.push('Rot.épaule D');
    if(n['aps-coude-g']) aps.push('Flex.coude G'); if(n['aps-coude-d']) aps.push('Flex.coude D');
    if(n['aps-pron-g']) aps.push('Pron.poignet G'); if(n['aps-pron-d']) aps.push('Pron.poignet D');
    if(aps.length) neuroItems.push('Posture statique: '+aps.join(', '));
    // Critères de force
    const force = [];
    if(n['cf-ext-g']) force.push('Ext.poignet G'); if(n['cf-ext-d']) force.push('Ext.poignet D');
    if(n['cf-flex-g']) force.push('Flex.hanche G'); if(n['cf-flex-d']) force.push('Flex.hanche D');
    if(force.length) neuroItems.push('Critères force: '+force.join(', '));
    // Posture dynamique
    const apd = [];
    if(n['apd-tronc-g']) apd.push('Tronc cérébral G'); if(n['apd-tronc-d']) apd.push('Tronc cérébral D');
    if(n['apd-cervelet-g']) apd.push('Cervelet G'); if(n['apd-cervelet-d']) apd.push('Cervelet D');
    if(n['apd-tete-g']) apd.push('Stab.tête G'); if(n['apd-tete-d']) apd.push('Stab.tête D');
    if(n['apd-membre-g']) apd.push('Membre sup G'); if(n['apd-membre-d']) apd.push('Membre sup D');
    if(n['acd-flex-g']) apd.push('Flex.poignet G'); if(n['acd-flex-d']) apd.push('Flex.poignet D');
    if(n['acd-hyper-g']) apd.push('Hyperext.genou G'); if(n['acd-hyper-d']) apd.push('Hyperext.genou D');
    if(apd.length) neuroItems.push('Posture dynamique: '+apd.join(', '));
    // Hypothèses
    const hypo = [];
    if(n['po-hypo-tronc']) hypo.push('Tronc cérébral');
    if(n['po-hypo-cervelet']) hypo.push('Cervelet');
    if(hypo.length) neuroItems.push('Hypothèse: '+hypo.join(', '));
    // Vestibulaire
    const vest = [];
    if(n['vest-ant-g']) vest.push('CSC ant G'); if(n['vest-ant-d']) vest.push('CSC ant D');
    if(n['vest-lat-g']) vest.push('CSC lat G'); if(n['vest-lat-d']) vest.push('CSC lat D');
    if(n['vest-post-g']) vest.push('CSC post G'); if(n['vest-post-d']) vest.push('CSC post D');
    if(vest.length) neuroItems.push('Vestibulaire: '+vest.join(', '));
    // Proprioception
    const prop = [];
    if(n['prop-lent-g']) prop.push('FN lent G'); if(n['prop-lent-d']) prop.push('FN lent D');
    if(n['prop-rapide-g']) prop.push('FN rapide G'); if(n['prop-rapide-d']) prop.push('FN rapide D');
    if(n['prop-golgi-g']) prop.push('Golgi G'); if(n['prop-golgi-d']) prop.push('Golgi D');
    if(n['prop-golgi-a-g']) prop.push('Golgi A G'); if(n['prop-golgi-a-d']) prop.push('Golgi A D');
    if(n['prop-paccini-g']) prop.push('Paccini G'); if(n['prop-paccini-d']) prop.push('Paccini D');
    if(n['prop-ruffini-d-g']) prop.push('Ruffini déc G'); if(n['prop-ruffini-d-d']) prop.push('Ruffini déc D');
    if(n['prop-ruffini-c-g']) prop.push('Ruffini com G'); if(n['prop-ruffini-c-d']) prop.push('Ruffini com D');
    if(prop.length) neuroItems.push('Proprioception: '+prop.join(', '));
    // Cervelet
    const cerv = [];
    if(n['vermis-sharp-d']||n['vermis-sharp-g']) cerv.push('Sharp Romberg');
    if(n['vermis-romberg-d']||n['vermis-romberg-g']) cerv.push('Romberg 1 pied');
    const axe = [];
    if(n['proprio-axe-tete']) axe.push('Tête');
    if(n['proprio-axe-corps']) axe.push('Corps');
    if(n['proprio-axe-bassin']) axe.push('Bassin');
    if(axe.length) cerv.push('Proprio axe: '+axe.join('+'));
    if(n['inter-prec-g']) cerv.push('Préc.doigt G'); if(n['inter-prec-d']) cerv.push('Préc.doigt D');
    if(n['inter-coord-g']) cerv.push('Coordination G'); if(n['inter-coord-d']) cerv.push('Coordination D');
    if(n['lat-prec-g']) cerv.push('Piano G'); if(n['lat-prec-d']) cerv.push('Piano D');
    if(n['lat-coord-g']) cerv.push('Go-No Go G'); if(n['lat-coord-d']) cerv.push('Go-No Go D');
    if(cerv.length) neuroItems.push('Cervelet: '+cerv.join(', '));
    // Réflexes archaïques
    const refl = [];
    if(n['ref-rpp-o']) refl.push('RPP +'); if(n['ref-rtp-o']) refl.push('RTP +');
    if(n['ref-moro-o']) refl.push('Moro +');
    if(n['ref-perez-o']) refl.push('Pérez +');
    if(n['ref-landau-o']) refl.push('Landau +');
    if(n['ref-reptation-o']) refl.push('Reptation +');
    if(n['ref-rtac-g']) refl.push('RTac G'); if(n['ref-rtac-d']) refl.push('RTac D');
    if(n['ref-galant-g']) refl.push('Galant G'); if(n['ref-galant-d']) refl.push('Galant D');
    if(n['ref-babinski-g']) refl.push('Babinski G'); if(n['ref-babinski-d']) refl.push('Babinski D');
    if(n['ref-plantaire-g']) refl.push('Plantaire G'); if(n['ref-plantaire-d']) refl.push('Plantaire D');
    if(n['ref-palmaire-g']) refl.push('Palmaire G'); if(n['ref-palmaire-d']) refl.push('Palmaire D');
    if(n['ref-babkin-g']) refl.push('Babkin G'); if(n['ref-babkin-d']) refl.push('Babkin D');
    if(refl.length) neuroItems.push('Réflexes archaïques: '+refl.join(', '));
    // Récepteurs tactiles
    const rect = [];
    if(n['tact-merkel-g']) rect.push('Merkel G'); if(n['tact-merkel-d']) rect.push('Merkel D');
    if(n['tact-ruffini-g']) rect.push('Ruffini G'); if(n['tact-ruffini-d']) rect.push('Ruffini D');
    if(n['tact-pacini-g']) rect.push('Pacini G'); if(n['tact-pacini-d']) rect.push('Pacini D');
    if(n['tact-tnl-g']) rect.push('TNL G'); if(n['tact-tnl-d']) rect.push('TNL D');
    if(n['tact-meissner-g']) rect.push('Meissner G'); if(n['tact-meissner-d']) rect.push('Meissner D');
    if(n['tact-poils-g']) rect.push('Poils G'); if(n['tact-poils-d']) rect.push('Poils D');
    if(rect.length) neuroItems.push('Récepteurs tactiles: '+rect.join(', '));
  }
  if(neuroItems.length) sections.push({titre:'🧠 Neuro-fonctionnel', items:neuroItems});

  // Système plantaire
  const plantItems = [];
  if(document.querySelector('input[name="po-epines"]:checked')?.value === 'oui') plantItems.push('Épines irritatives présentes');
  const loc = document.getElementById('po-epines-loc')?.value;
  if(loc) plantItems.push('Localisation: '+loc);
  const tact = document.querySelector('input[name="po-tactique"]:checked')?.value;
  if(tact) plantItems.push('Tactique équilibration: '+tact);
  ['plantaire','yeux','buccale','cicatrice','vestibulaire','viscerale'].forEach(function(p) {
    if(document.getElementById('po-para-'+p)?.checked) plantItems.push('Parasite: '+p);
  });
  if(plantItems.length) sections.push({titre:'🦶 Système plantaire', items:plantItems});

  // Vestibulaire
  const vestItems = [];
  if(document.querySelector('input[name="po-vertiges"]:checked')?.value === 'oui') vestItems.push('Présence de vertiges/nystagmus');
  if(document.querySelector('input[name="po-vppb"]:checked')?.value === 'oui') vestItems.push('VPPB positif');
  if(vestItems.length) sections.push({titre:'👂 Vestibulaire', items:vestItems});

  // Entrée buccale
  const buccalItems = [];
  if(document.querySelector('input[name="po-mcp-ouv"]:checked')?.value === 'oui') buccalItems.push('Amélioration ouverture bouche (ATM secondaire)');
  const atm = document.querySelector('input[name="po-atm-origine"]:checked')?.value;
  if(atm) buccalItems.push('ATM origine: '+atm);
  if(buccalItems.length) sections.push({titre:'🦷 Entrée buccale', items:buccalItems});

  // Terrain
  const terrainItems = [];
  if(document.getElementById('po-posture-ant')?.checked) terrainItems.push('Antériorisation globale');
  if(document.getElementById('po-posture-post')?.checked) terrainItems.push('Postériorisation globale');
  if(document.getElementById('po-posture-later')?.checked) {
    const dir = document.querySelector('input[name="po-posture-later-dir"]:checked')?.value;
    terrainItems.push('Latéralisation globale' + (dir ? ': '+dir : ''));
  }
  ['po-chaine-ext','po-chaine-ferm','po-chaine-ouv','po-chaine-stat-opt','po-chaine-stat-deg'].forEach(function(id) {
    const el = document.getElementById(id);
    if(el?.checked) terrainItems.push(el.parentElement.textContent.trim());
  });
  const biomec = document.getElementById('po-biomec-articulaire')?.value;
  if(biomec) terrainItems.push('Biomécanique: '+biomec);
  if(terrainItems.length) sections.push({titre:'🌿 Terrain', items:terrainItems});

  // Afficher résultat
  const result = document.getElementById('po-synthese-result');
  const content = document.getElementById('po-synthese-content');
  if(!sections.length) {
    content.innerHTML = '<em style="color:#888;">Aucun élément positif trouvé dans le bilan.</em>';
  } else {
    let html = '';
    sections.forEach(function(s) {
      html += '<div style="margin-bottom:10px;">';
      html += '<div style="font-weight:700;color:#2a7a4e;margin-bottom:4px;">'+s.titre+'</div>';
      html += '<ul style="margin:0;padding-left:20px;">';
      s.items.forEach(function(i) { html += '<li>'+i+'</li>'; });
      html += '</ul></div>';
    });
    content.innerHTML = html;
  }
  result.style.display = 'block';
  // Sauvegarder la synthèse dans bilanDataPosturo
  if(currentPatient) {
    if(!currentPatient.bilanDataPosturo) currentPatient.bilanDataPosturo = {};
    currentPatient.bilanDataPosturo._synthese = sections;
  }
}

function toggleVisLater(enabled) {
  const opts = document.getElementById('po-vis-later-opts');
  if(!opts) return;
  opts.style.opacity = enabled ? '1' : '0.35';
  opts.style.pointerEvents = enabled ? 'auto' : 'none';
  if(!enabled) {
    document.querySelectorAll('input[name="po-vis-later-type"]').forEach(r => r.checked = false);
  }
}
function toggleLongMI(zone, val) {
  const opts = document.getElementById('po-long-mi-'+zone+'-opts');
  if(!opts) return;
  opts.style.display = (val === 'court' || val === 'long') ? 'flex' : 'none';
  if(val === 'egal') {
    const name = zone === 'dors' ? 'po-long-mi-dors-side' : 'po-long-mi-proc-side';
    document.querySelectorAll('input[name="'+name+'"]').forEach(function(r){ r.checked=false; });
  }
}
function toggleTF(side, checked) {
  const opts = document.getElementById('po-tf-'+side+'-opts');
  if(!opts) return;
  opts.style.display = checked ? 'flex' : 'none';
  opts.style.flexDirection = 'column';
}
function toggleTFOs(side, os, checked) {
  const opts = document.getElementById('po-tf-'+side+'-'+os+'-opts');
  if(!opts) return;
  opts.style.display = checked ? 'flex' : 'none';
}
function togglePub(side) {
  ['d','g'].forEach(function(s) {
    const opts = document.getElementById('po-pub-'+s+'-opts');
    if(opts) opts.style.display = s === side ? 'flex' : 'none';
  });
}
function toggleDowning(side, checked) {
  const opts = document.getElementById('po-downing-'+side+'-opts');
  if(!opts) return;
  opts.style.display = checked ? 'flex' : 'none';
  opts.style.flexDirection = 'column';
}
function toggleIneg(show) {
  const opts = document.getElementById('po-ineg-opts');
  if(!opts) return;
  opts.style.display = show ? 'flex' : 'none';
  if(!show) document.querySelectorAll('input[name="po-ineg-dir"]').forEach(function(r){ r.checked=false; });
}
function updateExerciceSubMenu(selEl) {
  const data = {"systeme-visuel": ["1. Exercices avant et après la rééducation oculaire", "2. Rééducation pour un canal semi circulaire latéral", "3. Rééducation problème de fixation", "4. Rééducation problème de poursuite", "5. Rééducation oculaire de base"], "systeme-vestibulaire": ["1. Rééducation pour un canal semi circulaire latéral", "2. Rééducation pour un Moro ou un canal postérieur", "3. Rééducation pour un canal antérieur", "4. Rééducation pour les saccules", "5. Rééducation pour les utricules", "6. Rééducation du réflexe vestibulo oculaire"], "systeme-somesthesique": ["1. Stimulation du système proprioceptif"], "reeduc-pied": ["1. Rééducation du pied"], "systeme-mandibulaire": ["1. Rééducation de la mâchoire"], "reeduc-terrain": ["1. Rééducation d'un patient en excès de Schéma aérien", "2. Rééducation d'un patient en excès de Schéma terrien"], "reeduc-chaines": ["1. Rééduc d'un excès de chaîne de flexion", "2. Rééduc d'un excès de chaîne d'extension", "3. Rééduc d'un excès de chaîne de fermeture", "4. Rééduc d'un excès de chaîne d'ouverture", "5. Rééduc d'une chaîne statique en expi", "6. Rééduc d'une chaîne statique en inspi"], "reflexes-archaiques": ["1. Réflexe de peur paralysante", "2. Réflexe de MORO", "3. Réflexe tendineux de protection", "6. Réflexe Tonique Asymétrique du Cou RTAC", "8. Réflexe de Galant", "9. Réflexe de Perez", "10. Réflexe de Landau", "11. Réflexe de la reptation", "12. Réflexe de l'agrippement palmaire", "14. Réflexe de Babinski", "15. Réflexe d'Agrippement plantaire", "16. Réflexe de BABKIN"], "exercices-respi": ["1. Exercice autour du diaphragme", "2. Tempos respiratoire", "3. Respiration pour le stress"], "reeduc-posturale": ["10 Exercices chaîne posturale"], "reeduc-articulaire": ["11 Exercices chaîne articulaire"]};
  const system = selEl.value;
  // Trouver ou créer le wrapper pour ce select
  let wrapper = selEl.closest('.exo-pair');
  if(!wrapper) {
    wrapper = document.createElement('div');
    wrapper.className = 'exo-pair';
    wrapper.style.cssText = 'display:flex;flex-direction:column;gap:2px;background:#f8f9fa;border:1px solid #ddd;border-radius:6px;padding:4px 6px;flex:1;min-width:120px;';
    selEl.parentNode.insertBefore(wrapper, selEl);
    wrapper.appendChild(selEl);
  }
  // Supprimer l'ancien sous-menu
  const oldSub = wrapper.querySelector('.exo-sub');
  if(oldSub) oldSub.remove();
  const opts = data[system] || [];
  if(!opts.length) return;
  const sub = document.createElement('select');
  sub.className = 'inp exo-sub';
  sub.style.cssText = 'font-size:10px;background:#fff;color:#222;';
  sub.innerHTML = '<option value="">-- Exercice --</option>' + opts.map(o => '<option value="'+o+'">'+o+'</option>').join('');
  wrapper.appendChild(sub);
}

function toggleRessaut(enabled) {
  const opts = document.getElementById('po-ressaut-opts');
  if(!opts) return;
  opts.style.opacity = enabled ? '1' : '0.35';
  opts.style.pointerEvents = enabled ? 'auto' : 'none';
  if(!enabled) {
    document.getElementById('po-ressaut-dte').checked = false;
    document.getElementById('po-ressaut-gauche').checked = false;
  }
}
function toggleSerrage(type) {
  const aggOpts = document.getElementById('po-serrage-aggrav-opts');
  const amelOpts = document.getElementById('po-serrage-amelio-opts');
  if(!aggOpts || !amelOpts) return;
  if(type === 'aggravation') {
    aggOpts.style.display = 'flex';
    amelOpts.style.display = 'none';
    document.getElementById('po-amelio-contact').checked = false;
    document.getElementById('po-amelio-tension').checked = false;
  } else {
    amelOpts.style.display = 'flex';
    aggOpts.style.display = 'none';
    document.getElementById('po-aggr-dents').checked = false;
    document.getElementById('po-aggr-atm').checked = false;
  }
}
function toggleCLVF(enabled) {
  const el = document.getElementById('po-clvf-detail');
  if(!el) return;
  el.style.opacity = enabled ? '1' : '0.35';
  el.style.pointerEvents = enabled ? 'auto' : 'none';
  if(!enabled) {
    ['po-canal-ant','po-canal-post','po-canal-lat'].forEach(id => {
      const e = document.getElementById(id);
      if(e) e.checked = false;
    });
    document.querySelectorAll('input[name="po-pevs"]').forEach(r => r.checked = false);
  }
}
function toggleLateralisation(enabled) {
  const opts = document.getElementById('po-later-options');
  if(!opts) return;
  opts.style.opacity = enabled ? '1' : '0.35';
  opts.style.pointerEvents = enabled ? 'auto' : 'none';
  if(!enabled) {
    // Décocher tout
    ['po-later-local','po-later-regional','po-later-global'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.checked = false;
    });
    ['po-later-d','po-later-g'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.checked = false;
    });
  }
}
function updateNeuroTotals() {
  // Total nerfs crâniens (IDs réels: nc-nc1-g, nc-recap-g)
  const ncIds = ['nc-recap','nc-nc1','nc-nc2','nc-nc3','nc-nc4','nc-nc5','nc-nc6','nc-nc7','nc-nc8','nc-nc9','nc-nc10','nc-nc11','nc-nc12'];
  let ncG=0, ncD=0;
  ncIds.forEach(id => {
    if(document.getElementById(id+'-g')?.checked) ncG++;
    if(document.getElementById(id+'-d')?.checked) ncD++;
  });
  const tg = document.getElementById('nc-total-g');
  const td = document.getElementById('nc-total-d');
  if(tg) tg.textContent = ncG;
  if(td) td.textContent = ncD;

  // Total vestibulaire
  // Total = uniquement proprioception (pas vestibulaire)
  const vestIds = ['prop-lent','prop-rapide','prop-golgi','prop-paccini','prop-ruffini-d','prop-ruffini-c','prop-golgi-a'];
  let vG=0, vD=0;
  vestIds.forEach(id => {
    if(document.getElementById(id+'-g')?.checked) vG++;
    if(document.getElementById(id+'-d')?.checked) vD++;
  });
  const vgt = document.getElementById('vest-total-g');
  const vdt = document.getElementById('vest-total-d');
  if(vgt) vgt.textContent = vG;
  if(vdt) vdt.textContent = vD;

  // Total cervelet
  const cervIds = ['vermis-sharp','vermis-romberg','inter-prec','inter-coord','lat-prec','lat-coord'];
  let cG=0, cD=0;
  cervIds.forEach(id => {
    if(document.getElementById(id+'-g')?.checked) cG++;
    if(document.getElementById(id+'-d')?.checked) cD++;
  });
  const cgt = document.getElementById('cerv-total-g');
  const cdt = document.getElementById('cerv-total-d');
  if(cgt) cgt.textContent = cG;
  if(cdt) cdt.textContent = cD;
}

function showPosturoSection(idx) {
  document.querySelectorAll('.posturo-section').forEach((s,i) => {
    s.style.display = i === idx ? 'block' : 'none';
  });
  document.querySelectorAll('.posturo-tab').forEach((t,i) => {
    t.classList.toggle('act', i === idx);
  });
  if(typeof _injectMicButtons==='function') setTimeout(_injectMicButtons, 200);
  if(idx === 1) {
    // Attendre que psec-1 soit visible avant d'initialiser le canvas
    const psec1 = document.getElementById('psec-1');
    if(psec1) psec1.style.display = '';
    setTimeout(initPosturoBodyCanvas, 150);
  }
  if(idx === 3) {
    setTimeout(updateNeuroTotals, 100);
    setTimeout(() => {
      document.querySelectorAll('#psec-3 input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', updateNeuroTotals);
      });
    }, 200);
    // Restaurer neuro4 maintenant que le DOM est visible
    setTimeout(() => {
      const dn = currentPatient?.bilanDataPosturo?.neuro4;
      if(!dn) return;
      Object.assign(bilanData, dn);
      // Restaurer par ID direct (aps-, apd-, cf-, acd-, nc-, prop-, cerv-, vermis-, inter-, lat-)
      Object.entries(dn).forEach(([key, val]) => {
        if(typeof val === 'boolean') {
          const el = document.getElementById(key);
          if(el) el.checked = val;
        }
      });
      updateNeuroTotals();
    }, 400);
  }
  if(idx === 8) setTimeout(initPosturoFeetCanvas, 100);
}

let posturoDrawColor = 'red';
let posturoIsDrawing = false;
let posturoLastX = 0, posturoLastY = 0;

function setPosturoDrawColor(col) { posturoDrawColor = col; }

function clearPosturoCanvas(id) {
  const c = document.getElementById(id);
  if(c) c.getContext('2d').clearRect(0,0,c.width,c.height);
}

// Historique undo pour bilan posturo
let _posturoBodyHistory = [];
let _posturoFeetHistory = [];

function undoPosturoBody() {
  const canvas = document.getElementById('posturo-body-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(canvas._history && canvas._history.length > 0) {
    canvas._history.pop();
    const prev = canvas._history.length > 0
      ? canvas._history[canvas._history.length-1]
      : canvas._baseSnapshot;
    if(prev) {
      ctx.setTransform(1,0,0,1,0,0);
      ctx.putImageData(prev, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
  } else if(canvas._baseSnapshot) {
    ctx.setTransform(1,0,0,1,0,0);
    ctx.putImageData(canvas._baseSnapshot, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
}

function undoPosturoFeet() {
  const canvas = document.getElementById('posturo-feet-canvas');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const prev = canvas._history && canvas._history.length > 0
    ? (canvas._history.pop(), canvas._history.length > 0 ? canvas._history[canvas._history.length-1] : canvas._baseSnapshot)
    : canvas._baseSnapshot;
  if(prev) ctx.putImageData(prev, 0, 0);
}

function initPosturoBodyCanvas() {
  const canvas = document.getElementById('posturo-body-canvas');
  if(!canvas) return;
  const parent = canvas.parentElement;
  if(!parent) return;
  const r = parent.getBoundingClientRect();
  if(r.width === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  canvas.style.width = r.width + 'px';
  canvas.style.height = r.height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  canvas._history = [];
  canvas._baseSnapshot = null;
  canvas._tempSnap = null;
  // Snapshot de base (fond transparent - les images sont dans les divs en dessous)
  setTimeout(() => {
    canvas._baseSnapshot = ctx.getImageData(0,0,canvas.width,canvas.height);
  }, 100);
  // Restaurer dessin sauvegardé si existant
  if(currentPatient?.bilanDataPosturo?._bodyCanvas) {
    const saved = new Image();
    saved.onload = () => ctx.drawImage(saved, 0, 0, r.width, r.height);
    saved.src = currentPatient.bilanDataPosturo._bodyCanvas;
  }
  setupDrawCanvas(canvas, 'posturo-body-canvas');
}

function initPosturoFeetCanvas() {
  const canvas = document.getElementById('posturo-feet-canvas');
  if(!canvas) return;
  const parent = canvas.parentElement;
  if(!parent) return;
  const r = parent.getBoundingClientRect();
  if(r.width === 0) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  canvas.style.width = r.width + 'px';
  canvas.style.height = r.height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  canvas._history = [];
  canvas._baseSnapshot = null;
  canvas._tempSnap = null;
  setupDrawCanvas(canvas, 'posturo-feet-canvas');
  // Restaurer le dessin PUIS prendre le baseSnapshot
  const savedData = currentPatient?.bilanDataPosturo?._feetCanvas;
  if(savedData) {
    const saved = new Image();
    saved.onload = () => {
      ctx.drawImage(saved, 0, 0, r.width, r.height);
      // BaseSnapshot = état avec dessin restauré (pour que undo ne supprime pas le dessin précédent)
      canvas._baseSnapshot = ctx.getImageData(0,0,canvas.width,canvas.height);
    };
    saved.src = savedData;
  } else {
    setTimeout(() => {
      canvas._baseSnapshot = ctx.getImageData(0,0,canvas.width,canvas.height);
    }, 100);
  }
}

function getPosturoRadio(name) {
  const el = document.querySelector('input[name="'+name+'"]:checked');
  return el ? el.value : '';
}
function setPosturoRadio(name, val) {
  if(!val) return;
  const el = document.querySelector('input[name="'+name+'"][value="'+val+'"]');
  if(el) el.checked = true;
}
function getPoVal(id) { const e=document.getElementById(id); return e?e.value:''; }
function setPoVal(id, v) { const e=document.getElementById(id); if(e) e.value=v||''; }

function savePosturoBilan() {
  if(!currentPatient) { alert('Sélectionnez un patient'); return; }
  if(!currentPatient.bilanDataPosturo) currentPatient.bilanDataPosturo = {};
  const d = currentPatient.bilanDataPosturo;
  d.medecin=getPoVal('po-medecin'); d.dateConsult=getPoVal('po-date-consult');
  d.activite=getPoVal('po-activite'); d.travail=getPoVal('po-travail');
  d.atcd=getPoVal('po-atcd'); d.appareillage=getPoVal('po-appareillage');
  d.examens=getPoVal('po-examens'); d['1ereIntention']=getPosturoRadio('po-1ere-intention');
  d.activiteQuot=getPoVal('po-activite-quot'); d.motif=getPoVal('po-motif');
  d.douleur=getPosturoRadio('po-douleur'); d.eva=getPoVal('po-eva');
  d.terrainPred=getPosturoRadio('po-terrain-pred'); d.tactique=getPosturoRadio('po-tactique');
  d.terrain=getPosturoRadio('po-terrain'); d.tensionPrincipal=getPoVal('po-tension-principal');
  d.comp1=getPoVal('po-comp1'); d.comp2=getPoVal('po-comp2'); d.comp3=getPoVal('po-comp3');
  d.compCritique=getPoVal('po-comp-critique'); d.prefMot=getPosturoRadio('po-pref-mot');
  // Section 2: Romberg checkboxes
  const getChk2 = id => document.getElementById(id)?.checked||false;
  d.rombergAnt=getChk2('po-romberg-ant'); d.rombergLat=getChk2('po-romberg-lat');
  d.rombergLatDir=document.querySelector('input[name="po-romberg-lat-dir"]:checked')?.value||'';
  d.rombergPost=getChk2('po-romberg-post'); d.rombergOculaire=getChk2('po-romberg-oculaire');
  d.rombergRot=getChk2('po-romberg-rot');
  d.rombergRotDir=document.querySelector('input[name="po-romberg-rot-dir"]:checked')?.value||'';
  d.bilanDyn=getPoVal('po-bilan-dyn');
  d.course=getPoVal('po-course');
  // Section 3: Tests poignet D/G
  d.poignetD=document.querySelector('input[name="po-poignet-d"]:checked')?.value||'';
  d.poignetG=document.querySelector('input[name="po-poignet-g"]:checked')?.value||'';
  d.testStab=document.querySelector('input[name="po-test-stab"]:checked')?.value||'';
  d.testFlexAnt=getPoVal('po-test-flex-ant');
  d.flexDebout=getPosturoRadio('po-flex-debout'); d.flexAssis=getPosturoRadio('po-flex-assis');
  d.mobHanche=getPosturoRadio('po-mob-hanche'); d.mobGenou=getPosturoRadio('po-mob-genou');
  d.mobPied=getPosturoRadio('po-mob-pied'); d.mobBassin=getPosturoRadio('po-mob-bassin');
  // Tibia/fémur D/G
  d.tfD=getChk2('po-tf-d'); d.tfG=getChk2('po-tf-g');
  d.tfDFemur=getChk2('po-tf-d-femur'); d.tfDTibia=getChk2('po-tf-d-tibia');
  d.tfGFemur=getChk2('po-tf-g-femur'); d.tfGTibia=getChk2('po-tf-g-tibia');
  d.tfDFemurDir=document.querySelector('input[name="po-tf-d-femur-dir"]:checked')?.value||'';
  d.tfDTibiaDir=document.querySelector('input[name="po-tf-d-tibia-dir"]:checked')?.value||'';
  d.tfGFemurDir=document.querySelector('input[name="po-tf-g-femur-dir"]:checked')?.value||'';
  d.tfGTibiaDir=document.querySelector('input[name="po-tf-g-tibia-dir"]:checked')?.value||'';
  // Longueur MI dorsal
  d.longMiDorsVal=document.querySelector('input[name="po-long-mi-dors"]:checked')?.value||'';
  d.longMiDorsSide=document.querySelector('input[name="po-long-mi-dors-side"]:checked')?.value||'';
  // Branches pubiennes
  d.pubSide=document.querySelector('input[name="po-pub"]:checked')?.value||'';
  d.pubDir=document.querySelector('input[name="po-pub-dir"]:checked')?.value||'';
  // Downing
  d.downingD=getChk2('po-downing-d'); d.downingG=getChk2('po-downing-g');
  d.downingDRes=document.querySelector('input[name="po-downing-d-res"]:checked')?.value||'';
  d.downingGRes=document.querySelector('input[name="po-downing-g-res"]:checked')?.value||'';
  // Longueur MI procubitus
  d.longMiProcVal=document.querySelector('input[name="po-long-mi-proc"]:checked')?.value||'';
  d.longMiProcSide=document.querySelector('input[name="po-long-mi-proc-side"]:checked')?.value||'';
  // Inégalité
  d.inegDir=document.querySelector('input[name="po-ineg-dir"]:checked')?.value||'';
  d.inegStruct=getChk2('po-ineg-struct'); d.inegComp=getChk2('po-ineg-comp');
  d.inegLong=getPosturoRadio('po-ineg-long'); d.equilibre=getPosturoRadio('po-equilibre');
  d.scoliose=getPosturoRadio('po-scoliose');
  // Sections 4-9
  const getChk = id => document.getElementById(id)?.checked||false;
  const getRad = name => document.querySelector('input[name="'+name+'"]:checked')?.value||'';
  // Section 4 - Neuro fonctionnel complet
  d.hypoTronc=getChk('po-hypo-tronc'); d.hypoCervelet=getChk('po-hypo-cervelet');
  // Sauvegarder les données setBilanField (ps_, pd_, nc_ etc.)
  // Sauvegarder TOUTES les checkboxes de psec-3 par ID
  if(!d.neuro4) d.neuro4 = {};
  Object.assign(d.neuro4, bilanData);
  // Sauvegarder psec-3 seulement si visible (sinon garder neuro4 existant)
  const psec3 = document.getElementById('psec-3');
  if(psec3 && psec3.style.display !== 'none') {
    psec3.querySelectorAll('input[type="checkbox"][id]').forEach(el => {
      d.neuro4[el.id] = el.checked;
    });
  }
  // Nerfs crâniens
  const ncList = ['recap','nc1','nc2','nc3','nc4','nc5','nc6','nc7','nc8','nc9','nc10','nc11','nc12'];
  d.nc = {};
  ncList.forEach(nc => {
    ['g','d','n'].forEach(side => {
      const el = document.getElementById('nc-'+nc+'-'+side);
      if(el) d.nc[nc+'_'+side] = el.checked;
    });
  });
  // Proprioception
  const propList = ['lent','rapide','golgi','paccini','ruffini-d','ruffini-c','golgi-a'];
  d.prop = {};
  propList.forEach(p => {
    ['g','d'].forEach(side => {
      const el = document.getElementById('prop-'+p+'-'+side);
      if(el) d.prop[p+'_'+side] = el.checked;
    });
  });
  // Cervelet
  const cervList = ['vermis-sharp','vermis-romberg','inter-prec','inter-coord','lat-prec','lat-coord'];
  d.cerv = {};
  cervList.forEach(cv => {
    ['g','d'].forEach(side => {
      const el = document.getElementById(cv+'-'+side);
      if(el) d.cerv[cv+'_'+side] = el.checked;
    });
  });
  // Section 5
  d.epines=getRad('po-epines'); d.epinesLoc=getPoVal('po-epines-loc');
  // Photo empreinte
  const emprImg = document.getElementById('po-empreinte-img');
  if(emprImg && emprImg.src && emprImg.src.startsWith('data:')) d._empreinte = emprImg.src;
  d.chaussureType=getPoVal('po-chaussure-type');
  d.usureInterne=getChk('po-usure-interne'); d.usureExterne=getChk('po-usure-externe'); d.usureContrefort=getChk('po-usure-contrefort');
  d.testPouces=getChk('po-test-pouces'); d.testConvergence=getChk('po-test-convergence');
  d.testScapulaire=getChk('po-test-scapulaire'); d.testNucale=getChk('po-test-nucale');
  d.paraPlantaire=getChk('po-para-plantaire'); d.paraYeux=getChk('po-para-yeux');
  d.paraBuccale=getChk('po-para-buccale'); d.paraCicatrice=getChk('po-para-cicatrice');
  d.paraVestibulaire=getChk('po-para-vestibulaire'); d.paraViscerale=getChk('po-para-viscerale');
  d.monoPiedG=getChk('po-mono-pied-g'); d.monoPiedD=getChk('po-mono-pied-d');
  d.monoGenouG=getChk('po-mono-genou-g'); d.monoGenouD=getChk('po-mono-genou-d');
  d.monoHancheG=getChk('po-mono-hanche-g'); d.monoHancheD=getChk('po-mono-hanche-d');
  d.alignAxe=getChk('po-align-axe'); d.alignInf=getChk('po-align-inf'); d.alignSup=getChk('po-align-sup');
  // Section 6
  d.laterOui=getRad('po-later'); d.laterType=getRad('po-later-type');
  d.laterD=getChk('po-later-d'); d.laterG=getChk('po-later-g');
  d.kleinRes=getRad('po-klein'); d.ligamentsRes=getRad('po-ligaments'); d.rancurelRes=getRad('po-rancurel');
  d.headShaking=getRad('po-headshaking'); d.headImpulse=getRad('po-headimpulse');
  d.babinski=getRad('po-babinski'); d.unterburger=getRad('po-unterburger');
  d.vertiges=getRad('po-vertiges'); d.vppb=getRad('po-vppb');
  d.cscD=getChk('po-csc-d'); d.cscG=getChk('po-csc-g');
  d.cscAntG=getChk('po-csc-antg'); d.cscAntD=getChk('po-csc-antd');
  d.cscPostD=getChk('po-csc-postd'); d.cscPostG=getChk('po-csc-postg');
  d.clvf=getRad('po-clvf'); d.pevs=getRad('po-pevs');
  d.canalAnt=getChk('po-canal-ant'); d.canalPost=getChk('po-canal-post'); d.canalLat=getChk('po-canal-lat');
  d.manSemont=getChk('po-man-semont'); d.manEpley=getChk('po-man-epley');
  d.manEpleyInv=getChk('po-man-epley-inv'); d.manLempert=getChk('po-man-lempert');
  d.reorOrl=getChk('po-reor-orl'); d.reorKine=getChk('po-reor-kine');
  d.semelleComp=getRad('po-semelle-comp');
  // Section 7 Buccal
  d.mcpOuv=getRad('po-mcp-ouv'); d.serrage=getRad('po-serrage');
  d.aggrDents=getChk('po-aggr-dents'); d.aggrAtm=getChk('po-aggr-atm');
  d.amelioContact=getChk('po-amelio-contact'); d.amelioTension=getChk('po-amelio-tension');
  d.atmOrigine=getRad('po-atm-origine'); d.ouvMax=getRad('po-ouv-max');
  d.deviation=getRad('po-deviation'); d.contractures=getRad('po-contractures');
  d.douleurCaps=getRad('po-douleur-caps'); d.ressaut=getRad('po-ressaut');
  d.ressautDte=getChk('po-ressaut-dte'); d.ressautGauche=getChk('po-ressaut-gauche');
  d.reorBucDentiste=getChk('po-reor-buc-dentiste'); d.reorBucOrtho=getChk('po-reor-buc-ortho');
  d.reorBucStomato=getChk('po-reor-buc-stomato'); d.reorBucKine=getChk('po-reor-buc-kine');
  // Section 7 Visuel
  d.convOculaire=getChk('po-conv-oculaire');
  d.visLater=getRad('po-vis-later'); d.visLaterType=getRad('po-vis-later-type');
  d.testAllongement=getRad('po-test-allongement'); d.testRotNucale=getRad('po-test-rot-nucale');
  d.visEntree=getRad('po-vis-entree');
  d.myopie=getChk('po-myopie'); d.hypermetropie=getChk('po-hypermetropie');
  d.presbyte=getChk('po-presbyte'); d.astigmate=getChk('po-astigmate');
  d.oeilDirect=getRad('po-oeil-direct'); d.oeilDomin=getRad('po-oeil-domin');
  d.maddox=getRad('po-maddox'); d.coverTest=getRad('po-cover');
  d.heteroHUni=getPoVal('po-hetero-h-uni'); d.heteroHBi=getPoVal('po-hetero-h-bi'); d.heteroV=getPoVal('po-hetero-v');
  d.traitOrtho=getRad('po-trait-ortho'); d.ficheEx=getRad('po-fiche-ex');
  d.reorVisOrthoptiste=getChk('po-reor-vis-orthoptiste'); d.reorVisOphtalmo=getChk('po-reor-vis-ophtalmo'); d.reorVisOptom=getChk('po-reor-vis-optom');
  // Section 8
  d.postureAnt=getChk('po-posture-ant'); d.posturePost=getChk('po-posture-post');
  d.postureLater=getChk('po-posture-later'); d.postureLaterDir=getRad('po-posture-later-dir');
  d.chaineExt=getChk('po-chaine-ext'); d.chaineFlexion=getChk('po-chaine-flex'); d.chaineFerm=getChk('po-chaine-ferm');
  d.chaineOuv=getChk('po-chaine-ouv'); d.chaineStatOpt=getChk('po-chaine-stat-opt'); d.chaineStatDeg=getChk('po-chaine-stat-deg');
  d.biomecArticulaire=getPoVal('po-biomec-articulaire');
  // Section 9
  d.semellesDesc=getPoVal('po-semelles-desc'); d.prochaineRdv=getPoVal('po-prochain-rdv');
  ['t1','t2','t3','t4','t5','t6','t7','t8'].forEach(t => { d['test_'+t]=getRad('po-'+t); });
  // Matériaux et recouvrement (checkboxes multiples)
  d.materiaux = Array.from(document.querySelectorAll('input[name="po-materiaux"]:checked')).map(e=>e.value);
  d.recouvrement = Array.from(document.querySelectorAll('input[name="po-recouvrement"]:checked')).map(e=>e.value);
  // Circuits express
  ['c1-ex1','c1-ex2','c1-ex3','c1-ex4','c2-ex1','c2-ex2','c2-ex3','c2-ex4'].forEach(id => {
    d['circ_'+id.replace('-','_')] = getPoVal('po-'+id+'-libre');
    // Sauvegarder les selects système et sous-exercice
    const rowEl = document.getElementById('po-'+id+'-libre')?.closest('div[style*="border"]');
    if(rowEl) {
      const sels = rowEl.querySelectorAll('select.exo-sys');
      const subs = rowEl.querySelectorAll('select.exo-sub');
      d['circ_'+id.replace('-','_')+'_sys'] = Array.from(sels).map(s=>s.value);
      d['circ_'+id.replace('-','_')+'_sub'] = Array.from(subs).map(s=>s.value);
    }
  });

  const bc=document.getElementById('posturo-body-canvas');
  if(bc && bc.width>0 && bc._history && bc._history.length>0) {
    // Sauvegarder uniquement le canvas des dessins en PNG transparent
    d._bodyCanvas = bc.toDataURL('image/png');
    // Sauvegarder aussi les dimensions CSS du canvas pour reconstruction
    d._bodyCanvasW = parseFloat(bc.style.width) || bc.width;
    d._bodyCanvasH = parseFloat(bc.style.height) || bc.height;
  }
  const fc=document.getElementById('posturo-feet-canvas');
  if(fc) {
    const _buildFeetComposite = (canvas, callback) => {
      const piedsImgEl = document.getElementById('imgjs-pieds');
      const iw = piedsImgEl?.naturalWidth || 698;
      const ih = piedsImgEl?.naturalHeight || 558;
      // Canvas aux dimensions de l'image pour ne pas rogner
      const compC = document.createElement('canvas');
      compC.width = iw; compC.height = ih;
      const compCtx = compC.getContext('2d');
      // Fond: image pleine taille
      if(piedsImgEl) compCtx.drawImage(piedsImgEl, 0, 0, compC.width, compC.height);
      // Dessins: redimensionner le canvas dessins au même espace
      if(canvas && canvas.width > 0) {
        compCtx.drawImage(canvas, 0, 0, compC.width, compC.height);
      }
      callback(compC.toDataURL('image/jpeg', 0.5));
    };
    // Si nouveaux dessins -> régénérer, sinon garder l'existant
    if(fc._history && fc._history.length > 0) {
      _buildFeetComposite(fc, url => { d._feetCanvas = url; });
    } else if(!d._feetCanvas) {
      _buildFeetComposite(fc, url => { d._feetCanvas = url; });
    }
    // else: garder d._feetCanvas existant intact
  }
  // Mettre à jour le snapshot dans bilansPosturo
  if(currentPatient.bilansPosturo && currentPatient.bilansPosturo.length > 0) {
    const lastIdx = currentPatient.bilansPosturo.length - 1;
    currentPatient.bilansPosturo[lastIdx].bilanDataPosturo = JSON.parse(JSON.stringify(d));
  }
  savePatients();
  alert('✓ Bilan posturologique sauvegardé');
}

function loadPosturoBilan() {
  const d = currentPatient?.bilanDataPosturo;
  if(!d) return;
  setPoVal('po-medecin',d.medecin); setPoVal('po-date-consult',d.dateConsult);
  setPoVal('po-activite',d.activite); setPoVal('po-travail',d.travail);
  setPoVal('po-atcd',d.atcd); setPoVal('po-appareillage',d.appareillage);
  setPoVal('po-examens',d.examens); setPosturoRadio('po-1ere-intention',d['1ereIntention']);
  setPoVal('po-activite-quot',d.activiteQuot); setPoVal('po-motif',d.motif);
  setPosturoRadio('po-douleur',d.douleur);
  if(d.eva!==undefined){setPoVal('po-eva',d.eva);const ev=document.getElementById('po-eva-val');if(ev)ev.textContent=d.eva;}
  setPosturoRadio('po-terrain-pred',d.terrainPred); setPosturoRadio('po-tactique',d.tactique);
  setPosturoRadio('po-terrain',d.terrain); setPoVal('po-tension-principal',d.tensionPrincipal);
  setPoVal('po-comp1',d.comp1); setPoVal('po-comp2',d.comp2); setPoVal('po-comp3',d.comp3);
  setPoVal('po-comp-critique',d.compCritique); setPosturoRadio('po-pref-mot',d.prefMot);
  // Section 2: Romberg
  const setChk2 = (id,v) => { const e=document.getElementById(id); if(e) e.checked=!!v; };
  setChk2('po-romberg-ant',d.rombergAnt);
  setChk2('po-romberg-lat',d.rombergLat); if(d.rombergLat) toggleRomberg('lat',true);
  if(d.rombergLatDir) setPosturoRadio('po-romberg-lat-dir',d.rombergLatDir);
  setChk2('po-romberg-post',d.rombergPost); setChk2('po-romberg-oculaire',d.rombergOculaire);
  setChk2('po-romberg-rot',d.rombergRot); if(d.rombergRot) toggleRomberg('rot',true);
  if(d.rombergRotDir) setPosturoRadio('po-romberg-rot-dir',d.rombergRotDir);
  setPoVal('po-bilan-dyn',d.bilanDyn);
  setPoVal('po-course',d.course);
  // Section 3: Tests poignet
  if(d.poignetD) setPosturoRadio('po-poignet-d',d.poignetD);
  if(d.poignetG) setPosturoRadio('po-poignet-g',d.poignetG);
  if(d.testStab) setPosturoRadio('po-test-stab',d.testStab);
  setPoVal('po-test-flex-ant',d.testFlexAnt);
  setPosturoRadio('po-flex-debout',d.flexDebout); setPosturoRadio('po-flex-assis',d.flexAssis);
  setPosturoRadio('po-mob-hanche',d.mobHanche); setPosturoRadio('po-mob-genou',d.mobGenou);
  setPosturoRadio('po-mob-pied',d.mobPied); setPosturoRadio('po-mob-bassin',d.mobBassin);
  // Tibia/fémur
  setChk2('po-tf-d',d.tfD); setChk2('po-tf-g',d.tfG);
  if(d.tfD) toggleTF('d',true);
  if(d.tfG) toggleTF('g',true);
  setChk2('po-tf-d-femur',d.tfDFemur); if(d.tfDFemur) toggleTFOs('d','femur',true);
  setChk2('po-tf-d-tibia',d.tfDTibia); if(d.tfDTibia) toggleTFOs('d','tibia',true);
  setChk2('po-tf-g-femur',d.tfGFemur); if(d.tfGFemur) toggleTFOs('g','femur',true);
  setChk2('po-tf-g-tibia',d.tfGTibia); if(d.tfGTibia) toggleTFOs('g','tibia',true);
  if(d.tfDFemurDir) setPosturoRadio('po-tf-d-femur-dir',d.tfDFemurDir);
  if(d.tfDTibiaDir) setPosturoRadio('po-tf-d-tibia-dir',d.tfDTibiaDir);
  if(d.tfGFemurDir) setPosturoRadio('po-tf-g-femur-dir',d.tfGFemurDir);
  if(d.tfGTibiaDir) setPosturoRadio('po-tf-g-tibia-dir',d.tfGTibiaDir);
  // Longueur MI dorsal
  if(d.longMiDorsVal){setPosturoRadio('po-long-mi-dors',d.longMiDorsVal);toggleLongMI('dors',d.longMiDorsVal);}
  if(d.longMiDorsSide) setPosturoRadio('po-long-mi-dors-side',d.longMiDorsSide);
  // Branches pubiennes
  if(d.pubSide){setPosturoRadio('po-pub',d.pubSide);togglePub(d.pubSide);}
  if(d.pubDir) setPosturoRadio('po-pub-dir',d.pubDir);
  // Downing
  setChk2('po-downing-d',d.downingD); if(d.downingD) toggleDowning('d',true);
  setChk2('po-downing-g',d.downingG); if(d.downingG) toggleDowning('g',true);
  if(d.downingDRes) setPosturoRadio('po-downing-d-res',d.downingDRes);
  if(d.downingGRes) setPosturoRadio('po-downing-g-res',d.downingGRes);
  // Longueur MI procubitus
  if(d.longMiProcVal){setPosturoRadio('po-long-mi-proc',d.longMiProcVal);toggleLongMI('proc',d.longMiProcVal);}
  if(d.longMiProcSide) setPosturoRadio('po-long-mi-proc-side',d.longMiProcSide);
  // Inégalité
  setPosturoRadio('po-ineg-long',d.inegLong); if(d.inegLong==='oui') toggleIneg(true);
  if(d.inegDir) setPosturoRadio('po-ineg-dir',d.inegDir);
  setChk2('po-ineg-struct',d.inegStruct); setChk2('po-ineg-comp',d.inegComp);
  setPosturoRadio('po-equilibre',d.equilibre);
  setPosturoRadio('po-scoliose',d.scoliose);

  // Sections 4-9
  const setChk = (id,v) => { const e=document.getElementById(id); if(e) e.checked=!!v; };
  setChk('po-hypo-tronc',d.hypoTronc); setChk('po-hypo-cervelet',d.hypoCervelet);
  // Restaurer les données setBilanField
  if(d.neuro4) {
    Object.assign(bilanData, d.neuro4);
    // Restaurer après un délai pour laisser le DOM se construire
    setTimeout(function() {
      Object.entries(d.neuro4).forEach(function([key, val]) {
        if(typeof val === 'boolean') {
          // Chercher dans tout le document les checkboxes avec setBilanField
          document.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
            const onch = cb.getAttribute('onchange') || '';
            if(onch.includes("'"+key+"'") || onch.includes('"'+key+'"')) {
              cb.checked = val;
            }
          });
        } else if(typeof val === 'string' && val !== '') {
          // Champs texte et radio
          document.querySelectorAll('input, textarea, select').forEach(function(el) {
            const onch = el.getAttribute('onchange') || '';
            if(onch.includes("'"+key+"'") || onch.includes('"'+key+'"')) {
              if(el.type === 'radio') {
                if(el.value === val) el.checked = true;
              } else {
                el.value = val;
              }
            }
          });
        }
      });
    }, 500);
  }
  // Nerfs crâniens
  if(d.nc) {
    Object.entries(d.nc).forEach(([key,val]) => {
      const [nc, side] = key.split('_');
      const el = document.getElementById('nc-'+nc+'-'+side);
      if(el) el.checked = !!val;
    });
    setTimeout(updateNeuroTotals, 100);
  }
  // Proprioception
  if(d.prop) {
    Object.entries(d.prop).forEach(([key,val]) => {
      const [p, side] = key.split('_');
      const el = document.getElementById('prop-'+p+'-'+side);
      if(el) el.checked = !!val;
    });
  }
  // Cervelet
  if(d.cerv) {
    Object.entries(d.cerv).forEach(([key,val]) => {
      const [cv, side] = key.split('_');
      const el = document.getElementById(cv+'-'+side);
      if(el) el.checked = !!val;
    });
  }
  setPosturoRadio('po-epines',d.epines); setPoVal('po-epines-loc',d.epinesLoc);
  // Restaurer photo empreinte
  if(d._empreinte) {
    const img = document.getElementById('po-empreinte-img');
    const del = document.getElementById('po-empreinte-del');
    if(img) { img.src = d._empreinte; img.style.display = 'block'; }
    if(del) del.style.display = 'inline-block';
  }
  setPoVal('po-chaussure-type',d.chaussureType);
  setChk('po-usure-interne',d.usureInterne); setChk('po-usure-externe',d.usureExterne); setChk('po-usure-contrefort',d.usureContrefort);
  setChk('po-test-pouces',d.testPouces); setChk('po-test-convergence',d.testConvergence);
  setChk('po-test-scapulaire',d.testScapulaire); setChk('po-test-nucale',d.testNucale);
  setChk('po-para-plantaire',d.paraPlantaire); setChk('po-para-yeux',d.paraYeux);
  setChk('po-para-buccale',d.paraBuccale); setChk('po-para-cicatrice',d.paraCicatrice);
  setChk('po-para-vestibulaire',d.paraVestibulaire); setChk('po-para-viscerale',d.paraViscerale);
  setChk('po-mono-pied-g',d.monoPiedG); setChk('po-mono-pied-d',d.monoPiedD);
  setChk('po-mono-genou-g',d.monoGenouG); setChk('po-mono-genou-d',d.monoGenouD);
  setChk('po-mono-hanche-g',d.monoHancheG); setChk('po-mono-hanche-d',d.monoHancheD);
  setChk('po-align-axe',d.alignAxe); setChk('po-align-inf',d.alignInf); setChk('po-align-sup',d.alignSup);
  setPosturoRadio('po-later',d.laterOui); if(d.laterOui) toggleLateralisation(d.laterOui==='oui');
  setPosturoRadio('po-later-type',d.laterType);
  setChk('po-later-d',d.laterD); setChk('po-later-g',d.laterG);
  setPosturoRadio('po-klein',d.kleinRes); setPosturoRadio('po-ligaments',d.ligamentsRes); setPosturoRadio('po-rancurel',d.rancurelRes);
  setPosturoRadio('po-headshaking',d.headShaking); setPosturoRadio('po-headimpulse',d.headImpulse);
  setPosturoRadio('po-babinski',d.babinski); setPosturoRadio('po-unterburger',d.unterburger);
  setPosturoRadio('po-vertiges',d.vertiges); setPosturoRadio('po-vppb',d.vppb);
  if(d.vppb==='oui'){const vd=document.getElementById('po-vppb-detail');if(vd)vd.style.display='flex';}
  setChk('po-csc-d',d.cscD); setChk('po-csc-g',d.cscG);
  setChk('po-csc-antg',d.cscAntG); setChk('po-csc-antd',d.cscAntD);
  setChk('po-csc-postd',d.cscPostD); setChk('po-csc-postg',d.cscPostG);
  setPosturoRadio('po-clvf',d.clvf); if(d.clvf) toggleCLVF(d.clvf==='oui');
  setPosturoRadio('po-pevs',d.pevs);
  setChk('po-canal-ant',d.canalAnt); setChk('po-canal-post',d.canalPost); setChk('po-canal-lat',d.canalLat);
  setChk('po-man-semont',d.manSemont); setChk('po-man-epley',d.manEpley);
  setChk('po-man-epley-inv',d.manEpleyInv); setChk('po-man-lempert',d.manLempert);
  setChk('po-reor-orl',d.reorOrl); setChk('po-reor-kine',d.reorKine);
  setPosturoRadio('po-semelle-comp',d.semelleComp);
  setPosturoRadio('po-mcp-ouv',d.mcpOuv); setPosturoRadio('po-serrage',d.serrage);
  if(d.serrage) toggleSerrage(d.serrage);
  setChk('po-aggr-dents',d.aggrDents); setChk('po-aggr-atm',d.aggrAtm);
  setChk('po-amelio-contact',d.amelioContact); setChk('po-amelio-tension',d.amelioTension);
  setPosturoRadio('po-atm-origine',d.atmOrigine); setPosturoRadio('po-ouv-max',d.ouvMax);
  setPosturoRadio('po-deviation',d.deviation); setPosturoRadio('po-contractures',d.contractures);
  setPosturoRadio('po-douleur-caps',d.douleurCaps); setPosturoRadio('po-ressaut',d.ressaut);
  if(d.ressaut) toggleRessaut(d.ressaut==='oui');
  setChk('po-ressaut-dte',d.ressautDte); setChk('po-ressaut-gauche',d.ressautGauche);
  setChk('po-reor-buc-dentiste',d.reorBucDentiste); setChk('po-reor-buc-ortho',d.reorBucOrtho);
  setChk('po-reor-buc-stomato',d.reorBucStomato); setChk('po-reor-buc-kine',d.reorBucKine);
  setChk('po-conv-oculaire',d.convOculaire);
  setPosturoRadio('po-vis-later',d.visLater); if(d.visLater) toggleVisLater(d.visLater==='oui');
  setPosturoRadio('po-vis-later-type',d.visLaterType);
  setPosturoRadio('po-test-allongement',d.testAllongement); setPosturoRadio('po-test-rot-nucale',d.testRotNucale);
  setPosturoRadio('po-vis-entree',d.visEntree);
  setChk('po-myopie',d.myopie); setChk('po-hypermetropie',d.hypermetropie);
  setChk('po-presbyte',d.presbyte); setChk('po-astigmate',d.astigmate);
  setPosturoRadio('po-oeil-direct',d.oeilDirect); setPosturoRadio('po-oeil-domin',d.oeilDomin);
  setPosturoRadio('po-maddox',d.maddox); setPosturoRadio('po-cover',d.coverTest);
  setPoVal('po-hetero-h-uni',d.heteroHUni); setPoVal('po-hetero-h-bi',d.heteroHBi); setPoVal('po-hetero-v',d.heteroV);
  setPosturoRadio('po-trait-ortho',d.traitOrtho); setPosturoRadio('po-fiche-ex',d.ficheEx);
  setChk('po-reor-vis-orthoptiste',d.reorVisOrthoptiste); setChk('po-reor-vis-ophtalmo',d.reorVisOphtalmo); setChk('po-reor-vis-optom',d.reorVisOptom);
  setChk('po-posture-ant',d.postureAnt); setChk('po-posture-post',d.posturePost);
  setChk('po-posture-later',d.postureLater); if(d.postureLater) togglePostureLater(true);
  setPosturoRadio('po-posture-later-dir',d.postureLaterDir);
  setChk('po-chaine-ext',d.chaineExt); setChk('po-chaine-ferm',d.chaineFerm);
  setChk('po-chaine-ouv',d.chaineOuv); setChk('po-chaine-stat-opt',d.chaineStatOpt); setChk('po-chaine-stat-deg',d.chaineStatDeg);
  setPoVal('po-biomec-articulaire',d.biomecArticulaire);
  setPoVal('po-semelles-desc',d.semellesDesc); setPoVal('po-prochain-rdv',d.prochaineRdv);
  ['t1','t2','t3','t4','t5','t6','t7','t8'].forEach(t => { setPosturoRadio('po-'+t, d['test_'+t]); });
  // Matériaux et recouvrement
  if(d.materiaux) document.querySelectorAll('input[name="po-materiaux"]').forEach(e => { e.checked = d.materiaux.includes(e.value); });
  if(d.recouvrement) document.querySelectorAll('input[name="po-recouvrement"]').forEach(e => { e.checked = d.recouvrement.includes(e.value); });
  // Circuits express
  ['c1-ex1','c1-ex2','c1-ex3','c1-ex4','c2-ex1','c2-ex2','c2-ex3','c2-ex4'].forEach(id => {
    const key = id.replace('-','_');
    // Restaurer champ libre
    setPoVal('po-'+id+'-libre', d['circ_'+key]);
    // Restaurer selects système et sous-exercice
    const sysVals = d['circ_'+key+'_sys'] || [];
    const subVals = d['circ_'+key+'_sub'] || [];
    const libreEl = document.getElementById('po-'+id+'-libre');
    if(!libreEl) return;
    const row = libreEl.closest('div[style*="border"]');
    if(!row) return;
    const sels = row.querySelectorAll('select.exo-sys');
    sels.forEach((sel, i) => {
      if(sysVals[i]) {
        sel.value = sysVals[i];
        updateExerciceSubMenu(sel);
        // Restaurer le sous-menu après création
        setTimeout(() => {
          const sub = sel.nextElementSibling;
          if(sub && sub.classList.contains('exo-sub') && subVals[i]) {
            sub.value = subVals[i];
          }
        }, 100);
      }
    });
  });
}
// ===== DICTAPHONE SYSTEM =====
var _micRecognition = null;
var _micActive = false;
var _micTargetId = null;

function _injectMicButtons() {
  var poIds = ['po-motif','po-atcd','po-appareillage','po-examens','po-activite',
    'po-travail','po-activite-quot','po-tension-principal','po-comp1','po-comp2',
    'po-comp3','po-comp-critique','po-bilan-dyn','po-course','po-test-flex-ant',
    'po-epines-loc','po-chaussure-type','po-hetero-h-uni','po-hetero-h-bi',
    'po-hetero-v','po-biomec-articulaire','po-semelles-desc'];
  poIds.forEach(function(id) {
    var el = document.getElementById(id);
    if(!el || el._micInjected) return;
    el._micInjected = true;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Dicter dans ce champ';
    btn.innerHTML = '&#127908;';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;padding:2px 6px;border-radius:50%;opacity:0.6;vertical-align:middle;';
    btn.onclick = (function(fieldId, b) {
      return function() { startDictation(fieldId, b); };
    })(id, btn);
    el.parentNode.insertBefore(btn, el.nextSibling);
  });
}

function startDictation(targetId, btn) {
  if(!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert("Reconnaissance vocale non supportee. Utilisez Chrome ou Edge.");
    return;
  }
  if(_micActive && _micTargetId === targetId) {
    _stopMic(btn);
    return;
  }
  if(_micActive) _stopMic(null);
  _micTargetId = targetId;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  _micRecognition = new SR();
  _micRecognition.lang = 'fr-FR';
  _micRecognition.continuous = true;
  _micRecognition.interimResults = false;
  _micRecognition.maxAlternatives = 1;
  _micRecognition.onresult = function(e) {
    var el = document.getElementById(targetId);
    if(!el) return;
    for(var i = e.resultIndex; i < e.results.length; i++) {
      if(e.results[i].isFinal) {
        el.value += e.results[i][0].transcript + ' ';
        el.dispatchEvent(new Event('input'));
      }
    }
  };
  _micRecognition.onerror = function(e) { _stopMic(btn); };
  _micRecognition.onend = function() {
    if(_micActive) { try { _micRecognition.start(); } catch(e) {} }
  };
  _micActive = true;
  if(btn) { btn.style.opacity='1'; btn.style.background='#fee2e2'; }
  var fb = document.getElementById('mic-float');
  if(fb) { fb.style.background='#dc2626'; fb.textContent='\u23F9'; }
  try { _micRecognition.start(); } catch(e) {}
}

function _stopMic(btn) {
  _micActive = false;
  if(_micRecognition) { try { _micRecognition.stop(); } catch(e) {} _micRecognition = null; }
  document.querySelectorAll('._mic-active').forEach(function(b) {
    b.style.opacity='0.6'; b.style.background='none'; b.classList.remove('_mic-active');
  });
  if(btn) { btn.style.opacity='0.6'; btn.style.background='none'; }
  var fb = document.getElementById('mic-float');
  if(fb) { fb.style.background='#0e1f38'; fb.textContent='\u1F3A4'; }
  _micTargetId = null;
}

function toggleFloatMic() {
  if(_micActive) { _stopMic(null); return; }
  var focused = document.activeElement;
  var targetId = null;
  if(focused && (focused.tagName==='INPUT'||focused.tagName==='TEXTAREA') && focused.id) {
    targetId = focused.id;
  } else {
    var inputs = document.querySelectorAll('input[type="text"], textarea');
    for(var i=0; i<inputs.length; i++) {
      if(inputs[i].id && inputs[i].offsetParent !== null) { targetId = inputs[i].id; break; }
    }
  }
  if(!targetId) { alert("Cliquez dans un champ de texte d'abord."); return; }
  startDictation(targetId, null);
}

document.addEventListener('DOMContentLoaded', function() {
  // Bouton flottant
  var floatBtn = document.createElement('button');
  floatBtn.id = 'mic-float';
  floatBtn.innerHTML = '&#127908;';
  floatBtn.onclick = toggleFloatMic;
  floatBtn.style.cssText = 'position:fixed;bottom:80px;right:20px;width:52px;height:52px;border-radius:50%;background:#0e1f38;color:#fff;border:none;font-size:22px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:9999;display:flex;align-items:center;justify-content:center;';
  document.body.appendChild(floatBtn);
  setTimeout(_injectMicButtons, 800);
});

// ===== STRIPE + MODULES =====
var _stripeInstance = null;
function getStripe() {
  if(!_stripeInstance) _stripeInstance = Stripe('pk_live_51ITNlQIW0WGPcWsGk3UiD3cR7yw8QdNFw3JLaZM6bunA30jzipPZdR8nvrtJJ0QK6qGN3LZCcOYhwYyWqRkXhjYW00u5Kdl22X');
  return _stripeInstance;
}

var _stripePrices = {
  mensuel: ['price_1TNy2bIW0WGPcWsGcNjbZ1GS','price_1TNy52IW0WGPcWsGRNeaxypm','price_1TNyFDIW0WGPcWsGC9k5YBUM','price_1TNyHiIW0WGPcWsGtHHZg2mL','price_1TNyMLIW0WGPcWsGw82sj05L'],
  annuel:  ['price_1TO0q6IW0WGPcWsG05kRrDHq','price_1TO0tYIW0WGPcWsGkkPtZUn4','price_1TO0wcIW0WGPcWsGu8KWNyng','price_1TO0zbIW0WGPcWsGLEXi1KRL','price_1TO12oIW0WGPcWsGxY6tSZ92']
};
var _licencePriceId = 'price_1TNyQeIW0WGPcWsGQNMYXnb3';

var _modules = [
  {id:'postural', name:'Postural', icon:'🧍', desc:'Bilan postural complet'},
  {id:'podopedia', name:'Podopédia', icon:'🦶', desc:'Bilan podologique'},
  {id:'podo_sport', name:'Podo Sport', icon:'⚡', desc:'Analyse sportive'}
];

var _plans = [
  {name:'Essentiel',   idx:0, fixed:[],           choose:1, pool:['postural','podopedia']},
  {name:'Sport',       idx:1, fixed:['podo_sport'], choose:0, pool:[]},
  {name:'Duo',         idx:2, fixed:[],            choose:2, pool:['postural','podopedia']},
  {name:'Duo Sport',   idx:3, fixed:['podo_sport'], choose:1, pool:['postural','podopedia']},
  {name:'Intégral',    idx:4, fixed:['postural','podopedia','podo_sport'], choose:0, pool:[]}
];

var _currentPlanIdx = 0;
var _selectedModules = [];



function toggleModule(id, maxChoose, div) {
  var idx = _selectedModules.indexOf(id);
  var plan = _plans[_currentPlanIdx];
  var choosable = _selectedModules.filter(function(m){ return plan.fixed.indexOf(m) === -1; });

  if(idx !== -1) {
    _selectedModules.splice(idx, 1);
    div.classList.remove('mm-selected');
  } else {
    if(choosable.length >= maxChoose) return;
    _selectedModules.push(id);
    div.classList.add('mm-selected');
  }
  _updateOkBtn(maxChoose);
}

function _updateOkBtn(maxChoose) {
  var plan = _plans[_currentPlanIdx];
  var choosable = _selectedModules.filter(function(m){ return plan.fixed.indexOf(m) === -1; });
  var btn = document.getElementById('mm-btn-ok');
  btn.disabled = choosable.length !== maxChoose;
  btn.style.opacity = btn.disabled ? '0.4' : '1';
}

function confirmerModules() {
  document.getElementById('modal-modules').style.display = 'none';
  lancerPaiement(_currentPlanIdx, _selectedModules);
}

async function lancerPaiement(planIdx, modules) {
  // Liens AVEC licence (nouveaux clients)
  var mensuelAvecLicence = [
    'https://buy.stripe.com/test_cNibJ24ma8Z6a7xgFBfAc00',
    'https://buy.stripe.com/eVq14o9GufnubbBfBxfAc03',
    'https://buy.stripe.com/fZueVe8Cq1wEa7x751fAc05',
    'https://buy.stripe.com/3cIcN67ym6QYa7x1KHfAc07',
    'https://buy.stripe.com/4gM6oIbOCcbifrR1KHfAc09'
  ];
  var annuelAvecLicence = [
    'https://buy.stripe.com/4gMcN6dWK3EMgvV1KHfAc0l',
    'https://buy.stripe.com/8x24gAcSG6QY3J91KHfAc0m',
    'https://buy.stripe.com/3cIaEYaKycbi3J90GDfAc0n',
    'https://buy.stripe.com/aFaeVeg4SfnucfFgFBfAc0o',
    'https://buy.stripe.com/9B68wQdWK2AI2F5extfAc0p'
  ];
  // Liens SANS licence (clients existants changeant de formule)
  var mensuelSansLicence = [
    'https://buy.stripe.com/eVqdRa3i64IQa7xahdfAc0b',
    'https://buy.stripe.com/28E28s8Cq2AI4Nd60XfAc0d',
    'https://buy.stripe.com/aFa5kE6ui1wE3J9cplfAc0f',
    'https://buy.stripe.com/eVqaEY19Y8Z6bbBblhfAc0h',
    'https://buy.stripe.com/7sYaEY6ui1wE1B1blhfAc0j'
  ];
  var annuelSansLicence = [
    'https://buy.stripe.com/eVq7sM4ma4IQ0wXahdfAc0q',
    'https://buy.stripe.com/3cI5kE2e2ejqa7xahdfAc0r',
    'https://buy.stripe.com/28EbJ2g4S6QY5RhdtpfAc0s',
    'https://buy.stripe.com/14AfZi3i6a3a4Nd2OLfAc0t',
    'https://buy.stripe.com/cNi6oI4ma4IQ0wXfBxfAc0u'
  ];

  // Vérifier si l'utilisateur a déjà payé la licence
  var licenceDejaPaye = false;
  if(pwaUser && pwaUser.token && pwaUser.email) {
    try {
      var userRecord = await supa.getUserRecord(pwaUser.token, pwaUser.email);
      if(userRecord && userRecord.licence_payee === true) {
        licenceDejaPaye = true;
      }
    } catch(e) {
      console.log('Erreur vérification licence:', e);
    }
  }

  var url;
  if(licenceDejaPaye) {
    url = lpAnnual ? annuelSansLicence[planIdx] : mensuelSansLicence[planIdx];
  } else {
    url = lpAnnual ? annuelAvecLicence[planIdx] : mensuelAvecLicence[planIdx];
  }
  window.location.href = url;
}

window.addEventListener('DOMContentLoaded', async function() {
  var params = new URLSearchParams(window.location.search);
  if(params.get('payment') === 'success') {
    // Marquer la licence comme payée si l'utilisateur est connecté
    if(pwaUser && pwaUser.token && pwaUser.email) {
      try {
        await supa.updateLicence(pwaUser.token, pwaUser.email);
        console.log('Licence marquée comme payée');
      } catch(e) {
        console.log('Erreur mise à jour licence:', e);
      }
    }
    // Nettoyer l'URL
    window.history.replaceState({}, '', window.location.pathname);
    setTimeout(function() {
      alert('✅ Paiement réussi ! Bienvenue sur Sciopraxi.\nVous allez recevoir un email de confirmation.');
    }, 500);
  } else if(params.get('payment') === 'cancel') {
    window.history.replaceState({}, '', window.location.pathname);
    alert('Paiement annulé. Vous pouvez réessayer à tout moment.');
  }
});

// ===== GESTION ABONNEMENT =====
var _stripePortalUrl = 'https://billing.stripe.com/p/login/cNibJ24ma8Z6a7xgFBfAc00';

async function loadAbonnementInfo() {
  if(!pwaUser || !pwaUser.token || !pwaUser.email) return;
  try {
    var userRecord = await supa.getUserRecord(pwaUser.token, pwaUser.email);
    if(!userRecord) return;

    // Licence
    var licenceEl = document.getElementById('mc-licence-status');
    if(licenceEl) {
      if(userRecord.licence_payee) {
        licenceEl.innerHTML = '<span style="color:#2a7a4e;font-weight:600;">✅ Licence activée</span>';
      } else {
        licenceEl.innerHTML = '<span style="color:#e74c3c;">⚠️ Licence non activée</span>';
      }
    }

    // Formule
    var formuleEl = document.getElementById('mc-formule');
    var descEl = document.getElementById('mc-formule-desc');
    var engagementEl = document.getElementById('mc-engagement');
    var renouvEl = document.getElementById('mc-renouvellement');
    var resilierWrap = document.getElementById('mc-resilier-wrap');
    var resilierMsg = document.getElementById('mc-resilier-msg');

    if(userRecord.formule) {
      if(formuleEl) formuleEl.textContent = userRecord.formule;
    } else {
      if(formuleEl) formuleEl.textContent = 'Aucune formule active';
    }

    if(userRecord.engagement) {
      var engTxt = userRecord.engagement === '12_mois' ? 'Engagement 12 mois' : 'Sans engagement';
      if(engagementEl) engagementEl.textContent = '📋 ' + engTxt;

      // Date début abonnement
      if(userRecord.date_debut_abonnement) {
        var debut = new Date(userRecord.date_debut_abonnement);
        var maintenant = new Date();
        var moisEcoules = (maintenant.getFullYear() - debut.getFullYear()) * 12 + (maintenant.getMonth() - debut.getMonth());

        if(userRecord.engagement === '12_mois') {
          var moisRestants = 12 - moisEcoules;
          if(moisRestants > 0) {
            if(engagementEl) engagementEl.textContent += ' — ' + moisRestants + ' mois restants';
            if(resilierWrap) {
              resilierWrap.style.display = 'block';
              if(resilierMsg) resilierMsg.textContent = '⚠️ Résiliation impossible avant le ' + new Date(debut.setMonth(debut.getMonth()+12)).toLocaleDateString('fr-FR');
            }
          } else {
            if(resilierWrap) resilierWrap.style.display = 'block';
            if(resilierMsg) resilierMsg.textContent = 'Résiliation effective à la prochaine date anniversaire';
          }
        } else {
          // Sans engagement
          if(resilierWrap) resilierWrap.style.display = 'block';
          if(resilierMsg) resilierMsg.textContent = 'Résiliation effective à la prochaine date anniversaire';
        }

        // Prochain renouvellement
        var prochainRenouv = new Date(userRecord.date_debut_abonnement);
        while(prochainRenouv <= maintenant) {
          prochainRenouv.setMonth(prochainRenouv.getMonth() + 1);
        }
        if(renouvEl) renouvEl.textContent = '🔄 Prochain renouvellement : ' + prochainRenouv.toLocaleDateString('fr-FR');
      }
    }
  } catch(e) {
    console.log('Erreur chargement abonnement:', e);
  }
}

function gererAbonnement() {
  var email = pwaUser?.email || '';
  var url = _stripePortalUrl + (email ? '?prefilled_email=' + encodeURIComponent(email) : '');
  window.open(url, '_blank');
}

function changerFormule() {
  if(confirm('Pour changer de formule, vous allez être déconnecté et redirigé vers les tarifs. Continuer ?')) {
    closeMonCompte();
    sessionStorage.setItem('scroll_tarifs', '1');
    sessionStorage.setItem('skip_logout_confirm', '1');
    pwaLogout();
  }
}

async function resilierAbonnement() {
  if(!pwaUser || !pwaUser.token || !pwaUser.email) return;
  try {
    var userRecord = await supa.getUserRecord(pwaUser.token, pwaUser.email);
    if(!userRecord) return;

    // Vérifier engagement 12 mois
    if(userRecord.engagement === '12_mois' && userRecord.date_debut_abonnement) {
      var debut = new Date(userRecord.date_debut_abonnement);
      var maintenant = new Date();
      var moisEcoules = (maintenant.getFullYear() - debut.getFullYear()) * 12 + (maintenant.getMonth() - debut.getMonth());
      if(moisEcoules < 12) {
        var moisRestants = 12 - moisEcoules;
        alert('⚠️ Résiliation impossible\n\nVotre abonnement avec engagement de 12 mois ne peut pas être résilié avant ' + moisRestants + ' mois.\n\nDate de fin d\'engagement : ' + new Date(new Date(userRecord.date_debut_abonnement).setMonth(new Date(userRecord.date_debut_abonnement).getMonth()+12)).toLocaleDateString('fr-FR'));
        return;
      }
    }

    if(confirm('Êtes-vous sûr de vouloir résilier votre abonnement ?\n\nLa résiliation sera effective à la prochaine date anniversaire.')) {
      window.open(_stripePortalUrl, '_blank');
    }
  } catch(e) {
    alert('Erreur. Veuillez contacter le support.');
  }
}

// ===== IMPORT DOCTOLIB CSV =====
function importDoctolibCSV(input) {
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split('\n').filter(l => l.trim());
    if(lines.length < 2) { alert('Fichier CSV vide ou invalide.'); return; }
    
    // Détecter les colonnes (Doctolib utilise ; ou ,)
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g,''));
    
    // Mapper les colonnes Doctolib
    const colMap = {
      nom: headers.findIndex(h => h.includes('nom') && !h.includes('prénom') && !h.includes('prenom')),
      prenom: headers.findIndex(h => h.includes('prénom') || h.includes('prenom') || h.includes('first')),
      ddn: headers.findIndex(h => h.includes('naissance') || h.includes('birth') || h.includes('dob')),
      email: headers.findIndex(h => h.includes('email') || h.includes('mail')),
      tel: headers.findIndex(h => h.includes('téléphone') || h.includes('telephone') || h.includes('phone') || h.includes('mobile')),
      sexe: headers.findIndex(h => h.includes('sexe') || h.includes('genre') || h.includes('gender')),
    };
    
    console.log('Headers:', headers);
    console.log('ColMap:', colMap);
    
    let imported = 0, skipped = 0;
    const newPatients = [];
    
    for(let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g,''));
      if(cols.length < 2) continue;
      
      const nom = colMap.nom >= 0 ? cols[colMap.nom] : '';
      const prenom = colMap.prenom >= 0 ? cols[colMap.prenom] : '';
      
      if(!nom && !prenom) { skipped++; continue; }
      
      // Vérifier doublon
      const exists = patients.some(p => 
        p.nom?.toLowerCase() === nom.toLowerCase() && 
        p.prenom?.toLowerCase() === prenom.toLowerCase()
      );
      if(exists) { skipped++; continue; }
      
      // Formater la date
      let ddn = colMap.ddn >= 0 ? cols[colMap.ddn] : '';
      if(ddn) {
        // Convertir DD/MM/YYYY en YYYY-MM-DD
        const parts = ddn.split(/[/\-.]/);
        if(parts.length === 3) {
          if(parts[2].length === 4) ddn = parts[2]+'-'+parts[1].padStart(2,'0')+'-'+parts[0].padStart(2,'0');
          else if(parts[0].length === 4) ddn = parts[0]+'-'+parts[1].padStart(2,'0')+'-'+parts[2].padStart(2,'0');
        }
      }
      
      const patient = {
        id: Date.now() + Math.random(),
        nom: nom,
        prenom: prenom,
        ddn: ddn,
        email: colMap.email >= 0 ? cols[colMap.email] : '',
        tel: colMap.tel >= 0 ? cols[colMap.tel] : '',
        poids: '',
        taille: '',
        sport: '',
        motif: '',
        metier: '',
        lat: 'Droitier',
        pratId: pwaUser?.pratId || '',
        bilans: [],
        bilanDataPosturo: {}
      };
      
      newPatients.push(patient);
      imported++;
    }
    
    if(newPatients.length > 0) {
      patients.push(...newPatients);
      savePatients();
      renderPatientList();
      alert('✅ Import réussi !\n' + imported + ' patient(s) importé(s)\n' + skipped + ' ignoré(s) (doublons ou lignes vides)');
    } else {
      alert('Aucun nouveau patient à importer.\n' + skipped + ' ligne(s) ignorée(s).');
    }
    
    // Reset input
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}


