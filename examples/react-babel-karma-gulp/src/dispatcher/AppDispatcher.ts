import { Dispatcher } from 'flux';

export class TypedEvent<P> {
  constructor(public payload: P) {}
}

export type Event = TypedEvent<any>;

const dispatcherInstance: Dispatcher<Event> = new Dispatcher();

export { dispatcherInstance as AppDispatcher };
