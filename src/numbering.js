// Prefix edits keep the heading's remaining text and inline formatting intact.
export const numberPrefix = /^\d+(?:\.\d+)*[.、]?\s+/
export function headingEdits(headings, enabled, scopePos = null) {
  if (scopePos !== null && !headings.some(h => h.pos === scopePos)) return []
  const counters = [0, 0, 0, 0, 0, 0]
  const ancestors = [null, null, null, null, null, null]
  return headings.map(({ level, text, pos }) => {
    const previous = text.match(numberPrefix)?.[0] || ''
    // A single operation changes membership only for the chosen heading.
    // null means maintain the existing numbered set after an edit/reorder.
    const numbered = scopePos === pos ? enabled : scopePos !== null || enabled === null ? !!previous : enabled
    counters.fill(0, level)
    ancestors.fill(null, level - 1)
    let prefix = ''
    if (numbered) {
      counters[level - 1]++
      ancestors[level - 1] = counters[level - 1]
      prefix = ancestors.slice(0, level).filter(n => n !== null).join('.') + ' '
    }
    return { from: pos + 1, to: pos + 1 + previous.length, prefix, changed: previous !== prefix }
  }).filter(edit => edit.changed)
}
