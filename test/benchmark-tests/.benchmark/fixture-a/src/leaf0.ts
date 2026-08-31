import { HubValue, describeHub } from './hub';

export interface Leaf0Result {
  value: number;
  description: string;
}

export function leaf0(seed: number): Leaf0Result {
  const hubValue: HubValue = { id: seed + 0, label: 'leaf0' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
