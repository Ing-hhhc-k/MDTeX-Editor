const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const {registerWorkspace} = require('./workspace.cjs')
let win
const authorizedPaths = new Set()
if (process.env.MDTEX_TEST) app.setPath('userData', path.join(process.cwd(), 'test-results/user-data-' + process.pid))
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  registerWorkspace({ipcMain,dialog,shell,getWindow:()=>win,authorizedPaths})
  win = new BrowserWindow({ width: 1380, height: 920, minWidth: 820, minHeight: 600, show: !process.env.MDTEX_TEST, backgroundColor: '#ffffff', title: 'MDTeX', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
  win.loadFile(path.join(__dirname, '../dist/index.html'))
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return {action:'deny'} })
  win.webContents.on('will-navigate', e => e.preventDefault())
  // Renderer beforeunload detects an unsaved file; allow cancelling window close.
  win.webContents.on('will-prevent-unload', event => {
    const answer = dialog.showMessageBoxSync(win, { type:'question', buttons:['继续编辑','退出'], defaultId:0, cancelId:0, title:'文档尚未保存到文件', message:'有尚未保存到 Markdown 文件的修改。', detail:'退出前请确认已保存所需内容。自动草稿仅保存在当前电脑。' })
    if (answer === 1) event.preventDefault()
  })
  ipcMain.handle('file:open', async event => {
    if (event.sender !== win.webContents) throw new Error('无效的请求来源')
    const result = await dialog.showOpenDialog(win, { properties:['openFile'], filters:[{name:'Markdown 文档', extensions:['md','markdown','txt']}] })
    if (result.canceled) return null
    const file = result.filePaths[0]
    const info = await fs.stat(file)
    if (info.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB')
    const text = await fs.readFile(file, 'utf8'); authorizedPaths.add(file)
    return {path:file, name:path.basename(file), text}
  })
  ipcMain.handle('file:save', async (event, data) => {
    if (event.sender !== win.webContents || typeof data?.text !== 'string') throw new Error('无效的保存请求')
    let target = authorizedPaths.has(data.path) ? data.path : null
    if (!target) {
      const result = await dialog.showSaveDialog(win, { defaultPath:path.basename(data.name || '未命名文档.md'), filters:[{name:'Markdown 文档',extensions:['md']}] })
      if (result.canceled) return null
      target = result.filePath
    }
    // Atomic replacement keeps the previous file intact if writing fails.
    const temp = target + '.mdtex-' + Date.now() + '.tmp'
    try { await fs.writeFile(temp, data.text, 'utf8'); await fs.rename(temp, target) }
    catch(error) { await fs.unlink(temp).catch(()=>{}); throw error }
    authorizedPaths.add(target)
    return {path:target, name:path.basename(target)}
  })
})
app.on('window-all-closed', () => app.quit())
