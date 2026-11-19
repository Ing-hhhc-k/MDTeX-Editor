import React, { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { TableKit } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import {LocalImage} from './LocalImage'
import { TextSelection } from '@tiptap/pm/state'
import { BookOpen, PenLine, Code2, Columns2, PanelLeftClose, PanelLeftOpen, FileText, Plus, FolderOpen, Save, ChevronDown, ChevronRight, Bold, Italic, Strikethrough, List, ListOrdered, Quote, Table2, Sigma, Hash, Undo2, Redo2, Link, Check, X, Search, Keyboard, MoreHorizontal, Download, ListChecks, Minus, Maximize2 } from 'lucide-react'
import { InlineMath, BlockMath, FoldingCode, HeadingNumbering, mathHTML } from './extensions'
import { welcome } from './sample'
import { loadView, normalizeView } from './view-settings'
import WorkspacePanel from './WorkspacePanel'
import { symbols } from './formula-symbols'

const fresh = (markdown = '', name = '未命名文档.md') => ({ id: crypto.randomUUID(), name, markdown, updated: Date.now(), numbered: false, origin:'draft' })
function loadDrafts() {
  try { const data = JSON.parse(localStorage.getItem('mdtex.drafts.v1')); if (data?.docs?.length) return data } catch {}
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
function Modal({ title, subtitle, close, children, wide }) {
  const ref = useRef()
  useEffect(() => {
    const previous = document.activeElement
    const el = ref.current
    el.querySelector('textarea,input,button')?.focus()
    const key = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close() }
      if (e.key === 'Tab') {
        const els = [...el.querySelectorAll('button,input,textarea,select,[tabindex="0"]')].filter(n => !n.disabled)
        if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els.at(-1)?.focus() }
        else if (!e.shiftKey && document.activeElement === els.at(-1)) { e.preventDefault(); els[0]?.focus() }
      }
    }
    el.addEventListener('keydown', key)
    return () => { el.removeEventListener('keydown', key); previous?.focus() }
  }, [])
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}><section ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" aria-label="关闭" onClick={close}><X size={20}/></button></header>{children}</section></div>
}

