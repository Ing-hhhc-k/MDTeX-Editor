import { NodeSelection, TextSelection } from '@tiptap/pm/state'

const marker = '\uE000MDTEXCURSOR\uE001'
const clamp = (n, max) => Math.max(0, Math.min(n, max))

function sourceProbe(editor, source, offset, base) {
  const json = editor.markdown.parse(source.slice(0,offset) + marker + source.slice(offset))
  let result = null
  function visit(node, pos = -1) {
    if (node.text?.includes(marker)) {
      result = { pos: pos + node.text.indexOf(marker), node: false }
      node.text = node.text.replace(marker, '')
    }
    for (const [key,value] of Object.entries(node.attrs || {})) if (typeof value === 'string' && value.includes(marker)) {
      result = { pos: node.type === 'codeBlock' ? pos + 1 : pos, node: !['codeBlock','paragraph','heading'].includes(node.type) }
      node.attrs[key] = value.replace(marker, '')
    }
    for (const mark of node.marks || []) for (const [key,value] of Object.entries(mark.attrs || {})) if (typeof value === 'string' && value.includes(marker)) {
      result={pos,node:false};mark.attrs[key]=value.replace(marker,'')
    }
    let childPos = pos + 1
    if (node.content) node.content = node.content.filter(child => {
      const size = child.text?.length ?? editor.schema.nodeFromJSON(child).nodeSize
      visit(child, childPos); childPos += size
      return child.type !== 'text' || child.text.length > 0
    })
  }
  visit(json)
  if (!result) return null
  try { return editor.schema.nodeFromJSON(json).eq(base) ? result : null } catch { return null }
}

export function sourceToEditor(editor, source, offset, base = editor.schema.nodeFromJSON(editor.markdown.parse(source))) {
  offset = clamp(offset, source.length)
  const attempts = [offset]
  for (let i=1;i<=8;i++) attempts.push(offset+i,offset-i)
  const end = source.indexOf('\n', offset), start = source.lastIndexOf('\n', offset-1)+1
  attempts.push(end < 0 ? source.length : end, start, source.indexOf('>',offset)+1)
  for (const at of [...new Set(attempts)]) {
    if (at < 0 || at > source.length) continue
    const result = sourceProbe(editor,source,at,base)
    if (result) return result
  }
  // Delimiter-only lines have no text position of their own.
  return { pos: clamp(Math.round(offset / Math.max(1,source.length) * base.content.size),base.content.size), node:false }
}

export function editorToSource(editor, source, position, bias = 1) {
  const doc = editor.state.doc, pos = clamp(position,doc.content.size), $pos = doc.resolve(pos)
  let marked
  if ($pos.parent.isTextblock) {
    const adjacent=bias<0?$pos.nodeBefore:$pos.nodeAfter
    marked=editor.state.tr.insert(pos,editor.schema.text(marker,adjacent?.isText?adjacent.marks:$pos.marks())).doc
  }
  else {
    const after = $pos.nodeAfter, before = $pos.nodeBefore
    const atom = after?.attrs.latex !== undefined ? {node:after,pos,end:false} : before?.attrs.latex !== undefined ? {node:before,pos:pos-before.nodeSize,end:true} : null
    if (atom) marked = editor.state.tr.setNodeMarkup(atom.pos,null,{...atom.node.attrs,latex:atom.end ? atom.node.attrs.latex+marker : marker+atom.node.attrs.latex}).doc
    else {
      const near = TextSelection.between($pos,$pos).from
      if (doc.resolve(near).parent.isTextblock) marked = editor.state.tr.insertText(marker,near).doc
    }
  }
  if (!marked) return pos === 0 ? 0 : source.length
  const serialized = editor.markdown.serialize(marked.toJSON()), at = serialized.indexOf(marker)
  if (at < 0) return 0
  const canonical = serialized.replaceAll(marker,'')
  if (canonical === source) return at
  // Keep the user's original Markdown spelling and spacing. Find the equivalent
  // document position in that source instead of rewriting it just to move focus.
  const canonicalBase = editor.schema.nodeFromJSON(editor.markdown.parse(canonical))
  const target = sourceToEditor(editor,canonical,at,canonicalBase).pos
  const base = editor.schema.nodeFromJSON(editor.markdown.parse(source))
  let lo=0, hi=source.length
  while (lo < hi) {
    const mid = Math.floor((lo+hi)/2)
    if (sourceToEditor(editor,source,mid,base).pos < target) lo=mid+1
    else hi=mid
  }
  return lo
}

export function setEditorSelection(editor, from, to = from) {
  const doc=editor.state.doc, a=clamp(from.pos,doc.content.size), b=clamp(to.pos,doc.content.size)
  const selection=from.node && a===b && doc.nodeAt(a)?.isAtom ? NodeSelection.create(doc,a) : TextSelection.between(doc.resolve(a),doc.resolve(b))
  editor.view.dispatch(editor.state.tr.setSelection(selection))
}

export function revealSource(textarea, from, to = from, direction = 'none') {
  textarea.focus({preventScroll:true}); textarea.setSelectionRange(from,to,direction)
  const style=getComputedStyle(textarea), mirror=document.createElement('div'), caret=document.createElement('span')
  for (const key of ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','wordSpacing','paddingTop','paddingBottom','paddingLeft','paddingRight','tabSize','textIndent']) mirror.style[key]=style[key]
  Object.assign(mirror.style,{position:'fixed',left:'-100000px',top:'0',width:textarea.clientWidth+'px',boxSizing:'border-box',whiteSpace:'pre-wrap',overflowWrap:'break-word',border:'0'})
  mirror.textContent=textarea.value.slice(0,from);caret.textContent='\u200b';mirror.append(caret);document.body.append(mirror)
  textarea.scrollTop=Math.max(0,caret.getBoundingClientRect().top-mirror.getBoundingClientRect().top-textarea.clientHeight*.35)
  mirror.remove()
}
