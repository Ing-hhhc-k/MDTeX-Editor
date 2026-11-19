const {_electron}=require('@playwright/test')
const path=require('node:path')
const fs=require('node:fs/promises')
const assert=require('node:assert/strict')
const {unzipSync}=require('fflate')
;(async()=>{
  const env={...process.env,MDTEX_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE
  const app=await _electron.launch({executablePath:path.resolve('release/MDTeX/MDTeX.exe'),env,timeout:60000})
  try{
    const page=await app.firstWindow()
    await page.waitForSelector('.prose h1')
    const dest=path.resolve('test-results/packaged-'+Date.now());await fs.mkdir(dest,{recursive:true})
    const id='packaged-'+Date.now(),data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6v1sAAAAASUVORK5CYII='
    const image=await page.evaluate(async({id,data})=>{await window.desktop.draftSync({id,text:'# 打包测试'});return window.desktop.importImage({id,data})},{id,data})
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},path.join(dest,'bundle.md'))
    const result=await page.evaluate(({id,src})=>window.desktop.save({id,text:'# 打包测试\n\n![图]('+src+')',name:'bundle.md',origin:'draft'}),{id,src:image.src})
    assert.match(await fs.readFile(result.path,'utf8'),/picture\//)
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},path.join(dest,'bundle.zip'))
    await page.evaluate(({id,result})=>window.desktop.exportZip({id,path:result.path,text:result.text,name:'bundle.md'}),{id,result})
    assert.equal(Object.keys(unzipSync(await fs.readFile(path.join(dest,'bundle.zip')))).length,2)
    console.log('PASS: packaged executable loaded UI, staged/imported images, saved Markdown folder and exported ZIP using bundled dependencies')
  }finally{
    await app.evaluate(({BrowserWindow,app})=>{for(const win of BrowserWindow.getAllWindows())win.destroy();app.quit()}).catch(()=>{})
    await app.close().catch(()=>{})
  }
})().catch(e=>{console.error(e);process.exitCode=1})
