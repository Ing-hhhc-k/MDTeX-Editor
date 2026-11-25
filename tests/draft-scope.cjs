const {_electron,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict')
;(async()=>{
 const root=path.resolve('test-results/manual-save-'+Date.now());await fs.mkdir(root,{recursive:true});const file=path.join(root,'existing.md');await fs.writeFile(file,'# Existing\n')
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({executablePath:process.env.MDTEX_PACKAGED_TEST?path.resolve('MDTeX.exe'):undefined,args:process.env.MDTEX_PACKAGED_TEST?[]:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.prose');await app.evaluate(({BrowserWindow,dialog})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();global.testChoice=0;dialog.showMessageBoxSync=()=>2;dialog.showMessageBox=async()=>({response:global.testChoice})})
  const profile=await app.evaluate(({app})=>app.getPath('userData')),base=path.join(profile,'documents'),source=page.getByRole('textbox',{name:'Markdown 源码'})
  const dirs=()=>fs.readdir(base).catch(e=>{if(e.code==='ENOENT')return [];throw e}),mode=async name=>{await page.getByRole('button',{name,exact:true}).click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},file);await page.getByRole('button',{name:'打开md文档',exact:true}).click();await mode('源码');await source.fill('# External UNSAVED');await page.waitForTimeout(1600)
  assert.deepEqual(await dirs(),[]);assert.equal(await fs.readFile(file,'utf8'),'# Existing\n');assert.ok(!(await fs.readFile(path.join(profile,'session.json'),'utf8')).includes('UNSAVED'))
  await page.keyboard.press('Control+s');await expect.poll(()=>fs.readFile(file,'utf8')).toBe('# External UNSAVED');assert.deepEqual(await dirs(),[])
  await page.getByRole('button',{name:'新建文档',exact:true}).click();await mode('源码');const id=await page.evaluate(()=>window.mdtexImageContext.id);await source.fill('# Manual UNSAVED')
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6v1sAAAAASUVORK5CYII=','base64')
  await page.locator('input[type=file][accept^="image/"]').setInputFiles({name:'image.png',mimeType:'image/png',buffer:png});await expect(source).toHaveValue(/data:image/);await page.waitForTimeout(1600);assert.deepEqual(await dirs(),[])
  assert.ok(!(await fs.readFile(path.join(profile,'session.json'),'utf8')).includes('Manual UNSAVED'))
  await page.keyboard.press('Control+s');await expect(source).toHaveValue(/picture\//);const saved=path.join(base,id,'未命名文档.md'),savedText=await fs.readFile(saved,'utf8');assert.match(savedText,/Manual UNSAVED/);assert.equal((await fs.readdir(path.join(base,id,'picture'))).length,1)
  await source.fill('# Changed but not saved');await page.waitForTimeout(1500);assert.equal(await fs.readFile(saved,'utf8'),savedText)
  await app.evaluate(()=>{global.testChoice=2});await page.getByRole('button',{name:'关闭标签 未命名文档.md',exact:true}).click();await expect(source).toHaveValue('# Changed but not saved')
  await app.evaluate(()=>{global.testChoice=1});await page.getByRole('button',{name:'关闭标签 未命名文档.md',exact:true}).click();await expect(page.getByRole('tab',{name:/未命名文档/})).toHaveCount(0)
  await page.getByRole('button',{name:/^本地文档/}).click();await page.locator('.draft-open').filter({hasText:'未命名文档'}).click();await expect(source).toHaveValue(savedText)
  await source.fill('# Save when closing');await app.evaluate(()=>{global.testChoice=0});await page.getByRole('button',{name:'关闭标签 未命名文档.md',exact:true}).click();await expect.poll(()=>fs.readFile(saved,'utf8')).toBe('# Save when closing')
  await page.locator('.draft-open').filter({hasText:'未命名文档'}).click();await expect(source).toHaveValue('# Save when closing')
  await app.evaluate(({dialog},dest)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:dest})},path.join(root,'copy.md'));await page.keyboard.press('Control+Shift+s');await expect(page.getByRole('tab',{name:/copy.md/})).toHaveCount(1);assert.equal(await fs.readFile(saved,'utf8'),'# Save when closing');assert.equal(await fs.readFile(path.join(root,'copy','copy.md'),'utf8'),'# Save when closing')
  await page.getByRole('button',{name:/^本地文档/}).click();await expect(page.locator('.draft-row')).toHaveCount(1)
  await mode('源码');await source.fill('# Native close save');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await page.waitForTimeout(400);assert.equal(page.isClosed(),false)
  await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>0});const closed=page.waitForEvent('close');await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),20)});await closed
  assert.equal(await fs.readFile(path.join(root,'copy','copy.md'),'utf8'),'# Native close save');assert.deepEqual(errors,[])
  console.log('PASS: manual-only text/images, data defaults, no content in session cache, close save/discard/cancel, Save As retention, native close saves before exit')
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(error=>{console.error(error);process.exitCode=1})
