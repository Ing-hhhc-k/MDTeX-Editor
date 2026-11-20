const {_electron}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises')
;(async()=>{
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({executablePath:process.env.MDTEX_PACKAGED_TEST?require('node:path').resolve('MDTeX.exe'):undefined,args:process.env.MDTEX_PACKAGED_TEST?[]:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.prose');await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows()[0].showInactive();dialog.showMessageBoxSync=()=>1})
  const auto=page.getByRole('button',{name:'自动编号',exact:true}),source=page.getByRole('textbox',{name:'Markdown 源码'}),mode=name=>page.getByRole('button',{name,exact:true}).click()
  const load=async text=>{await mode('源码');await source.fill(text);await mode('编辑')}
  const titles=()=>page.locator('.prose h1,.prose h2,.prose h3').allTextContents()
  await load('# 前章\n\n# 当前章\n\n## 第一节\n\n## 第二节\n\n## 第三节 **粗体**')
  await page.locator('.prose h1').last().click();await auto.click();assert.deepEqual(await titles(),['前章','1 当前章','第一节','第二节','第三节 粗体'])
  await page.locator('.prose h2').last().click();await auto.click();assert.equal((await titles()).at(-1),'1.1 第三节 粗体')
  await page.locator('.prose h2').first().click();await auto.click();assert.deepEqual((await titles()).slice(2),['1.1 第一节','第二节','1.2 第三节 粗体'])
  await page.locator('.prose h1').first().click();await auto.click();assert.deepEqual(await titles(),['1 前章','2 当前章','2.1 第一节','第二节','2.2 第三节 粗体'])
  await page.locator('.prose h2').nth(1).click();await page.keyboard.press('Control+Shift+7');assert.deepEqual((await titles()).slice(2),['2.1 第一节','2.2 第二节','2.3 第三节 粗体'])
  await page.locator('.prose h2').first().click();await page.keyboard.press('Control+Alt+Shift+h');assert.deepEqual((await titles()).slice(2),['第一节','2.1 第二节','2.2 第三节 粗体']);assert.equal(await page.locator('.prose strong').innerText(),'粗体')
  await load('# 上级\n\n## 第一节\n\n## 第二节\n\n## 第三节')
  await page.locator('.prose h2').last().click();await auto.click();assert.equal((await titles()).at(-1),'1 第三节')
  await page.locator('.prose h2').first().click();await auto.click();assert.deepEqual((await titles()).slice(1),['1 第一节','第二节','2 第三节'])
  await page.locator('.prose h1').click();await auto.click();assert.deepEqual(await titles(),['1 上级','1.1 第一节','第二节','1.2 第三节'])
  await auto.click();assert.deepEqual(await titles(),['上级','1 第一节','第二节','2 第三节'])
  // Remove a numbered node; all following numbered peers close the gap.
  await page.evaluate(()=>{const e=document.querySelector('.prose').editor;let target;e.state.doc.descendants((n,p)=>{if(n.type.name==='heading'&&n.textContent==='1 第一节')target={from:p,to:p+n.nodeSize}});e.commands.deleteRange(target)})
  assert.deepEqual(await titles(),['上级','第二节','1 第三节'])
  await page.keyboard.press('Control+z');assert.deepEqual(await titles(),['上级','1 第一节','第二节','2 第三节'])
  await mode('源码');assert.match(await source.inputValue(),/## 2 第三节/);await mode('编辑');assert.deepEqual(await titles(),['上级','1 第一节','第二节','2 第三节'])
  console.log('PASS: sparse heading membership, earlier insertion/removal, descendants, missing parent, preserved marks and delete/undo')
  // Adjacent paragraphs continue, while an empty paragraph separates sequences.
  await page.evaluate(()=>{const e=document.querySelector('.prose').editor;e.commands.setContent({type:'doc',content:['甲','乙','','丙','丁'].map(text=>({type:'paragraph',content:text?[{type:'text',text}]:[]}))})})
  for(const text of ['甲','乙','丙','丁']){await page.locator('.prose p').filter({hasText:new RegExp('^'+text+'$')}).click();await auto.click()}
  assert.deepEqual(await page.locator('.prose > ol').evaluateAll(lists=>lists.map(n=>({start:n.start,items:[...n.children].map(n=>n.textContent)}))),[{start:1,items:['甲','乙']},{start:1,items:['丙','丁']}])
  await mode('源码');let md=await source.inputValue();assert.match(md,/1\. 甲\n2\. 乙/);assert.match(md,/1\. 丙\n2\. 丁/);await mode('编辑');assert.equal(await page.locator('.prose > ol').count(),2)
  // Multi-paragraph selection preserves empty lines rather than numbering them.
  await page.evaluate(()=>{const e=document.querySelector('.prose').editor;e.commands.setContent({type:'doc',content:['甲','乙','','丙','丁'].map(text=>({type:'paragraph',content:text?[{type:'text',text}]:[{type:'hardBreak'}]}))});e.commands.selectAll()})
  await auto.click();assert.equal(await page.locator('.prose > ol').count(),2);assert.equal(await page.locator('.prose li').count(),4);assert.ok(await page.locator('.prose > p').count()>=1);assert.ok((await page.locator('.prose > p').allTextContents()).every(t=>!t.trim()))
  // Plain text between lists and Markdown blank lines keep independent starts.
  await load('1. 第一项\n2. 第二项\n\n1. 第三项\n2. 第四项\n\n分隔内容\n\n1. 新的一组')
  assert.deepEqual(await page.locator('.prose > ol').evaluateAll(l=>l.map(n=>[n.start,n.children.length])),[[1,2],[1,2],[1,1]])
  await mode('源码');md=await source.inputValue();await source.fill(md);await mode('编辑');assert.equal(await page.locator('.prose > ol').count(),3)
  await page.locator('.prose > ol').nth(1).locator('li').first().click();await auto.click();await auto.click();assert.equal(await page.locator('.prose > ol').count(),3)
  // Pasting plain numbered text must keep blank-line boundaries too.
  await load('');await page.locator('.prose').click();await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','1. 粘贴甲\n2. 粘贴乙\n\n1. 粘贴丙');document.querySelector('.prose').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))})
  assert.deepEqual(await page.locator('.prose > ol').evaluateAll(l=>l.map(n=>[n.start,n.children.length])),[[1,2],[1,1]])
  await load('');await page.locator('.prose').click();await auto.click();await page.keyboard.type('先编号再输入');assert.equal(await page.locator('.prose > ol li').innerText(),'先编号再输入')
  // Double Enter exits the list with an actual separator, then numbering restarts.
  await load('第一项');await page.locator('.prose p').click();await auto.click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.type('第二项');await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.keyboard.type('新的一组');await auto.click()
  assert.deepEqual(await page.locator('.prose > ol').evaluateAll(l=>l.map(n=>[n.start,n.children.length])),[[1,2],[1,1]])
  await mode('源码');md=await source.inputValue();assert.match(md,/1\. 第一项\n2\. 第二项/);assert.match(md,/1\. 新的一组/)
  assert.deepEqual(errors,[]);console.log('PASS: adjacent paragraph continuation, blank-line and other-block reset, multi-selection, Markdown round-trip, double-Enter list exit')
  await fs.mkdir('test-results',{recursive:true});await mode('编辑');await page.screenshot({path:'test-results/numbering-fixed.png'})
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(error=>{console.error(error);process.exitCode=1})
