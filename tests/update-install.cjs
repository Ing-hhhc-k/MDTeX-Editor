const {_electron}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{zipSync,unzipSync}=require('fflate'),{execFileSync}=require('node:child_process')
;(async()=>{
 const version=require('../package.json').version,next=version.split('.').map(Number);next[2]++;const nextVersion=next.join('.')
 const root=path.resolve('test-results/真实更新-'+Date.now()),archive=path.resolve('test-results/update-fixture.zip');await fs.mkdir(root,{recursive:true});await fs.cp(path.resolve('release/MDTeX'),root,{recursive:true})
 const data=path.join(root,'MDTeX-data');await fs.mkdir(data,{recursive:true});await fs.writeFile(path.join(data,'preferences.json'),JSON.stringify({'mdtex.autoUpdateCheck':'false'}))
 // Use the real packaged runtime and UI, with only the fixture release version changed.
 const entries=unzipSync(await fs.readFile(`MDTeX-Editor-${version}-win-x64.zip`));const pkg=JSON.parse(Buffer.from(entries['_internal/resources/app/package.json']).toString());pkg.version=nextVersion;entries['_internal/resources/app/package.json']=Buffer.from(JSON.stringify(pkg));const bytes=Buffer.from(zipSync(entries,{level:1}));await fs.writeFile(archive,bytes);const digest='sha256:'+crypto.createHash('sha256').update(bytes).digest('hex')
 const env={...process.env,MDTEX_TEST:'1',MDTEX_TEST_INSTALL_ROOT:root,MDTEX_PORTABLE_ROOT:root};delete env.ELECTRON_RUN_AS_NODE
 let app
 try{
  app=await _electron.launch({executablePath:path.join(root,'_internal/MDTeX.exe'),env,timeout:60000});const page=await app.firstWindow();await page.waitForSelector('.prose')
  await app.evaluate(({net,dialog,BrowserWindow},input)=>{
   dialog.showMessageBoxSync=()=>1;BrowserWindow.getAllWindows()[0].showInactive()
   const fetch=net.fetch.bind(net)
   net.fetch=async url=>String(url).includes('/releases/latest')?{ok:true,json:async()=>({tag_name:'v'+input.nextVersion,body:'隔离更新测试',assets:[{state:'uploaded',digest:input.digest,size:input.size,browser_download_url:`https://github.com/Ing-hhhc-k/MDTeX-Editor/releases/download/v${input.nextVersion}/MDTeX-Editor-${input.nextVersion}-win-x64.zip`}]})}:fetch(input.archiveURL)
  },{digest,archiveURL:require('node:url').pathToFileURL(archive).href,size:bytes.length,nextVersion})
  await page.getByRole('button',{name:'新建文档',exact:true}).click();await page.getByRole('tab',{name:/未命名文档/}).waitFor();const id=await page.evaluate(()=>window.mdtexImageContext.id)
  await page.getByRole('button',{name:'源码',exact:true}).click();await page.getByRole('textbox',{name:'Markdown 源码'}).fill('# 自动更新保留草稿\n\n最后一次编辑')
  await page.getByRole('button',{name:/检查更新|发现新版本/,exact:true}).click();const install=page.getByRole('button',{name:'更新并重启',exact:true});await install.waitFor();assert.equal(await install.isEnabled(),true);await install.click()
  const updates=path.join(data,'updates');let work,status
  for(let i=0;i<180;i++){
   const dirs=await fs.readdir(updates).catch(()=>[]);if(dirs.length)work=path.join(updates,dirs[0])
   if(work){try{status=JSON.parse((await fs.readFile(path.join(work,'status.json'),'utf8')).replace(/^\uFEFF/,''));if(status.state)break}catch{}
   }
   if(!page.isClosed()&&await page.getByRole('alert').count().catch(()=>0))throw Error(await page.getByRole('alert').innerText())
   await new Promise(r=>setTimeout(r,500))
  }
  assert.equal(status?.state,'success',JSON.stringify(status));assert.equal(JSON.parse(await fs.readFile(path.join(root,'_internal/resources/app/package.json'),'utf8')).version,nextVersion)
  const session=JSON.parse(await fs.readFile(path.join(data,'session.json'),'utf8'));assert.match(session.docs.find(d=>d.id===id).markdown,/最后一次编辑/)
  await assert.rejects(fs.stat(path.join(work,'backup')),{code:'ENOENT'});await assert.rejects(fs.stat(path.join(work,'stage')),{code:'ENOENT'})
  console.log('PASS: packaged UI one-click download, SHA256 validation, app exit, in-place replacement, real restart/renderer-ready acknowledgement, draft retention, old-file cleanup')
 }finally{
  if(app){await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.destroy()}).catch(()=>{});await app.close().catch(()=>{})}
  // Stop only the restarted fixture executable, never another MDTeX instance.
  const exe=path.join(root,'_internal/MDTeX.exe').replaceAll("'","''")
  const command="$ProgressPreference='SilentlyContinue'; Get-Process -Name MDTeX -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '"+exe+"' } | Stop-Process -Force; exit 0"
  try{execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,stdio:'pipe'})}catch{}
 }
})().catch(error=>{console.error(error);process.exitCode=1})
