const {_electron}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{unzipSync,strFromU8}=require('fflate')
;(async()=>{
 const base=path.resolve('test-results/ui-v04-'+Date.now());await fs.mkdir(base,{recursive:true})
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6v1sAAAAASUVORK5CYII=','base64')
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({args:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.prose h1');await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows()[0].showInactive();dialog.showMessageBoxSync=()=>1})
  const mode=name=>page.getByRole('button',{name,exact:true}).click(),source=page.getByRole('textbox',{name:'Markdown 源码'})
  const setSave=dest=>app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:!file,filePath:file})},dest)
  const setOpen=dest=>app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},dest)
  const waitSaved=async()=>{await page.waitForTimeout(150);await page.waitForFunction(()=>document.querySelector('.app').getAttribute('aria-busy')==='false')}
  // New draft: managed staging, image resource, cancellation, folder save and cleanup.
  await page.getByRole('button',{name:'新建文档',exact:true}).click();await page.getByRole('tab',{name:/未命名文档/}).waitFor()
  await mode('源码');await source.fill('# 第一份笔记\n\n当前内容。\n');await mode('编辑');await page.locator('.prose p').first().click()
  await page.locator('input[type=file][accept^="image/"]').setInputFiles({name:'local.png',mimeType:'image/png',buffer:png});await page.waitForSelector('.prose img')
  const draftContext=await page.evaluate(()=>window.mdtexImageContext)
  const stageDir=path.join(await app.evaluate(({app})=>app.getPath('userData')),'drafts',draftContext.id)
  await setSave(null);await page.keyboard.press('Control+s');await waitSaved();await fs.stat(stageDir)
  await setSave(path.join(base,'第一份笔记.md'));await page.keyboard.press('Control+s');await waitSaved()
  const bundle=path.join(base,'第一份笔记'),md=path.join(bundle,'第一份笔记.md'),text=await fs.readFile(md,'utf8');assert.match(text,/picture\//);assert.doesNotMatch(text,/file:\/\/|data:image/)
  assert.equal((await fs.readdir(path.join(bundle,'picture'))).length,1);await page.waitForTimeout(900);await assert.rejects(fs.stat(stageDir),{code:'ENOENT'})
  assert.equal(await page.getByRole('button',{name:'文件树',exact:true}).count(),1);await page.getByRole('button',{name:'picture',exact:true}).click()
  assert.equal(await page.locator('.prose img').evaluate(el=>el.complete&&el.naturalWidth>0),true)
  // ZIP exports edits without changing Markdown on disk.
  await mode('源码');await source.fill(text+'\nZIP 中的未保存修改\n');await setSave(path.join(base,'export.zip'));await page.getByRole('button',{name:'打包 ZIP',exact:true}).click();await waitSaved()
  const archive=unzipSync(await fs.readFile(path.join(base,'export.zip'))),zipText=strFromU8(archive['第一份笔记/第一份笔记.md']);assert.match(zipText,/ZIP 中的未保存修改/);assert.equal(await fs.readFile(md,'utf8'),text)
  // Native single file: prompt, in-place picture, then optional copy into bundle.
  const single=path.join(base,'single.md');await fs.writeFile(path.join(base,'outside.png'),png);await fs.writeFile(single,'# 单个文件\n\n![local](outside.png)\n\n![web](https://example.invalid/a.png)\n')
  await setOpen(single);await page.getByRole('button',{name:'打开',exact:true}).click();await page.getByRole('tab',{name:/single.md/}).waitFor();assert.equal(await page.getByRole('button',{name:'文件树',exact:true}).count(),0)
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2})});await page.keyboard.press('Control+s');await waitSaved();assert.match(await fs.readFile(single,'utf8'),/outside.png/)
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0})});await page.keyboard.press('Control+s');await waitSaved();assert.match(await fs.readFile(single,'utf8'),/picture\//);await fs.stat(path.join(base,'outside.png'))
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1})});await page.keyboard.press('Control+s');await waitSaved();await fs.stat(path.join(base,'single','single.md'));assert.equal(await page.getByRole('button',{name:'文件树',exact:true}).count(),1)
  // Two folders with same basename: switching tab restores tree and unsaved content.
  const roots=[]
  for(const label of ['A','B']){const dir=path.join(base,label);await fs.mkdir(dir);await fs.writeFile(path.join(dir,'same.md'),'# '+label+' 文档\n\n正文\n');roots.push(dir);await setOpen(dir);await page.getByRole('button',{name:'打开文件夹',exact:true}).click();await page.getByRole('button',{name:'same.md',exact:true}).click();await page.locator('.prose h1').filter({hasText:label+' 文档'}).waitFor();if(label==='A'){await page.locator('.prose p').click();await page.keyboard.press('End');await page.keyboard.type(' unsaved-A')}}
  const tabs=page.getByRole('tab',{name:/same.md/});assert.equal(await tabs.count(),2);await tabs.first().click();assert.match(await page.locator('.prose').innerText(),/unsaved-A/);assert.equal(await page.locator('.folder-heading').innerText(),'A')
  await tabs.last().click();assert.equal(await page.locator('.folder-heading').innerText(),'B')
  // Delete explicitly requires a dialog and cancel leaves the file intact.
  await page.getByRole('button',{name:'删除 same.md',exact:true}).click();await page.getByRole('dialog',{name:'文件操作'}).waitFor();await page.getByRole('button',{name:'取消',exact:true}).click();await fs.stat(path.join(roots[1],'same.md'))
  await page.waitForTimeout(800);await page.reload();await page.waitForSelector('.prose h1');assert.equal(await page.getByRole('tab',{name:/same.md/}).count(),2);await page.getByRole('tab',{name:/same.md/}).first().click();assert.match(await page.locator('.prose').innerText(),/unsaved-A/)
  await page.screenshot({path:'test-results/v04.png',timeout:10000});assert.deepEqual(errors,[])
  console.log('PASS: native draft/folder/single-file flows, preview, image resources, save cancellation/cleanup, ZIP current edits, multi-root tabs/tree switching, delete confirmation and restored tabs')
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(e=>{console.error(e);process.exitCode=1})
