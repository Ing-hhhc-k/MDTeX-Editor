const fs=require('node:fs/promises'),path=require('node:path')
const {pathToFileURL}=require('node:url')
const {randomUUID,createHash}=require('node:crypto')
async function createDocuments({app,ipcMain,dialog,shell,getWindow,authorizedPaths}) {
  const assets=await import('./assets.mjs')
  const base=path.join(app.getPath('userData'),'drafts'),registryFile=path.join(app.getPath('userData'),'files.json')
  const known=new Set(),roots=new Set(),queues=new Map(),deletedDrafts=new Set()
  try{const registry=JSON.parse(await fs.readFile(registryFile,'utf8'));for(const f of registry.files||[])known.add(f);for(const r of registry.roots||[])roots.add(r)}catch{}
  const persist=async()=>{await fs.mkdir(path.dirname(registryFile),{recursive:true});await assets.atomicWrite(registryFile,Buffer.from(JSON.stringify({files:[...known],roots:[...roots]})))}
  const remember=async file=>{authorizedPaths.add(file);known.add(file);await persist()}
  const addRoot=async dir=>{const resolved=await fs.realpath(dir);roots.add(resolved);await persist();return {path:resolved,name:path.basename(resolved)}}
  const dirFor=id=>{if(typeof id!=='string'||!/^[a-z\d-]{8,80}$/i.test(id))throw new Error('无效草稿标识');return path.join(base,id)}
  const lock=(id,fn)=>{const previous=queues.get(id)||Promise.resolve();const result=previous.catch(()=>{}).then(fn);queues.set(id,result);return result.finally(()=>{if(queues.get(id)===result)queues.delete(id)})}
  const ensurePath=file=>{if(file&&!/\.md$/i.test(file))throw new Error('仅支持 .md 后缀的文档');if(file&&!authorizedPaths.has(file)){if(!known.has(file))throw new Error('请重新打开此文档以确认访问权限');authorizedPaths.add(file)}}
  const handle=(name,fn)=>ipcMain.handle(name,async(event,data)=>{if(event.sender!==getWindow().webContents)throw new Error('无效来源');return fn(data)})
  const sourceBase=data=>{ensurePath(data.path);return data.path?path.dirname(data.path):dirFor(data.id)}
  async function cleanup(id){const target=dirFor(id);if(path.dirname(target)!==base)throw new Error('无效临时目录');await fs.rm(target,{recursive:true,force:true})}
  handle('draft:sync',data=>lock(data.id,async()=>{if(deletedDrafts.has(data.id))return {deleted:true};sourceBase(data);const dir=dirFor(data.id);await fs.mkdir(dir,{recursive:true});await assets.atomicWrite(path.join(dir,'draft.md'),Buffer.from(data.text));await assets.atomicWrite(path.join(dir,'meta.json'),Buffer.from(JSON.stringify({sourcePath:data.path||null})));return {directory:dir}}))
  handle('draft:delete',data=>{const target=dirFor(data.id);if(path.dirname(target)!==base)throw new Error('无效临时目录');deletedDrafts.add(data.id);return lock(data.id,async()=>{try{const info=await fs.lstat(target);if(info.isSymbolicLink()||!info.isDirectory())throw new Error('草稿目录不是普通文件夹');await shell.trashItem(target)}catch(e){if(e.code!=='ENOENT')throw e}return {deleted:true}}).catch(error=>{deletedDrafts.delete(data.id);throw error})})
  handle('draft:detach',data=>lock(data.id,async()=>{if(deletedDrafts.has(data.id))throw new Error('草稿已删除');const collected=await assets.collectAssets(data.text,sourceBase(data));const dir=dirFor(data.id);await assets.writeDocument(path.join(dir,'draft.md'),collected);return {text:collected.text}}))
  handle('image:import',data=>lock(data.id,async()=>{if(deletedDrafts.has(data.id))throw new Error('草稿已删除');sourceBase(data);const {bytes,extension}=await assets.readImage(data.data,dirFor(data.id));const dir=path.join(dirFor(data.id),'picture');await fs.mkdir(dir,{recursive:true});const filename=createHash('sha256').update(bytes).digest('hex').slice(0,24)+'.'+extension;const file=path.join(dir,filename);await fs.writeFile(file,bytes);return {src:pathToFileURL(file).href}}))
  handle('image:preview',async data=>{
    if(assets.remoteImage(data.src)||/^data:/i.test(data.src))return data.src
    const dir=sourceBase(data),image=await assets.readImage(data.src,dir)
    return 'data:image/'+(image.extension==='jpg'?'jpeg':image.extension)+';base64,'+image.bytes.toString('base64')
  })
  handle('file:open',async()=>{const result=await dialog.showOpenDialog(getWindow(),{properties:['openFile'],filters:[{name:'Markdown 文档',extensions:['md']}]});if(result.canceled)return null;const file=result.filePaths[0];if(!/\.md$/i.test(file))throw new Error('只支持 Markdown 文档');if((await fs.stat(file)).size>20*1024*1024)throw new Error('文件超过 20 MB');const text=await fs.readFile(file,'utf8');await remember(file);return {path:file,name:path.basename(file),text,origin:'file'}})
  handle('file:save',data=>lock(data.id,async()=>{
    if(typeof data.text!=='string')throw new Error('无效内容')
    const originalBase=sourceBase(data),original=data.path
    const local=assets.imageNodes(data.text).some(n=>!assets.remoteImage(n.url))
    let target=original,bundle=false
    if(!original||data.saveAs) {
      const name=path.basename(data.name||'未命名文档.md').replace(/\.md$/i,'')+'.md'
      const result=await dialog.showSaveDialog(getWindow(),{title:'保存为文档文件夹（创建同名文件夹及 picture）',defaultPath:name,filters:[{name:'Markdown 文档文件夹',extensions:['md']}]})
      if(result.canceled)return null
      target=result.filePath;bundle=true
    } else if(data.origin==='file'&&local) {
      const choice=await dialog.showMessageBox(getWindow(),{type:'question',title:'保存文档和图片',message:'是否将文档和本地图片整理到同名文件夹？',detail:'原位置保存：Markdown 保持原位置，图片放入同级 picture 文件夹。整理为文件夹：复制文档及图片到同名文件夹，原文件保留。网络图片保持网址，不下载。',buttons:['原位置保存','整理为文件夹','取消'],defaultId:0,cancelId:2})
      if(choice.response===2)return null
      bundle=choice.response===1
    }
    if(!/\.md$/i.test(target))throw new Error('保存目标必须为 .md 后缀，其他文件不会修改')
    if(bundle)target=path.join(path.dirname(target),path.basename(target,path.extname(target)),path.basename(target))
    if(target===original&&typeof data.savedText==='string'&&(await fs.readFile(original,'utf8'))!==data.savedText){const choice=await dialog.showMessageBox(getWindow(),{type:'warning',title:'源文件已变化',message:'文档在其他程序中发生了修改，是否覆盖？',detail:'取消后可以另存为新文件，避免覆盖外部修改。',buttons:['取消','覆盖'],defaultId:0,cancelId:0});if(choice.response!==1)return null}
    if(target!==original){try{await fs.stat(target);const choice=await dialog.showMessageBox(getWindow(),{type:'warning',message:'目标文档已存在，是否覆盖？',buttons:['取消','覆盖'],defaultId:0,cancelId:0});if(choice.response!==1)return null}catch(e){if(e.code!=='ENOENT')throw e}}
    const collected=await assets.collectAssets(data.text,originalBase)
    await assets.writeDocument(target,collected);await remember(target)
    let workspaceRoot=data.workspaceRoot&&roots.has(data.workspaceRoot.path)?data.workspaceRoot:null
    if(bundle)workspaceRoot=await addRoot(path.dirname(target))
    const warnings=[];try{await cleanup(data.id)}catch{warnings.push('文档已保存，临时草稿清理失败，将在下次保存时重试')}
    return {path:target,name:path.basename(target),text:collected.text,origin:workspaceRoot?'workspace':'file',workspaceRoot,warnings}
  }))
  handle('file:export',data=>lock(data.id,async()=>{const dir=sourceBase(data);const name=path.basename(data.name||'文档.md');const result=await dialog.showSaveDialog(getWindow(),{title:'打包文档和图片',defaultPath:name.replace(/\.md$/i,'')+'.zip',filters:[{name:'ZIP 压缩包',extensions:['zip']}]});if(result.canceled)return null;const collected=await assets.collectAssets(data.text,dir);await assets.exportArchive(result.filePath,name,collected);return {path:result.filePath}}))
  return {roots,addRoot,remember,ensurePath}
}
module.exports={createDocuments}
