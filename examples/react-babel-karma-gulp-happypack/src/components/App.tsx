import React from 'react';
import FBEmitter from 'fbemitter';

import GreetingStore from '../stores/GreetingStore';
import GreetingState from '../types/GreetingState';
import WhoToGreet from './WhoToGreet';
import Greeting from './Greeting';

class App extends React.Component<{}, GreetingState> {
  eventSubscription: FBEmitter.EventSubscription;
  constructor(props: {}) {
    super(props);
    this.state = this.getStateFromStores();
  }

  public componentWillMount() {
    this.eventSubscription = GreetingStore.addChangeListener(this.onChange);
  }

  public componentWillUnmount() {
    this.eventSubscription.remove();
  }

  render() {
    const { greetings, newGreeting } = this.state;
    return (
      <div className="container-fluid">
        <h1>Hello People!</h1>

        <WhoToGreet newGreeting={ newGreeting } />

        { greetings.map((g, index) => <Greeting key={ index } targetOfGreeting={ g } />) }
      </div>
    );
  }

  private getStateFromStores() {
    return GreetingStore.getState();
  }
  private onChange = () => {
    this.setState(this.getStateFromStores());
  }
}

export default App;
