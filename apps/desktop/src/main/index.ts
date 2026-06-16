import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'

let widgetWindow: BrowserWindow | null = null

function createWindow(): void {
  const win = new BrowserWindow({
    width: 420,
    height: 860,
    resizable: false,
    frame: false,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createWidgetWindow(): void {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.focus()
    return
  }

  widgetWindow = new BrowserWindow({
    width: 340,
    height: 220,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    widgetWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?mode=widget`)
  } else {
    widgetWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { mode: 'widget' },
    })
  }

  widgetWindow.on('closed', () => {
    widgetWindow = null
  })
}

app.whenReady().then(() => {
  ipcMain.handle('open-external', (_event, url: string) => {
    return shell.openExternal(url)
  })

  ipcMain.handle('window-minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize()
  })

  ipcMain.handle('window-close', () => {
    BrowserWindow.getFocusedWindow()?.close()
  })

  ipcMain.handle('open-widget', () => {
    createWidgetWindow()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
