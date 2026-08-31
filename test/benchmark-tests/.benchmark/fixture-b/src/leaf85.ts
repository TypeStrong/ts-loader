import { HubValue, describeHub } from './hub';

export interface Leaf85Result {
  value: number;
  description: string;
}

export function leaf85(seed: number): Leaf85Result {
  const hubValue: HubValue = { id: seed + 85, label: 'leaf85' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
