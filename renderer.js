// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

document.getElementById("authenticate").addEventListener("click", async () => {
  window.requires.authenticate();
});

document.getElementById("refresh").addEventListener("click", () => {
  window.requires.refresh();
});

document.getElementById("clear").addEventListener("click", () => {
  const log = document.getElementById("log");
  while(log.childNodes[0]) log.removeChild(log.childNodes[0]);
});

document.getElementById("saveToFile").addEventListener("click", () => {
  window.requires.savetofile();
});

document.getElementById("loadFromFile").addEventListener("click", () => {
  window.requires.loadfromfile();
});

window.requires.on("log", (text, level) => {
  printLog(text, level);
});

window.requires.on("authenticated", (data) => {
  console.log(data);
  printLog(`Hello:${data.userInfo.preferred_username || data.userInfo.name}`, "info");
  printLog(`Get Access Token:${data.tokenSet.access_token.slice(0, 8)}...`, "info");
});

function printLog(text, level) {
  const log = document.getElementById("log");
  const msg = document.createElement("p");
  msg.textContent = text;
  msg.classList.value = `${level}`;
  log.appendChild(msg);
  msg.scrollIntoView();
}