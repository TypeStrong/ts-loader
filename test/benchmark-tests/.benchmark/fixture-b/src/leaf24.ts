import { HubValue, describeHub } from './hub';

export interface Leaf24Result {
  value: number;
  description: string;
}

export function leaf24(seed: number): Leaf24Result {
  const hubValue: HubValue = { id: seed + 24, label: 'leaf24' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
