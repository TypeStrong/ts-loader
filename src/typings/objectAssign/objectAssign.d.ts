declare module 'object-assign' {
    function assign<T>(target: Object, ...source: Object[]): T;
    export = assign;
}