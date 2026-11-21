import React,{useEffect,useState} from 'react'
import {FolderOpen,FileText,Plus,RefreshCw,Pencil,Trash2,ChevronRight,ChevronDown} from 'lucide-react'
export default function WorkspacePanel({root,refreshKey,onOpen,onRename,onDelete,notify}) {
  const [entries,setEntries]=useState({}),[expanded,setExpanded]=useState(new Set([''])),[action,setAction]=useState(null),[name,setName]=useState(''),[working,setWorking]=useState(false)
  const api=window.desktop?.workspace
  useEffect(()=>{let cancelled=false;setEntries({});setExpanded(new Set(['']));api?.list(root.path,'').then(files=>{if(!cancelled)setEntries({'':files})}).catch(e=>{if(!cancelled)notify(e.message)});return()=>{cancelled=true}},[root.path,refreshKey])
  const refresh=async()=>{const data={};for(const dir of expanded)data[dir]=await api.list(root.path,dir);setEntries(data)}
  const attempt=async fn=>{try{await fn()}catch(e){notify(e.message)}}
  const toggle=entry=>attempt(async()=>{const next=new Set(expanded);if(next.has(entry.relative))next.delete(entry.relative);else{next.add(entry.relative);const files=await api.list(root.path,entry.relative);setEntries(old=>({...old,[entry.relative]:files}))}setExpanded(next)})
  const begin=(type,entry=null)=>{setAction({type,entry});setName(type==='rename'?entry.name:'新文档.md')}
  const submit=async()=>{
    if(working)return;setWorking(true)
    try{
      if(action.type==='create'){if(!name.trim()||/[\\/:*?"<>|]/.test(name))throw new Error('请输入有效文件名');const dir=action.entry?.relative||'';onOpen(await api.create(root.path,dir?dir+'/'+name:name))}
      if(action.type==='rename')onRename(await api.rename(root.path,action.entry.relative,name))
      if(action.type==='delete'){const result=await api.delete(root.path,action.entry.relative);await onDelete(result.path);notify('文档已移入回收站，当前编辑内容保留在标签页中，可另存为')}
      setAction(null);await refresh()
    }catch(e){notify(e.message)}finally{setWorking(false)}
  }
  const tree=(dir,depth=0)=>(entries[dir]||[]).map(entry=><React.Fragment key={entry.relative}><div className="file-tree-row" style={{paddingLeft:depth*12+5}}><button disabled={!entry.directory&&!entry.editable} title={entry.editable?entry.name:entry.directory?'展开文件夹':'仅展示，不支持读取此类型'} onClick={()=>entry.directory?toggle(entry):attempt(async()=>onOpen(await api.read(root.path,entry.relative)))}>{entry.directory?(expanded.has(entry.relative)?<ChevronDown size={12}/>:<ChevronRight size={12}/>):<FileText size={13}/>}<span>{entry.name}</span></button>{entry.directory?<button aria-label={'在 '+entry.name+' 新建文档'} onClick={()=>begin('create',entry)}><Plus size={12}/></button>:entry.editable&&<><button aria-label={'重命名 '+entry.name} onClick={()=>begin('rename',entry)}><Pencil size={12}/></button><button aria-label={'删除 '+entry.name} onClick={()=>begin('delete',entry)}><Trash2 size={12}/></button></>}</div>{entry.directory&&expanded.has(entry.relative)&&tree(entry.relative,depth+1)}</React.Fragment>)
  return <section className="workspace-panel"><div className="folder-heading"><span title={root.path}><FolderOpen size={15}/> {root.name}</span><button aria-label="在文件夹中新建文档" onClick={()=>begin('create')}><Plus size={15}/></button><button aria-label="刷新文件夹" onClick={()=>attempt(refresh)}><RefreshCw size={14}/></button></div><div className="file-tree">{tree('')}{!entries['']?.length&&<p>文件夹为空，点击 + 新建 Markdown。</p>}</div>{action&&<div className="modal-backdrop" onClick={e=>e.stopPropagation()}><section className="modal" role="dialog" aria-modal="true" aria-label="文件操作"><h2>{action.type==='create'?'新建 Markdown':action.type==='rename'?'重命名文档':'移入回收站'}</h2>{action.type==='delete'?<p>将 {action.entry.name} 移入回收站？未保存的内容会保留为草稿。</p>:<input autoFocus disabled={working} aria-label="文件名" className="link-input" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit();if(e.key==='Escape')setAction(null)}}/>}<footer className="modal-footer"><button disabled={working} className="button quiet" onClick={()=>setAction(null)}>取消</button><button disabled={working} className="button primary" onClick={submit}>确定</button></footer></section></div>}</section>
}
