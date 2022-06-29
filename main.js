// Modules to control application life and create native browser window
const {app, BrowserWindow, shell, ipcMain} = require('electron')
const path = require('path')
const dotenv = require("dotenv");
const OIDC = require('./oidc');

dotenv.config();
let mainWindow;
let authenticateData;
let oidc;

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.on("ready-to-show", () => {
    oidc = new OIDC(process.env.CLIENT_ID, parseInt(process.env.PORT), process.env.ISSUER_BASE_URL);
    oidc.codeAuth(process.env.CLIENT_SECRET);
  });

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

ipcMain.handle("authenticate", async () => {
  await oidc.doAuthenticate(onAuthenticate);
  shell.openExternal(oidc.authorization_url);
})

ipcMain.handle("refresh", async () => {
  oidc.refresh(onAuthenticate);
});

ipcMain.handle("savetofile", async() => {
  await oidc.saveToFile("sessiondata.json");
  mainWindow.webContents.send("log", "Save complete at 'sessiondata.json'", "info");
});

ipcMain.handle("loadfromfile", async() => {
  let text = "";
  let level = "";
  if(await oidc.loadFromFile("sessiondata.json")){
    text = "Load complete at 'sessiondata.json'";
    level = "info";
  }else{
    text = "The load failed because the version is different or the file does not exist.";
    level = "error";
  }
  mainWindow.webContents.send("log", text, level);
});

function onAuthenticate(userinfo, idtoken) {
  mainWindow.webContents.send("authenticated", {
    tokenSet: idtoken,
    userInfo: userinfo
  });
}