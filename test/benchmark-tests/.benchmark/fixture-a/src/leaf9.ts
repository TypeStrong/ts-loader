import { HubValue, describeHub } from './hub';

export interface Leaf9Result {
  value: number;
  description: string;
}

export function leaf9(seed: number): Leaf9Result {
  const hubValue: HubValue = { id: seed + 9, label: 'leaf9' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
