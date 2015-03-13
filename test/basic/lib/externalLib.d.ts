declare module externalLib {
  export function doSomething2(arg: any): void;
}

declare module 'externalLib' {
    export = externalLib
}