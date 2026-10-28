"""Génère js/mannequin3d/mecanismes-data.js à partir de Mecanismes_lesionnels_VERTICY.md (document validé par le podologue)
et d'une table de conditions (seuils d'activation proposés, à calibrer)."""
import re, json
s = open('/root/outils/mannequin/Mecanismes_lesionnels_VERTICY.md', encoding='utf-8').read()
a = s.index('## 2. Table de RÈGLES'); b = s.index('## 3. Sources'); c = s.index('## 4. Dix phrases')
clean = lambda t: re.sub(r'\*\*([^*]+)\*\*', r'\1', t).strip()
def liste(t):
    t = clean(t)
    out, cur, depth = [], '', 0
    for ch in t:
        if ch in '(': depth += 1
        if ch in ')': depth -= 1
        if ch == ',' and depth == 0: out.append(cur.strip()); cur = ''
        else: cur += ch
    if cur.strip(): out.append(cur.strip())
    return [x for x in out if x and x != '—']
# --- conditions (curseur, opérateur, seuil) ; side=lat : évalué par côté ; sym=asymétrie |D-G|
# s = clé du seuil du cabinet (Paramètres → Seuils analyse posturale) qui remplace v quand elle existe
def Lat(base, op, v, s=None):
    d = {'base': base, 'op': op, 'v': v}
    if s: d['s'] = s
    return d
def Gl(cid, op, v, s=None):
    d = {'id': cid, 'op': op, 'v': v}
    if s: d['s'] = s
    return d
COND = {
 'R01': {'lat': [Lat('pied_valgus', '>=', 5, 'dos.calcaneen')]},
 'R02': {'lat': [Lat('pied_valgus', '<=', -5, 'dos.calcaneen')]},
 'R05': {'lat': [Lat('pied_ouverture', '>', 15)]},
 'R06': {'lat': [Lat('pied_ouverture', '<', -5)]},
 'R07': {'lat': [Lat('tibia_rot', '<=', -5)]},
 'R08': {'lat': [Lat('tibia_rot', '>=', 5)]},
 'R09': {'lat': [Lat('genou_valgus', '>=', 5, 'face.valgumVarum')]},
 'R10': {'lat': [Lat('genou_valgus', '<=', -5, 'face.valgumVarum')]},
 'R11': {'lat': [Lat('genou_flex', '<=', -5, 'neutralite.genou')]},
 'R12': {'lat': [Lat('genou_flex', '>=', 5, 'neutralite.genou')]},
 'R13': {'glob': [Gl('bassin_inegalite', 'abs>=', 10), Gl('bassin_inegalite', 'abs<', 20)]},
 'R14': {'glob': [Gl('bassin_inegalite', 'abs>=', 20)]},
 'R15': {'glob': [Gl('bassin_bascule', 'abs>=', 3, 'face.bassin')]},
 'R16': {'glob': [Gl('bassin_rot', 'abs>=', 5)]},
 'R17': {'glob': [Gl('bassin_antev', '>=', 3, 'neutralite.bassin')]},
 'R18': {'glob': [Gl('bassin_antev', '<=', -5, 'neutralite.bassin')]},
 'R19': {'glob': [Gl('tronc_lordose', '>=', 15)]},
 'R20': {'glob': [Gl('tronc_cyphose', '>=', 20)]},
 'R21': {'glob': [Gl('tronc_antero', '>=', 2)]},
 'R22': {'glob': [Gl('tete_antep', '>=', 3)]},
 'R23': {'glob': [Gl('tete_incl', 'abs>=', 3, 'face.tete')]},
 'R24': {'glob': [Gl('tete_rot', 'abs>=', 5, 'face.tete')]},
 'R25': {'glob': [Gl('tete_flex', 'abs>=', 8)]},
 'R26': {'sym': [{'base': 'epaule_elev', 'v': 3, 's': 'face.epaules'}]},
 'R27': {'lat': [Lat('epaule_antep', '>=', 8)]},
 'R28': {'glob': [Gl('ceinture_incl', 'abs>=', 3, 'face.epaules')]},
 'R29': {'glob': [Gl('ceinture_rot', 'abs>=', 5)]},
 'R30': {'sym': [{'base': 'bras_abd', 'v': 8}]},
 'R31': {'lat': [Lat('bras_rot', '<=', -10)]},
 'R32': {'sym': [{'base': 'coude_flex', 'v': 15}]},
 'R33': {'glob': [Gl('tronc_incl', 'abs>=', 3, 'face.lateralisation')]},
 'R34': {'glob': [Gl('tronc_rot', 'abs>=', 5)]},
 'R35': {'glob': [Gl('bassin_antev', '>=', 3, 'neutralite.bassin'), Gl('tronc_lordose', '>=', 10)]},
 'R36': {'glob': [Gl('tete_antep', '>=', 3), Gl('tronc_cyphose', '>=', 15)], 'any': [Lat('epaule_antep', '>=', 5)]},
 'R37': {'lat': [Lat('pied_valgus', '>=', 5, 'dos.calcaneen'), Lat('genou_valgus', '>=', 5, 'face.valgumVarum')], 'bascule': 'ipsi'},
 'R38': {'lat': [Lat('pied_valgus', '<=', -5, 'dos.calcaneen'), Lat('genou_valgus', '<=', -5, 'face.valgumVarum')]},
 'R39': {'sym': [{'base': 'cuisse_abd', 'v': 5}]},
 'R40': {'lat': [Lat('cuisse_rot', '<=', -10)]},
 'R41': {'lat': [Lat('cuisse_rot', '>=', 10)]},
 'R49': {'lat': [Lat('pied_valgus', '>=', 5, 'dos.calcaneen'), Lat('genou_valgus', '>=', 5, 'face.valgumVarum')], 'glob': [Gl('bassin_antev', '>=', 3, 'neutralite.bassin')]},
 'R50': {'anyGlob': [Gl('glob_chev', '>=', 3, 'neutralite.anteriorisation'), Gl('glob_gen', '>=', 3, 'neutralite.anteriorisation'), Gl('glob_bassin', '>=', 3, 'neutralite.anteriorisation')]},
 'R51': {'lat': [Lat('pied_valgus', '>=', 5, 'dos.calcaneen'), Lat('genou_valgus', '>=', 5, 'face.valgumVarum'), Lat('cuisse_rot', '<=', -5)], 'glob': [Gl('bassin_antev', '>=', 3, 'neutralite.bassin')]},
 'R43': {'lat': [Lat('pied_valgus', '>=', 5, 'dos.calcaneen')], 'glob': [Gl('bassin_antev', '>=', 3, 'neutralite.bassin')]},
}
rules = []
for r in [l for l in s[a:b].split('\n') if re.match(r'^\| R\d+', l)]:
    c_ = [x.strip() for x in r.strip().strip('|').split('|')]
    rid = c_[0]
    pre = clean(c_[7])
    nivs = []
    for t in re.findall(r'\b(CC|F|M|f)\b', pre):
        if t not in nivs: nivs.append(t)
    niveau = nivs[0] if nivs else 'CC'
    mh = re.search(r'H\s*:\s*([^;]*)', c_[5]); mi = re.search(r'I\s*:\s*(.*)', c_[5])
    rules.append({
        'id': rid, 'titre': clean(c_[1]), 'auto': rid in COND, 'cond': COND.get(rid),
        'asc': clean(c_[2]), 'desc': clean(c_[3]), 'patho': liste(c_[4]),
        'musclesH': liste(mh.group(1)) if mh else [], 'musclesI': liste(mi.group(1)) if mi else [],
        'tests': liste(c_[6]), 'preuve': pre, 'niveau': niveau, 'niveaux': nivs or ['CC'],
        'sources': [x.strip() for x in clean(c_[8]).split(',') if x.strip() and x.strip() != '—'],
    })
