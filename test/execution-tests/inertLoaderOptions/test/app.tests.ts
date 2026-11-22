import { greet } from '../src/app';

describe('app built with inert loader options', () => {
  it('runs', () => {
    expect(greet('ts-loader')).toBe('Hello, ts-loader');
  });
});
