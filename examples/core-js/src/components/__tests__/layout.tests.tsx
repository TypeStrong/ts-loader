import * as React from 'react';
import * as renderer from 'react-test-renderer';
import { Layout } from '../layout';

describe('app', () => {
    it('component renders as expected', () => {
        const component = renderer.create(
            <Layout />
        );
        let tree = component.toJSON();
        expect(tree).toMatchSnapshot();
    });
});