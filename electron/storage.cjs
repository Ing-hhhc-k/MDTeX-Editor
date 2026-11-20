const fs=require('node:fs'),path=require('node:path')
const {pathToFileURL}=require('node:url')
function remap(value,from,to){
 if(!from||path.resolve(from)===path.resolve(to))return value
 if(typeof value==='string'){
  const a=pathToFileURL(from+path.sep).href,b=pathToFileURL(to+path.sep).href
  return value.split(a).join(b).split(from+path.sep).join(to+path.sep)
 }
 if(Array.isArray(value))return value.map(v=>remap(v,from,to))
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v,from,to)]))
 return value
}
function configureStorage(app,fixture){
 const legacy=fixture?.legacy||app.getPath('userData'),exeDir=path.dirname(process.execPath)
 const root=fixture?.root|| (process.env.MDTEX_TEST?path.resolve('test-results',process.env.MDTEX_TEST_PROFILE||'user-data-'+process.pid):
  process.env.MDTEX_PORTABLE_ROOT?path.resolve(process.env.MDTEX_PORTABLE_ROOT):app.isPackaged?path.dirname(exeDir):path.resolve(__dirname,'..')
 )
 if(process.env.MDTEX_TEST&&!root.startsWith(path.resolve('test-results')+path.sep))throw Error('无效测试目录')
 const directory=process.env.MDTEX_TEST&&!fixture?root:path.join(root,'MDTeX-data')
 // Copy the old profile before Chromium opens it. Never remove the original.
 if(!fs.existsSync(directory)&&(!process.env.MDTEX_TEST||fixture)&&fs.existsSync(legacy)){
  const stage=directory+'.migration-'+process.pid
  fs.cpSync(legacy,stage,{recursive:true,filter:p=>!['Cache','Code Cache','GPUCache','Crashpad','SingletonLock','SingletonCookie','SingletonSocket'].includes(path.basename(p))})
  fs.writeFileSync(path.join(stage,'storage.json'),JSON.stringify({root:legacy,migratedFrom:legacy}))
  fs.renameSync(stage,directory)
 }
 fs.mkdirSync(directory,{recursive:true})
 app.setPath('userData',directory)
 function read(name,fallback){try{return JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'))}catch(e){if(e.code==='ENOENT')return fallback;throw Error('数据文件无法读取：'+name+'。请先备份 MDTeX-data，再检查文件。')}}
 function write(name,data){const target=path.join(directory,name),temp=target+'.tmp';fs.writeFileSync(temp,JSON.stringify(data));fs.renameSync(temp,target)}
 const metadata=read('storage.json',{root:directory}),previous=metadata.root
 const session=remap(read('session.json',null),previous,directory),preferences=read('preferences.json',{})
 write('storage.json',{...metadata,root:directory})
 if(session)write('session.json',session)
 const bootstrap={session,preferences,previous,directory,previousUrl:pathToFileURL(previous+path.sep).href,directoryUrl:pathToFileURL(directory+path.sep).href,migratedFrom:metadata.migratedFrom||null}
 function register({ipcMain,shell,getWindow}){
  const verify=e=>{if(e.sender!==getWindow()?.webContents)throw Error('无效来源')}
  ipcMain.on('storage:bootstrap',(e)=>{verify(e);e.returnValue=bootstrap})
  ipcMain.on('storage:session',(e,data)=>{try{verify(e);if(!Array.isArray(data?.docs)||!data.docs.length)throw Error('无效草稿列表');write('session.json',data);bootstrap.session=data;e.returnValue={ok:true}}catch(error){e.returnValue={error:error.message}}})
  ipcMain.handle('storage:preference',(e,{key,value})=>{verify(e);if(!['mdtex.theme','mdtex.view.v1','mdtex.autoUpdateCheck'].includes(key)||typeof value!=='string')throw Error('无效设置');preferences[key]=value;write('preferences.json',preferences)})
  ipcMain.handle('storage:open',async e=>{verify(e);const error=await shell.openPath(directory);if(error)throw Error(error)})
 }
 return {root,directory,register,bootstrap}
}
module.exports={configureStorage,remap}
