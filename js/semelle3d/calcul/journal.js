// Journal d'audit (dès le lot 0) : entrées ajoutées seulement, jamais modifiées.
const ACTIONS = ['creation', 'modification', 'export', 'import', 'confirmation'];
export function ajouterJournal(journal, action, detail, dateISO) {
  if (!ACTIONS.includes(action)) throw new RangeError('journal : action inconnue');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(dateISO)) throw new RangeError('journal : date ISO attendue');
  return Object.freeze([...journal, Object.freeze({ date: dateISO, action, detail: String(detail) })]);
}
