import { HubValue, describeHub } from './hub';

export interface Leaf10Result {
  value: number;
  description: string;
}

export function leaf10(seed: number): Leaf10Result {
  const hubValue: HubValue = { id: seed + 10, label: 'leaf10' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
