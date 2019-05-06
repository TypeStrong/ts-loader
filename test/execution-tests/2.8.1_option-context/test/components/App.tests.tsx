import * as React from 'react';
import { createRenderer } from 'react-test-renderer/shallow';

import App, { COApp } from '../../src/components/App';
import DeepApp, { CODeepApp } from '../../src/components/deep/DeepApp';
import DeeperApp, { CODeeperApp } from '../../src/components/deep/deeper/DeeperApp';

describe('App', () => {
  it('simple', () => expect(1).toBe(1));
  
  it('renders App as expected HTML', () => {
    const shallowRenderer = createRenderer();

    shallowRenderer.render(<App name="Christian" />);
    const app = shallowRenderer.getRenderOutput();

    expect(app).toEqual(
      <div className="container-fluid">
        <h1>Hello { "Christian" }!</h1>
      </div>
    );
  });

  it('renders ClickOutsideApp', () => {
    const shallowRenderer = createRenderer();

    shallowRenderer.render(<COApp name="Christian" />);
  });


  it('renders DeepApp as expected HTML', () => {
    const shallowRenderer = createRenderer();

    shallowRenderer.render(<DeepApp name="Christian" />);
    const app = shallowRenderer.getRenderOutput();

    expect(app).toEqual(
      <div className="container-fluid">
        <h1>Hello { "Christian" }!</h1>
      </div>
    );
  });

  it('renders ClickOutsideDeeApp', () => {
    const shallowRenderer = createRenderer();

    shallowRenderer.render(<CODeepApp name="Christian" />);
  });


  it('renders DeeperApp as expected HTML', () => {
    const shallowRenderer = createRenderer();

    shallowRenderer.render(<DeeperApp name="Christian" />);
    const app = shallowRenderer.getRenderOutput();

    expect(app).toEqual(
      <div className="container-fluid">
        <h1>Hello { "Christian" }!</h1>
      </div>
    );
  });

  it('renders ClickOutsideDeeperApp', () => {
    const shallowRenderer = createRenderer();

    shallowRenderer.render(<CODeeperApp name="Christian" />);
  });
});
