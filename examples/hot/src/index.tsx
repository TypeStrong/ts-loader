import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { AppContainer } from 'react-hot-loader';
import { App } from './components/app';
import './styles/styles.scss';

/**
 * Render the app
 */
function renderApp() {
    const rootEl = document.getElementById('root');
    ReactDOM.render(
        <AppContainer>
            <App />
        </AppContainer>,
        rootEl
    );
}

renderApp();

// Hot Module Replacement API
const anyModule: any = module;
if (anyModule.hot) {
    anyModule.hot.accept('./components/app', () => renderApp());
}
