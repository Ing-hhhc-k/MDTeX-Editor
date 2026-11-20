const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme, net } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const {registerWorkspace} = require('./workspace.cjs')
const {createDocuments} = require('./documents.cjs')
const {registerUpdates}=require('./updates.cjs')
const {configureStorage}=require('./storage.cjs')
let win
let updating=false
const authorizedPaths = new Set()
let storage
try{
  let fixture
  if(process.env.MDTEX_TEST&&process.env.MDTEX_TEST_INSTALL_ROOT){const root=path.resolve(process.env.MDTEX_TEST_INSTALL_ROOT);if(!root.startsWith(path.resolve('test-results')+path.sep))throw Error('无效测试安装目录');fixture={root,legacy:path.join(root,'empty-legacy')}}
  storage=configureStorage(app,fixture)
}catch(error){dialog.showErrorBox('无法打开 MDTeX 数据目录',error.message+'\n请关闭旧版后重试，并确认程序文件夹可以写入。');app.exit(1)}
if(!app.requestSingleInstanceLock())app.exit(0)
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus()}})
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  storage.register({ipcMain,shell,getWindow:()=>win})
  ipcMain.handle('app:ready',async event=>{
    if(event.sender!==win.webContents)throw Error('无效来源')
    const token=process.argv.find(a=>a.startsWith('--mdtex-update-token='))?.split('=')[1]
    if(/^[a-f0-9-]{36}$/.test(token||''))await fs.writeFile(path.join(storage.directory,'updates',token,'booted'),app.getVersion())
  })
  registerUpdates({app,ipcMain,net,shell,getWindow:()=>win,storage,beforeQuit:()=>{updating=true}})
  ipcMain.handle('app:theme',(event,theme)=>{if(event.sender!==win.webContents||!['system','light','dark'].includes(theme))throw new Error('无效主题');nativeTheme.themeSource=theme;win.setBackgroundColor(nativeTheme.shouldUseDarkColors?'#262626':'#fff');return true})
  const documents=await createDocuments({app,ipcMain,dialog,shell,getWindow:()=>win,authorizedPaths})
  registerWorkspace({ipcMain,dialog,shell,getWindow:()=>win,authorizedPaths,documents})
  win = new BrowserWindow({ width: 1380, height: 920, minWidth: 820, minHeight: 600, show: false, backgroundColor: '#ffffff', title: 'MDTeX', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  win.once('ready-to-show',()=>{
    const result=process.argv.find(a=>a.startsWith('--mdtex-update-result='))?.split('=')[1]
    if(/^[a-f0-9-]{36}$/.test(result||''))fs.readFile(path.join(storage.directory,'updates',result,'status.json'),'utf8').then(text=>dialog.showErrorBox('更新未完成',JSON.parse(text.replace(/^\uFEFF/,'')).message)).catch(()=>{})
    if(!process.env.MDTEX_TEST)win.show()
  })
  win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return {action:'deny'} })
  win.webContents.on('will-navigate', e => e.preventDefault())
  // Renderer beforeunload detects an unsaved file; allow cancelling window close.
  win.webContents.on('will-prevent-unload', event => {
    if(updating){event.preventDefault();return}
    const answer = dialog.showMessageBoxSync(win, { type:'question', buttons:['继续编辑','退出'], defaultId:0, cancelId:0, title:'文档尚未保存到文件', message:'有尚未保存到 Markdown 文件的修改。', detail:'退出前请确认已保存所需内容。自动草稿仅保存在当前电脑。' })
    if (answer === 1) event.preventDefault()
  })
}).catch(error=>{dialog.showErrorBox('MDTeX 启动失败',error.message);app.exit(1)})
app.on('window-all-closed', () => app.quit())
