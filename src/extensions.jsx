import React, { useEffect, useRef, useState } from 'react'
import { Node, Extension, InputRule, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import powershell from 'highlight.js/lib/languages/powershell'
import matlab from 'highlight.js/lib/languages/matlab'
import latex from 'highlight.js/lib/languages/latex'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { OrderedList } from '@tiptap/extension-list'
import katex from 'katex'
import { headingEdits, numberPrefix } from './numbering'
import useCodeLineTops from './useCodeLineTops'

export function mathHTML(latex, displayMode = false) {
  return katex.renderToString(latex || '\\square', { displayMode, throwOnError: false, trust: false, strict: 'ignore' })
}
function MathView({ node, getPos, editor }) {
  const select = event => {
    if(!editor.isEditable||event.shiftKey||event.button!==0)return
    const pos=getPos()
    if(typeof pos!=='number')return
    event.preventDefault()
    editor.view.dom.focus({preventScroll:true});editor.view.focus()
    editor.commands.setNodeSelection(pos)
  }
  const edit = () => {
    if (editor.isEditable) window.dispatchEvent(new CustomEvent('edit-formula', { detail: { latex: node.attrs.latex, display: node.type.name === 'blockMath', textAlign: node.type.name==='blockMath'?(node.attrs.textAlign||'center'):undefined, pos: getPos() } }))
  }
  return <NodeViewWrapper as={node.type.name === 'blockMath' ? 'div' : 'span'} className={`math-node ${node.type.name}`} style={node.type.name==='blockMath'?{textAlign:node.attrs.textAlign||'center'}:undefined} onMouseDown={select} onClick={select} onDoubleClick={edit} title={node.type.name==='blockMath'?'独立公式 · 双击编辑':'行内公式 · 双击编辑'} contentEditable={false}><span dangerouslySetInnerHTML={{ __html: mathHTML(node.attrs.latex, node.type.name === 'blockMath') }}/></NodeViewWrapper>
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
        const match = (block ? /^ {0,3}\$\$(?!\$)[ \t]*(?:\r?\n)?([\s\S]*?)\$\$[ \t]*(?:\r?\n|$)/ : /^\$(?!\$)((?:\\.|[^$\n\\])+)\$(?!\$)/).exec(src)
        if (match) return { type: name, raw: match[0], latex: match[1].trim() }
      },
    },
    parseMarkdown: token => ({ type: name, attrs: { latex: token.latex } }),
    renderMarkdown: node => {
      if(block&&['left','right'].includes(node.attrs.textAlign)){
        const latex=node.attrs.latex.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\r/g,'&#13;').replace(/\n/g,'&#10;')
        return `<div data-math="blockMath" data-latex="${latex}" style="text-align: ${node.attrs.textAlign}">${latex}</div>`
      }
      return block ? `$$\n${node.attrs.latex}\n$$` : `$${node.attrs.latex}$`
    },
    addInputRules() {
      if (!block) return [new InputRule({ find: /(?<![\\$])\$(?!\$)([^$\n]+)\$$/, handler: ({state,range,match}) => {
        state.tr.replaceWith(range.from,range.to,this.type.create({latex:match[1]}))
      } })]
      return [new InputRule({ find: /^[ \t]*\$\$(?!\$)([\s\S]+?)\$\$[ \t]*$/, handler: ({state,match}) => {
        const {$from}=state.selection
        if ($from.parent.type.name!=='paragraph'||!match[1].trim()) return null
        state.tr.replaceWith($from.before(),$from.after(),this.type.create({latex:match[1].trim()}))
      } }),new InputRule({ find: /^\$\$$/, handler: ({state}) => {
        const {$from}=state.selection
        if ($from.parent.type.name!=='paragraph') return null
        const parent=$from.node(-1), parts=[]
        let start=$from.before()
        for(let i=$from.index($from.depth-1)-1;i>=0;i--){
          const previous=parent.child(i);start-=previous.nodeSize
          if(previous.type.name!=='paragraph')return null
          if(previous.textContent.trim()==='$$'){
            const latex=parts.join('\n').trim()
            if(!latex)return null
            state.tr.replaceWith(start,$from.after(),this.type.create({latex}));return
          }
          if(previous.content.content.some(child=>!child.isText&&child.type.name!=='hardBreak'))return null
          parts.unshift(previous.textBetween(0,previous.content.size,'\n','\n'))
        }
        return null
      } })]
    },
    addProseMirrorPlugins() {
      return block ? [new Plugin({props:{handlePaste:(view,event)=>{
        const text=event.clipboardData?.getData('text/plain')||''
        if(!this.editor.isEditable||view.state.selection.$from.parent.type.spec.code||event.clipboardData?.getData('text/html')||!text.includes('$$'))return false
        return this.editor.commands.insertContent(text,{contentType:'markdown'})
      }}})] : []
    },
  })
}
export const InlineMath = mathNode(false)
export const BlockMath = mathNode(true)

