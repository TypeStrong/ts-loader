import {TypedEvent, AppDispatcher} from '../dispatcher/AppDispatcher';

export class AddGreetingEvent extends TypedEvent<string> {}
export class NewGreetingChanged extends TypedEvent<string> {}
export class RemoveGreeting extends TypedEvent<string> {}

export function addGreeting(newGreeting: string) {
  AppDispatcher.dispatch(new AddGreetingEvent(newGreeting));
}

export function newGreetingChanged(newGreeting: string) {
  AppDispatcher.dispatch(new NewGreetingChanged(newGreeting));
}

export function removeGreeting(greetingToRemove: string) {
  AppDispatcher.dispatch(new RemoveGreeting(greetingToRemove));
}
