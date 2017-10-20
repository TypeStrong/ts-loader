import * as React from 'react';
import * as renderer from 'react-test-renderer';
import { App } from '../app';

describe('app', () => {
    it('component renders as expected', () => {
        const component = renderer.create(
            <App />
        );
        let tree = component.toJSON();
        expect(tree).toMatchSnapshot();
    });
});