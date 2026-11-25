import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {zipSync} from 'fflate'
const require=createRequire(import.meta.url),{configureStorage,remap}=require('../electron/storage.cjs'),{validateArchive,managed,prepareInstall}=require('../electron/installer.cjs')
const fixture=async()=>fs.mkdtemp(path.join(os.tmpdir(),'mdtex-portable-'))
test('legacy migration is non-destructive; copied data restores text, preferences and image URLs',async()=>{
 const temp=await fixture(),legacy=path.join(temp,'旧数据'),root=path.join(temp,'程序甲'),nextRoot=path.join(temp,'程序乙')
 try{
  await fs.mkdir(path.join(legacy,'drafts','test-doc','picture'),{recursive:true})
  const text='![test]('+pathToFileURL(path.join(legacy,'drafts','test-doc','picture','test.png')).href+')'
  await fs.writeFile(path.join(legacy,'drafts','test-doc','draft.md'),text)
  await fs.writeFile(path.join(legacy,'session.json'),JSON.stringify({docs:[{id:'test-doc',markdown:text}],active:'test-doc'}))
  await fs.writeFile(path.join(legacy,'preferences.json'),JSON.stringify({'mdtex.theme':'dark'}))
  const app={getPath:()=>legacy,setPath:(_key,value)=>{app.directory=value}},storage=configureStorage(app,{root,legacy})
  assert.equal(app.directory,path.join(root,'MDTeX-data'));assert.equal(storage.bootstrap.preferences['mdtex.theme'],'dark')
  assert.ok(storage.bootstrap.session.docs[0].markdown.includes(pathToFileURL(app.directory).href));assert.equal(await fs.readFile(path.join(legacy,'drafts','test-doc','draft.md'),'utf8'),text)
  await fs.mkdir(nextRoot);await fs.cp(storage.directory,path.join(nextRoot,'MDTeX-data'),{recursive:true})
  const next=configureStorage(app,{root:nextRoot,legacy})
  assert.ok(next.bootstrap.session.docs[0].markdown.includes(pathToFileURL(next.directory).href))
  const handlers=new Map(),sender={};next.register({ipcMain:{on:(key,fn)=>handlers.set(key,fn),handle:(key,fn)=>handlers.set(key,fn)},getWindow:()=>({webContents:sender}),shell:{}})
  const e={sender};handlers.get('storage:session')(e,{docs:[{id:'test-doc',path:path.join(next.directory,'documents','test-doc','test.md'),markdown:'最新文字',savedMarkdown:'旧文字',dirty:true}],active:'test-doc'});assert.equal(e.returnValue.ok,true)
  const saved=JSON.parse(await fs.readFile(path.join(next.directory,'session.json'),'utf8'));assert.equal(saved.format,'manual-v1');assert.equal(saved.docs[0].path,path.join(next.directory,'documents','test-doc','test.md'));assert.equal(saved.docs[0].markdown,undefined);assert.equal(saved.docs[0].savedMarkdown,undefined);assert.equal(saved.docs[0].dirty,undefined)
  assert.equal(remap('D:\\external\\test.md',legacy,next.directory),'D:\\external\\test.md')
  await fs.writeFile(path.join(next.directory,'session.json'),'invalid');assert.throws(()=>configureStorage(app,{root:nextRoot,legacy}),/数据文件无法读取/)
 }finally{await fs.rm(temp,{recursive:true,force:true})}
})
const entries=()=>Object.fromEntries(managed.filter(n=>n!=='_internal').map(n=>[n,Buffer.from(n==='MDTeX.exe'?'MZlauncher':'documentation')]).concat([
 ['_internal/MDTeX.exe',Buffer.from('MZruntime')],['_internal/resources/app/package.json',Buffer.from(JSON.stringify({name:'mdtex-editor',version:'0.5.1'}))]
]))
const digest=bytes=>'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex')
test('updater rejects tampering, traversal, data overwrite, oversized archives and wrong version',()=>{
 const valid=zipSync(entries());assert.ok(validateArchive(valid,digest(valid),'0.5.1')['MDTeX.exe'])
 assert.throws(()=>validateArchive(valid,'sha256:'+'0'.repeat(64),'0.5.1'),/校验失败/)
 assert.throws(()=>validateArchive(valid,digest(valid),'0.5.2'),/版本不匹配/)
 const oversized=Buffer.from(valid),central=oversized.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));oversized.writeUInt32LE(1300*1024*1024,central+24);assert.throws(()=>validateArchive(oversized,digest(oversized),'0.5.1'),/解压后过大/)
 for(const bad of ['../evil.exe','_internal/../../bad','MDTeX-data/session.json','_internal\\bad','C:/bad']){
  const bytes=zipSync({...entries(),[bad]:Buffer.from('bad')});assert.throws(()=>validateArchive(bytes,digest(bytes),'0.5.1'),/不安全/)
 }
 const noExe=entries();delete noExe['_internal/MDTeX.exe'];const bad=zipSync(noExe);assert.throws(()=>validateArchive(bad,digest(bad),'0.5.1'),/Windows 程序/)
})
test('network or hash failure does not modify existing program or data',async()=>{
 const root=await fixture();try{
  await fs.writeFile(path.join(root,'MDTeX.exe'),'old')
  const storage={root,directory:path.join(root,'MDTeX-data')},release={digest:'sha256:'+'0'.repeat(64),downloadUrl:'https://github.com/example',latestVersion:'0.5.1'}
  await assert.rejects(prepareInstall({net:{fetch:async()=>{throw Error('offline')}},storage,release,onProgress:()=>{}}),/offline/)
  const bytes=zipSync(entries());await assert.rejects(prepareInstall({net:{fetch:async()=>new Response(bytes)},storage,release,onProgress:()=>{}}),/校验失败/)
  assert.equal(await fs.readFile(path.join(root,'MDTeX.exe'),'utf8'),'old');await assert.rejects(fs.stat(storage.directory),{code:'ENOENT'})
 }finally{await fs.rm(root,{recursive:true,force:true})}
})
test('Windows helper replaces in place, preserves data and rolls back an interrupted replacement',{skip:process.platform!=='win32'},async()=>{
 const temp=await fixture();try{
  for(const fail of [false,true]){
   const root=path.join(temp,fail?'失败测试':'成功测试'),work=path.join(root,'MDTeX-data','updates','test'),stage=path.join(work,'stage'),backup=path.join(work,'backup')
   await fs.mkdir(path.join(stage,'_internal'),{recursive:true});await fs.mkdir(path.join(root,'_internal'),{recursive:true})
   for(const name of managed){if(name==='_internal'){await fs.writeFile(path.join(root,name,'old.txt'),'old');await fs.writeFile(path.join(stage,name,'new.txt'),'new')}else{await fs.writeFile(path.join(root,name),'old');if(!(fail&&name==='使用说明.md'))await fs.writeFile(path.join(stage,name),'new')}}
   const keep=path.join(root,'MDTeX-data','session.json');await fs.writeFile(keep,'USER DATA')
   const planFile=path.join(work,'plan.json');await fs.writeFile(planFile,JSON.stringify({root,work,stage,backup,parentPid:0,restart:false}))
   const script=await fs.readFile('electron/update-helper.ps1','utf8'),command='& {\n'+script+'\n} -PlanFile \''+planFile.replaceAll("'","''")+'\''
   execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,timeout:30000})
   assert.equal(await fs.readFile(keep,'utf8'),'USER DATA')
   const status=JSON.parse((await fs.readFile(path.join(work,'status.json'),'utf8')).replace(/^\uFEFF/,''));assert.equal(status.state,fail?'failed':'success')
   for(const name of managed.filter(n=>n!=='_internal'))assert.equal(await fs.readFile(path.join(root,name),'utf8'),fail?'old':'new')
   if(!fail)await assert.rejects(fs.stat(backup),{code:'ENOENT'})
  }
 }finally{await fs.rm(temp,{recursive:true,force:true})}
})
