import React from 'react';
import TestUtils from 'react-addons-test-utils';

import App from '../../src/components/App';
import WhoToGreet from '../../src/components/WhoToGreet';
import Greeting from '../../src/components/Greeting';
import GreetingStore from '../../src/stores/GreetingStore';

describe('App', () => {
  it('renders expected HTML', () => {
    const app = render({ greetings: ['James'], newGreeting: 'Benjamin' });
    expect(app).toEqual(
      <div className="container-fluid">
        <h1>Hello People!</h1>

        <WhoToGreet newGreeting={ 'Benjamin' } />

        { [
          <Greeting key={ 0 } targetOfGreeting="James" />
        ] }
      </div>
    );
  });

  function render(state: any) {
    const shallowRenderer = TestUtils.createRenderer();
    spyOn(GreetingStore, 'getState').and.returnValue(state);

    shallowRenderer.render(<App />);
    return shallowRenderer.getRenderOutput();
  }
});
