import { HubValue, describeHub } from './hub';

export interface Leaf25Result {
  value: number;
  description: string;
}

export function leaf25(seed: number): Leaf25Result {
  const hubValue: HubValue = { id: seed + 25, label: 'leaf25' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
