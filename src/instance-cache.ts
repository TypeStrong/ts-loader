import type * as webpack from 'webpack';

import type { TSInstance } from './types';

const marker: webpack.Compiler = {} as webpack.Compiler;

const cache: WeakMap<webpack.Compiler, Map<string, TSInstance>> = new WeakMap();

export function getTSInstanceFromCache(
  key: webpack.Compiler,
  name: string
): TSInstance | undefined {
  const compiler = key ?? marker;

  let instances = cache.get(compiler);
  if (!instances) {
    instances = new Map();
    cache.set(compiler, instances);
  }

  return instances.get(name);
}

export function setTSInstanceInCache(
  key: webpack.Compiler | undefined,
  name: string,
  instance: TSInstance
) {
  const compiler = key ?? marker;

  const instances = cache.get(compiler) ?? new Map<string, TSInstance>();
  instances.set(name, instance);
  cache.set(compiler, instances);
}
