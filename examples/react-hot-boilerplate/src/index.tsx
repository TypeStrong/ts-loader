import { AppContainer } from 'react-hot-loader';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import App from './App';

const rootEl = document.getElementById('root');
const render = (Component: typeof App) =>
  ReactDOM.render(
    <AppContainer>
      <Component />
    </AppContainer>,
    rootEl
  );

render(App);
if ((module as any).hot) (module as any).hot.accept('./App', () => render(App));
