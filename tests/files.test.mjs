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

test('headerless HTML table images survive save, inline recovery and ZIP export; code tags stay literal',async()=>{
 const root=await fixture();await fs.writeFile(path.join(root,'a & b.png'),png)
 const html='<table><tr><td><p><strong>保留格式</strong></p><img alt="x > y" SRC = "a &amp; b.png"><img src=\''+data+'\'><img src=https://example.com/a.png></td></tr></table>'
 const code='\n\n```html\n<img src="missing.png">\n```\n\n`<img src="missing-inline.png">`\n\n<!-- <img src="missing-comment.png"> -->\n\n<div title=\'<img src="missing-attribute.png">\'>text</div>\n\n<script>const example=\'<img src="missing-script.png">\'</script>'
 const result=await collectAssets(html+code,root)
 assert.equal(result.files.size,1);assert.equal(imageNodes(result.text).length,3)
 assert.equal(imageNodes(result.text).filter(n=>n.url.startsWith('picture/')).length,2)
 assert.match(result.text,/<strong>保留格式<\/strong>/);assert.match(result.text,/alt="x > y"/);assert.ok(result.text.endsWith(code));assert.match(result.text,/src="https:\/\/example.com\/a.png"|src=https:\/\/example.com\/a.png/)
 const file=path.join(root,'saved','table.md');await writeDocument(file,result)
 const recovered=await collectAssets(result.text,path.dirname(file),{inline:true});assert.equal(imageNodes(recovered.text).filter(n=>n.url===data).length,2)
 const zip=path.join(root,'table.zip');await exportArchive(zip,'table.md',result)
 const entries=unzipSync(await fs.readFile(zip));assert.equal(Object.keys(entries).length,2);assert.equal(strFromU8(entries['table/table.md']),result.text)
})

