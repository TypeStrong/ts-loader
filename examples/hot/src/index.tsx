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
const anyModule: any = module;
if (anyModule.hot) {
    anyModule.hot.accept('./app', () => render(App));
}
