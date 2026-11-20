import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {unzipSync,strFromU8} from 'fflate'
import {collectAssets,imageNodes,writeDocument,exportArchive} from '../electron/assets.mjs'
const require=createRequire(import.meta.url)
const {createDocuments}=require('../electron/documents.cjs')
const {registerWorkspace}=require('../electron/workspace.cjs')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6v1sAAAAASUVORK5CYII=','base64')
const data='data:image/png;base64,'+png.toString('base64')
async function fixture(){await fs.mkdir('test-results',{recursive:true});return fs.mkdtemp(path.resolve('test-results/files-'))}
async function service(){
 const root=await fixture(),handlers=new Map(),webContents={},authorizedPaths=new Set()
 let savePath=null,openPaths=[],choice=0
 const dialog={showOpenDialog:async()=>({canceled:!openPaths.length,filePaths:openPaths}),showSaveDialog:async()=>({canceled:!savePath,filePath:savePath}),showMessageBox:async()=>({response:choice})}
 const getWindow=()=>({webContents}),ipcMain={handle:(name,fn)=>handlers.set(name,fn)},app={getPath:()=>root}
 const shell={trashItem:async file=>{await fs.rename(file,file+'.test-trash')}}
 const documents=await createDocuments({app,ipcMain,dialog,shell,getWindow,authorizedPaths})
 registerWorkspace({ipcMain,dialog,shell:{trashItem:async()=>{}},getWindow,authorizedPaths,documents})
 const call=(name,...args)=>handlers.get(name)({sender:webContents},...args)
 return {root,documents,call,setSave:p=>savePath=p,setOpen:paths=>openPaths=paths,setChoice:n=>choice=n}
}
test('Markdown AST collects local image references, deduplicates bytes, skips code and preserves network URLs',async()=>{
 const root=await fixture();await fs.writeFile(path.join(root,'a space.png'),png)
 const original='```md\n![code](missing.png)\n```\n\n`![inline](missing.png)`\n\n![local](<a space.png>)\n\n![same]('+data+')\n\n![remote](https://example.com/a.png)\n\n![ref][img]\n\n[img]: <a space.png> "标题"\n'
 const result=await collectAssets(original,root)
 assert.equal(result.files.size,1);assert.match(result.text,/https:\/\/example.com\/a.png/);assert.match(result.text,/!\[code\]\(missing.png\)/);assert.match(result.text,/\[img\]: <picture\//)
 assert.equal(imageNodes(result.text).filter(n=>n.url.startsWith('picture/')).length,3)
 assert.ok(!result.text.includes('data:image'))
})
test('draft image resources survive cancellation and are removed only after a successful folder save',async()=>{
 const s=await service(),id='draft-case-00001'
 const staged=await s.call('draft:sync',{id,text:'# 新文档'})
 const image=await s.call('image:import',{id,data})
 assert.deepEqual(await fs.readFile(fileURLToPath(image.src)),png)
 const text='# 新文档\n\n![local]('+image.src+')\n\n![web](https://example.com/a.png)\n'
 await s.call('draft:sync',{id,text})
 assert.equal(await s.call('file:save',{id,text,name:'note.md',origin:'draft'}),null)
 assert.match(await fs.readFile(path.join(staged.directory,'draft.md'),'utf8'),/新文档/)
 s.setSave(path.join(s.root,'note.md'))
 const result=await s.call('file:save',{id,text,name:'note.md',origin:'draft'})
 assert.equal(result.path,path.join(s.root,'note','note.md'));assert.equal(result.workspaceRoot.path,path.dirname(result.path))
 assert.equal(await fs.readFile(result.path,'utf8'),result.text)
 assert.match(result.text,/picture\//);assert.match(result.text,/https:\/\/example.com\/a.png/)
 assert.equal((await fs.readdir(path.join(s.root,'note','picture'))).length,1)
 await assert.rejects(fs.stat(staged.directory),{code:'ENOENT'})
 const preview=await s.call('image:preview',{id,path:result.path,src:imageNodes(result.text).find(n=>n.url.startsWith('picture')).url});assert.equal(preview,data)
})
test('external local images are copied, standalone documents can save in place or copy into a bundle',async()=>{
 const s=await service(),file=path.join(s.root,'existing.md'),external=path.join(s.root,'external.png'),id='existing-00001'
 await fs.writeFile(external,png);await fs.writeFile(file,'# 原文\n\n![old](external.png)\n')
 s.setOpen([file]);await s.call('file:open');s.setChoice(0)
 const result=await s.call('file:save',{id,path:file,name:'existing.md',text:'# 修改\n\n![local]('+pathToFileURL(external).href+')\n',origin:'file'})
 assert.equal(result.path,file);assert.equal(result.workspaceRoot,null);assert.match(result.text,/picture\//);assert.deepEqual(await fs.readFile(external),png)
 const previous=await fs.readFile(file,'utf8');s.setChoice(1)
 const bundle=await s.call('file:save',{id,path:file,name:'existing.md',text:result.text+'\n第二次修改',origin:'file'})
 assert.equal(bundle.path,path.join(s.root,'existing','existing.md'));assert.equal(await fs.readFile(file,'utf8'),previous)
 assert.match(bundle.text,/第二次修改/);assert.deepEqual(await fs.readFile(external),png)
})
test('missing local images and cancelled standalone prompt leave original file and staging intact',async()=>{
 const s=await service(),file=path.join(s.root,'keep.md'),id='failure-00001';await fs.writeFile(file,'ORIGINAL')
 s.setOpen([file]);await s.call('file:open');const stage=await s.call('draft:sync',{id,path:file,text:'UNSAVED'})
 s.setChoice(2);assert.equal(await s.call('file:save',{id,path:file,text:'![x](missing.png)',origin:'file'}),null)
 s.setChoice(0);await assert.rejects(s.call('file:save',{id,path:file,text:'![x](missing.png)',origin:'file'}),/无法整理图片/)
 assert.equal(await fs.readFile(file,'utf8'),'ORIGINAL');assert.equal(await fs.readFile(path.join(stage.directory,'draft.md'),'utf8'),'UNSAVED')
})
test('ZIP export contains current Markdown and picture resources without modifying originals or temporary drafts',async()=>{
 const s=await service(),id='archive-00001';const stage=await s.call('draft:sync',{id,text:'DRAFT'})
 const text='# 未保存内容\n\n![x]('+data+')\n\n![web](https://example.com/x.png)';const dest=path.join(s.root,'文档.zip');s.setSave(dest)
 await s.call('file:export',{id,text,name:'文档.md'})
 const files=unzipSync(await fs.readFile(dest));assert.equal(Object.keys(files).length,2);assert.match(strFromU8(files['文档/文档.md']),/未保存内容/);assert.match(strFromU8(files['文档/文档.md']),/https:\/\/example.com/)
 const image=Object.keys(files).find(k=>k.startsWith('文档/picture/'));assert.deepEqual(Buffer.from(files[image]),png)
 assert.equal(await fs.readFile(path.join(stage.directory,'draft.md'),'utf8'),'DRAFT')
})
test('multiple workspace roots remain independent and reject non-Markdown reads and traversal',async()=>{
 const s=await service(),a=path.join(s.root,'A'),b=path.join(s.root,'B');await fs.mkdir(a);await fs.mkdir(b)
 await fs.writeFile(path.join(a,'same.md'),'A');await fs.writeFile(path.join(b,'same.md'),'B');await fs.writeFile(path.join(a,'private.txt'),'NOT READ')
 s.setOpen([a]);await s.call('workspace:open');s.setOpen([b]);await s.call('workspace:open')
 assert.equal((await s.call('workspace:read',a,'same.md')).text,'A');assert.equal((await s.call('workspace:read',b,'same.md')).text,'B')
 await assert.rejects(s.call('workspace:read',a,'private.txt'),/仅支持/);await assert.rejects(s.call('workspace:read',a,'../B/same.md'),/超出/)
 await assert.rejects(s.call('workspace:create',a,'same.md'),{code:'EEXIST'})
})
test('external file changes require explicit overwrite before saving',async()=>{
 const s=await service(),file=path.join(s.root,'conflict.md'),id='conflict-00001';await fs.writeFile(file,'Original');s.setOpen([file]);await s.call('file:open');await fs.writeFile(file,'External update')
 s.setChoice(0);assert.equal(await s.call('file:save',{id,path:file,text:'My edits',savedText:'Original',origin:'file'}),null);assert.equal(await fs.readFile(file,'utf8'),'External update')
 s.setChoice(1);await s.call('file:save',{id,path:file,text:'My edits',savedText:'Original',origin:'file'});assert.equal(await fs.readFile(file,'utf8'),'My edits')
})
test('detached drafts copy relative local images and can be saved after the source Markdown is deleted',async()=>{
 const s=await service(),file=path.join(s.root,'deleted.md'),id='deleted-00001';await fs.writeFile(file,'# 原文');await fs.writeFile(path.join(s.root,'image.png'),png);s.setOpen([file]);await s.call('file:open');await fs.unlink(file)
 const draft=await s.call('draft:detach',{id,path:file,text:'# 尚未保存的修改\n\n![x](image.png)'})
 assert.match(draft.text,/picture\//);assert.equal(await s.call('image:preview',{id,src:imageNodes(draft.text)[0].url}),data)
 s.setSave(path.join(s.root,'rescued.md'));const result=await s.call('file:save',{id,text:draft.text,name:'rescued.md',origin:'draft'});assert.match(await fs.readFile(result.path,'utf8'),/尚未保存的修改/)
})
test('draft deletion clears only its own staging and blocks autosave resurrection',async()=>{
 const s=await service(),id='delete-draft-001',other='delete-draft-002',file=path.join(s.root,'original.md');await fs.writeFile(file,'SAVED');s.setOpen([file]);await s.call('file:open')
 const stage=await s.call('draft:sync',{id,path:file,text:'UNSAVED'});const otherStage=await s.call('draft:sync',{id:other,text:'KEEP'})
 await s.call('image:import',{id,path:file,data});await s.call('draft:delete',{id});await assert.rejects(fs.stat(stage.directory),{code:'ENOENT'});assert.equal(await fs.readFile(file,'utf8'),'SAVED');assert.equal(await fs.readFile(path.join(otherStage.directory,'draft.md'),'utf8'),'KEEP')
 assert.equal((await s.call('draft:sync',{id,text:'late write'})).deleted,true);await assert.rejects(fs.stat(stage.directory),{code:'ENOENT'});await assert.rejects(s.call('image:import',{id,data}),/草稿已删除/)
 await assert.rejects(s.call('draft:delete',{id:'../../original.md'}),/标识/)
})
test('workspace suffix restrictions cover create/read/rename/delete, including .markdown and disguised extensions',async()=>{
 const s=await service();s.setOpen([s.root]);await s.call('workspace:open');const dir=s.root
 for(const name of ['other.txt','other.markdown','photo.png','fake.md.txt'])await fs.writeFile(path.join(dir,name),'KEEP')
 const created=await s.call('workspace:create',dir,'allowed.md');assert.equal(created.text,'');await s.call('workspace:rename',dir,'allowed.md','renamed.md')
 for(const name of ['other.txt','other.markdown','photo.png','fake.md.txt']){
  await assert.rejects(s.call('workspace:read',dir,name),/仅支持/);await assert.rejects(s.call('workspace:delete',dir,name),/仅支持/);await assert.rejects(s.call('workspace:rename',dir,name,'new.md'),/仅支持/);assert.equal(await fs.readFile(path.join(dir,name),'utf8'),'KEEP')
 }
 await assert.rejects(s.call('workspace:create',dir,'new.txt'),/后缀|结尾/);await assert.rejects(s.call('workspace:rename',dir,'renamed.md','new.txt'),/仅支持/)
 assert.equal((await s.call('workspace:list',dir,'')).filter(e=>e.editable).length,1)
})
