import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableKit } from '@tiptap/extension-table'
import { createEditableTable } from './EditableTable'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import {LocalImage} from './LocalImage'
import { TextSelection, AllSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { BookOpen, PenLine, Code2, Columns2, PanelLeftClose, PanelLeftOpen, FileText, Plus, FolderOpen, Save, ChevronDown, ChevronRight, Bold, Italic, Strikethrough, List, ListOrdered, Quote, Table2, Sigma, Hash, Undo2, Redo2, Link, Check, X, Search, Keyboard, MoreHorizontal, Trash2, Download, ListChecks, Minus, Maximize2, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { InlineMath, BlockMath, FoldingCode, HeadingNumbering, ContextNumbering, SequentialOrderedList, mathHTML } from './extensions'
import { welcome } from './sample'
import { loadView, normalizeView } from './view-settings'
import WorkspacePanel from './WorkspacePanel'
import useTheme from './useTheme'
import UpdateNotice from './UpdateNotice'
import {numberPrefix} from './numbering'
import { symbols } from './formula-symbols'
import { createParagraphLayout, selectionAlignment, selectedTextBlocks } from './paragraph-layout'
import useActiveHeading from './useActiveHeading'
import { Highlighter } from 'lucide-react'
import { Highlight, highlightColors } from './Highlight'
import { sourceToEditor, editorToSource, setEditorSelection, revealSource } from './cursor-mapping'

const fresh = (markdown = '', name = '未命名文档.md', isDraft = false) => ({ id: crypto.randomUUID(), name, markdown, updated: Date.now(), numbered: false, origin:isDraft?'untitled':'session', isDraft:false, dirty:false })
const isLocalDraft = doc => doc.origin==='data'||doc.origin==='untitled'
function storeSession(data){
  if(window.desktop)window.desktop.saveSession(data)
}
function loadDrafts() {
  const native=window.desktop?.initialState
  if(native){
    for(const [key,value] of Object.entries(native.preferences||{})){try{localStorage.setItem(key,value)}catch{}}
    if(native.session?.docs?.length){
      const state=native.session
      if(state.docs.some(d=>d.id===state.active))return state
      const welcomeDoc=fresh(welcome,'欢迎使用 MDTeX.md')
      return {...state,docs:[...state.docs,welcomeDoc],active:welcomeDoc.id,openIds:[...(state.openIds||[]),welcomeDoc.id]}
    }
    const welcomeDoc=fresh(welcome,'欢迎使用 MDTeX.md');return {docs:[welcomeDoc],active:welcomeDoc.id,openIds:[welcomeDoc.id]}

  }
  try {
    let data=JSON.parse(localStorage.getItem('mdtex.drafts.v1'))
    if(native&&native.previous!==native.directory){
      const remap=value=>typeof value==='string'?value.split(native.previousUrl).join(native.directoryUrl).split(native.previous+'\\').join(native.directory+'\\'):Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,remap(v)])):value
      data=remap(data)
    }
    if(data?.docs?.length)return data
  } catch {}
  const doc = fresh(welcome, '欢迎使用 MDTeX.md'); return { docs: [doc], active: doc.id }
}
const initial = loadDrafts()
const templates = {
  常用: [['分式', '\\frac{a}{b}'], ['上标', 'x^{n}'], ['下标', 'a_{i}'], ['根式', '\\sqrt{x}'], ['二次方程', 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'], ['求和', '\\sum_{i=1}^{n} x_i'], ['平均值', '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i'], ['分段函数', 'f(x) = \\begin{cases} x^2 & x \\geq 0 \\\\ -x & x < 0 \\end{cases}']],
  微积分: [['定积分', '\\int_{a}^{b} f(x)\\,dx'], ['极限', '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1'], ['偏导数', '\\frac{\\partial f}{\\partial x}'], ['多重积分', '\\iint_{D} f(x,y)\\,dx\\,dy'], ['泰勒展开', 'f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n'], ['梯度', '\\nabla f = \\left(\\frac{\\partial f}{\\partial x}, \\frac{\\partial f}{\\partial y}\\right)']],
  线性代数: [['矩阵', '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}'], ['行列式', '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}'], ['向量', '\\vec{v} = (v_1, v_2, v_3)'], ['范数', '\\left\\|x\\right\\|_2'], ['方程组', '\\begin{cases} a_1 x + b_1 y = c_1 \\\\ a_2 x + b_2 y = c_2 \\end{cases}'], ['对齐等式', '\\begin{aligned} a &= b + c \\\\ &= d + e \\end{aligned}']],
  概率统计: [['正态分布', 'f(x) = \\frac{1}{\\sigma\\sqrt{2\\pi}} e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}'], ['条件概率', 'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}'], ['期望', '\\mathbb{E}[X] = \\sum_i x_i p_i'], ['方差', '\\operatorname{Var}(X) = \\mathbb{E}[X^2] - \\mathbb{E}[X]^2']],
  符号: [['希腊字母', '\\alpha + \\beta + \\gamma + \\theta'], ['集合', 'x \\in \\mathbb{R}, \\quad A \\subseteq B'], ['不等式', 'a \\leq b \\neq c \\geq d'], ['箭头', 'A \\Rightarrow B \\iff C'], ['无穷', '\\infty'], ['乘积', '\\prod_{i=1}^{n} a_i']],
}
function Tool({ icon: Icon, label, active, onClick, children, disabled }) {
  return <button className={`tool ${active ? 'active' : ''}`} title={label} aria-label={label} onMouseDown={e => e.preventDefault()} onClick={onClick} disabled={disabled}>{Icon && <Icon size={16}/ >}{children}</button>
}
function Modal({ title, subtitle, close, children, wide, className='' }) {
  const ref = useRef()
  useEffect(() => {
    const previous = document.activeElement
    const el = ref.current
    el.querySelector('textarea,input,button')?.focus({preventScroll:true})
    const key = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
      if (e.key === 'Tab') {
        const els = [...el.querySelectorAll('button,input,textarea,select,[tabindex="0"]')].filter(n => !n.disabled)
        if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els.at(-1)?.focus() }
        else if (!e.shiftKey && document.activeElement === els.at(-1)) { e.preventDefault(); els[0]?.focus() }
      }
    }
    el.addEventListener('keydown', key)
    return () => { el.removeEventListener('keydown', key); previous?.focus({preventScroll:true}) }
  }, [])
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}><section ref={ref} className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="关闭" onClick={close}><X size={20}/></button></header>{children}</section></div>
}

