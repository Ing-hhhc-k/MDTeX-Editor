const {_electron}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path')
const {pathToFileURL}=require('node:url')
;(async()=>{
 const tag='v05-'+Date.now(),profileA=tag+'-A',profileB=tag+'-B',profileC=tag+'-legacy',root=path.resolve('test-results');await fs.mkdir(root,{recursive:true})
 const launch=async profile=>{const env={...process.env,MDTEX_TEST:'1',MDTEX_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;const app=await _electron.launch({args:['.'],env,timeout:60000});const page=await app.firstWindow();await app.evaluate(({dialog,BrowserWindow,net})=>{dialog.showMessageBoxSync=()=>1;BrowserWindow.getAllWindows()[0].showInactive();net.fetch=async()=>{throw Error('offline-test')}});await page.waitForSelector('.prose');return {app,page}}
 const close=async app=>{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close()).catch(()=>{});await app.close().catch(()=>{})}
 let instance
 try{
  instance=await launch(profileA);let {app,page}=instance
  await page.getByRole('button',{name:'新建文档',exact:true}).click()
  await page.getByRole('tab',{name:/未命名文档/}).waitFor()
  const id=await page.evaluate(()=>window.mdtexImageContext.id)
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='
  const image=await page.evaluate(async({id,png})=>window.desktop.importImage({id,data:png}),{id,png})
  await page.getByRole('combobox',{name:'主题'}).selectOption('dark')
  await page.getByRole('button',{name:'源码',exact:true}).click();const text='# 迁移草稿\n\n![图片]('+image.src+')\n\n关闭前的最后文字'
  await page.getByRole('textbox',{name:'Markdown 源码'}).fill(text)
  await close(app);instance=null
  const session=JSON.parse(await fs.readFile(path.join(root,profileA,'session.json'),'utf8'));assert.equal(session.docs.find(d=>d.id===id).markdown,text)
  await fs.cp(path.join(root,profileA),path.join(root,profileB),{recursive:true})
  instance=await launch(profileB);({app,page}=instance)
  assert.equal(await page.getByRole('combobox',{name:'主题'}).inputValue(),'dark')
  await page.getByRole('button',{name:'源码',exact:true}).click();const migrated=await page.getByRole('textbox',{name:'Markdown 源码'}).inputValue();assert.match(migrated,/关闭前的最后文字/);assert.ok(migrated.includes(pathToFileURL(path.join(root,profileB)).href));assert.ok(!migrated.includes(profileA))
  await page.getByRole('button',{name:'编辑',exact:true}).click();await page.waitForFunction(()=>{const i=document.querySelector('.prose img');return i?.complete&&i.naturalWidth>0})
  await page.reload();await page.waitForSelector('.prose h1');assert.match(await page.locator('.prose').innerText(),/关闭前的最后文字/)
  await page.getByRole('button',{name:/检查更新|发现新版本/,exact:true}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/offline-test/)
  assert.match(await page.locator('.data-location').innerText(),new RegExp(profileB));await page.getByRole('checkbox',{name:/启动时检查更新/}).uncheck()
  await page.screenshot({path:path.join(root,'v05-dark-update.png')})
  await close(app);instance=null
  await fs.cp(path.join(root,profileA),path.join(root,profileC),{recursive:true});await fs.unlink(path.join(root,profileC,'session.json'))
  instance=await launch(profileC);({app,page}=instance);await page.getByRole('button',{name:'源码',exact:true}).click();const legacy=await page.getByRole('textbox',{name:'Markdown 源码'}).inputValue();assert.match(legacy,/关闭前的最后文字/);assert.ok(legacy.includes(pathToFileURL(path.join(root,profileC)).href))
  await page.getByRole('button',{name:'编辑',exact:true}).click();await page.waitForFunction(()=>{const i=document.querySelector('.prose img');return i?.complete&&i.naturalWidth>0})
  console.log('PASS: immediate-close text persistence, copied profile and legacy localStorage recovery, image remapping/rendering, restored theme, reload persistence, data location and update network failure')
 }finally{if(instance)await close(instance.app)}
})().catch(error=>{console.error(error);process.exitCode=1})
