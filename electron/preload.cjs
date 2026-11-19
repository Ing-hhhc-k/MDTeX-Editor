const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktop', {
  open: () => ipcRenderer.invoke('file:open'),
  save: data => ipcRenderer.invoke('file:save', data),
  draftSync: data => ipcRenderer.invoke('draft:sync', data),
  detachDraft: data => ipcRenderer.invoke('draft:detach', data),
  importImage: data => ipcRenderer.invoke('image:import', data),
  previewImage: data => ipcRenderer.invoke('image:preview', data),
  exportZip: data => ipcRenderer.invoke('file:export', data),
  workspace: Object.fromEntries(['open','list','read','create','rename','delete'].map(name=>[name,(...args)=>ipcRenderer.invoke('workspace:'+name,...args)])),
})
