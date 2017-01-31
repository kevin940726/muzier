import Inferno from 'inferno';

const RootComponent = () => (
  <div>Hello World!</div>
);

Inferno.render(
  <RootComponent />,
  document.getElementById('root'),
);
