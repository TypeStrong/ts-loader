import { HubValue, describeHub } from './hub';

export interface Leaf64Result {
  value: number;
  description: string;
}

export function leaf64(seed: number): Leaf64Result {
  const hubValue: HubValue = { id: seed + 64, label: 'leaf64' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
