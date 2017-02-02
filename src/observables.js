import { ipcMain } from 'electron';
import Rx from 'rxjs/Rx';
import youtubedl from 'youtube-dl';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import settings from 'electron-settings';
import SC from 'soundcloud-resolve';
import CREDENTIALS from './client_secret.json';

const Youtube = require('youtube-api');

Youtube.authenticate({
  type: 'key',
  key: CREDENTIALS.youtube, // replace your api key here
});

const soundcloudResolve = (url, cb) => SC(CREDENTIALS.soundcloud, url, cb);

const videoList$ = Rx.Observable.bindNodeCallback(Youtube.videos.list);

const youtubePlayListItemsList$ = (url) => {
  const isUrl = /list=(\w+)/g.exec(url);
  const playlistId = isUrl ? isUrl[1] : url;

  return Rx.Observable.bindNodeCallback(Youtube.playlistItems.list)({
    part: 'snippet',
    maxResults: 50,
    playlistId,
  })
    .mergeMap(res => videoList$({
      part: 'snippet',
      id: res[0].items
        .map(v => v.snippet.resourceId.videoId)
        .join(','),
    }))
    .map(res => res[0].items.map(item => ({
      thumbnail: item.snippet.thumbnails.default.url,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      url: `http://www.youtube.com/watch?v=${item.id}`,
    })))
    .catch(msg => Rx.Observable.of({ err: true, msg }));
};

const soundcloudPlayListItemsList$ = url => Rx.Observable.bindNodeCallback(soundcloudResolve)(url)
  .map(res => res[0].map(item => ({
    thumbnail: item.artwork_url,
    title: item.title,
    channelTitle: item.user.username,
    url: item.permalink_url,
  })))
  .catch(msg => Rx.Observable.of({ err: true, msg }));

const onPlaylist$ = Rx.Observable.fromEvent(ipcMain, 'playlistFetch', (event, arg) => ({ event, arg }))
  .mergeMap(({ arg }) => (
    Rx.Observable.merge(
      youtubePlayListItemsList$(arg),
      soundcloudPlayListItemsList$(arg),
    )
      .single(res => res && res.length && !res.err)
      .catch(msg => Rx.Observable.of({ err: true, msg }))
  ), ({ event }, res) => ({ event, res }));

onPlaylist$.subscribe(({ event, res }) => {
  event.sender.send('playlistId', res);
});

const downloadPlaylist$ = Rx.Observable.fromEvent(ipcMain, 'downloadPlaylist', (event, arg) => arg)
  .map(playlist => playlist.map(url => youtubedl(
    url,
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
        settings.getSync('downloadPath') || __dirname,
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
