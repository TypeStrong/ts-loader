import { HubValue, describeHub } from './hub';

export interface Leaf13Result {
  value: number;
  description: string;
}

export function leaf13(seed: number): Leaf13Result {
  const hubValue: HubValue = { id: seed + 13, label: 'leaf13' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