const lowlight = createLowlight(common)
lowlight.register({ powershell, matlab, latex })
const languages = [['plaintext', '纯文本'], ['python', 'Python'], ['javascript', 'JavaScript'], ['typescript', 'TypeScript'], ['java', 'Java'], ['c', 'C'], ['cpp', 'C++'], ['csharp', 'C#'], ['go', 'Go'], ['rust', 'Rust'], ['sql', 'SQL'], ['bash', 'Shell / Bash'], ['powershell', 'PowerShell'], ['json', 'JSON'], ['xml', 'HTML / XML'], ['css', 'CSS'], ['yaml', 'YAML'], ['markdown', 'Markdown'], ['r', 'R'], ['matlab', 'MATLAB'], ['latex', 'LaTeX']]
function CodeView({ node, editor, getPos, updateAttributes }) {
  const [collapsed, setCollapsed] = useState(false)
  const [editable, setEditable] = useState(editor.isEditable)
  const [copyState, setCopyState] = useState('idle')
  const copyTimer = useRef(null)
  const bodyRef = useRef(null)
  const lineTops = useCodeLineTops({ editor, getPos, text: node.textContent, bodyRef, collapsed })
  useEffect(() => () => clearTimeout(copyTimer.current), [])
  useEffect(() => {
    const update = () => setEditable(editor.isEditable)
    editor.on('update', update); update()
    return () => editor.off('update', update)
  }, [editor])
  const originalLanguage = node.attrs.language || 'plaintext'
  const language = ({ py:'python', js:'javascript', ts:'typescript', html:'xml', sh:'bash', ps1:'powershell', tex:'latex', yml:'yaml', 'c++':'cpp', cs:'csharp', text:'plaintext', txt:'plaintext' })[originalLanguage] || originalLanguage
  const lineCount = node.textContent.split(/\r\n|\r|\n/).length
  async function copyCode() {
    clearTimeout(copyTimer.current)
    setCopyState('copying')
    try {
      if (window.desktop) await window.desktop.copyText(node.textContent)
      else await navigator.clipboard.writeText(node.textContent)
      setCopyState('copied')
    } catch { setCopyState('failed') }
    copyTimer.current = setTimeout(() => setCopyState('idle'), 2000)
  }
  return <NodeViewWrapper className={`code-wrapper ${collapsed ? 'is-collapsed' : ''}`}>
    <div className="code-header" contentEditable={false}>
      <select aria-label="代码语言" value={language} disabled={!editable} onChange={e => { if (editor.isEditable) updateAttributes({ language: e.target.value }) }}>{!languages.some(([value]) => value === language) && <option value={language}>{language}</option>}{languages.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
      <div className="code-actions">
        <button className="code-copy" aria-label="复制代码" disabled={copyState === 'copying'} onMouseDown={e => e.preventDefault()} onClick={copyCode}><span role="status">{copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败，点击重试' : copyState === 'copying' ? '复制中…' : '复制代码'}</span></button>
        <button onMouseDown={e => e.preventDefault()} onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? '展开代码' : '折叠代码'}>{collapsed ? '▸ 展开' : '▾ 折叠'} · {lineCount} 行</button>
      </div>
    </div>
    <div className="code-body" ref={bodyRef}>
      <div className="code-line-numbers" aria-hidden="true" contentEditable={false} style={{ width: `calc(${Math.max(2, String(lineCount).length)}ch + 24px)` }}>{Array.from({ length: lineCount }, (_,i) => <span className="code-line-number" key={i} style={{ top: 14 + (lineTops[i] ?? i * 23.625) }}>{i + 1}</span>)}</div>
      <pre><NodeViewContent as="code" style={{ whiteSpace: 'pre-wrap' }} className={`language-${originalLanguage}`}/></pre>
    </div>
    {collapsed && <div className="code-folded" contentEditable={false} onClick={() => setCollapsed(false)}>代码已折叠 · 点击展开</div>}
  </NodeViewWrapper>
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
      // Keep only the chosen set, while maintaining its sequential numbering.
      if (dispatch) { this.storage.enabled = false; dispatch(tr || state.tr) }
      return true
    } }
  },
  addProseMirrorPlugins() {
    return [new Plugin({ appendTransaction: (transactions, oldState, state) => {
      if (transactions.some(tr => tr.docChanged)) return numberTransaction(state, this.storage.enabled ? true : null)
    } })]
  },
})

