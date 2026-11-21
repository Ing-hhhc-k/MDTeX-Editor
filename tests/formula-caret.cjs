const {_electron}=require('@playwright/test'),assert=require('node:assert/strict')
;(async()=>{
 const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
 const app=await _electron.launch({executablePath:process.env.MDTEX_PACKAGED_TEST?require('node:path').resolve('MDTeX.exe'):undefined,args:process.env.MDTEX_PACKAGED_TEST?[]:['.'],env,timeout:60000})
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.prose');await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus()})
  const open=()=>page.getByRole('button',{name:'插入公式 Ctrl+Shift+M'}).click(),latex=page.getByRole('textbox',{name:'LaTeX 源码'}),pick=name=>page.getByRole('button',{name,exact:true}).click()
  await open();await pick('根式');assert.equal(await latex.inputValue(),'\\sqrt{x}')
  await pick('分式');assert.equal(await latex.inputValue(),'\\frac{a}{b}')
  const caret=async(start,end=start)=>{await latex.focus();await latex.evaluate((el,{start,end})=>{el.setSelectionRange(start,end);el.dispatchEvent(new Event('select',{bubbles:true}))},{start,end})}
  await caret(6,7);await pick('根式');assert.equal(await latex.inputValue(),'\\frac{\\sqrt{x}}{b}')
  assert.equal(await latex.evaluate(el=>el.selectionStart),14)
  await latex.fill('left+right');await caret(5);await pick('分式');assert.equal(await latex.inputValue(),'left+\\frac{a}{b}right')
  await pick('上标');assert.equal(await latex.inputValue(),'left+\\frac{a}{b}x^{n}right')
  await latex.fill('a+b');await caret(0);await pick('根式');assert.equal(await latex.inputValue(),'\\sqrt{x}a+b')
  await latex.fill('a+b');await caret(2,3);await pick('微积分');await pick('定积分');assert.equal(await latex.inputValue(),'a+\\int_{a}^{b} f(x)\\,dx')
  await pick('希腊字母');await pick('alpha');assert.match(await latex.inputValue(),/dx\\alpha $/)
  await pick('取消');await open();await pick('常用');await pick('求和');assert.equal(await latex.inputValue(),'\\sum_{i=1}^{n} x_i')
  await pick('取消');await page.getByRole('button',{name:'源码',exact:true}).click();await page.getByRole('textbox',{name:'Markdown 源码'}).fill('# 公式编辑\n\n$$\na+b\n$$');await page.getByRole('button',{name:'编辑',exact:true}).click()
  await page.locator('.prose .blockMath').dblclick();await pick('分式');assert.equal(await latex.inputValue(),'\\frac{a}{b}');await caret(6,7);await pick('根式');await pick('更新公式')
  await page.getByRole('button',{name:'源码',exact:true}).click();assert.match(await page.getByRole('textbox',{name:'Markdown 源码'}).inputValue(),/\\frac\{\\sqrt\{x\}\}\{b\}/)
  assert.deepEqual(errors,[]);console.log('PASS: template fallback, nested insertion, selected text replacement, start/middle cursor, consecutive templates, category/symbol continuity, reset and existing formula update')
 }finally{await app.evaluate(({BrowserWindow,app})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();app.quit()}).catch(()=>{});await app.close().catch(()=>{})}
})().catch(error=>{console.error(error);process.exitCode=1})
