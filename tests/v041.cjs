const {_electron}=require('@playwright/test'),assert=require('node:assert/strict')
;(async()=>{
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({args:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.prose h1');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive())
  await page.getByRole('button',{name:'源码',exact:true}).click();await page.getByRole('textbox',{name:'Markdown 源码'}).fill('# 第一章\n\n## 第一节\n\n## 第二节 **粗体**\n\n正文内容\n\n```js\nconst x = 1\n```')
  await page.getByRole('button',{name:'编辑',exact:true}).click();const auto=page.getByRole('button',{name:'自动编号',exact:true})
  await page.locator('.prose h2').last().click();await auto.click();assert.equal(await page.locator('.prose h2').last().innerText(),'1.2 第二节 粗体');assert.equal(await page.locator('.prose h2 strong').innerText(),'粗体');assert.equal(await page.locator('.prose h2').first().innerText(),'第一节');assert.equal(await page.locator('.prose ol').count(),0)
  await auto.click();assert.equal(await page.locator('.prose h2').last().innerText(),'第二节 粗体')
  await page.locator('.prose h2').last().click();await page.keyboard.press('Control+Shift+7');assert.equal(await page.locator('.prose h2').last().innerText(),'1.2 第二节 粗体');assert.equal(await page.locator('.prose ol').count(),0)
  await page.keyboard.press('Control+Shift+7');assert.equal(await page.locator('.prose h2').last().innerText(),'第二节 粗体')
  await page.locator('.prose p').filter({hasText:'正文内容'}).click();await auto.click();assert.equal(await page.locator('.prose ol li').count(),1);await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('第二项');assert.equal(await page.locator('.prose ol li').count(),2)
  await page.keyboard.press('Control+Alt+Shift+h');assert.equal(await page.locator('.prose ol li').count(),1)
  await page.keyboard.press('Control+Alt+h');assert.ok(await page.locator('.prose ol li').count()>=1)
  await page.locator('.code-wrapper code').click();await auto.click();assert.equal(await page.locator('.code-wrapper').count(),1);assert.match(await page.locator('.code-wrapper code').innerText(),/const x = 1/)
  await page.getByRole('button',{name:'标题编号选项',exact:true}).click();assert.equal(await page.getByRole('menuitem').count(),2);await page.getByRole('menuitem',{name:/全文自动编号/}).click();assert.equal(await page.locator('.prose h1').innerText(),'1 第一章');assert.equal(await page.locator('.prose h2').last().innerText(),'1.2 第二节 粗体')
  await page.getByRole('button',{name:'阅读',exact:true}).click();assert.equal(await auto.isDisabled(),true);await page.locator('.prose h2').last().click();await page.keyboard.press('Control+Shift+7');assert.equal(await page.locator('.prose h2').last().innerText(),'1.2 第二节 粗体')
  assert.deepEqual(errors,[]);console.log('PASS: contextual body/heading numbering, repeated toggle, preserved heading formatting, keyboard routing, code guard, full-document numbering and read-only')
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(e=>{console.error(e);process.exitCode=1})
