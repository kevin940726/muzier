import Inferno from 'inferno';
import Component from 'inferno-component';
import { ipcRenderer, remote } from 'electron';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/fromEvent';
import settings from 'electron-settings';

const { dialog } = remote;

class InputPlaylist extends Component {
  constructor() {
    super();

    this.state = {
      isFetching: false,
    };

    this.playListItemsList = null;

    this.handleSubmit = this.handleSubmit.bind(this);
  }

  componentDidMount() {
    const onPlaylist$ = Observable.fromEvent(ipcRenderer, 'playlistFetch', (event, arg) => arg);

    onPlaylist$.subscribe(() => {
      this.setState({ isFetching: false });
    });
  }

  handleSubmit(e) {
    e.preventDefault();
    const value = this.playlistIdInput && this.playlistIdInput.value;

    if (value) {
      ipcRenderer.send('playlistId', this.playlistIdInput.value);
      this.setState({ isFetching: true });
    }
  }

  render() {
    const { isFetching } = this.state;

    return (
      <form onSubmit={this.handleSubmit} className="input-playlist">
        <label className="label" htmlFor="playlistId">Playlist URL</label>
        <p className="control has-addons">
          <input
            ref={(ref) => { this.playlistIdInput = ref; }}
            className="input is-expanded"
            id="playlistId"
            type="text"
            placeholder="Enter playlist url"
            defaultValue="https://www.youtube.com/playlist?list=FLp9N6FdCzTyQZKMOZEz2Kjw"
          />
          <button type="submit" className={`button is-primary ${isFetching ? 'is-loading' : ''}`}>PULL</button>
        </p>
      </form>
    );
  }
}

const Video = ({ thumbnail, title, channelTitle, handleClick, isChecked }) => (
  <div className="media video" onClick={handleClick}>
    <figure className="media-left">
      <p className="image is-4by3">
        <img src={thumbnail} alt={title} />
      </p>
    </figure>
    <div className="media-content">
      <div className="content">
        <p>
          <strong>{title}</strong>
          <br />
          <span>{channelTitle}</span>
        </p>
      </div>
    </div>
    <div className="media-right">
      {isChecked && (
        <a className="icon is-primary">
          <i className="fa fa-check" aria-hidden="true" />
        </a>
      )}
    </div>
  </div>
);

class IndeterminateCheckbox extends Component {
  constructor(props) {
    super(props);

    this.ref = null;
  }

  componentWillReceiveProps(nextProps) {
    this.ref.indeterminate = nextProps.indeterminate;
  }

  render() {
    return (
      <input
        type="checkbox"
        ref={(ref) => { this.ref = ref; }}
        {...this.props}
        onChange={this.props.onChange}
      />
    );
  }
}

const DownloadFooter = ({
  length,
  isDownloading,
  handleDownloadClick,
  downloadedSize,
  totalSize,
}) => (
  <div className="download-footer">
    {isDownloading && (
      <progress
        className="progress is-info"
        value={downloadedSize}
        max={totalSize}
      >
        {`${(downloadedSize / totalSize) * 100}%`}
      </progress>
    )}
    <button
      className={`button is-info ${length === 0 && 'is-disabled'} ${isDownloading ? 'is-loading' : ''}`}
      onClick={handleDownloadClick}
    >
      Download {length} {length > 1 ? 'tracks' : 'track'}
    </button>
  </div>
);

class Playlist extends Component {
  constructor(props) {
    super(props);

    this.state = {
      playlist: [],
      checked: [],
      isDownloading: false,
      totalSize: 0,
      downloadedSize: 0,
    };

    this.handleVideoClick = this.handleVideoClick.bind(this);
    this.handleSelectAll = this.handleSelectAll.bind(this);
    this.handleDownloadClick = this.handleDownloadClick.bind(this);
  }

  componentDidMount() {
    const onPlaylist$ = Observable.fromEvent(ipcRenderer, 'playlistFetch', (event, arg) => arg);
    const onDownloadProgress$ = Observable.fromEvent(ipcRenderer, 'downloadProgress', (event, arg) => arg);
    const onPlaylistSize$ = Observable.fromEvent(ipcRenderer, 'playlistSize', (event, arg) => arg);
    const onPlaylistEnd$ = Observable.fromEvent(ipcRenderer, 'playlistEnd');

    onPlaylist$.subscribe((playlist) => {
      if (playlist && playlist.length) {
        this.setState({
          playlist,
          checked: new Array(playlist.length).fill(false),
        });
      }
    });

    onPlaylistSize$.subscribe((size) => {
      this.setState({ totalSize: size });
    });

    onDownloadProgress$.subscribe((chunkLength) => {
      this.setState(state => ({
        downloadedSize: state.downloadedSize + chunkLength,
      }));
    });

    onPlaylistEnd$.subscribe(() => {
      this.setState({
        isDownloading: false,
      });
    });
  }

  handleVideoClick(index) {
    return () => {
      const newChecked = this.state.checked.slice(); // cut off reference
      newChecked[index] = !newChecked[index];

      this.setState({
        checked: newChecked,
      });
    };
  }
  handleSelectAll() {
    const checked = this.state.checked;
    const hasAtLeastOneChecked = checked.find(c => c === true);

    this.setState({
      checked: hasAtLeastOneChecked ?
        new Array(checked.length).fill(false) :
        new Array(checked.length).fill(true),
    });
  }
  handleDownloadClick() {
    const { playlist, checked, isDownloading } = this.state;
    const list = playlist.filter((cur, i) => checked[i]).map(v => v.url);

    if (list.length && !isDownloading) {
      if (!settings.hasSync('downloadPath')) {
        dialog.showOpenDialog({
          title: 'Where to save the tracks?',
          properties: ['openDirectory'],
        }, (filePaths) => {
          settings.set('downloadPath', filePaths[0])
            .then(() => ipcRenderer.send('downloadPlaylist', list));
        });
      } else {
        ipcRenderer.send('downloadPlaylist', list);
      }

      this.setState({ isDownloading: true });
    }
  }

  render() {
    const { playlist, checked, isDownloading, downloadedSize, totalSize } = this.state;
    const hasAtLeastOneChecked = Boolean(checked.find(c => c === true));

    return (
      <div className="playlist">
        {Boolean(playlist.length) && (
          <p className="control">
            <label className="checkbox" htmlFor="select-all">
              <IndeterminateCheckbox
                id="select-all"
                checked={checked.every(c => c === true)}
                indeterminate={hasAtLeastOneChecked}
                onChange={this.handleSelectAll}
              />
              Select all
            </label>
          </p>
        )}
        {playlist.map((video, index) => (
          <Video
            thumbnail={video.thumbnail}
            title={video.title}
            channelTitle={video.channelTitle}
            handleClick={this.handleVideoClick(index)}
            isChecked={checked[index]}
          />
        ))}
        {playlist.length > 0 && (
          <DownloadFooter
            length={checked.filter(c => c === true).length}
            handleDownloadClick={this.handleDownloadClick}
            isDownloading={isDownloading}
            downloadedSize={downloadedSize}
            totalSize={totalSize}
          />
        )}
      </div>
    );
  }
}

const RootComponent = () => (
  <div className="container">
    <InputPlaylist />
    <Playlist />
  </div>
);

Inferno.render(
  <RootComponent />,
  document.getElementById('root'),
);
