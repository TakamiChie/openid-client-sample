// Modules to control application life and create native browser window
const {app, BrowserWindow, shell, ipcMain} = require('electron')
const path = require('path')
const { Issuer, generators } = require("openid-client");
const dotenv = require("dotenv");
const express = require("express");

dotenv.config();
let server;
let mainWindow;
let authenticateData;

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

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
  if(server) await shutdown();
  const issuer = await Issuer.discover(`${process.env.ISSUER_BASE_URL}`);
  console.log("====DISCOVER====");
  console.log("----ISSUER----");
  console.log(issuer.issuer)
  console.log("----METADATA----");
  console.log(issuer.metadata);
  mainWindow.webContents.send("log", "DISCOVER", "debug");
  mainWindow.webContents.send("log", issuer.issuer, "info");
  const client = new issuer.Client({
    client_id: process.env.CLIENT_ID,    
    client_secret: process.env.CLIENT_SECRET,
    redirect_uris: [`${process.env.BASE_URL}callback`],
    response_types: ["code"],
  });
  const state = generators.state();
  const nonce = generators.nonce();
  const code_verifier = generators.codeVerifier();
  const code_challenge = generators.codeChallenge(code_verifier);
  mainWindow.webContents.send("log", `state:${state}`, "debug");
  mainWindow.webContents.send("log", `nonce:${nonce}`, "debug");
  mainWindow.webContents.send("log", `verifier:${code_verifier}`, "debug");
  mainWindow.webContents.send("log", `challenge:${code_challenge}`, "debug");
  const authorizationUrl = client.authorizationUrl({
    scope: "openid email profile",
    state: state,
    nonce: nonce,
    response_type: "code",
    code_challenge: code_challenge,
    code_challenge_method: "S256",
  });
  mainWindow.webContents.send("log", `Access To:${authorizationUrl}`, "debug");
  const exp = express();
  exp.get('/callback', async(req, res) => {
    mainWindow.webContents.send("log", `Callback Returned!`, "info");
    const params = client.callbackParams(req);
    const tokenSet = await client.callback(`${process.env.BASE_URL}callback`, params, { code_verifier, state, nonce,  });
    console.log('received and validated tokens %j', tokenSet);
    console.log('validated ID Token claims %j', tokenSet.claims());
    const userInfo = await client.userinfo(tokenSet.access_token);
    console.log('userInfo %j', userInfo);
    res.send("Certification is completed.Close the tab.");
    await shutdown();
    console.log("Server stopped");
    authenticateData = {
      "userInfo": userInfo,
      "tokenSet": tokenSet,
    }
    mainWindow.webContents.send("authenticated", authenticateData);
  });
  console.log(await startServer(exp, process.env.PORT));
  shell.openExternal(authorizationUrl);
})

ipcMain.handle("refresh", async () => {
  if(!authenticateData) mainWindow.webContents.send("log", "I haven't authenticated yet.", "error");
  if(server) await shutdown();
  const issuer = await Issuer.discover(`${process.env.ISSUER_BASE_URL}`);
  console.log("====DISCOVER====");
  console.log("----ISSUER----");
  console.log(issuer.issuer)
  console.log("----METADATA----");
  console.log(issuer.metadata);
  mainWindow.webContents.send("log", "DISCOVER", "debug");
  mainWindow.webContents.send("log", issuer.issuer, "info");
  const client = new issuer.Client({
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    redirect_uris: [`${process.env.BASE_URL}callback`],
    response_types: ["code"],
  });
  authenticateData.tokenSet = await client.refresh(authenticateData.tokenSet);
  mainWindow.webContents.send("authenticated", authenticateData);

});

async function startServer(expressApp, port){
  server = expressApp.listen(port, async() => {
    console.log("Start Listen!");
    mainWindow.webContents.send("log", "Server Start.", "info");
    return server;
  });
}
async function shutdown(){
  server.close(() => {
    mainWindow.webContents.send("log", "Server Shutdown.", "info");
    return true;
  });
}