// Markdown normally treats a blank line between items as a loose list. Here a
// blank line ends the sequence, matching the editor's empty-paragraph behavior.
export const SequentialOrderedList = OrderedList.extend({
  markdownTokenizer: {
    ...OrderedList.config.markdownTokenizer,
    tokenize(src, tokens, lexer) {
      const blank = src.search(/\r?\n[ \t]*\r?\n/)
      const prefix=blank < 0 ? src : src.slice(0, blank + 1)
      const token=OrderedList.config.markdownTokenizer.tokenize(prefix, tokens, lexer)
      if(token&&blank>=0&&token.raw.trimEnd()===prefix.trimEnd()&&/^[ \t]*\d+[.)]\s/.test(src.slice(blank).trimStart()))token.mdtexSeparateNext=true
      return token
    },
  },
  parseMarkdown(token,helpers){
    const node=OrderedList.config.parseMarkdown(token,helpers)
    return token.mdtexSeparateNext?[node,{type:'paragraph'}]:node
  },
  addProseMirrorPlugins() {
    return [new Plugin({props:{handlePaste:(view,event)=>{
      if(event.clipboardData?.getData('text/html')?.trim())return false
      const text=event.clipboardData?.getData('text/plain')||''
      if(!/^\s*\d+[.)]\s+/.test(text)||!(/\n[ \t]*\n/.test(text)))return false
      return this.editor.commands.insertContent(text,{contentType:'markdown'})
    }}}),...(this.parent?.()||[])]
  },
})

function numberParagraphGroups({state,tr,chain}) {
  const range=state.selection.$from.blockRange(state.selection.$to)
  if(!range)return false
  const groups=[]
  let pos=range.start,group=null
  for(let i=range.startIndex;i<range.endIndex;i++){
    const node=range.parent.child(i),end=pos+node.nodeSize
    if(node.type.name==='paragraph'&&(node.textContent.trim()||node.content.content.some(n=>n.isAtom&&n.type.name!=='hardBreak'))){
      if(group)group.to=end-1
      else{group={from:pos+1,to:end-1};groups.push(group)}
    }else group=null
    pos=end
  }
  if(!groups.length)return false
  const bookmark=tr.selection.getBookmark(),mappingStart=tr.mapping.maps.length
  for(const {from,to} of groups.reverse()){
    if(!chain().setTextSelection({from,to}).toggleOrderedList().run())return false
  }
  tr.setSelection(bookmark.map(tr.mapping.slice(mappingStart)).resolve(tr.doc))
  return true
}

export const ContextNumbering = Extension.create({
  name: 'contextNumbering',
  priority: 1100,
  addCommands() {
    return { smartNumbering: (remove = false) => props => {
      const {editor,state,commands}=props
      if(!editor.isEditable)return false
      const {$from,$to,from,to}=state.selection
      if($from.parent.type.name==='heading'&&$from.sameParent($to)) {
        return commands.setCurrentHeadingNumbering(remove?false:!numberPrefix.test($from.parent.textContent))
      }
      // Do not turn a mixed selection containing headings or a code block into a list.
      let unsupported=!['paragraph','doc'].includes($from.parent.type.name)
      state.doc.nodesBetween(from,to,node=>{if(node.type.name==='heading'||node.type.name==='codeBlock')unsupported=true})
      if(unsupported)return false
      if(remove&&!editor.isActive('orderedList'))return true
      if(editor.isActive('orderedList')||editor.isActive('bulletList'))return commands.toggleOrderedList()
      if(state.selection.empty&&!$from.parent.content.size)return commands.toggleOrderedList()
      return numberParagraphGroups(props)
    } }
  },
  addKeyboardShortcuts() {return {
    'Mod-Shift-7':()=>{this.editor.commands.smartNumbering();return true},
    Enter:()=>{
      const {state}=this.editor,{$from,empty}=state.selection
      if(!empty||$from.parent.type.name!=='paragraph'||$from.parent.content.size||!this.editor.isActive('orderedList'))return false
      if($from.node(-1).type.name!=='listItem'||$from.node(-1).childCount!==1)return false
      return this.editor.chain().liftListItem('listItem').command(({tr})=>{
        const at=tr.selection.$from
        // Keep an actual blank paragraph when Enter exits the top-level list.
        // Otherwise toggling the next paragraph would merge it back into it.
        for(let depth=at.depth-1;depth>0;depth--)if(at.node(depth).type.name==='orderedList')return true
        tr.insert(at.before(),state.schema.nodes.paragraph.create())
        return true
      }).run()
    },
  }}
})
