import GreetingStore from '../../src/stores/GreetingStore';
import { AddGreetingEvent, RemoveGreeting, NewGreetingChanged } from '../../src/actions/GreetingActions';

const registeredCallback = GreetingStore.onDispatch.bind(GreetingStore);

describe('GreetingStore', () => {
  beforeEach(() => {
    GreetingStore.cleanState();
  });

  it('given no actions, newGreeting should be an empty string and greetings should be an empty array', () => {
    const { greetings, newGreeting } = GreetingStore.getState();

    expect(greetings).toEqual([]);
    expect(newGreeting).toBe('');
  });

  it('given an ADD_GREETING action with a newGreeting of \'Benjamin\', the newGreeting should be an empty string and greetings should contain \'Benjamin\'', () => {
    [new AddGreetingEvent('Benjamin')].forEach(registeredCallback);

    const { greetings, newGreeting } = GreetingStore.getState();

    expect(greetings.find(g => g === 'Benjamin')).toBeTruthy();
    expect(newGreeting).toBe('');
  });

  it('given an REMOVE_GREETING action with a greetingToRemove of \'Benjamin\', the state greetings should be an empty array', () => {
    [new AddGreetingEvent('Benjamin'), new RemoveGreeting('Benjamin')].forEach(registeredCallback);

    const { greetings } = GreetingStore.getState();

    expect(greetings.length).toBe(0);
    expect(greetings.find(g => g === 'Benjamin')).toBeFalsy();
  });

  it('given a NEW_GREETING_CHANGED action with a newGreeting of \'Benjamin\', the state newGreeting should be \'Benjamin\'', () => {
    [new NewGreetingChanged('Benjamin')].forEach(registeredCallback);

    const { newGreeting } = GreetingStore.getState();

    expect(newGreeting).toEqual('Benjamin');
  });

});
