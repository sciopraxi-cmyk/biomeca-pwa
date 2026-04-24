function showRegisterForm() {
  document.getElementById('pwa-register-form').style.display = 'block';
  document.getElementById('pwa-login-form').style.display = 'none';
  document.getElementById('pwa-register-form').scrollIntoView({behavior:'smooth'});
}
function showLoginForm() {
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
