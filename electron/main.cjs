const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const {registerWorkspace} = require('./workspace.cjs')
const {createDocuments} = require('./documents.cjs')
let win
const authorizedPaths = new Set()
if (process.env.MDTEX_TEST) app.setPath('userData', path.join(process.cwd(), 'test-results/user-data-' + process.pid))
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  const documents=await createDocuments({app,ipcMain,dialog,getWindow:()=>win,authorizedPaths})
  registerWorkspace({ipcMain,dialog,shell,getWindow:()=>win,authorizedPaths,documents})
  win = new BrowserWindow({ width: 1380, height: 920, minWidth: 820, minHeight: 600, show: !process.env.MDTEX_TEST, backgroundColor: '#ffffff', title: 'MDTeX', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return {action:'deny'} })
  win.webContents.on('will-navigate', e => e.preventDefault())
  // Renderer beforeunload detects an unsaved file; allow cancelling window close.
  win.webContents.on('will-prevent-unload', event => {
    const answer = dialog.showMessageBoxSync(win, { type:'question', buttons:['继续编辑','退出'], defaultId:0, cancelId:0, title:'文档尚未保存到文件', message:'有尚未保存到 Markdown 文件的修改。', detail:'退出前请确认已保存所需内容。自动草稿仅保存在当前电脑。' })
    if (answer === 1) event.preventDefault()
  })
})
app.on('window-all-closed', () => app.quit())
