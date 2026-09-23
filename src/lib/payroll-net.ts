// Calcul du net d'une fiche de paie côté client, ALIGNÉ sur le trigger SQL
// public.recompute_payroll_net (migration 00036). Source unique de vérité des
// signes ; l'affichage ne doit jamais diverger du net stocké en base.

export interface PayrollLineLike {
  line_type: string;
  amount_chf: number | null;
  amount_state: string;
}

// Lignes qui RÉDUISENT le net (mêmes types que le CASE du trigger SQL).
const DEDUCTION_TYPES = new Set(['sans_solde', 'retard', 'amende_parc', 'cotisation']);

/**
 * Net = salaire_base + heures_sup + piquet + ajouts − sans_solde − retard − amende_parc − cotisations.
 * Retourne null tant qu'une ligne est « à configurer » : un net partiel n'est jamais présenté comme complet.
 */
export function computeNet(lines: PayrollLineLike[]): number | null {
  if (lines.some((l) => l.amount_state === 'requires_rule')) return null;
  return lines.reduce((sum, l) => {
    const amount = Number(l.amount_chf ?? 0);
    return sum + (DEDUCTION_TYPES.has(l.line_type) ? -amount : amount);
  }, 0);
}
