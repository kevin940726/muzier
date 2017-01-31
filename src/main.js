import { app, BrowserWindow, ipcMain } from 'electron';
import Rx from 'rxjs/Rx';
import CREDENTIALS from './client_secret.json';

const Youtube = require('youtube-api');

Youtube.authenticate({
  type: 'key',
  key: CREDENTIALS.key,
});

const playListItemsList$ = Rx.Observable.bindNodeCallback(Youtube.playlistItems.list);
const videoList$ = Rx.Observable.bindNodeCallback(Youtube.videos.list);
const onPlaylist$ = Rx.Observable.fromEvent(ipcMain, 'playlistId', (event, arg) => ({ event, arg }))
  .mergeMap(({ arg }) => (
    playListItemsList$({
      part: 'snippet',
      maxResults: 50,
      playlistId: arg,
    }).map(res => res[0].items.map(v => v.snippet.resourceId.videoId))
    .mergeMap(ids => videoList$({ part: 'snippet', id: ids.join(',') }))
    .map(res => res[0].items)
  ), ({ event }, res) => ({ event, res }));

onPlaylist$.subscribe(({ event, res }) => {
  event.sender.send('playlistId', res);
});

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 375,
    height: 667,
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/index.html`);

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
