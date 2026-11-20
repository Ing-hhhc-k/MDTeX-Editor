const REPO='Ing-hhhc-k/MDTeX-Editor'
const path=require('node:path'),fs=require('node:fs/promises')
const {prepareInstall,launchInstall}=require('./installer.cjs')
function compareVersions(a,b){const parse=v=>{if(!/^v?\d+\.\d+\.\d+$/.test(v))throw new Error('不支持的版本号');return v.replace(/^v/,'').split('.').map(Number)};const x=parse(a),y=parse(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1}return 0}
function parseRelease(release,currentVersion){
 const latestVersion=String(release.tag_name||'').replace(/^v/,'')
 compareVersions(latestVersion,currentVersion)
 if(release.draft||release.prerelease)throw new Error('该发布版本不是正式版')
 const downloadUrl=`https://github.com/${REPO}/releases/download/v${latestVersion}/MDTeX-Editor-${latestVersion}-win-x64.zip`
 const asset=release.assets?.find(a=>a.browser_download_url===downloadUrl&&a.state==='uploaded')
 if(!asset)throw new Error('新版 Windows 安装包尚未发布完成，请稍后重试')
 return {currentVersion,latestVersion,available:compareVersions(latestVersion,currentVersion)>0,downloadUrl,digest:/^sha256:[a-f0-9]{64}$/i.test(asset.digest||'')?asset.digest.toLowerCase():null,size:asset.size,releaseUrl:`https://github.com/${REPO}/releases/tag/v${latestVersion}`,notes:String(release.body||'').slice(0,8000)}
}
function registerUpdates({app,ipcMain,net,shell,getWindow,storage,beforeQuit}){
 let cached=null,lastCheck=0,pending=null,installing=false
 const canInstall=!!(app.isPackaged&&storage&&path.resolve(path.dirname(process.execPath))===path.join(storage.root,'_internal'))
 const verify=event=>{if(event.sender!==getWindow().webContents)throw new Error('无效来源')}
 ipcMain.handle('app:check-update',async(event,options={})=>{
  verify(event)
  if(cached&&!options.force&&Date.now()-lastCheck<15*60*1000)return cached
  if(pending)return pending
  pending=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000)
   try{const response=await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`,{signal:controller.signal,headers:{Accept:'application/vnd.github+json','User-Agent':'MDTeX-Editor'}});if(!response.ok)throw new Error(response.status===403?'GitHub 请求暂时受限，请稍后重试':'无法获取更新（HTTP '+response.status+'）');cached={...parseRelease(await response.json(),app.getVersion()),canInstall};lastCheck=Date.now();return cached}
   catch(error){throw new Error(error.name==='AbortError'?'检查更新超时，请检查网络后重试':error.message)}finally{clearTimeout(timer);pending=null}
  })();return pending
 })
 ipcMain.handle('app:download-update',async event=>{verify(event);if(!cached?.available)throw new Error('请先检查并确认新版本');await shell.openExternal(cached.downloadUrl);return true})
 ipcMain.handle('app:install-update',async event=>{
  verify(event);if(!cached?.available)throw Error('请先检查并确认新版本');if(!canInstall)throw Error('请从完整解压的免安装版启动后使用一键更新');if(installing)throw Error('正在更新，请稍候')
  installing=true
  try{
   if((await fs.lstat(path.join(storage.root,'_internal'))).isSymbolicLink())throw Error('不支持链接形式的程序目录，请手动更新')
   const prepared=await prepareInstall({net,release:cached,storage,onProgress:value=>{if(!getWindow().isDestroyed())getWindow().webContents.send('app:update-progress',value)}})
   await launchInstall(prepared);beforeQuit();setTimeout(()=>app.quit(),300);return {restarting:true}
  }catch(error){installing=false;throw Error(error.name==='AbortError'?'下载超时，请稍后重试':error.message)}
 })
}
module.exports={compareVersions,parseRelease,registerUpdates}
