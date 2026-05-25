declare global {
  interface Window {
    electron: {
      openExternal: (url: string) => Promise<void>
      minimize: () => Promise<void>
      close: () => Promise<void>
    }
  }
}

export {}
