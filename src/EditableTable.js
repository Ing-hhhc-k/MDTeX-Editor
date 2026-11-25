import { Table } from '@tiptap/extension-table'
import { DOMSerializer } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import { toggleHeader } from '@tiptap/pm/tables'

function removeTable(editor, backwards) {
  if (!editor.isEditable) return false
  const { selection, doc } = editor.state
  const { $from, empty } = selection
  if (selection instanceof NodeSelection && selection.node.type.name === 'table') {
    return editor.commands.deleteSelection()
  }
  if (!empty) return false // Preserve cell selection clearing and normal text deletion.

  let table, pos
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === 'table') {
      table = $from.node(depth); pos = $from.before(depth); break
    }
  }
  if (table) {
    let hasContent = false
    table.descendants(node => { if (node.isText || node.isLeaf) hasContent = true })
    if (!hasContent) return editor.commands.deleteTable()
    // At the outer edge, select first; a second press explicitly deletes contents.
    if (backwards ? selection.from !== pos + 4 : selection.from !== pos + table.nodeSize - 4) return false
  } else {
    if (!$from.parent.isTextblock || (backwards ? $from.parentOffset !== 0 : $from.parentOffset !== $from.parent.content.size)) return false
    const boundary = backwards ? $from.before() : $from.after()
    const adjacent = doc.resolve(boundary)
    table = backwards ? adjacent.nodeBefore : adjacent.nodeAfter
    if (table?.type.name !== 'table') return false
    pos = backwards ? boundary - table.nodeSize : boundary
  }
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(doc, pos)).scrollIntoView())
  return true
}

export function createEditableTable() {
 let schema
 return Table.extend({
  onBeforeCreate() { schema = this.editor.schema },
  markdownTokenizer: {
    ...Table.config.markdownTokenizer,
    start(src) {
      const match = /(?:^|\n) {0,3}<table\b/i.exec(src)
      const html = match ? match.index + (match[0].startsWith('\n') ? 1 : 0) : -1
      const pipe = Table.config.markdownTokenizer.start(src)
      return html < 0 ? pipe : pipe < 0 ? html : Math.min(html, pipe)
    },
    tokenize(src, tokens, helpers) {
      if (/^ {0,3}<table\b/i.test(src)) {
        // Marked's generic HTML block ends at a blank line, including blank
        // lines inside <pre>. Consume the complete table before HTML parsing.
        let depth = 0
        for (const tag of src.matchAll(/<!--[\s\S]*?-->|<\/?table\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
          if (tag[0].startsWith('<!--')) continue
          depth += /^<\//.test(tag[0]) ? -1 : 1
          if (depth === 0) {
            const raw = src.slice(0, tag.index + tag[0].length)
            return { type: 'html', raw, text: raw, block: true }
          }
        }
      }
      return Table.config.markdownTokenizer.tokenize(src, tokens, helpers)
    },
  },
  addCommands() {
    return { ...this.parent(), toggleHeaderRow:()=>({state,dispatch})=>toggleHeader('row')(state,dispatch),toggleHeaderColumn:()=>({state,dispatch})=>toggleHeader('column')(state,dispatch), selectWholeTable: () => ({ state, dispatch }) => {
      const { $from } = state.selection
      for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type.name !== 'table') continue
        if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $from.before(depth))))
        return true
      }
      return false
    } }
  },
  addKeyboardShortcuts() {
    const parent = this.parent?.() || {}
    return {
      ...parent,
      Backspace: () => removeTable(this.editor, true) || parent.Backspace?.({ editor: this.editor }),
      Delete: () => removeTable(this.editor, false) || parent.Delete?.({ editor: this.editor }),
    }
  },
  renderMarkdown(node, helpers) {
    // GFM requires a header row. HTML is valid Markdown and preserves tables
    // without headers, without injecting a synthetic blank row on every reload.
    const standardHeader = node.content?.[0]?.content?.every(cell => cell.type === 'tableHeader')
      && node.content.slice(1).every(row => row.content.every(cell => cell.type === 'tableCell'))
    const simpleCells = node.content?.every(row => row.content.every(cell => cell.content?.length === 1 && cell.content[0].type === 'paragraph' && !cell.content[0].attrs?.textAlign))
    if (standardHeader && simpleCells) return this.parent(node, helpers)
    const dom = DOMSerializer.fromSchema(schema).serializeNode(schema.nodeFromJSON(node))
    // Numeric entities keep code blank lines inside a single HTML block in
    // other Markdown readers too, while DOM parsing restores the exact text.
    return dom.outerHTML.replace(/\r/g, '&#13;').replace(/\n/g, '&#10;')
  },
}).configure({ resizable: true, allowTableNodeSelection: true })

}
