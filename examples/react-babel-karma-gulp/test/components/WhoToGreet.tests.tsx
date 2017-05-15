import React from 'react';
import { createRenderer } from 'react-test-renderer/shallow';

import WhoToGreet from '../../src/components/WhoToGreet';
import * as GreetingActions from '../../src/actions/GreetingActions';

describe('WhoToGreet', () => {
  let handleSelectionChangeSpy: jasmine.Spy;
  beforeEach(() => {
    handleSelectionChangeSpy = jasmine.createSpy('handleSelectionChange');
  });

  it('given a newGreeting then it renders a form containing an input containing that text and an add button', () => {
    const newGreeting = 'James';

    const form = render({ newGreeting });
    expect(form.type).toBe('form');
    expect(form.props.role).toBe('form');

    const formGroup = form.props.children;
    expect(formGroup.type).toBe('div');
    expect(formGroup.props.className).toBe('form-group');

    const [input, button] = formGroup.props.children;

    expect(input.type).toBe('input');
    expect(input.props.type).toBe('text');
    expect(input.props.className).toBe('form-control');
    expect(input.props.placeholder).toBe('Who would you like to greet?');
    expect(input.props.value).toBe(newGreeting);

    expect(button.type).toBe('button');
    expect(button.props.type).toBe('submit');
    expect(button.props.className).toBe('btn btn-default btn-primary');
    expect(button.props.disabled).toBe(false);
    expect(button.props.children).toBe('Add greeting');
  });

  it('input onChange triggers a newGreetingChanged action', () => {
    const newGreeting = 'Benjamin';
    const form = render({ newGreeting });
    const formGroup = form.props.children;
    const [input] = formGroup.props.children;
    spyOn(GreetingActions, 'newGreetingChanged');

    input.props.onChange({ target: { value: newGreeting } });

    expect(GreetingActions.newGreetingChanged).toHaveBeenCalledWith(newGreeting);
  });

  it('button onClick triggers an addGreeting action', () => {
    const newGreeting = 'Benjamin';
    const form = render({ newGreeting });
    const formGroup = form.props.children;
    const [, button] = formGroup.props.children;
    spyOn(GreetingActions, 'addGreeting');

    button.props.onClick({ preventDefault: () => { } });

    expect(GreetingActions.addGreeting).toHaveBeenCalledWith(newGreeting);
  });

  function render({ newGreeting }: { newGreeting: string }) {
    const shallowRenderer = createRenderer();
    shallowRenderer.render(<WhoToGreet newGreeting={newGreeting} />);
    return shallowRenderer.getRenderOutput();
  }
});
