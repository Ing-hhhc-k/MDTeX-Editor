import { useLayoutEffect, useState } from 'react'

// Measure logical line starts in the editor's actual layout. Syntax highlighting,
// table widths and soft wraps stay entirely inside the editable code content.
export default function useCodeLineTops({ editor, getPos, text, bodyRef, collapsed }) {
  const [tops, setTops] = useState([])
  useLayoutEffect(() => {
    const body = bodyRef.current, code = body?.querySelector('code')
    if (!code || collapsed) return
    let frame = 0, disposed = false
    const measure = () => {
      frame = 0
      if (disposed || editor.isDestroyed || !code.getClientRects().length || !code.offsetWidth) return
      const pos = getPos(), current = typeof pos === 'number' && editor.state.doc.nodeAt(pos)
      if (!current || current.type.name !== 'codeBlock' || current.textContent !== text) return
      const zoom = parseFloat(getComputedStyle(body.closest('.paper') || body).zoom) || 1
      const firstTop = editor.view.coordsAtPos(pos + 1).top
      const starts = [0, ...Array.from(text.matchAll(/\r\n|\r|\n/g), match => match.index + match[0].length)]
      const next = starts.map(offset => (editor.view.coordsAtPos(pos + 1 + offset).top - firstTop) / zoom)
      setTops(previous => previous.length === next.length && previous.every((top,i) => Math.abs(top - next[i]) < 0.1) ? previous : next)
    }
    const schedule = () => {
      if (disposed) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(body); resize.observe(code)
    const mutation = new MutationObserver(schedule)
    mutation.observe(code, { childList: true, characterData: true, subtree: true })
    document.fonts?.ready.then(schedule)
    document.fonts?.addEventListener('loadingdone', schedule)
    schedule()
    return () => { disposed = true; cancelAnimationFrame(frame); resize.disconnect(); mutation.disconnect(); document.fonts?.removeEventListener('loadingdone', schedule) }
  }, [editor, getPos, text, bodyRef, collapsed])
  return tops
}
