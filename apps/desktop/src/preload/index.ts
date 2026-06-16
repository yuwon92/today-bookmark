import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  close: () => ipcRenderer.invoke('window-close'),
  openWidget: () => ipcRenderer.invoke('open-widget'),
})
