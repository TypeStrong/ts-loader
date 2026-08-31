import { HubValue, describeHub } from './hub';

export interface Leaf160Result {
  value: number;
  description: string;
}

export function leaf160(seed: number): Leaf160Result {
  const hubValue: HubValue = { id: seed + 160, label: 'leaf160' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
