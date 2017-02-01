import { ipcMain } from 'electron';
import Rx from 'rxjs/Rx';
import youtubedl from 'youtube-dl';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
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

const downloadPlaylist$ = Rx.Observable.fromEvent(ipcMain, 'downloadPlaylist', (event, arg) => arg)
  .map(playlist => playlist.map(id => youtubedl(
    `http://www.youtube.com/watch?v=${id}`,
    ['-o', '%(title)s.%(ext)s'],
  )))
  .mergeMap(videos => Rx.Observable.zip(
    ...videos.map(video => Rx.Observable.fromEvent(video, 'info', info => ({ video, info }))),
  ))
  .share();

const onVideoData$ = downloadPlaylist$
  .mergeMap(videos => Rx.Observable.from(
    videos.map(({ video }) => Rx.Observable.fromEvent(video, 'data')),
  ))
  .mergeAll();

const onPlaylistSize$ = downloadPlaylist$
  .map(videos => (
    videos.map(({ info }) => info.size)
      .reduce((sum, cur) => sum + cur, 0)
  ));

const onPlaylistEnd$ = downloadPlaylist$
  .mergeMap(videos => Rx.Observable.zip(
    ...videos.map(({ video, info }) => {
      const stream = fs.createWriteStream(path.join(
        '/Users/Kai/Downloads/yt',
        `${info.title}.mp3`,
      ));

      const converter = ffmpeg(video)
        .format('mp3')
        .audioQuality(0)
        .output(stream);

      const observable = Rx.Observable.fromEvent(converter, 'end');

      converter.run();

      return observable;
    }),
  ));

export default (mainWindow) => {
  onVideoData$.subscribe((chunk) => {
    mainWindow.webContents.send('downloadProgress', chunk.length);
  });

  onPlaylistSize$.subscribe((size) => {
    mainWindow.webContents.send('playlistSize', size);
  });

  onPlaylistEnd$.subscribe(() => {
    mainWindow.webContents.send('playlistEnd');
  });
};
