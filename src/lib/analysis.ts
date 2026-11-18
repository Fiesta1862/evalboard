/** Win probability from white-pov centipawn eval, via logistic curve. */
export function evalToPercent(cp: number): number {
  return 1 / (1 + 10 ** (-cp / 400))
}

/** Human-readable eval string, e.g. +1.2, -0.4, #5. */
export function formatEval(cp: number): string {
  if (Math.abs(cp) >= 10000) return cp > 0 ? '#' : '-#'
  const pawns = cp / 100
  return (pawns >= 0 ? '+' : '') + pawns.toFixed(1)
}

export type Mark = '' | '?!' | '?' | '??'

/** Classify a move by how much it drops the eval from the mover's perspective. */
export function markFor(evalDrop: number): Mark {
  if (evalDrop >= 300) return '??'
  if (evalDrop >= 120) return '?'
  if (evalDrop >= 50) return '?!'
  return ''
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
