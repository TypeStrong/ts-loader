import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { AppContainer } from 'react-hot-loader';
import { App } from './app';

const rootEl = document.getElementById('root');
const render = (Component: React.SFC) =>
  ReactDOM.render(
    <AppContainer>
      <Component />
    </AppContainer>,
    rootEl
  );

render(App);

// Hot Module Replacement API
if ((module as any).hot) {
  (module as any).hot.accept('./app', () => render(App));
}
