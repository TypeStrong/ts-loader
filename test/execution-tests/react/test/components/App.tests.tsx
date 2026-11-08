import * as React from 'react';
import { createRenderer } from 'react-test-renderer/shallow';

import App from '../../src/components/App';

describe('App', () => {
  it('simple', () => expect(1).toBe(1));
  
  it('renders expected HTML', () => {
    const shallowRenderer = createRenderer();

    shallowRenderer.render(<App name="Benjamin" />);
    const app = shallowRenderer.getRenderOutput();

    expect(app).toEqual(
      <div className="container-fluid">
        <h1>Hello { 'Benjamin' }!</h1>
      </div>
    );
  });
});
