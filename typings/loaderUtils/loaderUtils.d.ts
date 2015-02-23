declare module 'loader-utils' {
    export function parseQuery<T>(query: string): T;
		export function getRemainingRequest(loaderContext: any): any;
		export function getCurrentRequest(loaderContext: any): any;
}