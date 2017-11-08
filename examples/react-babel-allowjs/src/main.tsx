import React from 'react';
import ReactDOM from 'react-dom';
import App from './app.js';

function getContainer (id: string) {
  return document.getElementById(id)
}

ReactDOM.render(
  <App />,
  getContainer('appContainer')
);