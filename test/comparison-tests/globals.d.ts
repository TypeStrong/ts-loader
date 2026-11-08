// The mocha globals create-and-execute-test.js uses. Mocha 12 ships no types, and
// this saves a dependency on @types/mocha.

interface MochaTestContext {
    timeout(ms: number): void;
}

declare function describe(title: string, fn: () => void): void;

declare function it(
    title: string,
    fn: (this: MochaTestContext, done: (error?: unknown) => void) => void,
): void;
