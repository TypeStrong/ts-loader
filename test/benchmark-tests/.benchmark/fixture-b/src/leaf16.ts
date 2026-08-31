import { HubValue, describeHub } from './hub';

export interface Leaf16Result {
  value: number;
  description: string;
}

export function leaf16(seed: number): Leaf16Result {
  const hubValue: HubValue = { id: seed + 16, label: 'leaf16' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
