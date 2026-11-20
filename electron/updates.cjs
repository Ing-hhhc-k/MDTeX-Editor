const REPO='Ing-hhhc-k/MDTeX-Editor'
function compareVersions(a,b){const parse=v=>{if(!/^v?\d+\.\d+\.\d+$/.test(v))throw new Error('不支持的版本号');return v.replace(/^v/,'').split('.').map(Number)};const x=parse(a),y=parse(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]?1:-1}return 0}
function parseRelease(release,currentVersion){
 const latestVersion=String(release.tag_name||'').replace(/^v/,'')
 compareVersions(latestVersion,currentVersion)
 if(release.draft||release.prerelease)throw new Error('该发布版本不是正式版')
 const downloadUrl=`https://github.com/${REPO}/releases/download/v${latestVersion}/MDTeX-Editor-${latestVersion}-win-x64.zip`
 if(!release.assets?.some(a=>a.browser_download_url===downloadUrl&&a.state==='uploaded'))throw new Error('新版 Windows 安装包尚未发布完成，请稍后重试')
 return {currentVersion,latestVersion,available:compareVersions(latestVersion,currentVersion)>0,downloadUrl,releaseUrl:`https://github.com/${REPO}/releases/tag/v${latestVersion}`,notes:String(release.body||'').slice(0,8000)}
}
function registerUpdates({app,ipcMain,net,shell,getWindow}){
 let cached=null,lastCheck=0,pending=null
 const verify=event=>{if(event.sender!==getWindow().webContents)throw new Error('无效来源')}
 ipcMain.handle('app:check-update',async(event,options={})=>{
  verify(event)
  if(cached&&!options.force&&Date.now()-lastCheck<15*60*1000)return cached
  if(pending)return pending
  pending=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000)
   try{const response=await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`,{signal:controller.signal,headers:{Accept:'application/vnd.github+json','User-Agent':'MDTeX-Editor'}});if(!response.ok)throw new Error(response.status===403?'GitHub 请求暂时受限，请稍后重试':'无法获取更新（HTTP '+response.status+'）');cached=parseRelease(await response.json(),app.getVersion());lastCheck=Date.now();return cached}
   catch(error){throw new Error(error.name==='AbortError'?'检查更新超时，请检查网络后重试':error.message)}finally{clearTimeout(timer);pending=null}
  })();return pending
 })
 ipcMain.handle('app:download-update',async event=>{verify(event);if(!cached?.available)throw new Error('请先检查并确认新版本');await shell.openExternal(cached.downloadUrl);return true})
}
module.exports={compareVersions,parseRelease,registerUpdates}
