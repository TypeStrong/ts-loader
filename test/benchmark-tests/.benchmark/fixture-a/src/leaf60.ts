import { HubValue, describeHub } from './hub';

export interface Leaf60Result {
  value: number;
  description: string;
}

export function leaf60(seed: number): Leaf60Result {
  const hubValue: HubValue = { id: seed + 60, label: 'leaf60' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
