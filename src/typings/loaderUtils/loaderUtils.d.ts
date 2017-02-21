declare module 'loader-utils' {
    export function getOptions<T>(loaderContext: { query: string; }): T;
		export function getRemainingRequest(loaderContext: any): any;
		export function getCurrentRequest(loaderContext: any): any;
}