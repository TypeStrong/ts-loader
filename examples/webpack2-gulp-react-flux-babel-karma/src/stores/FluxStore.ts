import { EventEmitter } from 'fbemitter';
import { Event } from '../dispatcher/AppDispatcher';
import * as Flux from "flux";

const CHANGE_EVENT = 'change';

class FluxStore<TState> {
  private changed: boolean;
  private emitter: EventEmitter;
  private dispatchToken: string;
  private dispatcher: Flux.Dispatcher<Event>;
  private cleanStateFn: () => TState;
  protected state: TState;

  constructor(dispatcher: Flux.Dispatcher<Event>, public onDispatch: (action: Event) => void, cleanStateFn: () => TState) {
    this.emitter = new EventEmitter();
    this.changed = false;
    this.dispatcher = dispatcher;
    this.dispatchToken = dispatcher.register(payload => {
      this.invokeOnDispatch(payload);
    });

    this.cleanStateFn = cleanStateFn;
    this.state = this.cleanStateFn();
  }

  /**
   * Is idempotent per dispatched event
   */
  emitChange() {
    this.changed = true;
  }

  hasChanged() { return this.changed; }

  addChangeListener(callback: () => void) {
    return this.emitter.addListener(CHANGE_EVENT, callback);
  }

  public cleanState() {
    this.changed = false;
    this.state = this.cleanStateFn();
  }

  private invokeOnDispatch(payload: Event) {
    this.changed = false;
    this.onDispatch(payload);
    if (this.changed) {
      this.emitter.emit(CHANGE_EVENT);
    }
  }
}

export default FluxStore;