export default function App() {
  const [docs, setDocs] = useState(initial.docs)
  const [openIds,setOpenIds]=useState(initial.openIds||initial.docs.map(d=>d.id))
  const [workspaceRoot,setWorkspaceRoot]=useState(initial.docs.find(d=>d.id===initial.active)?.workspaceRoot||null)
  const [workspaceVersion,setWorkspaceVersion]=useState(0)
  const [busy,setBusy]=useState(false)
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
  const imageRef=useRef(), latexRef=useRef()
  const sourceRef = useRef(), fileRef = useRef(), richRef = useRef(), savedSelection = useRef(null), current = useRef({}), timer = useRef()
  const notify = message => { setToast(message); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 3500) }
  window.mdtexImageContext={id:doc.id,path:doc.path}
  const editor = useEditor({
    extensions: [StarterKit.configure({ codeBlock: false, link: { openOnClick: false } }), FoldingCode, Markdown, TableKit.configure({ table: { resizable: true } }), TaskList, TaskItem.configure({ nested: true }), LocalImage, InlineMath, BlockMath, HeadingNumbering],
    content: doc.markdown, contentType: 'markdown',
    editorProps: { attributes: { class: 'prose', spellcheck: 'false', 'aria-label': '文档编辑区域' } },
    onUpdate: ({ editor,transaction }) => { if(transaction.docChanged)setMarkdown(editor.getMarkdown()); setRevision(n => n + 1) },
    onSelectionUpdate: () => setRevision(n => n + 1),
  })
  current.current = { doc,docs, markdown, mode, editor, modal, view, busy }
  useEffect(()=>{window.dispatchEvent(new Event('mdtex-image-context'))},[doc.id,doc.path])
  useEffect(()=>{
    if(!window.desktop||busy||(!doc.isDraft&&doc.path&&markdown===doc.savedMarkdown))return
    const timer=setTimeout(()=>window.desktop.draftSync({id:doc.id,path:doc.path,text:markdown}).catch(e=>notify('临时草稿写入失败：'+e.message)),500)
    return()=>clearTimeout(timer)
  },[markdown,active,doc.path,busy])
  useEffect(() => {
    try { localStorage.setItem('mdtex.view.v1', JSON.stringify(view)) } catch {}
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
    const id = setTimeout(() => { try { localStorage.setItem('mdtex.drafts.v1', JSON.stringify({ docs, active, openIds })); setStorageError(false) } catch { setStorageError(true) } }, 400)
    return () => clearTimeout(id)
  }, [docs, active,openIds])
  useEffect(() => {
    if (!editor || !['source', 'split'].includes(mode) || editor.getMarkdown() === markdown) return
    const id = setTimeout(() => { editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false }); setRevision(n => n + 1) }, 240)
    return () => clearTimeout(id)
  }, [markdown, mode, editor])
  useEffect(() => { if (editor) editor.setEditable(!busy && mode !== 'read' && mode !== 'source') }, [mode, editor,busy])
  useEffect(() => {
    const edit = e => { savedSelection.current = editor?.state.selection; setFormula(e.detail); setModal('formula') }
    window.addEventListener('edit-formula', edit)
    return () => window.removeEventListener('edit-formula', edit)
  }, [editor])
  useEffect(() => {
    if (editor) editor.storage.headingNumbering.enabled = !!doc.numbered
  }, [editor])
  useEffect(() => {
    const key = e => {
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') { setContext(null); setSlash(null); setNumberMenu(null); setTableMenu(null); setFocus(false) }
      if (current.current.modal) return
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(e.shiftKey) }
      else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile() }
      else if (mod && e.altKey && e.code === 'KeyN') { e.preventDefault(); number(!e.shiftKey) }
      else if (mod && e.altKey && e.code === 'KeyH') { e.preventDefault(); number(!e.shiftKey, 'current') }
      else if (mod && !e.altKey && ['Equal','NumpadAdd','Minus','NumpadSubtract','Digit0','Numpad0'].includes(e.code)) {
        e.preventDefault()
        setView(v => normalizeView({ ...v, zoom: ['Digit0','Numpad0'].includes(e.code) ? 100 : v.zoom + (['Minus','NumpadSubtract'].includes(e.code) ? -10 : 10) }))
      }
      else if (mod && e.shiftKey && e.code === 'KeyM') { e.preventDefault(); openFormula() }
      else if (mod && e.code === 'Slash') { e.preventDefault(); changeMode(current.current.mode === 'source' ? 'edit' : 'source') }
      else if (mod && e.shiftKey && e.code === 'KeyP') { e.preventDefault(); changeMode(current.current.mode === 'read' ? 'edit' : 'read') }
    }
    const leave = e => { const {doc, markdown} = current.current; if (current.current.busy||current.current.markdown !== (doc.savedMarkdown ?? '')||current.current.docsDirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('keydown', key); window.addEventListener('beforeunload', leave)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', leave) }
  }, [editor])
  useEffect(() => {
    const close = () => { setContext(null); setTableHover(null); setNumberMenu(null); setTableMenu(null) }
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [])
  function syncSource() {
    const { editor, markdown, mode } = current.current
    if (editor && ['source', 'split'].includes(mode) && editor.getMarkdown() !== markdown) editor.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false })
  }
  function changeMode(next) { if(current.current.busy)return; syncSource(); if (['edit','read'].includes(next) && editor.storage.headingNumbering.enabled) setMarkdown(editor.getMarkdown()); setMode(next); setContext(null); setSlash(null); setTableHover(null) }
  function switchDoc(next) {
    if(current.current.busy)return
    setOpenIds(ids=>ids.includes(next.id)?ids:[...ids,next.id])
    setWorkspaceRoot(next.workspaceRoot||null)
    setTab(previous=>next.workspaceRoot?'tree':previous==='tree'?'outline':previous)
    window.mdtexImageContext={id:next.id,path:next.path}
    const old = current.current
    if(window.desktop&&(!old.doc.path||old.markdown!==old.doc.savedMarkdown))window.desktop.draftSync({id:old.doc.id,path:old.doc.path,text:old.markdown}).catch(e=>notify(e.message))
    setDocs(items => items.map(d => d.id === old.doc.id ? { ...d, markdown: old.markdown, numbered: old.editor.storage.headingNumbering.enabled } : d))
    editor.storage.headingNumbering.enabled = !!next.numbered
    editor.commands.setContent(next.markdown, { contentType: 'markdown', emitUpdate: false })
    setActive(next.id); setMarkdown(next.markdown); setRevision(n => n + 1); setSlash(null)
  }
  async function newDoc() {
    if(current.current.busy)return
    const next=fresh()
    try{if(window.desktop)await window.desktop.draftSync({id:next.id,text:''});setDocs(items=>[...items,next]);switchDoc(next);setMode('edit');setTimeout(()=>editor.commands.focus(),50)}catch(e){notify(e.message)}
  }
  function closeTab(id){const rest=openIds.filter(item=>item!==id);setOpenIds(rest);if(active===id){if(rest.length)switchDoc(docs.find(d=>d.id===rest[0]));else newDoc()}}
  async function openFolder(){if(current.current.busy)return;if(!window.desktop)return notify('请使用桌面版');try{const root=await window.desktop.workspace.open();if(root){setWorkspaceRoot(root);setTab('tree')}}catch(e){notify(e.message)}}
  function importDoc(text, name, path,metadata={}) { const next = { ...fresh(text, name), path, savedMarkdown: text,origin:path?'file':'draft',...metadata }; setDocs(items => [...items, next]); switchDoc(next); notify('文档已打开') }
  function openWorkspaceDoc(file) {
    const existing=current.current.docs.find(d=>d.path===file.path)
    if(existing) switchDoc(existing)
    else importDoc(file.text,file.name,file.path,file)
    setMode('edit')
  }
  function renameWorkspaceDoc(result) {
    setDocs(items=>items.map(d=>d.path===result.old?{...d,path:result.path,name:result.name}:d))
  }
  async function detachWorkspaceDoc(path) {
    const list=current.current.docs.filter(d=>d.path===path)
    for(const original of list){
      const text=original.id===current.current.doc.id?current.current.markdown:original.markdown
      const result=window.desktop?await window.desktop.detachDraft({id:original.id,path,text}):{text}
      setDocs(items=>items.map(d=>d.id===original.id?{...d,path:undefined,workspaceRoot:null,origin:"draft",savedMarkdown:undefined,markdown:result.text,name:d.name.replace(/\.md$/i,"")+"（已删除的草稿）.md"}:d))
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
      if(window.desktop){const imported=await window.desktop.importImage({id:snapshot.doc.id,path:snapshot.doc.path,data});src=imported.src}
      if(current.current.doc.id!==snapshot.doc.id||current.current.doc.path!==snapshot.doc.path||current.current.markdown!==snapshot.markdown)return notify('文档已变化，请重新插入图片')
      const alt=(file.name||'粘贴的图片').replace(/[\[\]\r\n]/g,'')
      if(snapshot.mode==='source')setMarkdown(text=>text.slice(0,start)+`\n\n![${alt}](${src})\n\n`+text.slice(end))
      else snapshot.editor.chain().focus().setTextSelection({from:selection.from,to:selection.to}).setImage({src,alt}).run()
      notify('图片已暂存；保存时将整理到 picture 文件夹')
    }catch(e){notify(e.message)}
  }
  function pasteImage(event) {
    if(current.current.mode==='read'||!event.target.closest('.document-area'))return
    const file=[...(event.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'))
    if(file){event.preventDefault();event.stopPropagation();insertImageFile(file)}
  }
  function chooseSymbol(latex) {
    const input=latexRef.current,start=input?.selectionStart??formula.latex.length,end=input?.selectionEnd??start
    setFormula(old=>({...old,latex:old.latex.slice(0,start)+latex+old.latex.slice(end)}))
    requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(start+latex.length,start+latex.length)})
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
      if (window.desktop) { const file = await window.desktop.open(); if (file) { const existing=current.current.docs.find(d=>d.path===file.path);if(existing)switchDoc(existing);else importDoc(file.text,file.name,file.path,file) } }
      else fileRef.current.click()
    } catch (e) { notify('打开失败：' + e.message) }
  }
  async function saveFile(saveAs=false) {
    if(current.current.busy)return
    syncSource()
    const snapshot=current.current,text=editor.storage.headingNumbering.enabled?editor.getMarkdown():snapshot.markdown
    const sourceDoc=snapshot.doc
    setBusy(true)
    try {
      if(window.desktop) {
        const result=await window.desktop.save({id:sourceDoc.id,text,path:sourceDoc.path,name:sourceDoc.name,origin:sourceDoc.origin||'file',workspaceRoot:sourceDoc.workspaceRoot,savedText:sourceDoc.savedMarkdown,saveAs})
        if(!result)return
        setDocs(items=>items.map(d=>d.id===sourceDoc.id?{...d,...result,markdown:result.text,savedMarkdown:result.text,isDraft:false}:d))
        window.mdtexImageContext={id:sourceDoc.id,path:result.path}
        editor.commands.setContent(result.text,{contentType:'markdown',emitUpdate:false})
        setMarkdown(result.text)
        setWorkspaceRoot(result.workspaceRoot||null)
        if(result.workspaceRoot)setTab('tree')
        setWorkspaceVersion(n=>n+1)
        notify(result.warnings?.length?result.warnings.join('；'):'文档和本地图片已保存，临时草稿已清理')
      } else {
        const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}))
        const a=document.createElement('a');a.href=url;a.download=sourceDoc.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
        setDocs(items=>items.map(d=>d.id===sourceDoc.id?{...d,savedMarkdown:text}:d));notify('Markdown 已下载')
      }
    }catch(e){notify('保存失败：'+e.message)}finally{setBusy(false)}
  }
  async function exportZip() {
    if(current.current.busy)return
    if(!window.desktop)return notify('请使用桌面版打包文档和本地图片')
    syncSource();const snapshot=current.current
    setBusy(true)
    try{const result=await window.desktop.exportZip({id:snapshot.doc.id,path:snapshot.doc.path,name:snapshot.doc.name,text:snapshot.markdown});if(result)notify('ZIP 已导出，包含当前内容和本地图片；原文档未改变')}
    catch(e){notify('打包失败：'+e.message)}finally{setBusy(false)}
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
    notify(scope === 'current' ? (enabled ? '已编号当前标题；全文自动重排已暂停，其他标题保持原样' : '已移除当前标题编号；全文自动重排已暂停，其他标题保持原样') : enabled ? '已启用全文自动编号，标题变化时会按层级重排' : '已移除所有标题编号')
  }
  function openFormula() { if(current.current.busy)return; if (current.current.mode === 'read') return notify('请先切换到编辑或源码模式，再插入公式'); syncSource(); savedSelection.current = editor.state.selection; setFormula({ latex: '\\frac{a}{b}', display: true }); setModal('formula') }
  function insertFormula() {
    if (!formula.latex.trim()) return
    if (formula.pos != null) editor.chain().focus().setNodeSelection(formula.pos).updateAttributes(formula.display ? 'blockMath' : 'inlineMath', {latex:formula.latex}).run()
    else if (mode === 'source') {
      const el = sourceRef.current, start = el?.selectionStart ?? markdown.length, end = el?.selectionEnd ?? start
      const text = formula.display ? `\n\n$$\n${formula.latex}\n$$\n\n` : `$${formula.latex}$`
      setMarkdown(markdown.slice(0, start) + text + markdown.slice(end))
    } else {
      const chain = editor.chain().focus()
      if (savedSelection.current) chain.setTextSelection({from:savedSelection.current.from,to:savedSelection.current.to})
      chain.insertContent({ type: formula.display ? 'blockMath' : 'inlineMath', attrs: {latex:formula.latex} }).run()
    }
    setModal(null)
  }
  function insertTable(size = grid) {
    if (mode === 'source') {
      const text = '\n\n| ' + Array.from({length:size.cols}, (_,i) => `列 ${i+1}`).join(' | ') + ' |\n| ' + Array(size.cols).fill('---').join(' | ') + ' |\n' + Array(Math.max(0,size.rows-1)).fill('| ' + Array(size.cols).fill(' ').join(' | ') + ' |').join('\n') + '\n\n'
      const el = sourceRef.current, start = el?.selectionStart ?? markdown.length, end = el?.selectionEnd ?? start
      setMarkdown(markdown.slice(0,start) + text + markdown.slice(end))
    } else editor.chain().focus().insertTable({ rows:size.rows, cols:size.cols, withHeaderRow:true }).run()
    setTableMenu(null)
  }
  function run(command) {
    if (!editor||current.current.busy) return
    if (mode === 'read') changeMode('edit')
    syncSource(); command(editor.chain().focus()).run(); setMarkdown(editor.getMarkdown())
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
  current.current.docsDirty=docs.some(d=>d.id!==active&&d.markdown!==(d.savedMarkdown??''))
  const sourceOnly = mode === 'source'
  const formatsDisabled = sourceOnly || !editable
  return <div className={`app ${focus ? 'focus-mode' : ''}`} aria-busy={busy} onPasteCapture={pasteImage} onClick={() => { setContext(null); setNumberMenu(null); setTableMenu(null) }}>
    <header className="app-header"><div className="brand"><span className="brand-mark">M<span>⌁</span></span><strong>MDTeX</strong><span className="brand-caption">留白之间，自有思考</span></div><div className="header-actions"><span className={`draft-status ${storageError ? 'error' : ''}`}><span/>{storageError ? '草稿空间不足，请保存文件' : '草稿已保存在本机'}</span><button className="button quiet" disabled={busy} onClick={openFolder}><FolderOpen size={16}/>打开文件夹</button><button className="button quiet" disabled={busy} onClick={openFile}><FolderOpen size={16}/>打开</button><button className="button quiet" disabled={busy} onClick={exportZip}><Download size={16}/>打包 ZIP</button><button className="button primary" disabled={busy} onClick={() => saveFile()}><Save size={15}/>保存<span className="shortcut">Ctrl S</span></button></div></header>
    <div className="workspace">
      {sidebar && <aside className="sidebar"><div className="workspace-label">我的写作空间 <button className="icon-button" onClick={newDoc} title="新建文档" aria-label="新建文档"><Plus size={17}/></button></div><button className="current-document" onClick={() => setTab('files')}><span className="doc-icon"><FileText size={20}/></span><span><strong>{doc.name.replace(/\.md$/,'')}</strong><small>Markdown 文档</small></span><MoreHorizontal size={16}/></button><div className="sidebar-tabs"><button className={tab==='outline'?'selected':''} onClick={() => setTab('outline')}>文档大纲</button><button className={tab==='files'?'selected':''} onClick={() => setTab('files')}>本地草稿 <span>{docs.length}</span></button>{workspaceRoot&&<button className={tab==='tree'?'selected':''} onClick={()=>setTab('tree')}>文件树</button>}</div>{tab==='tree'&&workspaceRoot?<WorkspacePanel root={workspaceRoot} refreshKey={workspaceVersion} onOpen={openWorkspaceDoc} onRename={renameWorkspaceDoc} onDelete={detachWorkspaceDoc} notify={notify}/>:tab==='outline' ? <nav className="outline">{headings.length ? headings.map((h,i) => <button key={i} style={{paddingLeft:14 + (h.level-1)*13}} title={h.title} onClick={() => { if(mode==='source') changeMode('read'); const el=editor.view.nodeDOM(h.pos); setTimeout(() => el?.scrollIntoView({behavior:'smooth',block:'center'}),30) }}><span className="outline-dot"/>{h.title}</button>) : <p className="muted">添加标题后，大纲会出现在这里。</p>}</nav> : <div className="draft-list">{docs.map(d => <button key={d.id} className={d.id===active?'selected':''} onClick={() => switchDoc(d)}><FileText size={15}/><span>{d.name.replace(/\.md$/,'')}</span>{d.id===active && <span className="active-dot"/>}</button>)}<button className="new-draft" onClick={newDoc}><Plus size={15}/>新建空白文档</button></div>}<div className="sidebar-footer"><span className="local-dot"/>本地优先 · 无需联网<button onClick={() => setModal('shortcuts')}><Keyboard size={16}/>快捷键指南</button></div></aside>}
      <main className="main"><div className="document-tabs" role="tablist" aria-label="打开的文档">{openIds.map(id=>docs.find(d=>d.id===id)).filter(Boolean).map(d=><div key={d.id} className={d.id===active?"document-tab selected":"document-tab"}><button disabled={busy} role="tab" aria-selected={d.id===active} title={d.path||"未保存草稿"} onClick={()=>switchDoc(d)}><FileText size={14}/><span>{d.name}<small>{d.workspaceRoot?.name||"本地文档"}</small></span>{(d.id===active?markdown:d.markdown)!==(d.savedMarkdown??"")&&<i/>}</button><button disabled={busy} aria-label={"关闭标签 "+d.name} title="关闭标签，内容仍保留为草稿" onClick={()=>closeTab(d.id)}><X size={12}/></button></div>)}</div><div className="document-bar"><div className="breadcrumb"><button className="icon-button" onClick={() => setSidebar(!sidebar)} title="切换侧栏" aria-label="切换侧栏">{sidebar ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}</button><span>文档</span><ChevronRight size={13}/><span className="breadcrumb-name">{doc.name}</span>{markdown !== doc.savedMarkdown && <span title="尚未保存到文件" className="unsaved-dot"/>}</div><div className="view-switch">{[['edit',PenLine,'编辑'],['read',BookOpen,'阅读'],['source',Code2,'源码'],['split',Columns2,'分屏']].map(([value,Icon,label]) => <button key={value} className={mode===value?'selected':''} onClick={() => changeMode(value)}><Icon size={14}/>{label}</button>)}</div><button className="icon-button focus-button" onClick={() => setFocus(!focus)} title="专注写作 · Esc 退出" aria-label="专注写作"><Maximize2 size={16}/></button></div>
      <div className={`format-bar ${!editable ? 'reading-toolbar' : ''}`}><div className="format-group"><select aria-label="段落格式" disabled={formatsDisabled} value={editor?.isActive('heading') ? editor.getAttributes('heading').level : 'p'} onChange={e => run(c => e.target.value==='p' ? c.setParagraph() : c.setHeading({level:Number(e.target.value)}))}><option value="p">正文</option>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>标题 {n}</option>)}</select></div><div className="format-group"><Tool icon={Bold} label="加粗 Ctrl+B" active={editor?.isActive('bold')} disabled={formatsDisabled} onClick={() => run(c=>c.toggleBold())}/><Tool icon={Italic} label="斜体 Ctrl+I" active={editor?.isActive('italic')} disabled={formatsDisabled} onClick={() => run(c=>c.toggleItalic())}/><Tool icon={Strikethrough} label="删除线" disabled={formatsDisabled} onClick={() => run(c=>c.toggleStrike())}/><Tool icon={Link} label="插入链接" disabled={formatsDisabled} onClick={() => { savedSelection.current=editor.state.selection; setSearch(editor.getAttributes('link').href||''); setModal('link') }}/></div><div className="format-group"><Tool icon={List} label="无序列表" disabled={formatsDisabled} active={editor?.isActive('bulletList')} onClick={() => run(c=>c.toggleBulletList())}/><Tool icon={ListOrdered} label="有序列表" disabled={formatsDisabled} active={editor?.isActive('orderedList')} onClick={() => run(c=>c.toggleOrderedList())}/><Tool icon={ListChecks} label="任务列表" disabled={formatsDisabled} onClick={() => run(c=>c.toggleTaskList())}/><Tool icon={Quote} label="引用" disabled={formatsDisabled} onClick={() => run(c=>c.toggleBlockquote())}/><Tool icon={Code2} label="代码块" disabled={formatsDisabled} onClick={() => run(c=>c.toggleCodeBlock())}/></div><div className="format-group insert-tools"><Tool icon={Table2} label="插入表格" disabled={!editable} onClick={openTableMenu}>表格</Tool><Tool icon={FileText} label="插入图片" disabled={!editable} onClick={()=>{syncSource();imageRef.current.click()}}>图片</Tool><Tool icon={Sigma} label="插入公式 Ctrl+Shift+M" disabled={!editable} onClick={openFormula}>公式</Tool><Tool icon={Hash} label="标题编号选项" active={doc.numbered} disabled={!editable} onClick={e => { e.stopPropagation(); const r=e.currentTarget.getBoundingClientRect(); setNumberMenu(numberMenu ? null : {x:Math.min(r.left,window.innerWidth-315),y:r.bottom+8}) }}>编号<ChevronDown size={11}/></Tool></div><div className="format-group history-tools"><Tool icon={Undo2} label="撤销 Ctrl+Z" disabled={formatsDisabled || !editor?.can().undo()} onClick={() => run(c=>c.undo())}/><Tool icon={Redo2} label="重做 Ctrl+Shift+Z" disabled={formatsDisabled || !editor?.can().redo()} onClick={() => run(c=>c.redo())}/></div><span className="toolbar-hint">{mode==='read' ? '只读预览' : '输入 / 快速插入'}</span></div>
      <div className={`document-area mode-${mode}`}>
        {['source','split'].includes(mode) && <section className="source-pane"><div className="pane-label"><Code2 size={13}/> MARKDOWN<span>UTF-8</span></div><textarea disabled={busy} ref={sourceRef} style={{fontSize:15*view.zoom/100}} aria-label="Markdown 源码" value={markdown} spellCheck={false} onChange={e => setMarkdown(e.target.value)} onKeyDown={e => {if(e.key==='Tab'){e.preventDefault();const start=e.currentTarget.selectionStart,end=e.currentTarget.selectionEnd;setMarkdown(markdown.slice(0,start)+'  '+markdown.slice(end));requestAnimationFrame(()=>{sourceRef.current.selectionStart=sourceRef.current.selectionEnd=start+2})}}}/></section>}
        <section className={`render-pane ${sourceOnly ? 'hidden' : ''}`} ref={richRef} onMouseMove={hover} onMouseLeave={e => {if(!e.relatedTarget?.closest?.('.table-edge'))setTableHover(null)}} onContextMenu={e => { const cell=e.target.closest('td,th'); if(cell && editable){e.preventDefault();selectCell(cell);setContext({x:Math.min(e.clientX,window.innerWidth-220),y:Math.min(e.clientY,window.innerHeight-250)})} }}>
          {mode==='split' && <div className="pane-label"><PenLine size={13}/> 实时预览<span>可直接编辑</span></div>}<div className="paper" style={{zoom:view.zoom/100,maxWidth:view.width==="wide"?"none":view.width==="compact"?850:1100}}><div className="paper-meta"><span>MARKDOWN DOCUMENT</span><span>{mode==='read' ? '阅读模式' : '让文字有序，让灵感自由'}</span></div><EditorContent editor={editor} onKeyUp={e => {if(e.key==='/'){const s=editor.state.selection; if(s.$from.parent.textContent==='/'){const r=editor.view.coordsAtPos(s.from);setSlash({pos:s.from-1,x:Math.min(r.left,window.innerWidth-280),y:Math.min(r.bottom+8,window.innerHeight-330)})}}else if(e.key==='Escape')setSlash(null)}}/><div className="paper-end"><span/>写到这里，也是一种进步<span/></div></div>
        </section>
      </div><footer className="status-bar"><div><span className="status-dot"/>{mode==='read'?'阅读模式':mode==='source'?'源码编辑':mode==='split'?'双向编辑':'所见即所得'}<span className="status-divider"/>{headings.length} 个标题{doc.numbered && <span className="numbering-status">自动编号已启用</span>}</div><div>{count.toLocaleString()} 字符<span className="status-divider"/>约 {Math.max(1,Math.ceil(count/500))} 分钟阅读<span className="status-divider"/>Markdown <span className="encoding">UTF-8</span><div className="view-controls"><select aria-label="页面宽度" value={view.width} onChange={e=>setView(v=>({...v,width:e.target.value}))}><option value="compact">紧凑页宽</option><option value="standard">舒适页宽</option><option value="wide">铺满窗口</option></select><button aria-label="缩小页面" title="缩小 Ctrl+−" disabled={view.zoom<=70} onClick={()=>setView(v=>normalizeView({...v,zoom:v.zoom-10}))}><Minus size={13}/></button><button className="zoom-reset" aria-label="重置缩放" title="重置到 100% · Ctrl+0" onClick={()=>setView(v=>({...v,zoom:100}))}>{view.zoom}%</button><button aria-label="放大页面" title="放大 Ctrl++" disabled={view.zoom>=180} onClick={()=>setView(v=>normalizeView({...v,zoom:v.zoom+10}))}><Plus size={13}/></button></div></div></footer></main>
    </div>
    {numberMenu && <div className="number-menu" role="menu" aria-label="标题编号" style={{left:numberMenu.x,top:numberMenu.y}} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.preventDefault()}><small>全文操作</small><button role="menuitem" onClick={()=>number(true)}>全文自动编号<kbd>Ctrl+Alt+N</kbd></button><button role="menuitem" onClick={()=>number(false)}>移除全文编号<kbd>Ctrl+Alt+Shift+N</kbd></button><small>当前标题 · 先将光标放入标题</small><button role="menuitem" onClick={()=>number(true,"current")}>仅编号当前标题<kbd>Ctrl+Alt+H</kbd></button><button role="menuitem" onClick={()=>number(false,"current")}>移除当前标题编号<kbd>Ctrl+Alt+Shift+H</kbd></button><p>单标题按全文层级计算序号；执行后暂停全文自动重排，其他已有编号保留。</p></div>}
    {tableHover && editable && <><button className="table-edge add-row" style={{left:tableHover.left+tableHover.width/2-13,top:tableHover.y-1}} aria-label="在表格末尾添加行" title="添加行" onClick={() => tableEdge('row')}><Plus size={15}/></button><button className="table-edge add-col" style={{left:tableHover.x-1,top:tableHover.top+tableHover.height/2-13}} aria-label="在表格右侧添加列" title="添加列" onClick={() => tableEdge('col')}><Plus size={15}/></button></>}
    {context && <div className="context-menu" style={{left:context.x,top:context.y}} onClick={e=>e.stopPropagation()}>{[['在上方插入行','addRowBefore'],['在下方插入行','addRowAfter'],['在左侧插入列','addColumnBefore'],['在右侧插入列','addColumnAfter'],['删除当前行','deleteRow'],['删除当前列','deleteColumn'],['删除整个表格','deleteTable']].map(([label,cmd],i)=><button className={i>=4?'danger':''} key={cmd} onClick={()=>{editor.chain().focus()[cmd]().run();setContext(null)}}>{label}</button>)}</div>}
    {slash && editable && <div className="slash-menu" onClick={e=>e.stopPropagation()} style={{left:slash.x,top:slash.y}}><small>快捷插入 <button onClick={()=>setSlash(null)} aria-label="关闭快捷菜单"><X size={13}/></button></small>{[['一级标题',Hash,()=>run(c=>c.setHeading({level:1}))],['二级标题',Hash,()=>run(c=>c.setHeading({level:2}))],['表格',Table2,openTableMenu],['公式',Sigma,openFormula],['代码块',Code2,()=>run(c=>c.setCodeBlock())],['任务列表',ListChecks,()=>run(c=>c.toggleTaskList())],['分割线',Minus,()=>run(c=>c.setHorizontalRule())]].map(([label,Icon,action])=><button key={label} onMouseDown={e=>e.preventDefault()} onClick={()=>{editor.chain().focus().deleteRange({from:slash.pos,to:slash.pos+1}).run();setSlash(null);action()}}><Icon size={17}/>{label}<span>↵</span></button>)}</div>}
    {modal==='formula' && <Modal title={formula.pos != null?'编辑公式':'插入公式'} subtitle="从一个模板开始，让公式输入更轻松。" close={()=>setModal(null)} wide><div className="formula-tabs">{Object.keys({...templates,...symbols}).map(cat=><button key={cat} className={cat===category?'selected':''} onClick={()=>setCategory(cat)}>{cat}</button>)}</div><div className="formula-templates">{(symbols[category]||templates[category]).map(([name,latex])=><button title={name} aria-label={name} key={name} onMouseDown={e=>e.preventDefault()} onClick={()=>symbols[category]?chooseSymbol(latex):setFormula({...formula,latex})}><span dangerouslySetInnerHTML={{__html:mathHTML(latex)}}/><small>{name}</small></button>)}</div><div className="formula-input-label"><label htmlFor="latex">LaTeX 源码</label><span>模板替换整式；括号、字母和字符插入光标处</span></div><textarea ref={latexRef} id="latex" className="latex-input" value={formula.latex} onChange={e=>setFormula({...formula,latex:e.target.value})} spellCheck={false}/><div className="formula-preview"><small>实时预览</small><div dangerouslySetInnerHTML={{__html:mathHTML(formula.latex,true)}}/></div><footer className="modal-footer"><div className="formula-display"><label><input type="checkbox" checked={formula.display} disabled={formula.pos != null} onChange={e=>setFormula({...formula,display:e.target.checked})}/>独立公式 · 居中显示</label></div><button className="button quiet" onClick={()=>setModal(null)}>取消</button><button className="button primary" disabled={!formula.latex.trim()} onClick={insertFormula}>{formula.pos!=null?'更新公式':'插入公式'}<ChevronRight size={15}/></button></footer></Modal>}
    {tableMenu && <div className="table-popover" role="dialog" aria-label="选择表格尺寸" style={{left:tableMenu.x,top:tableMenu.y}} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.preventDefault()}><strong>插入表格 · {grid.rows} 行 × {grid.cols} 列</strong><div className="table-picker">{Array.from({length:8},(_,r)=><div key={r}>{Array.from({length:8},(_,c)=><button key={c} aria-label={(r+1)+" 行 "+(c+1)+" 列"} className={r<grid.rows&&c<grid.cols?"picked":""} onFocus={()=>setGrid({rows:r+1,cols:c+1})} onMouseEnter={()=>setGrid({rows:r+1,cols:c+1})} onClick={()=>insertTable({rows:r+1,cols:c+1})}/>)}</div>)}</div><small>移动选择尺寸，点击直接插入。首行为表头。</small></div>}
    {modal==='link' && <Modal title="插入链接" subtitle="输入网页地址，应用到选中的文字。" close={()=>setModal(null)}><input className="link-input" aria-label="链接地址" value={search} placeholder="https://example.com" onChange={e=>setSearch(e.target.value)}/><footer className="modal-footer"><button className="button quiet" onClick={()=>{run(c=>c.unsetLink());setModal(null)}}>移除链接</button><button className="button primary" disabled={!/^(https?:\/\/|mailto:)/i.test(search)} onClick={()=>{const s=savedSelection.current;editor.chain().focus().setTextSelection({from:s.from,to:s.to}).extendMarkRange('link').setLink({href:search}).run();setModal(null)}}>应用链接</button></footer></Modal>}
    {modal==='shortcuts' && <Modal title="写作快捷键" subtitle="让常用操作，离你再近一步。" close={()=>setModal(null)}><div className="shortcuts-list">{[['打开文档','Ctrl + O'],['保存文件','Ctrl + S'],['另存为','Ctrl + Shift + S'],['源码 / 编辑切换','Ctrl + /'],['阅读 / 编辑切换','Ctrl + Shift + P'],['插入公式','Ctrl + Shift + M'],['启用 / 重排标题编号','Ctrl + Alt + N'],['移除全文标题编号','Ctrl + Alt + Shift + N'],['仅编号当前标题','Ctrl + Alt + H'],['移除当前标题编号','Ctrl + Alt + Shift + H'],['放大 / 缩小页面','Ctrl + 加号 / 减号'],['恢复 100% 缩放','Ctrl + 0'],['撤销 / 重做','Ctrl + Z / Ctrl + Shift + Z'],['快捷插入','空段落输入 /']].map(([a,b])=><div key={a}><span>{a}</span><kbd>{b}</kbd></div>)}</div></Modal>}
    {toast && <div className="toast" role="status"><Check size={16}/>{toast}</div>}
    <input type="file" ref={imageRef} hidden accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" onChange={e=>{const file=e.target.files?.[0];if(file)insertImageFile(file);e.target.value=""}}/>
    <input type="file" ref={fileRef} hidden accept=".md,.markdown,.txt" onChange={async e=>{const file=e.target.files?.[0];if(file){if(file.size>20*1024*1024)notify('文件超过 20 MB，请选择较小的文档');else importDoc(await file.text(),file.name)}e.target.value=''}}/>
  </div>
}
