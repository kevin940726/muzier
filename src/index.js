/* global gapi */
import Inferno from 'inferno';
import Component from 'inferno-component';
import { ipcRenderer } from 'electron';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/fromEvent';

let playlistIdInput = null;

const handleSubmit = (e) => {
  e.preventDefault();

  if (playlistIdInput.value) {
    ipcRenderer.send('playlistId', playlistIdInput.value);
  }
};

const InputPlaylist = () => (
  <form onSubmit={handleSubmit}>
    <label className="label" htmlFor="playlistId">Playlist ID:</label>
    <p className="control has-addons">
      <input
        ref={(ref) => { playlistIdInput = ref; }}
        className="input is-expanded"
        id="playlistId"
        type="text"
        placeholder="Enter playlist id"
        defaultValue="FLp9N6FdCzTyQZKMOZEz2Kjw"
      />
      <button type="submit" className="button is-primary">PULL</button>
    </p>
  </form>
);

const Video = ({ thumbnail, title, channelTitle }) => (
  <div className="media">
    <figure className="media-left">
      <p className="image is-4by3" style={{ width: '100px' }}>
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
  </div>
);

class Playlist extends Component {
  constructor(props) {
    super(props);

    this.state = {
      playlist: [],
    };
  }

  componentDidMount() {
    const onPlaylist$ = Observable.fromEvent(ipcRenderer, 'playlistId', (event, arg) => arg);

    onPlaylist$.subscribe((playlist) => {
      this.setState({ playlist });
    });
  }

  render() {
    const { playlist } = this.state;

    return (
      <div>
        {playlist.map(video => (
          <Video
            thumbnail={video.snippet.thumbnails.default.url}
            title={video.snippet.title}
            channelTitle={video.snippet.channelTitle}
          />
        ))}
      </div>
    );
  }
}

const RootComponent = () => (
  <div className="container" style={{ padding: '20px' }}>
    <InputPlaylist />
    <hr />
    <Playlist />
  </div>
);

Inferno.render(
  <RootComponent />,
  document.getElementById('root'),
);
