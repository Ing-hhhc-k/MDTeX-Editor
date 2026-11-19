const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktop', {
  open: () => ipcRenderer.invoke('file:open'),
  save: data => ipcRenderer.invoke('file:save', data),
  workspace: Object.fromEntries(['open','list','read','create','rename','delete'].map(name=>[name,(...args)=>ipcRenderer.invoke('workspace:'+name,...args)])),
})
