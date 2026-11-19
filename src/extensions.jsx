import React, { useEffect, useState } from 'react'
import { Node, Extension, mergeAttributes, nodeInputRule } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import powershell from 'highlight.js/lib/languages/powershell'
import matlab from 'highlight.js/lib/languages/matlab'
import latex from 'highlight.js/lib/languages/latex'
import { Plugin } from '@tiptap/pm/state'
import katex from 'katex'
import { headingEdits, numberPrefix } from './numbering'

export function mathHTML(latex, displayMode = false) {
  return katex.renderToString(latex || '\\square', { displayMode, throwOnError: false, trust: false, strict: 'ignore' })
}
function MathView({ node, getPos, editor }) {
  const edit = () => {
    if (editor.isEditable) window.dispatchEvent(new CustomEvent('edit-formula', { detail: { latex: node.attrs.latex, display: node.type.name === 'blockMath', pos: getPos() } }))
  }
  return <NodeViewWrapper as={node.type.name === 'blockMath' ? 'div' : 'span'} className={`math-node ${node.type.name}`} onDoubleClick={edit} title="双击编辑公式" contentEditable={false}><span dangerouslySetInnerHTML={{ __html: mathHTML(node.attrs.latex, node.type.name === 'blockMath') }}/></NodeViewWrapper>
}
function mathNode(block) {
  const name = block ? 'blockMath' : 'inlineMath'
  return Node.create({
    name, group: block ? 'block' : 'inline', inline: !block, atom: true,
    addAttributes: () => ({ latex: { default: '' } }),
    parseHTML: () => [{ tag: `${block ? 'div' : 'span'}[data-math]`, getAttrs: el => ({ latex: el.getAttribute('data-latex') }) }],
    renderHTML: ({ node, HTMLAttributes }) => [block ? 'div' : 'span', mergeAttributes(HTMLAttributes, { 'data-math': name, 'data-latex': node.attrs.latex }), node.attrs.latex],
    addNodeView: () => ReactNodeViewRenderer(MathView),
    markdownTokenizer: {
      name, level: block ? 'block' : 'inline',
      start: src => src.indexOf(block ? '$$' : '$'),
      tokenize(src) {
        const match = (block ? /^\$\$[ \t]*\n?([\s\S]*?)\$\$(?:[ \t]*\n|$)/ : /^\$(?!\$)((?:\\.|[^$\n\\])+)\$(?!\$)/).exec(src)
        if (match) return { type: name, raw: match[0], latex: match[1].trim() }
      },
    },
    parseMarkdown: token => ({ type: name, attrs: { latex: token.latex } }),
    renderMarkdown: node => block ? `$$\n${node.attrs.latex}\n$$` : `$${node.attrs.latex}$`,
    addInputRules() {
      return block ? [] : [nodeInputRule({ find: /\$([^$\n]+)\$$/, type: this.type, getAttributes: match => ({ latex: match[1] }) })]
    },
  })
}
export const InlineMath = mathNode(false)
export const BlockMath = mathNode(true)

