import { HubValue, describeHub } from './hub';

export interface Leaf128Result {
  value: number;
  description: string;
}

export function leaf128(seed: number): Leaf128Result {
  const hubValue: HubValue = { id: seed + 128, label: 'leaf128' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
