const fs = require('node:fs/promises')
const path = require('node:path')
const isMarkdown = file => /\.(md|markdown)$/i.test(file)
function registerWorkspace({ipcMain, dialog, shell, getWindow, authorizedPaths}) {
  let root = null
  async function resolve(relative = '') {
    if (!root || typeof relative !== 'string') throw new Error('请先打开文件夹')
    const target = path.resolve(root, relative)
    const inside = p => p === root || p.startsWith(root + path.sep)
    if (!inside(target)) throw new Error('路径超出当前文件夹')
    const parent = await fs.realpath(path.dirname(target))
    if (target !== root && !inside(parent)) throw new Error('不支持文件夹外的链接')
    try { if (!inside(await fs.realpath(target))) throw new Error('不支持文件夹外的链接') } catch(e) { if(e.code !== 'ENOENT') throw e }
    return target
  }
  function handle(name, fn) { ipcMain.handle('workspace:'+name, async(event,...args)=> { if(event.sender!==getWindow().webContents)throw new Error('无效来源'); return fn(...args) }) }
  async function read(relative) {
    const file = await resolve(relative)
    if(!isMarkdown(file))throw new Error('仅支持读取 Markdown 文档')
    if((await fs.stat(file)).size>20*1024*1024)throw new Error('文件超过 20 MB')
    const text=await fs.readFile(file,'utf8'); authorizedPaths.add(file)
    return {path:file,name:path.basename(file),text}
  }
  handle('open',async()=>{const result=await dialog.showOpenDialog(getWindow(),{properties:['openDirectory']});if(result.canceled)return null;root=await fs.realpath(result.filePaths[0]);return {name:path.basename(root),path:root}})
  handle('list',async(relative='')=>{
    const dir=await resolve(relative)
    const entries=await fs.readdir(dir,{withFileTypes:true})
    return entries.map(e=>({name:e.name,relative:path.join(relative,e.name),directory:e.isDirectory()&&!e.isSymbolicLink(),editable:e.isFile()&&!e.isSymbolicLink()&&isMarkdown(e.name)})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name))
  })
  handle('read',read)
  handle('create',async(relative)=>{const file=await resolve(relative);if(!isMarkdown(file))throw new Error('文件名须以 .md 或 .markdown 结尾');await fs.writeFile(file,'',{flag:'wx'});return read(relative)})
  handle('rename',async(relative,newName)=>{
    if(typeof newName!=='string'||newName!==path.basename(newName)||/[\\/:*?"<>|]/.test(newName))throw new Error('请输入有效文件名')
    const old=await resolve(relative),target=await resolve(path.join(path.dirname(relative),newName))
    if(!isMarkdown(old)||!isMarkdown(target))throw new Error('仅支持重命名 Markdown 文档')
    if(old===target)return {old,path:target,name:newName}
    try{await fs.stat(target);throw new Error('同名文件已存在')}catch(e){if(e.code!=='ENOENT')throw e}
    await fs.rename(old,target);authorizedPaths.delete(old);authorizedPaths.add(target)
    return {old,path:target,name:newName}
  })
  handle('delete',async(relative)=>{const file=await resolve(relative);if(!isMarkdown(file))throw new Error('仅支持删除 Markdown 文档');if(!(await fs.stat(file)).isFile())throw new Error('不是文件');await shell.trashItem(file);authorizedPaths.delete(file);return {path:file}})
}
module.exports={registerWorkspace}
