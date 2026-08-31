import { HubValue, describeHub } from './hub';

export interface Leaf70Result {
  value: number;
  description: string;
}

export function leaf70(seed: number): Leaf70Result {
  const hubValue: HubValue = { id: seed + 70, label: 'leaf70' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
