// Prefix edits keep the heading's remaining text and inline formatting intact.
export const numberPrefix = /^\d+(?:\.\d+)*[.、]?\s+/
export function headingEdits(headings, enabled, scopePos = null) {
  const counters = [0, 0, 0, 0, 0, 0]
  return headings.map(({ level, text, pos }) => {
    const previous = text.match(numberPrefix)?.[0] || ''
    let prefix = ''
    if (enabled) {
      for (let i = 0; i < level - 1; i++) if (!counters[i]) counters[i] = 1
      counters[level - 1]++
      counters.fill(0, level)
      prefix = counters.slice(0, level).join('.') + ' '
    }
    return { from: pos + 1, to: pos + 1 + previous.length, prefix, changed: previous !== prefix }
  }).filter(edit => edit.changed && (scopePos === null || edit.from === scopePos + 1))
}