export default function App() {
  const [theme,setTheme]=useTheme()
  const [docs, setDocs] = useState(initial.docs)
  const [openIds,setOpenIds]=useState(initial.openIds||initial.docs.map(d=>d.id))
  const [workspaceRoot,setWorkspaceRoot]=useState(initial.docs.find(d=>d.id===initial.active)?.workspaceRoot||null)
  const [workspaceVersion,setWorkspaceVersion]=useState(0)
  const [busy,setBusy]=useState(false)
  const [draftDelete,setDraftDelete]=useState(null)
  const [external,setExternal]=useState({})
  const refreshing=useRef(false),ignoredExternal=useRef(new Map())
  const [active, setActive] = useState(initial.active || initial.docs[0].id)
  const doc = docs.find(d => d.id === active) || docs[0]
  const [markdown, setMarkdown] = useState(doc.markdown)
  const [mode, setMode] = useState('edit')
  const [sidebar, setSidebar] = useState(true)
  const [tab, setTab] = useState('outline')
  const [modal, setModal] = useState(null)
  const [formula, setFormula] = useState({ latex: '\\frac{a}{b}', display: true })
  const [category, setCategory] = useState('常用')
  const [grid, setGrid] = useState({ rows: 3, cols: 3 })
  const [tableHeader, setTableHeader] = useState(false)
  const [toast, setToast] = useState('')
  const [storageError, setStorageError] = useState(false)
  const [tableHover, setTableHover] = useState(null)
  const [context, setContext] = useState(null)
  const [slash, setSlash] = useState(null)
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [focus, setFocus] = useState(false)
  const [numberMenu, setNumberMenu] = useState(null)
  const [view, setView] = useState(loadView)
  const [tableMenu,setTableMenu] = useState(null)
  const [highlightMenu,setHighlightMenu] = useState(null)
  const imageRef=useRef(), latexRef=useRef(), latexSelection=useRef(null), pendingLatexCaret=useRef(null)
  useLayoutEffect(()=>{
    const pending=pendingLatexCaret.current
    if(!pending)return
    pendingLatexCaret.current=null
    if(latexRef.current!==pending.input)return
    pending.input.focus();pending.input.setSelectionRange(pending.caret,pending.caret)
    latexSelection.current={start:pending.caret,end:pending.caret}
  })
  const sourceRef = useRef(), fileRef = useRef(), richRef = useRef(), savedSelection = useRef(null), current = useRef({}), timer = useRef()
  const lastPane=useRef('rich'), pendingView=useRef(null), formulaReturn=useRef(null), pendingFormulaReturn=useRef(null)
  const formulaSource=useRef(null), pendingFormulaSourceCaret=useRef(null)
  const notify = message => { setToast(message); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 3500) }
  window.mdtexImageContext={id:doc.id,path:doc.path}
  const editor = useEditor({
    extensions: [StarterKit.configure({ codeBlock: false, orderedList: false, paragraph: false, heading: false, link: { openOnClick: false } }), ...createParagraphLayout(), Highlight, SequentialOrderedList, FoldingCode, Markdown, TableKit.configure({ table: false }), createEditableTable(), TaskList, TaskItem.configure({ nested: true }), LocalImage, InlineMath, BlockMath, HeadingNumbering, ContextNumbering],
    content: doc.markdown, contentType: 'markdown',
    editorProps: { attributes: { class: 'prose', spellcheck: 'false', 'aria-label': '文档编辑区域' } },
    onUpdate: ({ editor,transaction }) => { if(transaction.docChanged){setMarkdown(editor.getMarkdown());markDirty()}; setRevision(n => n + 1) },
    onSelectionUpdate: () => setRevision(n => n + 1),
  })
  current.current = { doc,docs, markdown, mode, editor, modal, view, busy,openIds,active }
  const {position:activeHeading,selectHeading}=useActiveHeading({editor,richRef,sourceRef,mode,markdown,revision,active,zoom:view.zoom})
  useLayoutEffect(()=>{
    const pending=pendingFormulaSourceCaret.current,input=sourceRef.current
    if(modal||!pending||!input||input.value!==pending.text)return
    pendingFormulaSourceCaret.current=null
    if(doc.id===pending.id)revealSource(input,pending.caret)
  },[markdown,modal,active])
  useLayoutEffect(()=>{
    const pending=pendingView.current
    if(!editor||!pending)return
    pendingView.current=null
    const frame=requestAnimationFrame(()=>{
      if(current.current.doc.id!==pending.id)return
      if(pending.pane==='source'&&sourceRef.current){
        lastPane.current='source';revealSource(sourceRef.current,pending.from,pending.to,pending.direction)
      }else if(richRef.current){
        lastPane.current='rich';setEditorSelection(editor,pending.from,pending.to)
        if(mode!=='read'){editor.view.dom.focus({preventScroll:true});editor.view.focus()}
        const pane=richRef.current,rect=pane.getBoundingClientRect(),caret=editor.view.coordsAtPos(editor.state.selection.head)
        pane.scrollTo({top:pane.scrollTop+caret.top-rect.top-pane.clientHeight*.35,behavior:'instant'})
      }
    })
    return()=>cancelAnimationFrame(frame)
  },[mode,editor,active])
  useLayoutEffect(()=>{
    const snapshot=pendingFormulaReturn.current
    if(modal||!snapshot||!editor)return
    pendingFormulaReturn.current=null
    const restore=()=>{
      if(current.current.doc.id!==snapshot.id||current.current.modal)return
      if(snapshot.source&&sourceRef.current){
        const el=sourceRef.current;el.focus({preventScroll:true});el.setSelectionRange(snapshot.source.from,snapshot.source.to,snapshot.source.direction);el.scrollTop=snapshot.source.top;el.scrollLeft=snapshot.source.left
      }else{
        editor.view.dispatch(editor.state.tr.setSelection(snapshot.bookmark.resolve(editor.state.doc)))
        editor.view.dom.focus({preventScroll:true});editor.view.focus()
      }
      if(richRef.current)richRef.current.scrollTo({top:snapshot.top,left:snapshot.left,behavior:'instant'})
    }
    let second
    const frame=requestAnimationFrame(()=>{restore();second=requestAnimationFrame(restore)})
    return()=>{cancelAnimationFrame(frame);cancelAnimationFrame(second)}
  },[modal,editor,active])
  useEffect(()=>{if(editor)window.desktop?.ready().catch(()=>{})},[editor])
  useEffect(()=>{window.dispatchEvent(new Event('mdtex-image-context'))},[doc.id,doc.path])
  useEffect(()=>{if(window.desktop)refreshLocalDocuments().catch(e=>notify(e.message))},[])
  useEffect(()=>{
    if(!window.desktop||!editor)return
    const refresh=()=>refreshDiskFiles().catch(e=>notify(e.message))
    const timer=setInterval(refresh,1200);window.addEventListener('focus',refresh);refresh()
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[editor,active])
  useEffect(()=>window.desktop?.onSaveBeforeClose(async()=>{if(await saveAllDocuments())await window.desktop.finishClose()}),[editor])
  useEffect(() => {
    try { localStorage.setItem('mdtex.view.v1', JSON.stringify(view)) } catch {}
    window.desktop?.setPreference('mdtex.view.v1',JSON.stringify(view)).catch(()=>{})
    setTableHover(null); setNumberMenu(null)
  }, [view])
  useEffect(() => {
    const wheel = e => {
      if (e.ctrlKey && e.target.closest('.document-area')) {
        e.preventDefault()
        setView(v => normalizeView({ ...v, zoom: v.zoom + (e.deltaY < 0 ? 10 : -10) }))
      }
    }
    window.addEventListener('wheel', wheel, { passive: false })
    return () => window.removeEventListener('wheel', wheel)
  }, [])
  useEffect(() => {
    setDocs(items => items.map(d => d.id === active ? { ...d, markdown, numbered: editor?.storage.headingNumbering.enabled ?? d.numbered, updated: Date.now() } : d))
  }, [markdown])
  useEffect(() => {
    const id = setTimeout(() => { try { const data={docs:docs.map(d=>d.id===active?{...d,markdown}:d),active,openIds};storeSession(data); setStorageError(false) } catch { setStorageError(true) } }, 400)
    return () => clearTimeout(id)
  }, [docs, active,openIds,markdown])
  function persistNow(){const s=current.current;const data={docs:s.docs.map(d=>d.id===s.active?{...d,markdown:s.markdown}:d),active:s.active,openIds:s.openIds};storeSession(data);return data}
  async function prepareUpdate(){if(current.current.busy)throw Error('请等待当前文件操作完成');const dirty=current.current.docs.filter(d=>d.dirty);if(dirty.length&&!await window.desktop.confirmUpdate({names:dirty.map(d=>d.name)}))throw Error('已取消更新，未保存内容仍在当前窗口');if(!await saveAllDocuments())throw Error('文档未保存，已取消更新');persistNow();setBusy(true);return true}
  useEffect(() => {
    if (!editor || !['source', 'split'].includes(mode) || editor.getMarkdown() === markdown) return
    const id = setTimeout(() => { syncSource(); setRevision(n => n + 1) }, 240)
    return () => clearTimeout(id)
  }, [markdown, mode, editor])
  useEffect(() => { if (editor) editor.setEditable(!busy && mode !== 'read' && mode !== 'source') }, [mode, editor,busy])
  useEffect(() => {
    const edit = e => { formulaSource.current=null;captureFormulaReturn();savedSelection.current = editor?.state.selection; latexSelection.current=null; pendingLatexCaret.current=null; setFormula(e.detail); setModal('formula') }
    window.addEventListener('edit-formula', edit)
    return () => window.removeEventListener('edit-formula', edit)
  }, [editor])
  useEffect(() => {
    if (editor) editor.storage.headingNumbering.enabled = !!doc.numbered
  }, [editor])
  useEffect(() => {
    const key = e => {
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') { setContext(null); setSlash(null); setNumberMenu(null); setTableMenu(null); setHighlightMenu(null); setFocus(false) }
      if (current.current.modal) return
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(e.shiftKey) }
      else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile() }
      else if (mod && e.altKey && e.code === 'KeyN') { e.preventDefault(); number(!e.shiftKey) }
      else if (mod && e.altKey && e.code === 'KeyH') { e.preventDefault(); contextNumber(e.shiftKey) }
      else if (mod && !e.altKey && ['Equal','NumpadAdd','Minus','NumpadSubtract','Digit0','Numpad0'].includes(e.code)) {
        e.preventDefault()
        setView(v => normalizeView({ ...v, zoom: ['Digit0','Numpad0'].includes(e.code) ? 100 : v.zoom + (['Minus','NumpadSubtract'].includes(e.code) ? -10 : 10) }))
      }
      else if (mod && e.shiftKey && e.code === 'KeyM') { e.preventDefault(); openFormula() }
      else if (mod && e.code === 'Slash') { e.preventDefault(); changeMode(current.current.mode === 'source' ? 'edit' : 'source') }
      else if (mod && e.shiftKey && e.code === 'KeyP') { e.preventDefault(); changeMode(current.current.mode === 'read' ? 'edit' : 'read') }
    }
    const leave = e => { try{persistNow()}catch{};const {doc, markdown} = current.current; if (current.current.busy||doc.dirty||current.current.docsDirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('keydown', key); window.addEventListener('beforeunload', leave)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', leave) }
  }, [editor])
  useEffect(() => {
    const close = () => { setContext(null); setTableHover(null); setNumberMenu(null); setTableMenu(null); setHighlightMenu(null) }
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [])
  function markDirty(){const id=current.current.doc?.id;if(id)setDocs(items=>items.map(d=>d.id===id?{...d,dirty:true}:d))}
  function editMarkdown(value){markDirty();setMarkdown(value)}
  async function refreshLocalDocuments(){
    if(!window.desktop)return
    const files=await window.desktop.listDefaultDocuments()
    setDocs(items=>{const next=[...items];for(const file of files)if(!next.some(d=>d.path===file.path))next.push({...fresh('',file.name),...file,savedMarkdown:'',loaded:false,dirty:false});return next})
  }
  function acceptDiskFile(file,activate=false,force=false,options={}){
    const s=current.current,existing=s.docs.find(d=>d.path===file.path)
    if(!existing){importDoc(file.text,file.name,file.path,file);return}
    const currentText=existing.id===s.doc.id?s.markdown:existing.markdown
    const changed=file.text!==existing.savedMarkdown
    if(changed&&existing.dirty&&!force){
      if(ignoredExternal.current.get(existing.id)!==file.text)setExternal(items=>({...items,[existing.id]:{file}}))
      if(activate)activateDoc({...existing,markdown:currentText},options)
      return
    }
    if(!changed&&existing.loaded!==false&&!force){if(activate)activateDoc({...existing,markdown:currentText},options);setExternal(items=>items[existing.id]?.missing?Object.fromEntries(Object.entries(items).filter(([id])=>id!==existing.id)):items);return}
    const next={...existing,...file,origin:file.origin==='data'?'data':existing.workspaceRoot?'workspace':'file',markdown:file.text,savedMarkdown:file.text,dirty:false,loaded:true,externalMissing:false}
    setDocs(items=>items.map(d=>d.id===existing.id?next:d));setExternal(items=>{const rest={...items};delete rest[existing.id];return rest});ignoredExternal.current.delete(existing.id)
    if(activate)activateDoc(next,options)
    else if(s.doc.id===existing.id){
      const top=richRef.current?.scrollTop||0,left=richRef.current?.scrollLeft||0
      editor.commands.setContent(next.markdown,{contentType:'markdown',emitUpdate:false});setMarkdown(next.markdown);richRef.current?.scrollTo({top,left,behavior:'instant'})
    }
  }
  async function switchDoc(next,options={}){
    if(!next||current.current.busy&&!options.allowBusy)return
    if(!next.path||!window.desktop){activateDoc(next,options);return}
    try{acceptDiskFile(await window.desktop.readFile({path:next.path}),true,false,options)}catch(error){activateDoc(next,options);setExternal(items=>({...items,[next.id]:{missing:true,error:error.message}}))}
  }
  async function refreshDiskFiles(){
    const s=current.current
    if(refreshing.current||s.busy||s.modal||!s.doc.path)return
    refreshing.current=true
    try{
      const file=await window.desktop.readFile({path:s.doc.path})
      if(current.current.busy||current.current.modal||current.current.doc.id!==s.doc.id||current.current.markdown!==s.markdown)return
      acceptDiskFile(file)
    }catch(error){if(current.current.doc.id===s.doc.id&&ignoredExternal.current.get(s.doc.id)!=='missing')setExternal(items=>({...items,[s.doc.id]:{missing:true,error:error.message}}))}
    finally{refreshing.current=false}
  }
  async function reloadExternal(){
    const s=current.current
    if(!s.doc.path||s.busy)return
    if(s.doc.dirty&&!await window.desktop.confirmReload({name:s.doc.name}))return
    try{acceptDiskFile(await window.desktop.readFile({path:s.doc.path}),false,true)}catch(error){notify('读取失败：'+error.message)}
  }
  function keepExternalEdits(){const id=current.current.doc.id,change=external[id];ignoredExternal.current.set(id,change?.missing?'missing':change?.file?.text);setExternal(items=>{const next={...items};delete next[id];return next})}
  function navigateOutline(index){
    const id=current.current.doc.id
    const positions=[];editor.state.doc.descendants((node,pos)=>{if(node.type.name==='heading')positions.push(pos)})
    selectHeading(positions[index])
    if(current.current.mode==='source')changeMode('read')
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(current.current.doc.id!==id)return
      const headings=[];editor.state.doc.descendants((node,pos)=>{if(node.type.name==='heading')headings.push(pos)})
      const pos=headings[index],el=pos===undefined?null:editor.view.nodeDOM(pos),pane=richRef.current
      if(typeof el?.getBoundingClientRect!=='function'||!pane)return
      const top=Math.max(0,Math.min(pane.scrollHeight-pane.clientHeight,pane.scrollTop+el.getBoundingClientRect().top-pane.getBoundingClientRect().top-55))
      selectHeading(pos,top)
      pane.scrollTo({top,behavior:'smooth'})
    }))
  }
  function syncSource() {
    const { editor, markdown, mode } = current.current
    if (editor && ['source', 'split'].includes(mode) && editor.getMarkdown() !== markdown) {
      // Different Markdown spellings can represent the same document. Replacing
      // an equivalent document would unnecessarily move its live selection.
      if(editor.schema.nodeFromJSON(editor.markdown.parse(markdown)).eq(editor.state.doc))return
      const selection=editor.state.selection
      editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
      if(mode==='split'&&lastPane.current==='rich')setEditorSelection(editor,{pos:selection.from,node:selection.node?.isAtom||false},{pos:selection.to})
    }
  }
  function changeMode(next) {
    const old=current.current
    if(old.busy||old.mode===next)return
    const fromSource=old.mode==='source'||(old.mode==='split'&&lastPane.current==='source')
    const el=sourceRef.current, selection=editor.state.selection
    let from,to,direction='none'
    if(fromSource&&el){
      from=sourceToEditor(editor,old.markdown,el.selectionStart);to=sourceToEditor(editor,old.markdown,el.selectionEnd);direction=el.selectionDirection
    }else{from={pos:selection.from,node:selection.node?.isAtom||false};to={pos:selection.to,node:false}}
    if(next==='source'||(next==='split'&&fromSource)){
      const a=fromSource&&el?el.selectionStart:editorToSource(editor,old.markdown,selection.from)
      const b=fromSource&&el?el.selectionEnd:editorToSource(editor,old.markdown,selection.to,selection.empty?1:-1)
      pendingView.current={id:old.doc.id,pane:'source',from:Math.min(a,b),to:Math.max(a,b),direction}
    }else pendingView.current={id:old.doc.id,pane:'rich',from,to}
    syncSource()
    if(['edit','read'].includes(next))setMarkdown(editor.getMarkdown())
    setMode(next);setContext(null);setSlash(null);setTableHover(null)
  }
  function activateDoc(next,{snapshot=true,allowBusy=false}={}) {
    if(current.current.busy&&!allowBusy)return
    setOpenIds(ids=>ids.includes(next.id)?ids:[...ids,next.id])
    setWorkspaceRoot(next.workspaceRoot||null)
    setTab(previous=>next.workspaceRoot?'tree':previous==='tree'?'outline':previous)
    window.mdtexImageContext={id:next.id,path:next.path}
    const old = current.current
    if(snapshot&&old.doc.id!==next.id)setDocs(items => items.map(d => d.id === old.doc.id ? { ...d, markdown: old.markdown, numbered: old.editor.storage.headingNumbering.enabled } : d))
    editor.storage.headingNumbering.enabled = !!next.numbered
    editor.commands.setContent(next.markdown, { contentType: 'markdown', emitUpdate: false })
    setActive(next.id); setMarkdown(next.markdown); setRevision(n => n + 1); setSlash(null)
  }
  async function newDoc(createDraft=true) {
    if(current.current.busy)return
    const next=fresh('', '未命名文档.md', createDraft!==false)
    setDocs(items=>[...items,next]);activateDoc(next);setMode('edit');setTimeout(()=>editor.commands.focus(),50)
  }
  async function deleteLocalDraft(){
    if(!draftDelete||current.current.busy)return
    const target=current.current.docs.find(d=>d.id===draftDelete.id)||draftDelete
    setBusy(true)
    try{
      let retained=null
      if(target.path&&target.dirty){const text=target.id===current.current.doc.id?current.current.markdown:target.markdown;const result=await window.desktop.detachDraft({id:target.id,path:target.path,text});retained={...target,path:undefined,origin:'untitled',savedMarkdown:undefined,markdown:result.text,dirty:true,workspaceRoot:null}}
      if(target.path&&window.desktop)await window.desktop.deleteDefaultDocument({path:target.path})
      const rest=current.current.docs.filter(d=>d.id!==target.id);if(retained)rest.push(retained)
      let tabs=openIds.filter(id=>id!==target.id)
      if(retained)tabs.push(retained.id)
      let next=retained||rest.find(d=>tabs.includes(d.id))||rest[0]
      if(!next){next=fresh();rest.push(next);tabs.push(next.id)}
      setDocs(rest);setOpenIds(tabs);if(current.current.doc.id===target.id)activateDoc(next,{snapshot:false,allowBusy:true})
      setDraftDelete(null);notify(retained?'文件已移入回收站，未保存修改仍保留在标签中':'本地文档已删除')
    }catch(e){notify('删除失败：'+e.message)}finally{setBusy(false)}
  }
  async function closeTab(id){
    const target=current.current.docs.find(d=>d.id===id)
    if(!target||current.current.busy)return
    if(target.dirty){const choice=window.desktop?await window.desktop.confirmClose({name:target.name}):'cancel';if(choice==='cancel')return;if(choice==='save'&&!await saveDocument(target))return}
    const rest=openIds.filter(value=>value!==id);setOpenIds(rest)
    const docs=current.current.docs.filter(d=>d.id!==id||d.origin==='data').map(d=>d.id===id?{...d,markdown:d.savedMarkdown||'',dirty:false}:d)
    setDocs(docs)
    if(active===id){if(rest.length)await switchDoc(docs.find(d=>d.id===rest[0]),{snapshot:false});else{const empty=fresh();setDocs(items=>[...items,empty]);activateDoc(empty,{snapshot:false});setMode('edit')}}
  }
  async function openFolder(){if(current.current.busy)return;if(!window.desktop)return notify('请使用桌面版');try{const root=await window.desktop.workspace.open();if(root){setWorkspaceRoot(root);setTab('tree')}}catch(e){notify(e.message)}}
  function importDoc(text, name, path,metadata={}) { const next = { ...fresh(text, name), path, savedMarkdown: text,dirty:false,loaded:true,origin:path?'file':'session',...metadata }; setDocs(items => [...items, next]); activateDoc(next); notify('文档已打开') }
  function openWorkspaceDoc(file) { acceptDiskFile(file,true);setMode('edit') }
  function renameWorkspaceDoc(result) {
    setDocs(items=>items.map(d=>d.path===result.old?{...d,path:result.path,name:result.name}:d))
  }
  async function detachWorkspaceDoc(path) {
    const list=current.current.docs.filter(d=>d.path===path)
    for(const original of list){
      const text=original.id===current.current.doc.id?current.current.markdown:original.markdown
      const result=window.desktop?await window.desktop.detachDraft({id:original.id,path,text}):{text}
      setDocs(items=>items.map(d=>d.id===original.id?{...d,path:undefined,workspaceRoot:null,origin:"untitled",isDraft:false,dirty:true,savedMarkdown:undefined,markdown:result.text,name:d.name.replace(/\.md$/i,"")+"（原文件已删除）.md"}:d))
      if(current.current.doc.id===original.id){window.mdtexImageContext={id:original.id};editor.commands.setContent(result.text,{contentType:"markdown",emitUpdate:false});setMarkdown(result.text)}
    }
  }
  async function insertImageFile(file) {
    const snapshot=current.current
    if(snapshot.mode==='read')return
    if(!/^image\/(png|jpeg|gif|webp|bmp)$/i.test(file.type))return notify('支持 PNG、JPEG、GIF、WebP、BMP 图片')
    if(file.size>8*1024*1024)return notify('图片超过 8 MB，请压缩后再插入')
    const start=sourceRef.current?.selectionStart??snapshot.markdown.length,end=sourceRef.current?.selectionEnd??start
    const selection=snapshot.editor.state.selection
    try {
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('无法读取图片'));reader.readAsDataURL(file)})
      if(current.current.doc.id!==snapshot.doc.id)return notify('文档已切换，请重新插入图片')
      if(current.current.markdown!==snapshot.markdown||current.current.mode!==snapshot.mode)return notify('文档已变化，请在新的光标位置重新插入图片')
      if(current.current.mode==='read')return notify('请切换到编辑模式后插入图片')
      let src=data
      if(window.desktop){const imported=await window.desktop.importImage({id:snapshot.doc.id,path:snapshot.doc.path,isDraft:isLocalDraft(snapshot.doc),data});src=imported.src}
      if(current.current.doc.id!==snapshot.doc.id||current.current.doc.path!==snapshot.doc.path||current.current.markdown!==snapshot.markdown)return notify('文档已变化，请重新插入图片')
      const alt=(file.name||'粘贴的图片').replace(/[\[\]\r\n]/g,'')
      if(snapshot.mode==='source')editMarkdown(text=>text.slice(0,start)+`\n\n![${alt}](${src})\n\n`+text.slice(end))
      else snapshot.editor.chain().focus().setTextSelection({from:selection.from,to:selection.to}).setImage({src,alt}).run()
      notify('图片已暂存；保存时将整理到 picture 文件夹')
    }catch(e){notify(e.message)}
  }
  function pasteImage(event) {
    if(current.current.mode==='read'||!event.target.closest('.document-area'))return
    const file=[...(event.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'))
    if(file){event.preventDefault();event.stopPropagation();insertImageFile(file)}
  }
  function rememberLatexSelection(event) {
    const input=event.currentTarget
    if(document.activeElement!==input)return
    latexSelection.current={start:input.selectionStart,end:input.selectionEnd}
  }
  function chooseSymbol(latex, template=false) {
    const input=latexRef.current,selection=latexSelection.current
    if(template&&!selection){setFormula(old=>({...old,latex}));return}
    const start=selection?.start??formula.latex.length,end=selection?.end??start
    setFormula(old=>({...old,latex:old.latex.slice(0,start)+latex+old.latex.slice(end)}))
    const caret=start+latex.length
    latexSelection.current={start:caret,end:caret}
    pendingLatexCaret.current={input,caret}
  }
  function openTableMenu(event) {
    event?.stopPropagation()
    syncSource()
    const button=document.querySelector('[aria-label="插入表格"]'),r=button?.getBoundingClientRect()
    setTableMenu(tableMenu?null:{x:Math.min(r?.left||300,window.innerWidth-290),y:r?.bottom+8||180})
  }
  async function openFile() {
    if(current.current.busy)return
    try {
      if (window.desktop) { const file = await window.desktop.open(); if (file) { acceptDiskFile(file,true) } }
      else fileRef.current.click()
    } catch (e) { notify('打开失败：' + e.message) }
  }
  async function saveDocument(sourceDoc,saveAs=false){
    if(!window.desktop)return false
    const s=current.current,text=sourceDoc.id===s.doc.id?s.markdown:sourceDoc.markdown
    try{
      const result=await window.desktop.save({id:sourceDoc.id,text,path:sourceDoc.path,name:sourceDoc.name,origin:sourceDoc.origin,workspaceRoot:sourceDoc.workspaceRoot,savedText:sourceDoc.savedMarkdown,saveAs})
      if(!result)return false
      const updated={...sourceDoc,...result,markdown:result.text,savedMarkdown:result.text,dirty:false,loaded:true,externalMissing:false}
      current.current.docs=current.current.docs.map(d=>d.id===sourceDoc.id?updated:d);if(current.current.doc.id===sourceDoc.id){current.current.doc=updated;current.current.markdown=result.text};setDocs(items=>items.map(d=>d.id===sourceDoc.id?updated:d));ignoredExternal.current.delete(sourceDoc.id);setExternal(items=>{const next={...items};delete next[sourceDoc.id];return next})
      if(current.current.doc.id===sourceDoc.id){window.mdtexImageContext={id:sourceDoc.id,path:result.path};editor.commands.setContent(result.text,{contentType:'markdown',emitUpdate:false});setMarkdown(result.text);setWorkspaceRoot(result.workspaceRoot||null);if(result.workspaceRoot)setTab('tree')}
      await refreshLocalDocuments();setWorkspaceVersion(n=>n+1);notify(result.origin==='data'?'已手动保存到 MDTeX-data/documents':'文档和本地图片已保存')
      return true
    }catch(e){notify('保存失败：'+e.message);return false}
  }
  async function saveFile(saveAs=false){
    if(current.current.busy)return false
    syncSource();setBusy(true)
    try{
      if(window.desktop)return await saveDocument(current.current.doc,saveAs)
      const s=current.current,url=URL.createObjectURL(new Blob([s.markdown],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=s.doc.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setDocs(items=>items.map(d=>d.id===s.doc.id?{...d,savedMarkdown:s.markdown,dirty:false}:d));return true
    }finally{setBusy(false)}
  }
  async function saveAllDocuments(){
    if(current.current.busy)return false
    syncSource();const s=current.current,items=s.docs.filter(d=>d.dirty).map(d=>d.id===s.doc.id?{...d,markdown:s.markdown}:d)
    setBusy(true)
    try{for(const item of items)if(!await saveDocument(item))return false;persistNow();return true}finally{setBusy(false)}
  }
  async function exportZip() {
    if(current.current.busy)return
    if(!window.desktop)return notify('请使用桌面版打包文档和本地图片')
    syncSource();const snapshot=current.current
    setBusy(true)
    try{const result=await window.desktop.exportZip({id:snapshot.doc.id,path:snapshot.doc.path,name:snapshot.doc.name,text:snapshot.markdown});if(result)notify('ZIP 已导出，包含当前内容和本地图片；原文档未改变')}
    catch(e){notify('打包失败：'+e.message)}finally{setBusy(false)}
  }
  function contextNumber(remove=false) {
    const snapshot=current.current
    if(snapshot.busy)return
    if(snapshot.mode==="source"||snapshot.mode==="read"||document.activeElement===sourceRef.current)return notify("请在编辑视图中选择正文或标题，再使用自动编号")
    if(!editor.commands.smartNumbering(remove))return notify("请选择正文段落或单个标题，代码块和混合标题选择不适用")
    const text=editor.getMarkdown();setMarkdown(text)
    setDocs(items=>items.map(d=>d.id===snapshot.doc.id?{...d,markdown:text,numbered:editor.storage.headingNumbering.enabled}:d))
  }
  function number(enabled, scope = 'all') {
    if(current.current.busy)return
    if (current.current.mode === 'read') return notify('请先切换到编辑或源码模式，再修改编号')
    setNumberMenu(null)
    if (scope === 'current') {
      if (current.current.mode === 'source' || document.activeElement === sourceRef.current) return notify('请在编辑视图中，将光标放入要编号的标题')
      if (!editor.commands.setCurrentHeadingNumbering(enabled)) return notify('请将光标放入一个标题内，再执行单标题操作')
    } else { syncSource(); editor.commands.setHeadingNumbering(enabled) }
    const text = editor.getMarkdown(); setMarkdown(text)
    setDocs(items => items.map(d => d.id === current.current.doc.id ? { ...d, markdown: text, numbered: editor.storage.headingNumbering.enabled } : d))
    notify(scope === 'current' ? (enabled ? '已编号当前标题，并更新后续已编号标题' : '已移除当前编号，并更新后续已编号标题') : enabled ? '已启用全文自动编号，标题变化时会按层级重排' : '已移除所有标题编号')
  }
  function captureFormulaReturn(){
    const s=current.current,el=sourceRef.current
    pendingFormulaReturn.current=null
    formulaReturn.current={id:s.doc.id,bookmark:editor.state.selection.getBookmark(),top:richRef.current?.scrollTop||0,left:richRef.current?.scrollLeft||0,source:el&&(s.mode==='source'||(s.mode==='split'&&lastPane.current==='source'))?{from:el.selectionStart,to:el.selectionEnd,direction:el.selectionDirection,top:el.scrollTop,left:el.scrollLeft}:null}
  }
  function cancelFormula(){formulaSource.current=null;pendingFormulaReturn.current=formulaReturn.current;setModal(null)}
  function openFormula() {
    const s=current.current
    if(s.busy)return
    if(s.mode==='read')return notify('请先切换到编辑或源码模式，再插入公式')
    syncSource();captureFormulaReturn();savedSelection.current=editor.state.selection
    const input=sourceRef.current,fromSource=(s.mode==='source'||(s.mode==='split'&&lastPane.current==='source'))&&input
    const sourceText=fromSource?input.value:''
    const lineEnd=fromSource?sourceText.indexOf('\n',input.selectionStart):-1
    const line=fromSource?sourceText.slice(sourceText.lastIndexOf('\n',input.selectionStart-1)+1,lineEnd<0?undefined:lineEnd):''
    const selection=editor.state.selection
    const selectedText=fromSource?sourceText.slice(input.selectionStart,input.selectionEnd):selection instanceof TextSelection||selection instanceof AllSelection?editor.state.doc.textBetween(selection.from,selection.to,'\n'):''
    if(selectedText.trim()){
      if(fromSource){
        const from=input.selectionStart,to=input.selectionEnd
        const before=sourceText.slice(sourceText.lastIndexOf('\n',from-1)+1,from),end=sourceText.indexOf('\n',to),after=sourceText.slice(to,end<0?undefined:end)
        const display=!before.trim()&&!after.trim()||selectedText.includes('\n'),latex=selectedText.trim(),replacement=display?`\n\n$$\n${latex}\n$$\n\n`:`$${latex}$`
        const next=sourceText.slice(0,from)+replacement+sourceText.slice(to)
        pendingFormulaSourceCaret.current={id:s.doc.id,text:next,caret:from+replacement.length};editMarkdown(next)
      }else{
        let unsupported=false;editor.state.doc.nodesBetween(selection.from,selection.to,node=>{if(node.type.name==='codeBlock'||!node.isText&&node.isAtom)unsupported=true})
        if(unsupported)return notify('请选择正文文字；代码块、图片和已有公式不直接转换')
        const whole=selection instanceof AllSelection||selection.$from.sameParent(selection.$to)&&selection.$from.parentOffset===0&&selection.$to.parentOffset===selection.$to.parent.content.size
        editor.chain().focus().command(({tr})=>{closeHistory(tr);return true}).insertContent({type:whole||selectedText.includes('\n')?'blockMath':'inlineMath',attrs:{latex:selectedText.trim()}}).run()
      }
      setSlash(null);notify('选中文字已转换为公式，双击可继续编辑');return
    }
    const parent=editor.state.selection.$from.parent
    const inText=fromSource?!!line.trim():['paragraph','heading'].includes(parent.type.name)&&!!(parent.textContent.trim()||parent.content.content.some(node=>node.isInline&&node.isAtom))
    latexSelection.current=null;pendingLatexCaret.current=null
    formulaSource.current=fromSource?{id:s.doc.id,original:s.markdown,markdown:sourceText,from:input.selectionStart,to:input.selectionEnd}:null
    setFormula({latex:'\\frac{a}{b}',display:!inText});setModal('formula')
  }
  function insertFormula() {
    if (!formula.latex.trim()) return
    if (formula.pos != null) {
      const type=formula.display?'blockMath':'inlineMath'
      const chain=editor.chain().focus().setNodeSelection(formula.pos)
      if(editor.state.doc.nodeAt(formula.pos)?.type.name===type)chain.updateAttributes(type,{latex:formula.latex}).run()
      else chain.insertContent({type,attrs:{latex:formula.latex}}).run()
    }
    else if (formulaSource.current) {
      const snapshot=formulaSource.current
      if(snapshot.id!==current.current.doc.id||snapshot.original!==current.current.markdown)return notify('文档已变化，请重新选择公式插入位置')
      const start=snapshot.from,end=snapshot.to
      const text = formula.display ? `\n\n$$\n${formula.latex}\n$$\n\n` : `$${formula.latex}$`
      const next=snapshot.markdown.slice(0,start)+text+snapshot.markdown.slice(end)
      pendingFormulaSourceCaret.current={id:snapshot.id,text:next,caret:start+text.length}
      editMarkdown(next)
    } else {
      const chain = editor.chain().focus()
      if (savedSelection.current) chain.setTextSelection({from:savedSelection.current.from,to:savedSelection.current.to})
      chain.insertContent({ type: formula.display ? 'blockMath' : 'inlineMath', attrs: {latex:formula.latex} }).run()
    }
    formulaSource.current=null;setModal(null)
  }
  function insertTable(size = grid) {
    if (mode === 'source') {
      const text = tableHeader
        ? '\n\n| ' + Array(size.cols).fill(' ').join(' | ') + ' |\n| ' + Array(size.cols).fill('---').join(' | ') + ' |\n' + Array(Math.max(0,size.rows-1)).fill('| ' + Array(size.cols).fill(' ').join(' | ') + ' |').join('\n') + '\n\n'
        : '\n\n<table><tbody>' + Array(size.rows).fill('<tr>' + Array(size.cols).fill('<td><p></p></td>').join('') + '</tr>').join('') + '</tbody></table>\n\n'
      const el = sourceRef.current, start = el?.selectionStart ?? markdown.length, end = el?.selectionEnd ?? start
      editMarkdown(markdown.slice(0,start) + text + markdown.slice(end))
    } else editor.chain().focus().insertTable({ rows:size.rows, cols:size.cols, withHeaderRow:tableHeader }).run()
    setTableMenu(null)
  }
  function run(command) {
    if (!editor||current.current.busy) return
    if (mode === 'read') changeMode('edit')
    syncSource(); command(editor.chain().focus()).run(); setMarkdown(editor.getMarkdown())
  }
  function alignParagraph(value) {
    const s=current.current
    if(!editor||s.busy||['source','read'].includes(s.mode))return
    const input=sourceRef.current,fromSource=s.mode==='split'&&lastPane.current==='source'&&input
    const from=fromSource?sourceToEditor(editor,s.markdown,input.selectionStart):null
    const to=fromSource?sourceToEditor(editor,s.markdown,input.selectionEnd):null
    syncSource()
    if(fromSource)setEditorSelection(editor,from,to)
    editor.chain().focus().setParagraphAlignment(value).run()
    setMarkdown(editor.getMarkdown())
  }
  function applyHighlight(color){
    const s=current.current,input=sourceRef.current
    if(s.busy||s.mode==='read')return
    if(input&&(s.mode==='source'||s.mode==='split'&&lastPane.current==='source')){
      if(input.selectionStart===input.selectionEnd)return notify('请先选择需要高亮的文字')
      const from=sourceToEditor(editor,s.markdown,input.selectionStart),to=sourceToEditor(editor,s.markdown,input.selectionEnd)
      syncSource();setEditorSelection(editor,from,to)
      if(color==='none')editor.commands.unsetHighlight();else editor.commands.setHighlight(color)
      const text=editor.getMarkdown(),start=editorToSource(editor,text,editor.state.selection.from),end=editorToSource(editor,text,editor.state.selection.to,-1)
      editMarkdown(text);requestAnimationFrame(()=>{input.focus({preventScroll:true});input.setSelectionRange(start,end)})
    }else{
      syncSource();const chain=editor.chain().focus()
      if(color==='none')chain.unsetHighlight().run();else chain.setHighlight(color).run()
    }
    setHighlightMenu(null)
  }
  function selectCell(cell) {
    const pos = editor.view.posAtDOM(cell, 0)
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos + 1))))
  }
  function tableEdge(kind) {
    if (!tableHover) return
    const rows = tableHover.el.rows
    selectCell(kind === 'row' ? rows[rows.length-1].cells[0] : rows[0].cells[rows[0].cells.length-1])
    editor.chain().focus()[kind === 'row' ? 'addRowAfter' : 'addColumnAfter']().run(); setTableHover(null)
  }
  function hover(e) {
    if (mode === 'read') return
    const table = e.target.closest('table')
    if (table) { const r = table.getBoundingClientRect(); setTableHover({el:table, x:r.right, y:r.bottom, left:r.left, top:r.top, width:r.width, height:r.height}) }
    else if (!e.target.closest('.table-edge')) setTableHover(null)
  }
  const headings = []
  if (editor) editor.state.doc.descendants((node,pos) => { if(node.type.name === 'heading') headings.push({title:node.textContent || '未命名标题',level:node.attrs.level,pos}) })
  const title = headings[0]?.title || doc.name.replace(/\.md$/,'')
  const count = markdown.replace(/\s/g,'').length
  const editable = !busy && mode !== 'read'
  current.current.docsDirty=docs.some(d=>d.id!==active&&d.dirty)
  const sourceOnly = mode === 'source'
  const formatsDisabled = sourceOnly || !editable
  return <div className={`app ${focus ? 'focus-mode' : ''}`} aria-busy={busy} onPasteCapture={pasteImage} onClick={() => { setContext(null); setNumberMenu(null); setTableMenu(null); setHighlightMenu(null) }}>
    <header className="app-header"><div className="brand"><span className="brand-mark">M<span>⌁</span></span><strong>MDTeX</strong><span className="brand-caption">留白之间，自有思考</span></div><div className="header-actions"><select className="theme-select" aria-label="主题" value={theme} onChange={e=>setTheme(e.target.value)}><option value="system">跟随系统</option><option value="light">浅色主题</option><option value="dark">暗色主题</option></select><UpdateNotice prepareUpdate={prepareUpdate} releaseUpdate={()=>setBusy(false)}/><span className={`draft-status ${storageError ? 'error' : ''}`}><span/>{storageError ? '会话索引写入失败' : doc.dirty?'未保存修改':doc.path?(doc.origin==='data'?'data 本地文档':'本地文件'):'手动保存 · 未指定路径'}</span><button className="button quiet" disabled={busy} onClick={openFolder}><FolderOpen size={16}/>打开文件夹</button><button className="button quiet" disabled={busy} onClick={openFile}><FileText size={16}/>打开md文档</button><button className="button quiet" disabled={busy} onClick={exportZip}><Download size={16}/>打包 ZIP</button><button className="button primary" disabled={busy} onClick={() => saveFile()}><Save size={15}/>保存<span className="shortcut">Ctrl S</span></button></div></header>
    <div className="workspace">
      {sidebar && <aside className="sidebar"><div className="workspace-label">我的写作空间 <button className="icon-button" onClick={newDoc} title="新建文档" aria-label="新建文档"><Plus size={17}/></button></div><button className="current-document" onClick={() => setTab('files')}><span className="doc-icon"><FileText size={20}/></span><span><strong>{doc.name.replace(/\.md$/,'')}</strong><small>Markdown 文档</small></span><MoreHorizontal size={16}/></button><div className="sidebar-tabs"><button className={tab==='outline'?'selected':''} onClick={() => setTab('outline')}>文档大纲</button><button className={tab==='files'?'selected':''} onClick={() => setTab('files')}>本地文档 <span>{docs.filter(isLocalDraft).length}</span></button>{workspaceRoot&&<button className={tab==='tree'?'selected':''} onClick={()=>setTab('tree')}>文件树</button>}</div>{tab==='tree'&&workspaceRoot?<WorkspacePanel root={workspaceRoot} refreshKey={workspaceVersion} onOpen={openWorkspaceDoc} onRename={renameWorkspaceDoc} onDelete={detachWorkspaceDoc} notify={notify}/>:tab==='outline' ? <nav className="outline">{headings.length ? headings.map((h,i) => <button key={i} data-outline-pos={h.pos} aria-current={activeHeading===h.pos?'location':undefined} className={activeHeading===h.pos?'outline-active':''} style={{paddingLeft:14 + (h.level-1)*13}} title={h.title} onClick={()=>navigateOutline(i)}><span className="outline-dot"/>{h.title}</button>) : <p className="muted">添加标题后，大纲会出现在这里。</p>}</nav> : <div className="draft-list">{docs.filter(isLocalDraft).map(d => <div key={d.id} className={d.id===active?"draft-row selected":"draft-row"}><button className="draft-open" title={d.path||d.name} onClick={() => switchDoc(d)}><FileText size={15}/><span>{d.name.replace(/\.md$/i,"")}</span>{d.id===active && <span className="active-dot"/>}</button><button className="draft-remove" aria-label={"删除本地文档 "+d.name} title="删除本地文档及其图片" onClick={()=>setDraftDelete(d)}><Trash2 size={14}/></button></div>)}<button className="new-draft" onClick={newDoc}><Plus size={15}/>新建空白文档</button></div>}<div className="sidebar-footer"><span className="local-dot"/>本地优先 · 无需联网<button onClick={() => setModal('shortcuts')}><Keyboard size={16}/>快捷键指南</button></div></aside>}
      <main className="main"><div className="document-tabs" role="tablist" aria-label="打开的文档">{openIds.map(id=>docs.find(d=>d.id===id)).filter(Boolean).map(d=><div key={d.id} className={d.id===active?"document-tab selected":"document-tab"}><button disabled={busy} role="tab" aria-selected={d.id===active} title={d.path||"未保存文档"} onClick={()=>switchDoc(d)}><FileText size={14}/><span>{d.name}<small>{d.workspaceRoot?.name||"本地文档"}</small></span>{d.dirty&&<i/>}</button><button disabled={busy} aria-label={"关闭标签 "+d.name} title="关闭标签，未保存时询问" onClick={()=>closeTab(d.id)}><X size={12}/></button></div>)}</div><div className="document-bar"><div className="breadcrumb"><button className="icon-button" onClick={() => setSidebar(!sidebar)} title="切换侧栏" aria-label="切换侧栏">{sidebar ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</button><span>文档</span><ChevronRight size={13}/><span className="breadcrumb-name">{doc.name}</span>{doc.dirty && <span title="尚未保存到文件" className="unsaved-dot"/>}</div><div className="view-switch">{[['edit',PenLine,'编辑'],['read',BookOpen,'阅读'],['source',Code2,'源码'],['split',Columns2,'分屏']].map(([value,Icon,label]) => <button key={value} className={mode===value?'selected':''} onMouseDown={e=>e.preventDefault()} onClick={() => changeMode(value)}><Icon size={14}/>{label}</button>)}</div><button className="icon-button focus-button" onClick={() => setFocus(!focus)} title="专注写作 · Esc 退出" aria-label="专注写作"><Maximize2 size={16}/></button></div>
      <div className={`format-bar ${!editable ? 'reading-toolbar' : ''}`}><div className="format-group"><select aria-label="段落格式" disabled={formatsDisabled} value={editor?.isActive('heading') ? editor.getAttributes('heading').level : 'p'} onChange={e => run(c => e.target.value==='p' ? c.setParagraph() : c.setHeading({level:Number(e.target.value)}))}><option value="p">正文</option>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>标题 {n}</option>)}</select></div><div className="format-group"><Tool icon={Bold} label="加粗 Ctrl+B" active={editor?.isActive('bold')} disabled={formatsDisabled} onClick={() => run(c=>c.toggleBold())}/><Tool icon={Italic} label="斜体 Ctrl+I" active={editor?.isActive('italic')} disabled={formatsDisabled} onClick={() => run(c=>c.toggleItalic())}/><Tool icon={Strikethrough} label="删除线" disabled={formatsDisabled} onClick={() => run(c=>c.toggleStrike())}/><Tool icon={Highlighter} label="文字高亮" active={editor?.isActive('highlight')} disabled={!editable} onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setHighlightMenu(highlightMenu?null:{x:Math.min(r.left,window.innerWidth-240),y:r.bottom+8})}}/><Tool icon={Link} label="插入链接" disabled={formatsDisabled} onClick={() => { savedSelection.current=editor.state.selection; setSearch(editor.getAttributes('link').href||''); setModal('link') }}/></div><div className="format-group"><Tool icon={List} label="无序列表" disabled={formatsDisabled} active={editor?.isActive('bulletList')} onClick={() => run(c=>c.toggleBulletList())}/><Tool icon={ListOrdered} label="自动编号" disabled={formatsDisabled} active={editor?.isActive("heading")?numberPrefix.test(editor.state.selection.$from.parent.textContent):editor?.isActive("orderedList")} onClick={()=>contextNumber()}/><Tool icon={ListChecks} label="任务列表" disabled={formatsDisabled} onClick={() => run(c=>c.toggleTaskList())}/><Tool icon={Quote} label="引用" disabled={formatsDisabled} onClick={() => run(c=>c.toggleBlockquote())}/><Tool icon={Code2} label="代码块" disabled={formatsDisabled} onClick={() => run(c=>c.toggleCodeBlock())}/></div><div className="format-group alignment-tools">{[["left",AlignLeft,"段落靠左"],["center",AlignCenter,"段落居中"],["right",AlignRight,"段落靠右"]].map(([align,Icon,label])=><Tool key={align} icon={Icon} label={label} active={!(mode==="split"&&lastPane.current==="source")&&selectionAlignment(editor)===align} disabled={formatsDisabled||!editor||(!(mode==="split"&&lastPane.current==="source")&&!selectedTextBlocks(editor.state).length)} onClick={()=>alignParagraph(align)}/>)}</div><div className="format-group insert-tools"><Tool icon={Table2} label="插入表格" disabled={!editable} onClick={openTableMenu}>表格</Tool><Tool icon={FileText} label="插入图片" disabled={!editable} onClick={()=>{syncSource();imageRef.current.click()}}>图片</Tool><Tool icon={Sigma} label="插入公式 Ctrl+Shift+M" disabled={!editable} onClick={openFormula}>公式</Tool><Tool icon={Hash} label="标题编号选项" active={doc.numbered} disabled={!editable} onClick={e => { e.stopPropagation(); const r=e.currentTarget.getBoundingClientRect(); setNumberMenu(numberMenu ? null : {x:Math.min(r.left,window.innerWidth-315),y:r.bottom+8}) }}>全文编号<ChevronDown size={11}/></Tool></div><div className="format-group history-tools"><Tool icon={Undo2} label="撤销 Ctrl+Z" disabled={formatsDisabled || !editor?.can().undo()} onClick={() => run(c=>c.undo())}/><Tool icon={Redo2} label="重做 Ctrl+Shift+Z" disabled={formatsDisabled || !editor?.can().redo()} onClick={() => run(c=>c.redo())}/></div><span className="toolbar-hint">{mode==='read' ? '只读预览' : '输入 / 快速插入'}</span></div>
      {external[doc.id]&&<div className="external-change" role="status"><span>{external[doc.id].missing?'源文件不可用，当前编辑仍保留，可另存为副本。':'文件已在其他程序中更新；当前有未保存修改，请选择处理方式。'}</span>{!external[doc.id].missing&&<button disabled={busy} onClick={reloadExternal}>载入磁盘版本</button>}<button disabled={busy} onClick={keepExternalEdits}>保留当前编辑</button><button disabled={busy} onClick={()=>saveFile(true)}>另存为副本</button></div>}
      <div className={`document-area mode-${mode}`}>
        {['source','split'].includes(mode) && <section className="source-pane"><div className="pane-label"><Code2 size={13}/> MARKDOWN<span>UTF-8</span></div><textarea disabled={busy} ref={sourceRef} style={{fontSize:15*view.zoom/100}} aria-label="Markdown 源码" onFocus={()=>{lastPane.current="source";setRevision(n=>n+1)}} value={markdown} spellCheck={false} onChange={e => editMarkdown(e.target.value)} onKeyDown={e => {if(e.key==='Tab'){e.preventDefault();const start=e.currentTarget.selectionStart,end=e.currentTarget.selectionEnd;editMarkdown(markdown.slice(0,start)+'  '+markdown.slice(end));requestAnimationFrame(()=>{sourceRef.current.selectionStart=sourceRef.current.selectionEnd=start+2})}}}/></section>}
        <section className={`render-pane ${sourceOnly ? 'hidden' : ''}`} ref={richRef} onMouseMove={hover} onMouseLeave={e => {if(!e.relatedTarget?.closest?.('.table-edge'))setTableHover(null)}} onContextMenu={e => { const cell=e.target.closest('td,th'); if(cell && editable){e.preventDefault();selectCell(cell);setContext({x:Math.min(e.clientX,window.innerWidth-220),y:Math.min(e.clientY,window.innerHeight-360)})} }}>
          {mode==='split' && <div className="pane-label"><PenLine size={13}/> 实时预览<span>可直接编辑</span></div>}<div className="paper" style={{zoom:view.zoom/100,maxWidth:view.width==="wide"?"none":view.width==="compact"?850:1100}}><div className="paper-meta"><span>MARKDOWN DOCUMENT</span><span>{mode==='read' ? '阅读模式' : '让文字有序，让灵感自由'}</span></div><EditorContent editor={editor} onFocusCapture={()=>{lastPane.current="rich"}} onKeyUp={e => {if(e.key==='/'){const s=editor.state.selection; if(s.$from.parent.textContent==='/'){const r=editor.view.coordsAtPos(s.from);setSlash({pos:s.from-1,x:Math.min(r.left,window.innerWidth-280),y:Math.min(r.bottom+8,window.innerHeight-330)})}}else if(e.key==='Escape')setSlash(null)}}/><div className="paper-end"><span/>写到这里，也是一种进步<span/></div></div>
        </section>
      </div><footer className="status-bar"><div><span className="status-dot"/>{mode==='read'?'阅读模式':mode==='source'?'源码编辑':mode==='split'?'双向编辑':'所见即所得'}<span className="status-divider"/>{headings.length} 个标题{doc.numbered && <span className="numbering-status">自动编号已启用</span>}</div><div>{count.toLocaleString()} 字符<span className="status-divider"/>约 {Math.max(1,Math.ceil(count/500))} 分钟阅读<span className="status-divider"/>Markdown <span className="encoding">UTF-8</span><div className="view-controls"><select aria-label="页面宽度" value={view.width} onChange={e=>setView(v=>({...v,width:e.target.value}))}><option value="compact">紧凑页宽</option><option value="standard">舒适页宽</option><option value="wide">铺满窗口</option></select><button aria-label="缩小页面" title="缩小 Ctrl+−" disabled={view.zoom<=70} onClick={()=>setView(v=>normalizeView({...v,zoom:v.zoom-10}))}><Minus size={13}/></button><button className="zoom-reset" aria-label="重置缩放" title="重置到 100% · Ctrl+0" onClick={()=>setView(v=>({...v,zoom:100}))}>{view.zoom}%</button><button aria-label="放大页面" title="放大 Ctrl++" disabled={view.zoom>=180} onClick={()=>setView(v=>normalizeView({...v,zoom:v.zoom+10}))}><Plus size={13}/></button></div></div></footer></main>
    </div>
    {numberMenu && <div className="number-menu" role="menu" aria-label="标题编号" style={{left:numberMenu.x,top:numberMenu.y}} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.preventDefault()}><small>全文操作</small><button role="menuitem" onClick={()=>number(true)}>全文自动编号<kbd>Ctrl+Alt+N</kbd></button><button role="menuitem" onClick={()=>number(false)}>移除全文编号<kbd>Ctrl+Alt+Shift+N</kbd></button><p>正文或单个标题请使用工具栏的“自动编号”。标题按层级编号，正文按有序列表编号。</p></div>}
    {tableHover && editable && <><button className="table-edge add-row" style={{left:tableHover.left+tableHover.width/2-13,top:tableHover.y-1}} aria-label="在表格末尾添加行" title="添加行" onClick={() => tableEdge('row')}><Plus size={15}/></button><button className="table-edge add-col" style={{left:tableHover.x-1,top:tableHover.top+tableHover.height/2-13}} aria-label="在表格右侧添加列" title="添加列" onClick={() => tableEdge('col')}><Plus size={15}/></button></>}
    {context && <div className="context-menu" style={{left:context.x,top:context.y}} onClick={e=>e.stopPropagation()}>{[['在上方插入行','addRowBefore'],['在下方插入行','addRowAfter'],['在左侧插入列','addColumnBefore'],['在右侧插入列','addColumnAfter'],['删除当前行','deleteRow'],['删除当前列','deleteColumn'],['删除整个表格','deleteTable'],['设置 / 取消标题行','toggleHeaderRow'],['设置 / 取消标题列','toggleHeaderColumn'],['选中整个表格','selectTable']].map(([label,cmd],i)=><button className={i>=4&&i<=6?'danger':''} key={cmd} onClick={()=>{editor.chain().focus()[cmd==='selectTable'?'selectWholeTable':cmd]().run();setContext(null)}}>{label}</button>)}</div>}
    {slash && editable && <div className="slash-menu" onClick={e=>e.stopPropagation()} style={{left:slash.x,top:slash.y}}><small>快捷插入 <button onClick={()=>setSlash(null)} aria-label="关闭快捷菜单"><X size={13}/></button></small>{[['一级标题',Hash,()=>run(c=>c.setHeading({level:1}))],['二级标题',Hash,()=>run(c=>c.setHeading({level:2}))],['表格',Table2,openTableMenu],['公式',Sigma,openFormula],['代码块',Code2,()=>run(c=>c.setCodeBlock())],['任务列表',ListChecks,()=>run(c=>c.toggleTaskList())],['分割线',Minus,()=>run(c=>c.setHorizontalRule())]].map(([label,Icon,action])=><button key={label} onMouseDown={e=>e.preventDefault()} onClick={()=>{editor.chain().focus().deleteRange({from:slash.pos,to:slash.pos+1}).run();setSlash(null);action()}}><Icon size={17}/>{label}<span>↵</span></button>)}</div>}
    {modal==='formula' && <Modal title={formula.pos != null?'编辑公式':'插入公式'} subtitle="行内公式跟随正文排版，独立公式单独成行。" close={cancelFormula} wide className="formula-modal"><fieldset className="formula-mode-picker"><legend>插入方式</legend>{[[false,"行内公式","嵌入正文，与文字同行"],[true,"独立公式","单独一行，默认居中"]].map(([display,label,hint])=><label key={label} className={formula.display===display?"selected":""}><input type="radio" name="formula-mode" aria-label={label} checked={formula.display===display} onChange={()=>setFormula(old=>({...old,display}))}/><span><strong>{label}</strong><small>{hint}</small></span></label>)}</fieldset><div className="formula-content"><div className="formula-tabs">{Object.keys({...templates,...symbols}).map(cat=><button key={cat} className={cat===category?'selected':''} onMouseDown={e=>e.preventDefault()} onClick={()=>setCategory(cat)}>{cat}</button>)}</div><div className="formula-templates">{(symbols[category]||templates[category]).map(([name,latex])=><button title={name} aria-label={name} key={name} onMouseDown={e=>e.preventDefault()} onClick={()=>chooseSymbol(latex,!symbols[category])}><span dangerouslySetInnerHTML={{__html:mathHTML(latex)}}/><small>{name}</small></button>)}</div><div className="formula-input-label"><label htmlFor="latex">LaTeX 源码</label><span>模板优先插入光标处或替换选中文字；未定位光标时更新整式</span></div><textarea ref={latexRef} id="latex" className="latex-input" value={formula.latex} onFocus={rememberLatexSelection} onSelect={rememberLatexSelection} onChange={e=>{rememberLatexSelection(e);setFormula(old=>({...old,latex:e.target.value}))}} spellCheck={false}/><div className="formula-preview"><small>{formula.display?"独立公式预览 · "+({left:"靠左",center:"居中",right:"靠右"}[formula.textAlign||"center"]):"行内公式预览 · 跟随段落对齐"}</small><div className="formula-preview-math" style={{textAlign:formula.display?(formula.textAlign||"center"):"left"}}>{!formula.display&&<span className="formula-preview-context">正文示例 </span>}<span dangerouslySetInnerHTML={{__html:mathHTML(formula.latex,formula.display)}}/>{!formula.display&&<span className="formula-preview-context"> 继续正文</span>}</div></div></div><footer className="modal-footer"><span className="formula-mode-summary">{formula.display?"将单独成行，可用段落对齐工具调整":"将插入正文，不改变段落对齐"}</span><button className="button quiet" onClick={cancelFormula}>取消</button><button className="button primary" disabled={!formula.latex.trim()} onClick={insertFormula}>{formula.pos!=null?'更新公式':'插入公式'}<ChevronRight size={15}/></button></footer></Modal>}
    {highlightMenu&&<div className="highlight-popover" role="dialog" aria-label="文字高亮颜色" style={{left:highlightMenu.x,top:highlightMenu.y}} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.preventDefault()}><strong>文字高亮</strong><div className="highlight-swatches">{[...highlightColors,{id:'none',name:'无色'}].map(color=><button key={color.id} aria-label={color.name+'高亮'} onClick={()=>applyHighlight(color.id)}><i className={color.id==='none'?'no-highlight':''} style={color.id==='none'?undefined:{background:`var(--highlight-${color.id})`}}/>{color.name}</button>)}</div></div>}
    {tableMenu && <div className="table-popover" role="dialog" aria-label="选择表格尺寸" style={{left:tableMenu.x,top:tableMenu.y}} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.preventDefault()}><strong>插入表格 · {grid.rows} 行 × {grid.cols} 列</strong><div className="table-picker">{Array.from({length:8},(_,r)=><div key={r}>{Array.from({length:8},(_,c)=><button key={c} aria-label={(r+1)+" 行 "+(c+1)+" 列"} className={r<grid.rows&&c<grid.cols?"picked":""} onFocus={()=>setGrid({rows:r+1,cols:c+1})} onMouseEnter={()=>setGrid({rows:r+1,cols:c+1})} onClick={()=>insertTable({rows:r+1,cols:c+1})}/>)}</div>)}</div><label className="table-header-option"><input type="checkbox" checked={tableHeader} onChange={e=>setTableHeader(e.target.checked)}/>首行设为标题行</label><small>移动选择尺寸，点击直接插入。右键可切换标题行。</small></div>}
    {modal==='link' && <Modal title="插入链接" subtitle="输入网页地址，应用到选中的文字。" close={()=>setModal(null)}><input className="link-input" aria-label="链接地址" value={search} placeholder="https://example.com" onChange={e=>setSearch(e.target.value)}/><footer className="modal-footer"><button className="button quiet" onClick={()=>{run(c=>c.unsetLink());setModal(null)}}>移除链接</button><button className="button primary" disabled={!/^(https?:\/\/|mailto:)/i.test(search)} onClick={()=>{const s=savedSelection.current;editor.chain().focus().setTextSelection({from:s.from,to:s.to}).extendMarkRange('link').setLink({href:search}).run();setModal(null)}}>应用链接</button></footer></Modal>}
    {modal==='shortcuts' && <Modal title="写作快捷键" subtitle="让常用操作，离你再近一步。" close={()=>setModal(null)}><div className="shortcuts-list">{[['打开文档','Ctrl + O'],['保存文件','Ctrl + S'],['另存为','Ctrl + Shift + S'],['源码 / 编辑切换','Ctrl + /'],['阅读 / 编辑切换','Ctrl + Shift + P'],['插入公式','Ctrl + Shift + M'],['启用 / 重排标题编号','Ctrl + Alt + N'],['移除全文标题编号','Ctrl + Alt + Shift + N'],['自动编号（正文 / 标题）','Ctrl + Shift + 7 / Ctrl + Alt + H'],['移除当前编号','Ctrl + Alt + Shift + H'],['放大 / 缩小页面','Ctrl + 加号 / 减号'],['恢复 100% 缩放','Ctrl + 0'],['撤销 / 重做','Ctrl + Z / Ctrl + Shift + Z'],['快捷插入','空段落输入 /']].map(([a,b])=><div key={a}><span>{a}</span><kbd>{b}</kbd></div>)}</div></Modal>}
    {draftDelete&&<Modal title="删除本地文档" subtitle={draftDelete.name} close={()=>{if(!current.current.busy)setDraftDelete(null)}}><p>{draftDelete.path?"将这份 data 本地文档及其 picture 图片移入回收站？未保存的修改会保留在标签中。":"删除这份尚未保存的文档？当前未保存内容将被丢弃。"}</p><footer className="modal-footer"><button disabled={busy} className="button quiet" onClick={()=>setDraftDelete(null)}>取消</button><button disabled={busy} className="button primary" onClick={deleteLocalDraft}>删除文档</button></footer></Modal>}
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    <input type="file" ref={imageRef} hidden accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" onChange={e=>{const file=e.target.files?.[0];if(file)insertImageFile(file);e.target.value=""}}/>
    <input type="file" ref={fileRef} hidden accept=".md" onChange={async e=>{const file=e.target.files?.[0];if(file){if(!/\.md$/i.test(file.name))notify('仅支持 .md 后缀的文档');else if(file.size>20*1024*1024)notify('文件超过 20 MB，请选择较小的文档');else importDoc(await file.text(),file.name)}e.target.value=''}}/>
  </div>
}
