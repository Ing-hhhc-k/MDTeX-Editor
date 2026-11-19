const {_electron}=require('@playwright/test')
const path=require('node:path')
;(async()=>{
  const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
  const app=await _electron.launch({executablePath:path.resolve('release/MDTeX/MDTeX.exe'),env,timeout:60000})
  try{
    const page=await app.firstWindow()
    await page.waitForSelector('.prose h1')
    console.log('PASS: packaged Windows executable loaded document and bundled assets')
  }finally{
    await app.evaluate(({BrowserWindow,app})=>{for(const win of BrowserWindow.getAllWindows())win.destroy();app.quit()}).catch(()=>{})
    await app.close().catch(()=>{})
  }
})().catch(e=>{console.error(e);process.exitCode=1})
