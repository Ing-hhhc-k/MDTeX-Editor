const {_electron}=require('@playwright/test'),assert=require('node:assert/strict')
;(async()=>{
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({args:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow();await app.evaluate(({net,shell,dialog,BrowserWindow})=>{net.fetch=async()=>({ok:true,json:async()=>({tag_name:'v0.4.3',body:'测试发布说明',assets:[{state:'uploaded',browser_download_url:'https://github.com/Ing-hhhc-k/MDTeX-Editor/releases/download/v0.4.3/MDTeX-Editor-0.4.3-win-x64.zip'}]})});shell.openExternal=async url=>{globalThis.downloaded=url};dialog.showMessageBoxSync=()=>1;BrowserWindow.getAllWindows()[0].showInactive()})
  await page.waitForSelector('.prose h1');const errors=[];page.on('pageerror',e=>errors.push(e.message));const theme=page.getByRole('combobox',{name:'主题'})
  const text=await page.locator('.prose').innerText();await theme.selectOption('dark');await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark')
  const color=await page.locator('.app').evaluate(el=>getComputedStyle(el).backgroundColor);assert.ok(Number(color.match(/\d+/)[0])<80)
  assert.ok(Number((await page.locator('.document-tab.selected').evaluate(el=>getComputedStyle(el).backgroundColor)).match(/\d+/)[0])<80)
  assert.ok(Number((await theme.evaluate(el=>getComputedStyle(el).color)).match(/\d+/)[0])>150)
  await page.getByRole('button',{name:'源码',exact:true}).click();assert.ok(Number((await page.locator('.source-pane').evaluate(el=>getComputedStyle(el).backgroundColor)).match(/\d+/)[0])<80)
  await page.getByRole('button',{name:'编辑',exact:true}).click();assert.equal(await page.locator('.prose').innerText(),text)
  await page.reload();await page.waitForSelector('.prose h1');assert.equal(await theme.inputValue(),'dark');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark')
  await page.getByRole('button',{name:/检查更新|发现新版本/,exact:true}).click();await page.getByRole('button',{name:'下载新版 ZIP'}).waitFor();await page.getByRole('button',{name:'下载新版 ZIP'}).click();assert.match(await app.evaluate(()=>globalThis.downloaded),/v0\.4\.3\/MDTeX-Editor-0\.4\.3-win-x64.zip$/)
  await page.getByRole('checkbox',{name:/启动时检查更新/}).uncheck();await page.getByRole('button',{name:'关闭更新窗口'}).click()
  await page.screenshot({path:'test-results/dark-theme.png',timeout:10000})
  await theme.selectOption('light');await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');assert.equal(await theme.inputValue(),'light')
  await app.evaluate(({net})=>{net.fetch=async()=>{throw Error('offline-test')}});await page.getByRole('button',{name:/检查更新|发现新版本/,exact:true}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/offline-test/);await page.getByRole('button',{name:'关闭更新窗口'}).click()
  await page.reload();await page.waitForSelector('.prose h1');await page.getByRole('button',{name:'检查更新',exact:true}).click();assert.equal(await page.getByRole('checkbox',{name:/启动时检查更新/}).isChecked(),false)
  assert.deepEqual(errors,[]);console.log('PASS: dark/light theme, persistence, source colors, unchanged document, release detection, verified download, network errors and startup-check preference')
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(e=>{console.error(e);process.exitCode=1})
