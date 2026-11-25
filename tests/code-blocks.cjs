const {_electron,expect}=require('@playwright/test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises')
;(async()=>{
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({executablePath:process.env.MDTEX_PACKAGED_TEST?path.resolve('MDTeX.exe'):undefined,args:process.env.MDTEX_PACKAGED_TEST?[]:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)});await page.waitForSelector('.prose')
  await app.evaluate(({BrowserWindow,clipboard,dialog})=>{
   const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();dialog.showMessageBoxSync=()=>1
   // Exercise native IPC without replacing the user's actual clipboard.
   global.__mdtexCopies=[];global.__mdtexCopyFails=false
   clipboard.writeText=text=>{if(global.__mdtexCopyFails)throw Error('Fixture clipboard failure');global.__mdtexCopies.push(text)}
  })
  const mode=async name=>{await page.getByRole('button',{name,exact:true}).click();await page.evaluate(()=>new Promise(requestAnimationFrame))},source=page.getByRole('textbox',{name:'Markdown 源码'}),blocks=page.locator('.code-wrapper')
  const load=async text=>{await mode('源码');await source.fill(text);await mode('编辑')}
  const numbers=block=>block.locator('.code-line-number').allTextContents().then(lines=>lines.join('\n')),lastCopy=()=>app.evaluate(()=>global.__mdtexCopies.at(-1))
  const copy=async(block,text)=>{await block.getByRole('button',{name:'复制代码',exact:true}).click();await block.getByRole('status').filter({hasText:'已复制'}).waitFor();assert.equal(await lastCopy(),text)}
  const aligned=async(block,text)=>{
   try{await expect.poll(()=>block.evaluate((el,text)=>{
    const e=document.querySelector('.prose').editor;let at
    e.state.doc.descendants((n,p)=>{if(n.type.name==='codeBlock'&&n.textContent===text)at=p})
    if(at===undefined)return false
    const nums=[...el.querySelectorAll('.code-line-number')],starts=[0,...Array.from(text.matchAll(/\r\n|\r|\n/g),m=>m.index+m[0].length)]
    if(nums.length!==starts.length)return false
    const top=nums[0].getBoundingClientRect().top,first=e.view.coordsAtPos(at+1).top,pre=el.querySelector('pre')
    return pre.scrollWidth<=pre.clientWidth+1&&starts.every((offset,i)=>Math.abs((nums[i].getBoundingClientRect().top-top)-(e.view.coordsAtPos(at+1+offset).top-first))<2)
   },text),{timeout:5000}).toBe(true)}catch(error){console.log(await block.evaluate((el,text)=>{const e=document.querySelector('.prose').editor;let at;e.state.doc.descendants((n,p)=>{if(n.type.name==='codeBlock')at={p,text:n.textContent}});const nums=[...el.querySelectorAll('.code-line-number')],pre=el.querySelector('pre');return {same:at.text===text,lengths:[at.text.length,text.length],begin:at.text.slice(0,80),end:at.text.slice(-80),pos:at.p,overflow:[pre.scrollWidth,pre.clientWidth],nums:nums.map(n=>({text:n.textContent,top:n.getBoundingClientRect().top,style:n.style.top})),coords:[0,...Array.from(text.matchAll(/\r\n|\r|\n/g),m=>m.index+m[0].length)].map(o=>e.view.coordsAtPos(at.p+1+o).top)}} ,text));await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/wrap-failure.png'});throw error}
  }
  const resizeColumn=width=>page.evaluate(width=>{
   const e=document.querySelector('.prose').editor,tr=e.state.tr
   // Real column dragging updates every row, keeping table column widths valid.
   e.state.doc.descendants((row,pos)=>{if(row.type.name!=='tableRow')return;tr.setNodeMarkup(pos+1,null,{...row.firstChild.attrs,colwidth:[width]});return false})
   e.view.dispatch(tr)
  },width)
  const text='const value = "中文";\n\n\tconsole.log(value);\n'
  await load('```javascript\n'+text+'\n```\n\n```python\nprint("second")\n```')
  assert.equal(await blocks.count(),2);assert.equal(await numbers(blocks.first()),'1\n2\n3\n4');assert.equal(await numbers(blocks.last()),'1')
  assert.match(await blocks.first().getByRole('button',{name:'折叠代码'}).innerText(),/4 行/)
  await copy(blocks.first(),text);await copy(blocks.last(),'print("second")')
  // A code-block Enter adds a numbered line; Backspace joins it again.
  await blocks.first().locator('pre code').evaluate(async el=>{const e=document.querySelector('.prose').editor;e.commands.focus(e.view.posAtDOM(el,0));await new Promise(requestAnimationFrame)})
  await page.keyboard.press('Enter');assert.equal(await numbers(blocks.first()),'1\n2\n3\n4\n5')
  await page.keyboard.press('Backspace');assert.equal(await numbers(blocks.first()),'1\n2\n3\n4')
  const before=await page.evaluate(()=>{const s=document.querySelector('.prose').editor.state.selection;return {from:s.from,to:s.to}})
  await copy(blocks.first(),text);assert.deepEqual(await page.evaluate(()=>{const s=document.querySelector('.prose').editor.state.selection;return {from:s.from,to:s.to}}),before)
  // Soft wraps add visual rows while keeping only actual newline numbers.
  const long='0123456789'.repeat(100)
  await load('```sql\n'+long+'\n\nSELECT 1;\n```')
  assert.equal(await numbers(blocks.first()),'1\n2\n3')
  await page.waitForFunction(()=>{const el=document.querySelector('.code-wrapper'),nums=el.querySelectorAll('.code-line-number');return nums[1].getBoundingClientRect().top-nums[0].getBoundingClientRect().top>50})
  const dimensions=await blocks.first().evaluate(el=>{const pre=el.querySelector('pre'),code=pre.querySelector('code'),gutter=el.querySelector('.code-line-numbers');return {overflow:pre.scrollWidth>pre.clientWidth+1,whiteSpace:getComputedStyle(code).whiteSpace,lineHeight:getComputedStyle(code).lineHeight,gutterLineHeight:getComputedStyle(gutter).lineHeight,top:Math.abs(code.getBoundingClientRect().top-(gutter.getBoundingClientRect().top+14*parseFloat(getComputedStyle(el.closest('.paper')).zoom||1)))}})
  await aligned(blocks.first(),long+'\n\nSELECT 1;')
  assert.equal(dimensions.overflow,false);assert.equal(dimensions.whiteSpace,'pre-wrap');assert.equal(dimensions.lineHeight,dimensions.gutterLineHeight);assert.ok(dimensions.top<1,JSON.stringify(dimensions))
  assert.equal(await numbers(blocks.first()),'1\n2\n3');await copy(blocks.first(),long+'\n\nSELECT 1;')
  // Language changes, folding and reading keep copy available and text intact.
  await blocks.first().getByRole('combobox',{name:'代码语言'}).selectOption('cpp');await blocks.first().getByRole('button',{name:'折叠代码'}).click();assert.equal(await blocks.first().locator('.code-body').isVisible(),false);await copy(blocks.first(),long+'\n\nSELECT 1;')
  await mode('阅读');assert.equal(await page.locator('.prose').getAttribute('contenteditable'),'false');await copy(blocks.first(),long+'\n\nSELECT 1;');assert.equal(await blocks.first().getByRole('combobox').isDisabled(),true)
  await blocks.first().getByRole('button',{name:'展开代码'}).click();assert.equal(await blocks.first().locator('.code-body').isVisible(),true)
  // The display gutter and button feedback never leak into Markdown.
  await mode('源码');assert.equal((await source.inputValue()).trimEnd(),'```cpp\n'+long+'\n\nSELECT 1;\n```');await mode('分屏');assert.equal(await numbers(blocks.first()),'1\n2\n3');await copy(blocks.first(),long+'\n\nSELECT 1;')
  // CRLF input, an empty block and a trailing blank line each keep correct counts.
  await load('```python\r\nfirst\r\n\r\nlast\r\n```');assert.equal(await numbers(blocks.first()),'1\n2\n3');await copy(blocks.first(),'first\n\nlast')
  await load('```\n\n```');assert.equal(await numbers(blocks.first()),'1');await copy(blocks.first(),'')
  await page.evaluate(()=>{const e=document.querySelector('.prose').editor;e.commands.setContent({type:'doc',content:[{type:'codeBlock',attrs:{language:'python'},content:[{type:'text',text:'a\n\n'}]}]})});assert.equal(await numbers(blocks.first()),'1\n2\n3');await copy(blocks.first(),'a\n\n');await aligned(blocks.first(),'a\n\n')
  await load('Example `<table>` text.\n\n```html\n<table>\n\n<tr><td>literal</td></tr>\n</table>\n```');assert.equal(await page.locator('.prose table').count(),0);await copy(blocks.first(),'<table>\n\n<tr><td>literal</td></tr>\n</table>')
  // Table cells wrap within their own width, including numbered headers.
  const tableText='const message = "'+('长字符串_abcdefgh'.repeat(40))+'";\n\nconsole.log(message);'
  for(const header of [false,true]){
   const cell=header?'th':'td'
   await load('<table><tr><'+cell+'><pre><code class="language-javascript">'+tableText+'</code></pre></'+cell+'><'+cell+'><p>other cell</p></'+cell+'></tr><tr><td><p>body</p></td><td><p>body</p></td></tr></table>')
   assert.equal(await blocks.count(),1);assert.equal(await numbers(blocks.first()),'1\n2\n3');await aligned(blocks.first(),tableText);await copy(blocks.first(),tableText)
   const height=()=>blocks.first().locator('pre').evaluate(el=>el.getBoundingClientRect().height)
   await page.locator('.prose table '+cell).first().click()
   await resizeColumn(480)
   await aligned(blocks.first(),tableText)
   const wideHeight=await height()
   await resizeColumn(230)
   await expect.poll(height).toBeGreaterThan(wideHeight);await aligned(blocks.first(),tableText)
   await resizeColumn(480)
   await aligned(blocks.first(),tableText);assert.equal(await numbers(blocks.first()),'1\n2\n3')
   await page.getByRole('button',{name:'放大页面',exact:true}).click();await aligned(blocks.first(),tableText)
   for(const view of ['阅读','分屏','编辑']){await mode(view);await aligned(blocks.first(),tableText);assert.equal(await numbers(blocks.first()),'1\n2\n3')}
   await mode('源码');const tableMarkdown=await source.inputValue();assert.match(tableMarkdown,/<pre><code class="language-javascript">/);await mode('编辑');assert.equal(await blocks.count(),1);assert.equal(await blocks.first().getByRole('combobox',{name:'代码语言'}).inputValue(),'javascript');await copy(blocks.first(),tableText);await aligned(blocks.first(),tableText)
   assert.equal(await page.locator('.prose table th').count(),header?2:0)
  }
  await page.getByRole('combobox',{name:'页面宽度'}).selectOption('compact');await aligned(blocks.first(),tableText)
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1060,850));await aligned(blocks.first(),tableText)
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/code-wrap-table.png'})
  await load('```python\na\n\n\n```')
  // Failure remains retryable and never reports success for a failed write.
  await app.evaluate(()=>{global.__mdtexCopyFails=true});await blocks.first().getByRole('button',{name:'复制代码'}).click();await blocks.first().getByRole('status').filter({hasText:'复制失败'}).waitFor()
  await app.evaluate(()=>{global.__mdtexCopyFails=false});await copy(blocks.first(),'a\n\n')
  const invalid=await page.evaluate(async()=>{try{await window.desktop.copyText({bad:true});return false}catch{return true}});assert.equal(invalid,true)
  // Check legibility and alignment in the dark theme at a different zoom.
  await load('```javascript\nconst answer = 42;\n\nconsole.log(answer);\n```');await page.getByRole('combobox',{name:'主题'}).selectOption('dark');await page.getByRole('button',{name:'放大页面',exact:true}).click();assert.equal(await numbers(blocks.first()),'1\n2\n3');await copy(blocks.first(),'const answer = 42;\n\nconsole.log(answer);')
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/code-blocks-dark.png'});assert.deepEqual(errors,[])
  console.log('PASS: newline/empty/trailing/CRLF numbering, live Enter/Backspace, soft wrapping without extra numbers, table/header/column/page/window/zoom reflow and alignment, exact native copy, independent blocks, read/fold/split, language change, Markdown round-trip, retry and dark theme')
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(error=>{console.error(error);process.exitCode=1})
