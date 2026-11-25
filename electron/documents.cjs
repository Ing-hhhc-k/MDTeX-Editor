const fs=require('node:fs/promises'),path=require('node:path')
const syncFs=require('node:fs')
const {randomUUID}=require('node:crypto')
const {sessionMetadata}=require('./session-metadata.cjs')
async function createDocuments({app,ipcMain,dialog,shell,getWindow,authorizedPaths}) {
  const assets=await import('./assets.mjs')
  const base=path.join(app.getPath('userData'),'drafts'),registryFile=path.join(app.getPath('userData'),'files.json')
  const defaultRoot=path.join(app.getPath('userData'),'documents')
  const known=new Set(),roots=new Set(),queues=new Map(),deletedDrafts=new Set(),savedDrafts=new Set()
  try{const registry=JSON.parse(await fs.readFile(registryFile,'utf8'));for(const f of registry.files||[])known.add(f);for(const r of registry.roots||[])roots.add(r)}catch{}
  const persist=async()=>{await fs.mkdir(path.dirname(registryFile),{recursive:true});await assets.atomicWrite(registryFile,Buffer.from(JSON.stringify({files:[...known],roots:[...roots]})))}
  const remember=async file=>{authorizedPaths.add(file);known.add(file);await persist()}
  const addRoot=async dir=>{const resolved=await fs.realpath(dir);roots.add(resolved);await persist();return {path:resolved,name:path.basename(resolved)}}
  const dirFor=id=>{if(typeof id!=='string'||!/^[a-z\d-]{8,80}$/i.test(id))throw new Error('无效草稿标识');return path.join(base,id)}
  const lock=(id,fn)=>{const previous=queues.get(id)||Promise.resolve();const result=previous.catch(()=>{}).then(fn);queues.set(id,result);return result.finally(()=>{if(queues.get(id)===result)queues.delete(id)})}
  const ensurePath=file=>{if(file&&!/\.md$/i.test(file))throw new Error('仅支持 .md 后缀的文档');if(file&&!authorizedPaths.has(file)){if(!known.has(file))throw new Error('请重新打开此文档以确认访问权限');authorizedPaths.add(file)}}
  const handle=(name,fn)=>ipcMain.handle(name,async(event,data)=>{if(event.sender!==getWindow().webContents)throw new Error('无效来源');return fn(data)})
  const sourceBase=data=>{ensurePath(data.path);return data.path?path.dirname(data.path):dirFor(data.id)}
  const managed=file=>typeof file==='string'&&path.dirname(path.dirname(path.resolve(file)))===defaultRoot&&/^[a-z\d-]{8,80}$/i.test(path.basename(path.dirname(file)))&&/\.md$/i.test(file)
  function defaultPath(data){dirFor(data.id);const name=path.basename(data.name||'未命名文档.md').replace(/[\\/:*?"<>|]/g,'_').replace(/\.md$/i,'')+'.md';return path.join(defaultRoot,data.id,name)}
  async function read(file){ensurePath(file);if((await fs.stat(file)).size>20*1024*1024)throw Error('文件超过 20 MB');return {path:file,name:path.basename(file),text:await fs.readFile(file,'utf8'),origin:managed(file)?'data':'file'}}
  async function listDefaults(){
    const list=[];let folders=[];try{folders=await fs.readdir(defaultRoot,{withFileTypes:true})}catch(e){if(e.code!=='ENOENT')throw e}
    for(const folder of folders){if(!folder.isDirectory()||folder.isSymbolicLink()||!/^[a-z\d-]{8,80}$/i.test(folder.name))continue
      const dir=path.join(defaultRoot,folder.name)
      for(const item of await fs.readdir(dir,{withFileTypes:true}))if(item.isFile()&&!item.isSymbolicLink()&&/\.md$/i.test(item.name)){const file=path.join(dir,item.name);await remember(file);list.push({path:file,name:item.name,origin:'data'})}
    }
    return list
  }
  handle('file:read',data=>read(data.path))
  handle('file:list-defaults',listDefaults)
  handle('file:delete-default',async data=>{
    ensurePath(data.path);if(!managed(data.path))throw Error('仅能从本地文档列表删除 data 内的文档')
    const dir=path.dirname(data.path),real=await fs.realpath(dir)
    if(real!==dir||(await fs.lstat(dir)).isSymbolicLink())throw Error('文档目录不是普通文件夹')
    const siblings=(await fs.readdir(dir)).filter(name=>/\.md$/i.test(name))
    await shell.trashItem(siblings.length===1?dir:data.path);authorizedPaths.delete(data.path);known.delete(data.path);await persist();return {deleted:true}
  })
  handle('file:confirm-close',async data=>{const result=await dialog.showMessageBox(getWindow(),{type:'question',title:'文档尚未保存',message:`是否保存 ${data.name||'当前文档'} 的修改？`,detail:'已关闭自动保存。没有外部路径的文档默认保存到 MDTeX-data/documents。',buttons:['保存','不保存','取消'],defaultId:0,cancelId:2});return ['save','discard','cancel'][result.response]||'cancel'})
  handle('file:confirm-reload',async data=>{const result=await dialog.showMessageBox(getWindow(),{type:'warning',title:'载入磁盘版本',message:`载入 ${data.name||'当前文档'} 的最新磁盘内容？`,detail:'这会丢弃当前标签中尚未保存的修改；原文件不会被写入。',buttons:['取消','载入'],defaultId:0,cancelId:0});return result.response===1})
  handle('file:confirm-update',async data=>{const result=await dialog.showMessageBox(getWindow(),{type:'question',title:'更新前保存文档',message:'有尚未保存的修改，保存后再更新？',detail:(data.names||[]).join('\n'),buttons:['保存并继续','取消'],defaultId:0,cancelId:1});return result.response===0})
  async function cleanup(id){const target=dirFor(id);if(path.dirname(target)!==base)throw new Error('无效临时目录');await fs.rm(target,{recursive:true,force:true})}
  handle('draft:sync',data=>{dirFor(data.id);return {disabled:true,skipped:true}})
  handle('draft:delete',data=>{const target=dirFor(data.id);if(path.dirname(target)!==base)throw new Error('无效临时目录');deletedDrafts.add(data.id);return lock(data.id,async()=>{try{const info=await fs.lstat(target);if(info.isSymbolicLink()||!info.isDirectory())throw new Error('草稿目录不是普通文件夹');await shell.trashItem(target)}catch(e){if(e.code!=='ENOENT')throw e}return {deleted:true}}).catch(error=>{deletedDrafts.delete(data.id);throw error})})
  handle('draft:detach',data=>lock(data.id,async()=>{if(deletedDrafts.has(data.id))throw new Error('草稿已删除');const collected=await assets.collectAssets(data.text,sourceBase(data),{inline:true});return {text:collected.text}}))
  handle('image:import',data=>lock(data.id,async()=>{if(deletedDrafts.has(data.id))throw new Error('草稿已删除');sourceBase(data);const {bytes,extension}=await assets.readImage(data.data,dirFor(data.id));return {src:'data:image/'+(extension==='jpg'?'jpeg':extension)+';base64,'+bytes.toString('base64')}}))
  handle('image:preview',async data=>{
    if(assets.remoteImage(data.src)||/^data:/i.test(data.src))return data.src
    const dir=sourceBase(data),image=await assets.readImage(data.src,dir)
    return 'data:image/'+(image.extension==='jpg'?'jpeg':image.extension)+';base64,'+image.bytes.toString('base64')
  })
  handle('file:open',async()=>{const result=await dialog.showOpenDialog(getWindow(),{properties:['openFile'],filters:[{name:'Markdown 文档',extensions:['md']}]});if(result.canceled)return null;const file=result.filePaths[0];if(!/\.md$/i.test(file))throw new Error('只支持 Markdown 文档');await remember(file);return read(file)})
  handle('file:save',data=>lock(data.id,async()=>{
    if(typeof data.text!=='string')throw new Error('无效内容')
    const originalBase=sourceBase(data),original=data.path
    const local=assets.imageNodes(data.text).some(n=>!assets.remoteImage(n.url))
    let target=original,bundle=false
    if(!original&&!data.saveAs)target=defaultPath(data)
    else if(data.saveAs) {
      const name=path.basename(data.name||'未命名文档.md').replace(/\.md$/i,'')+'.md'
      const result=await dialog.showSaveDialog(getWindow(),{title:'保存为文档文件夹（创建同名文件夹及 picture）',defaultPath:name,filters:[{name:'Markdown 文档文件夹',extensions:['md']}]})
      if(result.canceled)return null
      target=result.filePath;bundle=true
    } else if(data.origin==='file'&&!managed(original)&&local) {
      const choice=await dialog.showMessageBox(getWindow(),{type:'question',title:'保存文档和图片',message:'是否将文档和本地图片整理到同名文件夹？',detail:'原位置保存：Markdown 保持原位置，图片放入同级 picture 文件夹。整理为文件夹：复制文档及图片到同名文件夹，原文件保留。网络图片保持网址，不下载。',buttons:['原位置保存','整理为文件夹','取消'],defaultId:0,cancelId:2})
      if(choice.response===2)return null
      bundle=choice.response===1
    }
    if(!/\.md$/i.test(target))throw new Error('保存目标必须为 .md 后缀，其他文件不会修改')
    if(bundle)target=path.join(path.dirname(target),path.basename(target,path.extname(target)),path.basename(target))
    if(target===original&&typeof data.savedText==='string'&&(await fs.readFile(original,'utf8'))!==data.savedText){const choice=await dialog.showMessageBox(getWindow(),{type:'warning',title:'源文件已变化',message:'文档在其他程序中发生了修改，是否覆盖？',detail:'取消后可以另存为新文件，避免覆盖外部修改。',buttons:['取消','覆盖'],defaultId:0,cancelId:0});if(choice.response!==1)return null}
    if(target!==original){try{await fs.stat(target);const choice=await dialog.showMessageBox(getWindow(),{type:'warning',message:'目标文档已存在，是否覆盖？',buttons:['取消','覆盖'],defaultId:0,cancelId:0});if(choice.response!==1)return null}catch(e){if(e.code!=='ENOENT')throw e}}
    const collected=await assets.collectAssets(data.text,originalBase)
    await assets.writeDocument(target,collected);await remember(target);savedDrafts.add(data.id)
    let workspaceRoot=data.workspaceRoot&&roots.has(data.workspaceRoot.path)?data.workspaceRoot:null
    if(bundle)workspaceRoot=await addRoot(path.dirname(target))
    const warnings=[];try{await cleanup(data.id)}catch{warnings.push('文档已保存，临时草稿清理失败，将在下次保存时重试')}
    return {path:target,name:path.basename(target),text:collected.text,origin:managed(target)?'data':workspaceRoot?'workspace':'file',workspaceRoot,warnings}
  }))
  handle('file:export',data=>lock(data.id,async()=>{const dir=sourceBase(data);const name=path.basename(data.name||'文档.md');const result=await dialog.showSaveDialog(getWindow(),{title:'打包文档和图片',defaultPath:name.replace(/\.md$/i,'')+'.zip',filters:[{name:'ZIP 压缩包',extensions:['zip']}]});if(result.canceled)return null;const collected=await assets.collectAssets(data.text,dir);await assets.exportArchive(result.filePath,name,collected);return {path:result.filePath}}))
  async function initializeSession(session){
    let records=session?.docs||[],active=session?.active,openIds=session?.openIds||records.map(d=>d.id)
    if(session&&session.format!=='manual-v1'){
      const backup=path.join(app.getPath('userData'),'migration-backups');await fs.mkdir(backup,{recursive:true});await fs.writeFile(path.join(backup,'session-before-manual-save.json'),JSON.stringify(session),{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e})
      const restored=[]
      for(const doc of records){
        if(doc.path)restored.push({...doc,markdown:undefined,savedMarkdown:undefined})
        const edited=typeof doc.markdown==='string'&&(!doc.path||doc.markdown!==doc.savedMarkdown)
        if(!edited)continue
        const id=!doc.path&&/^[a-z\d-]{8,80}$/i.test(doc.id)?doc.id:randomUUID(),name=doc.path?(doc.name||'文档.md').replace(/\.md$/i,'（恢复副本）.md'):doc.name||'未命名文档.md',file=defaultPath({id,name})
        let collected
        try{collected=await assets.collectAssets(doc.markdown,doc.path?path.dirname(doc.path):dirFor(doc.id))}catch{collected={text:doc.markdown,files:new Map()}}
        if(!syncFs.existsSync(file))await assets.writeDocument(file,collected)
        await remember(file);restored.push({id,path:file,name:path.basename(file),origin:'data',numbered:doc.numbered})
        if(active===doc.id)active=id
        openIds=openIds.map(value=>value===doc.id?id:value)
      }
      records=restored
    }
    for(const item of await listDefaults())if(!records.some(d=>d.path===item.path))records.push({...item,id:randomUUID()})
    return sessionMetadata({docs:records,active,openIds})
  }
  function hydrateSession(session){
    if(!session)return null
    return {...session,docs:session.docs.map(doc=>{try{ensurePath(doc.path);if(syncFs.statSync(doc.path).size>20*1024*1024)throw Error('文件超过 20 MB');const text=syncFs.readFileSync(doc.path,'utf8');return {...doc,origin:managed(doc.path)?'data':doc.origin,markdown:text,savedMarkdown:text,dirty:false,loaded:true}}catch(error){return {...doc,markdown:'',savedMarkdown:'',dirty:false,loaded:false,externalMissing:true,loadError:error.message}}})}
  }
  return {roots,addRoot,remember,ensurePath,initializeSession,hydrateSession}
}
module.exports={createDocuments}
