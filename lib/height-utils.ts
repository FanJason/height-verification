export function parseHeightToInches(text: string): number | null {
  const cleaned = text.trim().replace(/"/g, '').replace(/\s+/g, ' ')

  // 5'11 or 5' 11 or 5-11
  const feetInches = cleaned.match(/(\d)['\s-](\d{1,2})/)
  if (feetInches) {
    const ft = parseInt(feetInches[1])
    const inches = parseInt(feetInches[2])
    if (ft >= 4 && ft <= 7 && inches >= 0 && inches <= 11) return ft * 12 + inches
  }

  // 511 → 5'11
  const compact = cleaned.match(/^(\d)(\d{2})$/)
  if (compact) {
    const ft = parseInt(compact[1])
    const inches = parseInt(compact[2])
    if (ft >= 4 && ft <= 7 && inches >= 0 && inches <= 11) return ft * 12 + inches
  }

  return null
}

export function inchesToDisplay(inches: number): string {
  const ft = Math.floor(inches / 12)
  const inch = inches % 12
  return `${ft}'${inch}"`
}

export function heightsMatch(a: number, b: number, toleranceInches = 0): boolean {
  return Math.abs(a - b) <= toleranceInches
}
