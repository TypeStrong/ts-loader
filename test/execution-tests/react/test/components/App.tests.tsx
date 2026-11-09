import { renderToStaticMarkup } from 'react-dom/server';

import App from '../../src/components/App';

describe('App', () => {
  it('simple', () => expect(1).toBe(1));

  it('renders expected HTML', () => {
    expect(renderToStaticMarkup(<App name="Benjamin" />)).toBe(
      '<div class="container-fluid"><h1>Hello Benjamin!</h1></div>'
    );
  });
});