# --- sources
src = s[b:c]
srcs = {}
for m in re.finditer(r'\*\*(S\d+)\*\*\s*[—-]\s*(.+?)\n(?:\s*\n)?(?:URL[^\n]*?:\s*(\S+))?', src):
    pass
for blk in re.split(r'\n(?=\*\*S\d+\*\*)', src):
    m = re.match(r'\*\*(S\d+)\*\*\s*[—-]\s*(.+)', blk)
    if not m: continue
    body = blk.split('\n')
    ref = clean(m.group(2))
    url = re.search(r'https?://\S+', blk)
    st = re.search(r'Statut de vérification\s*:\s*\**([A-ZÉÈ ]+)\**', blk)
    srcs[m.group(1)] = {'ref': ref[:400], 'url': url.group(0).rstrip(').,') if url else '', 'statut': st.group(1).strip().title() if st else ''}
pr = s[c:]
phrases = [clean(re.sub(r'^\d+\.\s*', '', l)) for l in pr.split('\n') if re.match(r'^\d+\.\s', l)]
out = 'export const REGLES = ' + json.dumps(rules, ensure_ascii=False, indent=1) + ';\nexport const SOURCES = ' + json.dumps(srcs, ensure_ascii=False, indent=1) + ';\nexport const PRUDENCE = ' + json.dumps(phrases, ensure_ascii=False, indent=1) + ';\n'
head = "// Données générées depuis « Mecanismes_lesionnels_VERTICY.md » (document relu et validé par le podologue, 28/10/2026).\n// Les seuils d'activation (champ cond) sont des paramètres du logiciel, à calibrer par le praticien : ce ne sont pas des normes.\n// Ne pas éditer à la main : scripts/mannequin/gen_meca.py\n"
open('/root/projets/VERTICY/code/verticy-repo/js/mannequin3d/mecanismes-data.js', 'w', encoding='utf-8').write(head + out)
print(len(rules), sum(1 for r in rules if r['auto']), len(srcs), len(phrases))
print([ (k, v['statut']) for k, v in list(srcs.items())[:5]])
