const {_electron}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path')
;(async()=>{
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({executablePath:process.env.MDTEX_PACKAGED_TEST?path.resolve('MDTeX.exe'):undefined,args:process.env.MDTEX_PACKAGED_TEST?[]:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)});await page.waitForSelector('.prose')
  await app.evaluate(({BrowserWindow,dialog})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();dialog.showMessageBoxSync=()=>1})
  const mode=async name=>{await page.getByRole('button',{name,exact:true}).click();await page.evaluate(()=>new Promise(requestAnimationFrame))},source=page.getByRole('textbox',{name:'Markdown 源码'}),table=page.locator('.prose table')
  const load=async text=>{await mode('源码');await source.fill(text);await mode('编辑')}
  const insert=async(header=false)=>{await page.getByRole('button',{name:'插入表格',exact:true}).click();await page.getByRole('checkbox',{name:'首行设为标题行'}).setChecked(header);await page.getByRole('button',{name:'2 行 2 列',exact:true}).click();if(!await source.isVisible())assert.equal(await table.locator('tr').count(),2,await page.locator('.prose').innerHTML())}
  const focus=async(selector,end=false)=>{await page.locator(selector).first().evaluate(async(el,end)=>{const e=document.querySelector('.prose').editor;e.commands.focus(e.view.posAtDOM(el,0)+(end?el.textContent.length:0));await new Promise(requestAnimationFrame)},end)}
  const resetTable=async()=>{await load('');await page.locator('.prose').click();await insert();await page.waitForTimeout(550)}
  for(const key of ['Backspace','Delete']){await resetTable();assert.equal(await table.locator('th').count(),0);await page.keyboard.press(key);assert.equal(await table.count(),0);await page.keyboard.press('Control+z');assert.equal(await table.locator('tr').count(),2,await page.locator('.prose').innerHTML())}
  await resetTable();await page.keyboard.type('abc');await page.keyboard.press('Backspace');assert.equal(await table.locator('td').first().innerText(),'ab');await focus('.prose td p');await page.keyboard.press('Delete');assert.equal(await table.locator('td').first().innerText(),'b')
  // Switching source/reading/split must not add an artificial header or row.
  await mode('源码');assert.match(await source.inputValue(),/<table/);assert.doesNotMatch(await source.inputValue(),/<th[ >]/)
  for(const view of ['阅读','分屏','编辑']){await mode(view);assert.equal(await table.locator('tr').count(),2);assert.equal(await table.locator('th').count(),0);assert.equal(await table.locator('td').first().innerText(),'b')}
  // Toggle from any row; only the first row changes, preserving cell contents.
  for(const expected of [2,0]){await table.locator('tr').last().locator('td').first().click({button:'right'});await mode('设置 / 取消标题行');assert.equal(await table.locator('th').count(),expected);assert.equal(await table.locator('tr').first().locator('td,th').first().innerText(),'b');await mode('源码');await mode('编辑');assert.equal(await table.locator('th').count(),expected);assert.equal(await table.locator('tr').count(),2)}
  await focus('.prose td p');await page.keyboard.press('Backspace');assert.equal(await table.count(),1);assert.equal(await page.evaluate(()=>document.querySelector('.prose').editor.state.selection.node?.type.name==='table'),true);await page.keyboard.press('Backspace');assert.equal(await table.count(),0);await page.keyboard.press('Control+z');assert.equal(await table.count(),1)
  await table.locator('td').first().click({button:'right'});await mode('选中整个表格');assert.equal(await page.evaluate(()=>document.querySelector('.prose').editor.state.selection.node?.type.name),'table');await page.keyboard.press('Delete');assert.equal(await table.count(),0)
  // Adjacent paragraph boundaries select the table before deleting it.
  for(const key of ['Backspace','Delete']){await load('before\n\n<table><tr><td><p>keep</p></td></tr></table>\n\nafter');await focus(key==='Backspace'?'.prose > p:last-of-type':'.prose > p:first-of-type',key==='Delete');await page.keyboard.press(key);assert.equal(await table.count(),1);await page.keyboard.press(key);assert.equal(await table.count(),0);assert.match(await page.locator('.prose').innerText(),/before/);assert.match(await page.locator('.prose').innerText(),/after/)}
  // Full cell selection deletes the table; partial selection only clears cells.
  for(const all of [false,true]){await resetTable();await page.keyboard.type('keep');await page.evaluate(all=>{const e=document.querySelector('.prose').editor,cells=[];e.state.doc.descendants((n,p)=>{if(n.type.name==='tableCell')cells.push(p)});e.commands.setCellSelection({anchorCell:cells[0],headCell:cells[all?cells.length-1:1]});e.commands.focus()},all);await page.keyboard.press('Delete');assert.equal(await table.count(),all?0:1)}
  await load('');await page.locator('.prose').click();await insert(true);assert.equal(await table.locator('th').count(),2);await mode('源码');assert.match(await source.inputValue(),/\|\s*---/);await mode('编辑');assert.equal(await table.locator('tr').count(),2)
  // Source insertion obeys the same header choice and exact dimensions.
  await mode('源码');await source.fill('');await source.focus();await insert(false);await mode('编辑');assert.equal(await table.locator('th').count(),0)
  // Rich cell content and native save/reopen preserve a headerless table.
  await load('<table><tr><td><p><strong>bold &amp; &lt;text&gt;</strong></p><p><code>a|b</code></p><p><span data-math="inlineMath" data-latex="x^2">x^2</span></p></td><td><p>second</p></td></tr></table>')
  await mode('源码');await mode('编辑');assert.equal(await table.locator('strong').innerText(),'bold & <text>');assert.equal(await table.locator('code').innerText(),'a|b');assert.equal(await table.locator('.inlineMath').count(),1)
  const dir=path.resolve('test-results/table-save-'+Date.now());await fs.mkdir(dir,{recursive:true});const dest=path.join(dir,'table.md')
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},dest);await page.keyboard.press('Control+Shift+s');await page.waitForFunction(()=>document.querySelector('.toast')?.textContent.includes('已保存'))
  const savedPath=path.join(dir,'table','table.md');const saved=await fs.readFile(savedPath,'utf8');assert.match(saved,/<td/);assert.doesNotMatch(saved,/<th[ >]/);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},savedPath);await mode('打开md文档');assert.equal(await table.locator('th').count(),0);assert.equal(await table.locator('strong').innerText(),'bold & <text>')
  assert.deepEqual(errors,[]);await page.screenshot({path:'test-results/tables-053.png'});console.log('PASS: empty/selected/boundary keyboard deletion, undo, cell text protection, partial/full selections, optional header, exact dimensions, rich content, source/read/split and save/reopen')
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(error=>{console.error(error);process.exitCode=1})