const lowlight = createLowlight(common)
lowlight.register({ powershell, matlab, latex })
const languages = [['plaintext', '纯文本'], ['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['java', 'Java'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'], ['go', 'Go'], ['rust', 'Rust'], ['sql', 'SQL'], ['bash', 'Shell / Bash'], ['powershell', 'PowerShell'], ['json', 'JSON'], ['xml', 'HTML / XML'], ['css', 'CSS'], ['yaml', 'YAML'], ['markdown', 'Markdown'], ['r', 'R'], ['matlab', 'MATLAB'], ['latex', 'LaTeX']]
function CodeView({ node, editor, updateAttributes }) {
  const [collapsed, setCollapsed] = useState(false)
  const [editable, setEditable] = useState(editor.isEditable)
  useEffect(() => {
    const update = () => setEditable(editor.isEditable)
    editor.on('update', update); update()
    return () => editor.off('update', update)
  }, [editor])
  const originalLanguage = node.attrs.language || 'plaintext'
  const language = ({ py:'python', js:'javascript', ts:'typescript', html:'xml', sh:'bash', ps1:'powershell', tex:'latex', yml:'yaml', 'c++':'cpp', cs:'csharp', text:'plaintext', txt:'plaintext' })[originalLanguage] || originalLanguage
  return <NodeViewWrapper className={`code-wrapper ${collapsed ? 'is-collapsed' : ''}`}><div className="code-header" contentEditable={false}><select aria-label="代码语言" value={language} disabled={!editable} onChange={e => { if (editor.isEditable) updateAttributes({ language: e.target.value }) }}>{!languages.some(([value]) => value === language) && <option value={language}>{language}</option>}{languages.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? '展开代码' : '折叠代码'}>{collapsed ? '▸ 展开' : '▾ 折叠'} · {node.textContent.split('\n').length} 行</button></div><pre><NodeViewContent as="code" className={`language-${originalLanguage}`}/></pre>{collapsed && <div className="code-folded" contentEditable={false} onClick={() => setCollapsed(false)}>代码已折叠 · 点击展开</div>}</NodeViewWrapper>
}
export const FoldingCode = CodeBlockLowlight.extend({ addNodeView: () => ReactNodeViewRenderer(CodeView) }).configure({ lowlight, defaultLanguage: 'plaintext', enableTabIndentation: true, tabSize: 2 })

function numberTransaction(state, enabled, scopePos = null) {
  const headings = []
  state.doc.descendants((node, pos) => { if (node.type.name === 'heading') headings.push({ level: node.attrs.level, text: node.textContent, pos }) })
  const edits = headingEdits(headings, enabled, scopePos)
  if (!edits.length) return null
  const tr = state.tr
  for (const edit of edits.reverse()) tr.insertText(edit.prefix, edit.from, edit.to)
  return tr
}
export const HeadingNumbering = Extension.create({
  name: 'headingNumbering',
  addStorage: () => ({ enabled: false }),
  addCommands() {
    return { setHeadingNumbering: enabled => ({ state, dispatch }) => {
      const tr = numberTransaction(state, enabled)
      if (dispatch) { this.storage.enabled = enabled; dispatch(tr || state.tr) }
      return true
    }, setCurrentHeadingNumbering: enabled => ({ state, dispatch }) => {
      const { $from, $to } = state.selection
      if ($from.parent.type.name !== 'heading' || !$from.sameParent($to)) return false
      const tr = numberTransaction(state, enabled, $from.before())
      // Single-heading edits must not trigger a global renumbering pass.
      if (dispatch) { this.storage.enabled = false; dispatch(tr || state.tr) }
      return true
    } }
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (transactions, oldState, state) => {
      if (this.storage.enabled && transactions.some(tr => tr.docChanged)) return numberTransaction(state, true)
    } })]
  },
})

export const ContextNumbering = Extension.create({
  name: 'contextNumbering',
  priority: 1100,
  addCommands() {
    return { smartNumbering: (remove = false) => ({editor,state,commands}) => {
      if(!editor.isEditable)return false
      const {$from,$to,from,to}=state.selection
      if($from.parent.type.name==='heading'&&$from.sameParent($to)) {
        return commands.setCurrentHeadingNumbering(remove?false:!numberPrefix.test($from.parent.textContent))
      }
      // Do not turn a mixed selection containing headings or a code block into a list.
      let unsupported=$from.parent.type.name!=='paragraph'
      state.doc.nodesBetween(from,to,node=>{if(node.type.name==='heading'||node.type.name==='codeBlock')unsupported=true})
      if(unsupported)return false
      if(remove&&!editor.isActive('orderedList'))return true
      return commands.toggleOrderedList()
    } }
  },
  addKeyboardShortcuts() {return {'Mod-Shift-7':()=>{this.editor.commands.smartNumbering();return true}}}
})
