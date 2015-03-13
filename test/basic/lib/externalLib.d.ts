declare module externalLib {
  export function doSomething(arg: any): void;
}

declare module 'externalLib' {
    export = externalLib
}