test('existing local files never create draft directories, including image import and save',async()=>{
 const s=await service(),file=path.join(s.root,'opened.md'),id='external-file-001'
 await fs.writeFile(file,'# 已有文件');s.setOpen([file]);await s.call('file:open')
 assert.equal((await s.call('draft:sync',{id,path:file,text:'edited'})).skipped,true)
 const image=await s.call('image:import',{id,path:file,isDraft:false,data});assert.equal(image.src,data)
 await assert.rejects(fs.stat(path.join(s.root,'drafts')),{code:'ENOENT'})
 s.setSave(path.join(s.root,'export.zip'));await s.call('file:export',{id,path:file,text:'![x]('+image.src+')',name:'opened.md'})
 assert.equal(Object.keys(unzipSync(await fs.readFile(path.join(s.root,'export.zip')))).length,2)
 s.setChoice(0);const result=await s.call('file:save',{id,path:file,text:'![x]('+image.src+')',origin:'file'})
 assert.match(result.text,/picture\//);assert.equal((await fs.readdir(path.join(s.root,'picture'))).length,1)
 await assert.rejects(fs.stat(path.join(s.root,'drafts')),{code:'ENOENT'})
})

test('saved new documents cannot be resurrected by a delayed autosave; sessions are not drafts',async()=>{
 const s=await service(),id='new-unsaved-001';await s.call('draft:sync',{id,isDraft:true,text:'# 新建'})
 s.setSave(path.join(s.root,'new.md'));await s.call('file:save',{id,text:'# 新建',name:'new.md',origin:'draft'})
 assert.equal((await s.call('draft:sync',{id,isDraft:true,text:'late'})).skipped,true)
 await assert.rejects(fs.stat(path.join(s.root,'drafts',id)),{code:'ENOENT'})
 const session='session-only-001';assert.equal((await s.call('draft:sync',{id:session,isDraft:false,text:'hello'})).skipped,true)
 assert.equal((await s.call('image:import',{id:session,isDraft:false,data})).src,data)
 await assert.rejects(fs.stat(path.join(s.root,'drafts',session)),{code:'ENOENT'})
})
test('manual saves create default documents and picture only when requested; Save As cancellation changes nothing',async()=>{
 const s=await service(),id='manual-save-0001'
 const staged=await s.call('draft:sync',{id,text:'# 新文档'});assert.equal(staged.disabled,true)
 const image=await s.call('image:import',{id,data});assert.equal(image.src,data)
 await assert.rejects(fs.stat(path.join(s.root,'documents')),{code:'ENOENT'})
 const text='# 新文档\n\n![local]('+image.src+')\n\n![web](https://example.com/a.png)\n'
 assert.equal(await s.call('file:save',{id,text,name:'note.md',saveAs:true}),null)
 await assert.rejects(fs.stat(path.join(s.root,'documents')),{code:'ENOENT'})
 const result=await s.call('file:save',{id,text,name:'note.md',origin:'untitled'})
 assert.equal(result.path,path.join(s.root,'documents',id,'note.md'));assert.equal(result.origin,'data');assert.equal(result.workspaceRoot,null)
 assert.equal(await fs.readFile(result.path,'utf8'),result.text);assert.match(result.text,/picture\//);assert.match(result.text,/https:\/\/example.com/)
 assert.equal((await fs.readdir(path.join(s.root,'documents',id,'picture'))).length,1)
 const preview=await s.call('image:preview',{id,path:result.path,src:imageNodes(result.text).find(n=>n.url.startsWith('picture')).url});assert.equal(preview,data)
 await s.call('draft:sync',{id,text:'NOT SAVED'});assert.equal(await fs.readFile(result.path,'utf8'),result.text)
 s.setSave(path.join(s.root,'note.md'));const moved=await s.call('file:save',{id,path:result.path,text:result.text,name:'note.md',origin:'data',saveAs:true})
 assert.equal(moved.path,path.join(s.root,'note','note.md'));assert.equal(await fs.readFile(result.path,'utf8'),result.text)
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
test('missing images and cancelled save leave the local original intact without staging',async()=>{
 const s=await service(),file=path.join(s.root,'keep.md'),id='failure-00001';await fs.writeFile(file,'ORIGINAL')
 s.setOpen([file]);await s.call('file:open');const stage=await s.call('draft:sync',{id,path:file,text:'UNSAVED'})
 s.setChoice(2);assert.equal(await s.call('file:save',{id,path:file,text:'![x](missing.png)',origin:'file'}),null)
 s.setChoice(0);await assert.rejects(s.call('file:save',{id,path:file,text:'![x](missing.png)',origin:'file'}),/无法整理图片/)
 assert.equal(stage.skipped,true);assert.equal(await fs.readFile(file,'utf8'),'ORIGINAL');await assert.rejects(fs.stat(path.join(s.root,'drafts',id)),{code:'ENOENT'})
})
test('ZIP export contains current Markdown and picture resources without modifying originals or temporary drafts',async()=>{
 const s=await service(),id='archive-00001';const stage=await s.call('draft:sync',{id,text:'DRAFT'})
 const text='# 未保存内容\n\n![x]('+data+')\n\n![web](https://example.com/x.png)';const dest=path.join(s.root,'文档.zip');s.setSave(dest)
 await s.call('file:export',{id,text,name:'文档.md'})
 const files=unzipSync(await fs.readFile(dest));assert.equal(Object.keys(files).length,2);assert.match(strFromU8(files['文档/文档.md']),/未保存内容/);assert.match(strFromU8(files['文档/文档.md']),/https:\/\/example.com/)
 const image=Object.keys(files).find(k=>k.startsWith('文档/picture/'));assert.deepEqual(Buffer.from(files[image]),png)
 assert.equal(stage.disabled,true);await assert.rejects(fs.stat(path.join(s.root,'drafts',id)),{code:'ENOENT'})
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
 assert.match(draft.text,/data:image\/png;base64,/);await assert.rejects(fs.stat(path.join(s.root,'drafts',id)),{code:'ENOENT'});assert.equal(await s.call('image:preview',{id,src:imageNodes(draft.text)[0].url}),data)
 s.setSave(path.join(s.root,'rescued.md'));const result=await s.call('file:save',{id,text:draft.text,name:'rescued.md',origin:'draft'});assert.match(await fs.readFile(result.path,'utf8'),/尚未保存的修改/)
})
test('default document deletion removes its own folder and protects external files',async()=>{
 const s=await service(),id='delete-local-001',other='delete-local-002',file=path.join(s.root,'original.md');await fs.writeFile(file,'SAVED');s.setOpen([file]);await s.call('file:open')
 const first=await s.call('file:save',{id,text:'FIRST',name:'first.md'}),second=await s.call('file:save',{id:other,text:'KEEP',name:'second.md'})
 await s.call('file:delete-default',{path:first.path});await assert.rejects(fs.stat(first.path),{code:'ENOENT'});assert.equal(await fs.readFile(second.path,'utf8'),'KEEP')
 await assert.rejects(s.call('file:delete-default',{path:file}),/仅能/);assert.equal(await fs.readFile(file,'utf8'),'SAVED')
 await assert.rejects(s.call('draft:delete',{id:'../../original.md'}),/标识/)
})

test('legacy sessions recover unsaved work separately and hydrate from latest disk content',async()=>{
 const s=await service(),file=path.join(s.root,'external.md');await fs.writeFile(file,'DISK');await s.documents.remember(file)
 const migrated=await s.documents.initializeSession({docs:[{id:'external-0001',path:file,name:'external.md',markdown:'UNSAVED',savedMarkdown:'OLD'},{id:'legacy-0001',name:'draft.md',markdown:'![x]('+data+')'}],active:'external-0001',openIds:['external-0001','legacy-0001']})
 assert.equal(migrated.format,'manual-v1');assert.equal(migrated.docs.length,3);assert.ok(migrated.docs.every(d=>!('markdown' in d)&&!('savedMarkdown' in d)))
 const recovery=migrated.docs.find(d=>d.name.includes('恢复副本'));assert.equal(await fs.readFile(recovery.path,'utf8'),'UNSAVED');assert.equal(migrated.active,recovery.id);assert.equal(await fs.readFile(file,'utf8'),'DISK')
 const draft=migrated.docs.find(d=>d.name==='draft.md');assert.match(await fs.readFile(draft.path,'utf8'),/picture\//)
 await fs.writeFile(file,'NEW EXTERNAL');assert.equal(s.documents.hydrateSession(migrated).docs.find(d=>d.path===file).markdown,'NEW EXTERNAL')
 assert.equal((await s.call('file:read',{path:file})).text,'NEW EXTERNAL')
 const again=await s.documents.initializeSession(migrated);assert.equal(again.docs.length,3)
 assert.ok((await fs.readFile(path.join(s.root,'migration-backups','session-before-manual-save.json'),'utf8')).includes('UNSAVED'))
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
