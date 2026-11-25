const {_electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises')
;(async()=>{
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({executablePath:process.env.MDTEX_PACKAGED_TEST?path.resolve('MDTeX.exe'):undefined,args:process.env.MDTEX_PACKAGED_TEST?[]:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)});await page.waitForSelector('.prose')
  await app.evaluate(({BrowserWindow,dialog})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();dialog.showMessageBoxSync=()=>1})
  const source=page.getByRole('textbox',{name:'Markdown 源码'}),mode=async name=>{await page.getByRole('button',{name,exact:true}).click();await page.evaluate(()=>new Promise(requestAnimationFrame));await page.evaluate(()=>new Promise(requestAnimationFrame))}
  const sourceCaret=async(start,end=start)=>source.evaluate((el,{start,end})=>{el.focus({preventScroll:true});el.setSelectionRange(start,end);el.dispatchEvent(new Event('select',{bubbles:true}))},{start,end})
  const load=async(text,at=text.length)=>{await mode('源码');await source.fill(text);await sourceCaret(at);await mode('编辑')}
  const richCursor=()=>page.evaluate(()=>{const e=document.querySelector('.prose').editor,s=e.state.selection;return {from:s.from,to:s.to,text:s.$from.parent.textContent,offset:s.$from.parentOffset,node:s.node?.type.name,scroll:document.querySelector('.render-pane').scrollTop}})
  const fixture=Array.from({length:100},(_,i)=>`## 第 ${i} 节\n\n第 ${i} 段 before **唯一位置${i}** after。`).join('\n\n')
  const target=fixture.indexOf('唯一位置88')+4
  await load(fixture,target);let cursor=await richCursor();assert.match(cursor.text,/唯一位置88/);assert.ok(cursor.scroll>1000,JSON.stringify(cursor))
  await mode('源码');const canonical=await source.inputValue();assert.equal(await source.evaluate(el=>el.selectionStart),canonical.indexOf('唯一位置88')+4);assert.ok(await source.evaluate(el=>el.scrollTop)>1000)
  await page.keyboard.press('Control+/');await page.waitForTimeout(80);assert.match((await richCursor()).text,/唯一位置88/)
  await mode('源码');const selectionStart=(await source.inputValue()).indexOf('唯一位置66');await sourceCaret(selectionStart,selectionStart+6);await mode('编辑');assert.equal((await richCursor()).to-(await richCursor()).from,6);await mode('源码');assert.equal(await source.evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd)),'唯一位置66')
  assert.doesNotMatch(await source.inputValue(),/MDTEXCURSOR|\uE000|\uE001/)
  // Duplicate text and noncanonical Markdown still map to the correct occurrence.
  const raw='Title\n=====\n\nSame **duplicate** paragraph.\n\nSame **duplicate** paragraph.\n\n```python\na = 1\nsecond_unique = 2\n```'
  await mode('源码');await source.fill(raw);await sourceCaret(raw.lastIndexOf('duplicate')+3);await mode('编辑');cursor=await richCursor();assert.equal(cursor.text,'Same duplicate paragraph.');assert.ok(cursor.from>30)
  await mode('源码');let codeAt=(await source.inputValue()).indexOf('second_unique')+6;await sourceCaret(codeAt);await mode('编辑');assert.equal((await richCursor()).offset,'a = 1\nsecond'.length);await mode('源码');assert.equal(await source.evaluate(el=>el.selectionStart),(await source.inputValue()).indexOf('second_unique')+6)
  await mode('编辑');await fs.mkdir('test-results',{recursive:true});const file=path.resolve('test-results/original-cursor.md');await fs.writeFile(file,raw)
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},file);await mode('打开md文档')
  await page.evaluate(()=>{const e=document.querySelector('.prose').editor;let last;e.state.doc.descendants((n,p)=>{if(n.isText&&n.text==='duplicate')last=p});e.commands.focus(last+3)})
  await mode('源码');assert.equal(await source.inputValue(),raw);assert.equal(await source.evaluate(el=>el.selectionStart),raw.lastIndexOf('duplicate')+3)
  // Split-view switching follows whichever editing pane was last active.
  await mode('分屏');await sourceCaret(raw.indexOf('second_unique')+6);await mode('编辑');assert.equal((await richCursor()).offset,'a = 1\nsecond'.length)
  await load('<table><tr><td><pre><code class="language-python">first&#10;table_cursor_unique</code></pre></td></tr></table>');await mode('源码');const tableAt=(await source.inputValue()).indexOf('table_cursor_unique')+5;await sourceCaret(tableAt);await mode('编辑');assert.equal((await richCursor()).offset,'first\ntable'.length);await mode('源码');assert.equal(await source.evaluate(el=>el.selectionStart),(await source.inputValue()).indexOf('table_cursor_unique')+5)
  // Both same-line and multiline display formulas, plus CRLF, render as KaTeX.
  for(const math of ['$$x^2+1$$','$$\n\\frac{a}{b}\n$$','$$\r\n\\begin{aligned}a&=b\\\\c&=d\\end{aligned}\r\n$$\r\n']){
   await load('before\n\n'+math+'\n\nafter');assert.equal(await page.locator('.prose .blockMath .katex-display').count(),1);assert.equal(await page.locator('.prose .inlineMath').count(),0)
  }
  await load('```latex\n$$not_math$$\n```\n\n`$$not_math$$`');assert.equal(await page.locator('.prose .blockMath').count(),0)
  await load('');await page.locator('.prose').click();await page.keyboard.type('$$x^2+1$$');assert.equal(await page.locator('.prose .blockMath .katex-display').count(),1);assert.equal(await page.locator('.prose .inlineMath').count(),0)
  await load('');await page.locator('.prose').click();await page.keyboard.type('$$');await page.keyboard.press('Enter');await page.keyboard.type('a+b');await page.keyboard.press('Enter');await page.keyboard.type('$$');assert.equal(await page.locator('.prose .blockMath').count(),1)
  await mode('源码');assert.match(await source.inputValue(),/\$\$\na\+b\n\$\$/)
  await load('');await page.locator('.prose').click();await page.keyboard.type('$x+1$');assert.equal(await page.locator('.prose .inlineMath').count(),1);await mode('源码');assert.equal((await source.inputValue()).trim(),'$x+1$')
  await load('');await page.locator('.prose').click();await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','before\n\n$$\n\\sqrt{x}\n$$\n\nafter');document.querySelector('.prose').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))});assert.equal(await page.locator('.prose .blockMath .katex-display').count(),1)
  // Cancellation through every exit leaves focus and scrolling at the formula.
  const long=fixture+'\n\n$$\nx+y\n$$\n\nlast paragraph'
  await load(long,long.indexOf('x+y'));assert.equal((await richCursor()).node,'blockMath')
  const open=()=>page.getByRole('button',{name:'插入公式 Ctrl+Shift+M'}).click()
  for(const exit of ['cancel','escape','close','backdrop']){
   await page.locator('.prose .blockMath').dblclick();await page.getByRole('textbox',{name:'LaTeX 源码'}).fill('changed');const top=await page.locator('.render-pane').evaluate(el=>el.scrollTop)
   if(exit==='cancel')await page.getByRole('button',{name:'取消',exact:true}).click()
   else if(exit==='escape')await page.keyboard.press('Escape')
   else if(exit==='close')await page.getByRole('button',{name:'关闭',exact:true}).click()
   else await page.locator('.modal-backdrop').click({position:{x:3,y:3}})
   await page.waitForTimeout(100);assert.ok(Math.abs(await page.locator('.render-pane').evaluate(el=>el.scrollTop)-top)<2);assert.equal((await richCursor()).node,'blockMath')
  }
  await mode('源码');assert.match(await source.inputValue(),/x\+y/);assert.doesNotMatch(await source.inputValue(),/changed/);const sourceAt=(await source.inputValue()).indexOf('唯一位置90')+3;await sourceCaret(sourceAt);await source.evaluate(el=>el.scrollTop=el.scrollHeight*.85);const top=await source.evaluate(el=>el.scrollTop);await open();await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForTimeout(100);assert.equal(await source.evaluate(el=>el.selectionStart),sourceAt);assert.ok(Math.abs(await source.evaluate(el=>el.scrollTop)-top)<2)
  await mode('源码');const splitRaw=long.replace('## 第 0 节','第 0 节\n=====');await source.fill(splitRaw);await sourceCaret(splitRaw.indexOf('唯一位置90')+3);await mode('分屏')
  await page.locator('.prose p').filter({hasText:'唯一位置90'}).click()
  // Native selectionchange may follow the click on hosted Windows desktops.
  // Snapshot the intended paragraph once ProseMirror has received that event.
  await expect.poll(async()=>(await richCursor()).text).toMatch(/唯一位置90/)
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const splitBefore=await richCursor();await open();await page.getByRole('button',{name:'取消',exact:true}).click();await page.waitForTimeout(100);assert.equal((await richCursor()).from,splitBefore.from);assert.equal((await richCursor()).text,splitBefore.text)
  assert.deepEqual(errors,[]);console.log('PASS: caret/selection/scroll mapping, shortcuts, repeated text, code positions, display math source/type/paste/CRLF, inline/code protection, formula cancel/Escape/close/backdrop and source restoration')
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(error=>{console.error(error);process.exitCode=1})
