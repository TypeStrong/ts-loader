import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { App } from './app';

const rootEl = document.getElementById('root');
const render = (Component: React.SFC) =>
  ReactDOM.render(
    <Component />,
    rootEl
  );

render(App);
