module externalLib {
  export function doSomething(): void;
}

declare module 'externalLib' {
    export = externalLib
}