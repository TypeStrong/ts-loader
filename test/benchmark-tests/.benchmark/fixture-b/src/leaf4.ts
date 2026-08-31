import { HubValue, describeHub } from './hub';

export interface Leaf4Result {
  value: number;
  description: string;
}

export function leaf4(seed: number): Leaf4Result {
  const hubValue: HubValue = { id: seed + 4, label: 'leaf4' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
