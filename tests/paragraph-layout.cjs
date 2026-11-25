const {_electron}=require('@playwright/test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path')
;(async()=>{
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({executablePath:process.env.MDTEX_PACKAGED_TEST?path.resolve('MDTeX.exe'):undefined,args:process.env.MDTEX_PACKAGED_TEST?[]:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)});await page.waitForSelector('.prose')
  await app.evaluate(({BrowserWindow,dialog})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();dialog.showMessageBoxSync=()=>1})
  const mode=async name=>{await page.getByRole('button',{name,exact:true}).click();await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>new Promise(requestAnimationFrame))},source=page.getByRole('textbox',{name:'Markdown 源码'})
  const load=async text=>{await mode('源码');await source.fill(text);await mode('编辑')},align=async value=>{await page.getByRole('button',{name:{left:'段落靠左',center:'段落居中',right:'段落靠右'}[value],exact:true}).click();await page.evaluate(()=>new Promise(requestAnimationFrame))}
  const css=locator=>locator.evaluate(el=>{const s=getComputedStyle(el),value=s.textAlign;return value==='start'?(s.direction==='rtl'?'right':'left'):value==='end'?(s.direction==='rtl'?'left':'right'):value})
  const focus=async locator=>{await locator.click();await locator.evaluate(async el=>{const e=document.querySelector('.prose').editor;e.commands.focus(e.view.posAtDOM(el,0));await new Promise(requestAnimationFrame)})}
  await load('before\n\n$$\nx+y\n$$\n\nafter')
  assert.equal(await css(page.locator('.blockMath')),'center');assert.equal(await css(page.locator('.blockMath .katex-display > .katex')),'center');for(const p of await page.locator('.prose > p').all())assert.equal(await css(p),'left')
  // Inserting display math in the middle leaves both surrounding pieces left aligned.
  await load('before TARGET after');await page.evaluate(()=>{const e=document.querySelector('.prose').editor;e.commands.focus(8)})
  await page.getByRole('button',{name:'插入公式 Ctrl+Shift+M'}).click();assert.equal(await page.getByRole('radio',{name:'行内公式',exact:true}).isChecked(),true);await page.getByRole('radio',{name:'独立公式',exact:true}).check();await page.getByRole('button',{name:'插入公式',exact:true}).click()
  assert.equal(await css(page.locator('.blockMath')),'center');for(const p of await page.locator('.prose > p').all())assert.equal(await css(p),'left')
  // Current paragraph only, undo/redo and bold + inline math preservation.
  await load('# Heading\n\nfirst **bold** $x+1$\n\nsecond\n\nthird')
  const first=()=>page.locator('.prose > p').filter({hasText:'first'}).first(),second=()=>page.locator('.prose > p').filter({hasText:'second'}).first(),third=()=>page.locator('.prose > p').filter({hasText:'third'}).first()
  await focus(first());await align('center');assert.equal(await css(first()),'center');assert.equal(await css(second()),'left');assert.equal(await first().locator('strong').innerText(),'bold');assert.equal(await first().locator('.inlineMath').count(),1)
  await page.keyboard.press('Control+z');assert.equal(await css(first()),'left');await page.keyboard.press('Control+Shift+z');assert.equal(await css(first()),'center')
  await mode('源码');assert.match(await source.inputValue(),/<p style="text-align: center/);await mode('阅读');assert.equal(await css(first()),'center');assert.equal(await page.getByRole('button',{name:'段落居中',exact:true}).isDisabled(),true);await mode('分屏');assert.equal(await css(first()),'center');await mode('编辑')
  await focus(second());await align('right');assert.equal(await css(second()),'right');assert.equal(await css(third()),'left')
  // A multi-paragraph selection changes only those paragraphs.
  await page.evaluate(()=>{const e=document.querySelector('.prose').editor;let from,to;e.state.doc.descendants((n,p)=>{if(n.type.name==='paragraph'&&n.textContent==='second')from=p+1;if(n.type.name==='paragraph'&&n.textContent==='third')to=p+n.nodeSize-1});e.commands.setTextSelection({from,to});e.commands.focus()})
  await align('center');assert.equal(await css(second()),'center');assert.equal(await css(third()),'center');await align('left');assert.equal(await css(second()),'left');assert.equal(await css(third()),'left');assert.equal(await css(first()),'center')
  await focus(page.locator('.prose h1'));await align('right');await mode('源码');assert.match(await source.inputValue(),/<h1 style="text-align: right/);await mode('编辑');assert.equal(await css(page.locator('.prose h1')),'right')
  // Formula alignment is independent of neighboring paragraphs and survives parsing.
  await load('before\n\n$$\nx+y\n$$\n\nafter');await page.locator('.blockMath').click();await align('center');assert.equal(await css(page.locator('.blockMath .katex-display > .katex')),'center');assert.equal(await css(page.locator('.prose > p').first()),'left')
  await mode('源码');assert.match(await source.inputValue(),/\$\$\nx\+y\n\$\$/);await mode('编辑');assert.equal(await css(page.locator('.blockMath')),'center');await page.locator('.blockMath').click();await align('right');assert.equal(await css(page.locator('.blockMath .katex-display > .katex')),'right',await page.evaluate(()=>{const e=document.querySelector('.prose').editor;return JSON.stringify({selection:e.state.selection.toJSON(),doc:e.getJSON(),style:document.querySelector('.blockMath')?.getAttribute('style')})}));await align('left');assert.equal(await css(page.locator('.blockMath .katex-display > .katex')),'left')
  for(let i=0;i<4;i++){await mode('源码');await mode('编辑');await page.locator('.blockMath').click();await align('right');assert.equal(await css(page.locator('.blockMath')),'right');assert.equal(await css(page.locator('.prose > p').first()),'left');await align('left')}
  await load('first\n\nsecond\n\nthird');await mode('分屏');await source.evaluate(el=>{const at=el.value.indexOf('second');el.focus();el.setSelectionRange(at+2,at+2)});await align('center');assert.equal(await css(page.locator('.prose > p').filter({hasText:'second'})),'center');assert.equal(await css(page.locator('.prose > p').filter({hasText:'first'})),'left');await mode('编辑')
  // Header tables retain paragraph alignment and overriding a column to left works.
  await load('| A | B |\n| ---: | --- |\n| table text | other |')
  const cell=()=>page.locator('.prose td').first().locator('p');await focus(cell());await align('left');assert.equal(await css(cell()),'left');await mode('源码');await mode('编辑');assert.equal(await css(cell()),'left')
  await focus(cell());await align('center');await mode('源码');assert.match(await source.inputValue(),/<table/);await mode('编辑');assert.equal(await css(cell()),'center');assert.equal(await page.locator('.prose table th').count(),2);await focus(cell());await align('right');await mode('源码');await mode('编辑');assert.equal(await css(cell()),'right')
  await load('- list first\n- list second');await focus(page.locator('.prose li p').first());await align('center');await mode('源码');await mode('编辑');assert.equal(await css(page.locator('.prose li p').first()),'center');assert.equal(await page.locator('.prose li').count(),2)
  // Code stays out of paragraph alignment; real save/reopen retains chosen layout.
  await load('```python\nprint(1)\n```');await focus(page.locator('.code-wrapper code'));assert.equal(await page.getByRole('button',{name:'段落居中',exact:true}).isDisabled(),true)
  await load('<p style="text-align: center">saved centered</p>\n\n<p style="text-align: right">saved right</p>\n\nnormal left')
  const dir=path.resolve('test-results/layout-'+Date.now());await fs.mkdir(dir,{recursive:true});const dest=path.join(dir,'layout.md');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},dest);await page.keyboard.press('Control+Shift+s');await page.getByRole('tab',{name:/layout.md/}).waitFor();const saved=path.join(dir,'layout','layout.md');assert.match(await fs.readFile(saved,'utf8'),/text-align: center/)
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},saved);await mode('打开md文档');assert.equal(await css(page.locator('.prose > p').filter({hasText:'saved centered'})),'center');assert.equal(await css(page.locator('.prose > p').filter({hasText:'saved right'})),'right');assert.equal(await css(page.locator('.prose > p').filter({hasText:'normal left'})),'left')
  await page.getByRole('combobox',{name:'主题'}).selectOption('dark');await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/paragraph-layout.png'});assert.deepEqual(errors,[])
  console.log('PASS: default-centered display math with left-aligned surrounding text, surrounding text unchanged, scoped/batch paragraph and heading alignment, undo/redo, math/marks, read/source/split, table/list layout, code protection and native save/reopen')
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(error=>{console.error(error);process.exitCode=1})
