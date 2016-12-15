import FluxStore from './FluxStore';
import {Event, AppDispatcher} from '../dispatcher/AppDispatcher';
import GreetingState from '../types/GreetingState';
import { AddGreetingEvent, RemoveGreeting, NewGreetingChanged } from '../actions/GreetingActions';

class GreeterStore extends FluxStore<GreetingState> {
  constructor(dispatcher: typeof AppDispatcher) {
    const onDispatch = (action: Event) => {
      if (action instanceof AddGreetingEvent) {
        const {payload} = action;
        this.state.newGreeting = '';
        this.state.greetings = this.state.greetings.concat(payload);
        this.emitChange();
      }
      else if (action instanceof RemoveGreeting) {
        const {payload} = action;
        this.state.greetings = this.state.greetings.filter(g => g !== payload);
        this.emitChange();
      }
      else if (action instanceof NewGreetingChanged) {
        const {payload} = action;
        this.state.newGreeting = payload;
        this.emitChange();
      }
    }
    super(dispatcher, onDispatch, () => ({
      greetings: [],
      newGreeting: ''
    }));
  }

  getState() {
    return this.state
  }
}

const greeterStoreInstance = new GreeterStore(AppDispatcher);
export default greeterStoreInstance;
