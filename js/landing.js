// ─── Vues de la landing : « accueil » (titre + 2 pancartes) / « praticien » (connexion, offres, essai) ───
// Les formulaires restent dans la page ; seule la visibilité change (classe sur #pwa-login).
function lpVue(vue, opts) {
  var racine = document.getElementById('pwa-login');
  if (!racine) return;
  // 'fonction' = pages de description des fonctionnalités (même univers que la vue praticien).
  var prat = vue === 'praticien' || vue === 'fonction';
  racine.classList.toggle('lp-accueil', !prat);
  racine.classList.toggle('lp-praticien', prat);
  racine.classList.toggle('lp-fonction', vue === 'fonction');
  var menu = document.getElementById('lpf-menu');
  if (menu) menu.classList.remove('ouvert');
  var defil = racine.querySelector('.lp-defil');
  if (defil) defil.scrollTop = 0;
  // Sur grand écran le formulaire de connexion est déjà dans l'en-tête de la page : on reste en haut
  // (sinon le titre se retrouve coupé sous la barre). Sur téléphone il est plus bas : on y descend.
  var versFormulaire = opts && opts.scroll === 'pwa-login-form' && window.innerWidth > 1040;
  if (opts && opts.scroll && !versFormulaire) {
    var cible = document.getElementById(opts.scroll);
    if (cible) setTimeout(function () { cible.scrollIntoView({ behavior: 'smooth' }); }, 50);
  }
}
function lpScroller(id) { var c = document.getElementById(id); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function lpAllerTarifs() { lpVue('praticien', { scroll: 'lp-pricing-section' }); }
// ─── Confort de connexion : « Se souvenir de moi » (adresse e-mail SEULEMENT) et œil du mot de passe ───
// Jamais de mot de passe stocké par Verticy : c'est le gestionnaire de mots de passe du navigateur qui s'en charge.
var LP_CLE_EMAIL = 'verticy_email_memorise';
function lpRestaurerEmail() {
  var champ = document.getElementById('pwa-email');
  var case_ = document.getElementById('pwa-remember-cb');
  var mem = '';
  try { mem = localStorage.getItem(LP_CLE_EMAIL) || ''; } catch (_e) { mem = ''; }
  if (case_) case_.checked = !!mem;
  if (champ && mem && !champ.value) champ.value = mem;
}
function lpMemoriserEmail(email) {
  var case_ = document.getElementById('pwa-remember-cb');
  try {
    if (case_ && case_.checked && email) localStorage.setItem(LP_CLE_EMAIL, String(email).trim());
    else localStorage.removeItem(LP_CLE_EMAIL);
  } catch (_e) { /* stockage indisponible : on ne mémorise simplement pas */ }
}
var LP_OEIL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
var LP_OEIL_BARRE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 8 10 8a18 18 0 0 1-2.16 3.19M6.61 6.61A13.5 13.5 0 0 0 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.39-1.61M2 2l20 20"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';
function lpInstallerOeil(idChamp) {
  var champ = document.getElementById(idChamp);
  if (!champ || champ.getAttribute('data-oeil')) return;
  var zone = champ.parentNode;
  if (!zone) return;
  champ.setAttribute('data-oeil', '1');
  zone.style.position = 'relative';
  champ.style.paddingRight = '46px';
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'lp-oeil';
  b.setAttribute('aria-label', 'Afficher le mot de passe');
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = LP_OEIL;
  b.onclick = function () {
    var visible = champ.type === 'password';
    champ.type = visible ? 'text' : 'password';
    b.innerHTML = visible ? LP_OEIL_BARRE : LP_OEIL;
    b.setAttribute('aria-pressed', visible ? 'true' : 'false');
    b.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  };
  zone.appendChild(b);
}
['pwa-pwd', 'reg-pwd', 'reset-pwd-new', 'reset-pwd-confirm'].forEach(lpInstallerOeil);
lpRestaurerEmail();
// Ouverture : accueil, sauf retour d'un lien de réinitialisation du mot de passe, verrouillage
// par inactivité ou retour vers les tarifs (le praticien doit alors voir sa page).
(function () {
  var hash = window.location.hash || '';
  var praticien = hash.indexOf('type=recovery') !== -1
    || sessionStorage.getItem('locked_by_idle') === '1'
    || !!sessionStorage.getItem('scroll_tarifs');
  lpVue(praticien ? 'praticien' : 'accueil');
})();
function showRegisterForm() {
  lpVue('praticien');
  document.getElementById('pwa-register-form').style.display = 'block';
  document.getElementById('pwa-login-form').style.display = 'none';
  document.getElementById('pwa-register-form').scrollIntoView({behavior:'smooth'});
}
function showLoginForm() {
  lpVue('praticien');
  document.getElementById('pwa-login-form').style.display = 'block';
  document.getElementById('pwa-register-form').style.display = 'none';
  document.getElementById('pwa-login-form').scrollIntoView({behavior:'smooth'});
}
async function pwaRegister() {
  const nom = document.getElementById('reg-nom').value.trim();
  const prenom = document.getElementById('reg-prenom').value.trim();
  const titre = document.getElementById('reg-titre').value;
  const cabinet = document.getElementById('reg-cabinet').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pwd = document.getElementById('reg-pwd').value;
  const errEl = document.getElementById('reg-err');
  const okEl = document.getElementById('reg-ok');
  const btn = document.getElementById('reg-btn');
  errEl.style.display = 'none';
  okEl.style.display = 'none';
  if(!nom || !prenom || !titre || !email || !pwd) {
    errEl.textContent = 'Veuillez remplir tous les champs obligatoires.';
    errEl.style.display = 'block'; return;
  }
  if(pwd.length < 8) {
    errEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères.';
    errEl.style.display = 'block'; return;
  }
  btn.disabled = true; btn.textContent = 'Création en cours...';
  try {
    const data = await supa.signUp(email, pwd, { nom, prenom, titre, cabinet });
    if(data.id || data.user?.id) {
      okEl.textContent = 'Compte créé ! Vérifiez votre email pour confirmer votre inscription.';
      okEl.style.display = 'block';
      btn.textContent = 'Email envoyé !';
    } else {
      errEl.textContent = data.msg || data.error_description || 'Erreur lors de la création du compte.';
      errEl.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Créer mon compte';
    }
  } catch(e) {
    errEl.textContent = 'Erreur de connexion. Vérifiez votre connexion internet.';
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Créer mon compte';
  }
}
var lpAnnual = false;
var lpPrices = [{m:30,a:25},{m:40,a:33},{m:50,a:42},{m:60,a:50},{m:70,a:58}];
function lpToggle() {
  lpAnnual = !lpAnnual;
  var tog = document.getElementById('lp-tog');
  var lm = document.getElementById('lbl-m');
  var la = document.getElementById('lbl-a');
  var sv = document.getElementById('lp-save');
  if(lpAnnual) { tog.classList.add('ann'); lm.classList.remove('on'); la.classList.add('on'); sv.style.display='inline-block'; }
  else { tog.classList.remove('ann'); lm.classList.add('on'); la.classList.remove('on'); sv.style.display='none'; }
  // La mention d'engagement suit le choix : le mensuel est sans engagement, l'annuel engage pour 12 mois.
  var eng = document.getElementById('lp-engagement');
  if(eng) eng.textContent = lpAnnual ? 'Annuel : engagement de 12 mois' : 'Mensuel : sans engagement, résiliez à tout moment';
  lpPrices.forEach(function(p,i) {
    var el = document.getElementById('lpp'+(i+1));
    if(el) el.textContent = lpAnnual ? p.a : p.m;
  });
}

var _modules = [
  {id:'postural', name:'Postural', icon:'🧍', desc:'Bilan postural complet'},
  {id:'podopedia', name:'Podopédia', icon:'🦶', desc:'Bilan podologique'},
  {id:'podo_sport', name:'Podo Sport', icon:'⚡', desc:'Analyse sportive'}
];
var _plans = [
  {name:'Essentiel', idx:0, fixed:[], choose:1, pool:['postural','podopedia']},
  {name:'Sport', idx:1, fixed:['podo_sport'], choose:0, pool:[]},
  {name:'Duo', idx:2, fixed:[], choose:2, pool:['postural','podopedia']},
  {name:'Duo Sport', idx:3, fixed:['podo_sport'], choose:1, pool:['postural','podopedia']},
  {name:'Intégral', idx:4, fixed:['postural','podopedia','podo_sport'], choose:0, pool:[]}
];
var _currentPlanIdx = 0;
var _selectedModules = [];

function choisirOffre(planIdx) {
  var plan = _plans[planIdx];
  _currentPlanIdx = planIdx;
  if(plan.choose === 0) {
    _lancerPaiementLP(planIdx, plan.fixed);
    return;
  }
  _selectedModules = plan.fixed.slice();
  var modal = document.getElementById('modal-modules-lp');
  if(!modal) { _lancerPaiementLP(planIdx, plan.fixed); return; }
  document.getElementById('mm-title-lp').textContent = 'Offre ' + plan.name;
  document.getElementById('mm-sub-lp').textContent = plan.choose === 1 ? 'Choisissez 1 module' : 'Choisissez ' + plan.choose + ' modules';
  var container = document.getElementById('mm-modules-lp');
  container.innerHTML = '';
  plan.fixed.forEach(function(fid) {
    var mod = _modules.find(function(m){ return m.id === fid; });
    if(!mod) return;
    var div = document.createElement('div');
    div.className = 'mm-mod mm-fixed';
    div.innerHTML = mod.icon + ' <strong>' + mod.name + '</strong> <span style="color:#2dd4bf;font-size:11px;">inclus</span>';
    container.appendChild(div);
  });
  plan.pool.forEach(function(pid) {
    var mod = _modules.find(function(m){ return m.id === pid; });
    if(!mod) return;
    var div = document.createElement('div');
    div.className = 'mm-mod mm-choice';
    div.dataset.id = pid;
    div.innerHTML = mod.icon + ' <strong>' + mod.name + '</strong><div style="font-size:11px;color:rgba(255,255,255,0.5);">' + mod.desc + '</div>';
    div.onclick = (function(pid2, div2) {
      return function() { _toggleModuleLP(pid2, plan.choose, div2); };
    })(pid, div);
    container.appendChild(div);
  });
  _updateOkBtnLP(plan.choose);
  modal.style.display = 'flex';
}

function _toggleModuleLP(id, maxChoose, div) {
  var plan = _plans[_currentPlanIdx];
  var idx = _selectedModules.indexOf(id);
  var choosable = _selectedModules.filter(function(m){ return plan.fixed.indexOf(m)===-1; });
  if(idx !== -1) {
    _selectedModules.splice(idx,1);
    div.classList.remove('mm-selected');
  } else {
    if(choosable.length >= maxChoose) return;
    _selectedModules.push(id);
    div.classList.add('mm-selected');
  }
  _updateOkBtnLP(maxChoose);
}

function _updateOkBtnLP(maxChoose) {
  var plan = _plans[_currentPlanIdx];
  var choosable = _selectedModules.filter(function(m){ return plan.fixed.indexOf(m)===-1; });
  var btn = document.getElementById('mm-btn-ok-lp');
  if(btn) { btn.disabled = choosable.length !== maxChoose; btn.style.opacity = btn.disabled ? '0.4' : '1'; }
}

function confirmerModulesLP() {
  document.getElementById('modal-modules-lp').style.display = 'none';
  _lancerPaiementLP(_currentPlanIdx, _selectedModules);
}

function _lancerPaiementLP(planIdx, modules) {
  var mensuel = [
    'https://buy.stripe.com/bJeeVebOC4IQdjJ4WTfAc01',
    'https://buy.stripe.com/eVq14o9GufnubbBfBxfAc03',
    'https://buy.stripe.com/fZueVe8Cq1wEa7x751fAc05',
    'https://buy.stripe.com/3cIcN67ym6QYa7x1KHfAc07',
    'https://buy.stripe.com/4gM6oIbOCcbifrR1KHfAc09'
  ];
  var annuel = [
    'https://buy.stripe.com/4gMcN6dWK3EMgvV1KHfAc0l',
    'https://buy.stripe.com/8x24gAcSG6QY3J91KHfAc0m',
    'https://buy.stripe.com/3cIaEYaKycbi3J90GDfAc0n',
    'https://buy.stripe.com/aFaeVeg4SfnucfFgFBfAc0o',
    'https://buy.stripe.com/9B68wQdWK2AI2F5extfAc0p'
  ];
  var url = lpAnnual ? annuel[planIdx] : mensuel[planIdx];
  window.location.href = url;
}
