const { contextBridge, ipcRenderer} = require("electron");

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
})

contextBridge.exposeInMainWorld(
  "requires", {
    authenticate: async() => { return await ipcRenderer.invoke("authenticate"); },
    refresh: async() => { return await ipcRenderer.invoke("refresh"); },
    on: (channel, func) => { ipcRenderer.on(channel, (event, ...args) => func(...args)) }
  }
);