const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto')
const {spawn}=require('node:child_process'),{unzipSync}=require('fflate')
const managed=['_internal','MDTeX.exe','使用说明.md','CHANGELOG.md','ROADMAP.md']
function validateArchive(bytes,digest,version){
 if(!/^sha256:[a-f0-9]{64}$/i.test(digest||'')||'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex')!==digest.toLowerCase())throw Error('下载文件校验失败，请重试或手动下载')
 let total=0,count=0
 const entries=unzipSync(bytes,{filter:file=>{
  const name=file.name,parts=name.split('/')
  if(++count>20000||/[\\:\x00-\x1f]/.test(name)||parts.some(p=>p==='.'||p==='..')||!managed.includes(parts[0])||(!name.startsWith('_internal/')&&parts.length!==1))throw Error('更新包包含不安全的文件路径')
  total+=file.originalSize;if(total>1200*1024*1024)throw Error('更新包解压后过大')
  return !name.endsWith('/')
 }})
 for(const name of ['MDTeX.exe','_internal/MDTeX.exe'])if(Buffer.from(entries[name]||[]).subarray(0,2).toString()!=='MZ')throw Error('更新包缺少 Windows 程序')
 const pkg=JSON.parse(Buffer.from(entries['_internal/resources/app/package.json']||[]).toString())
 if(pkg.name!=='mdtex-editor'||pkg.version!==version)throw Error('更新包版本不匹配')
 for(const name of managed.filter(n=>n!=='_internal'))if(!entries[name])throw Error('更新包缺少 '+name)
 return entries
}
async function prepareInstall({net,release,storage,onProgress}){
 if(!release.digest)throw Error('该版本没有完整性校验信息，请手动下载')
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10*60*1000)
 let bytes
 try{
  const response=await net.fetch(release.downloadUrl,{signal:controller.signal});if(!response.ok)throw Error('下载失败（HTTP '+response.status+'）')
  const chunks=[];let size=0;const total=Number(response.headers.get('content-length'))||release.size||0
  for await(const chunk of response.body){size+=chunk.length;if(size>500*1024*1024)throw Error('更新包过大');chunks.push(Buffer.from(chunk));onProgress({phase:'下载新版',received:size,total})}
  bytes=Buffer.concat(chunks)
 }finally{clearTimeout(timer)}
 onProgress({phase:'校验和准备更新'})
 const entries=validateArchive(bytes,release.digest,release.latestVersion)
 const token=crypto.randomUUID(),work=path.join(storage.directory,'updates',token),stage=path.join(work,'stage')
 await fs.mkdir(stage,{recursive:true})
 for(const [name,data] of Object.entries(entries)){const target=path.join(stage,...name.split('/'));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data)}
 const plan={root:storage.root,work,stage,backup:path.join(work,'backup'),parentPid:process.pid,version:release.latestVersion,token,restart:true}
 const planFile=path.join(work,'plan.json');await fs.writeFile(planFile,JSON.stringify(plan))
 const helper=path.join(work,'apply.ps1');await fs.copyFile(path.join(__dirname,'update-helper.ps1'),helper)
 const runner=path.join(work,'update-runner.exe');await fs.copyFile(path.join(storage.root,'MDTeX.exe'),runner)
 return {work,planFile,helper,runner,token}
}
async function launchInstall(prepared){
 const log=await fs.open(path.join(prepared.work,'helper.log'),'a')
 let child
 try{child=spawn(prepared.runner,['--apply-update',prepared.planFile],{windowsHide:true,detached:true,stdio:['ignore',log.fd,log.fd]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});child.unref()}finally{await log.close()}
 // The helper acknowledges before the app exits. Policy/launch errors leave the app open.
 for(let i=0;i<300;i++){try{await fs.access(path.join(prepared.work,'helper-ready'));return}catch{};if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,100))}
 const detail=await fs.readFile(path.join(prepared.work,'helper.log'),'utf8').catch(()=>'')
 throw Error('无法启动更新程序，请使用“下载 ZIP”手动更新。（退出码 '+child.exitCode+'，信号 '+child.signalCode+'）'+detail.slice(-500))
}
module.exports={validateArchive,prepareInstall,launchInstall,managed}
