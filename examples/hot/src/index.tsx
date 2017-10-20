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

    const anyModule: any = module;

    // Hot Module Replacement API
    if (anyModule.hot) {
        anyModule.hot.accept('./components/app', () => {
            const makeNextApp = require('./components/app').default;
            const nextApp = makeNextApp(['app']);
            ReactDOM.render(
                <AppContainer>
                    {nextApp.App}
                </AppContainer>,
                rootEl
            );
        });
    }
}

renderApp();
