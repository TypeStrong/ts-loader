import { HubValue, describeHub } from './hub';

export interface Leaf42Result {
  value: number;
  description: string;
}

export function leaf42(seed: number): Leaf42Result {
  const hubValue: HubValue = { id: seed + 42, label: 'leaf42' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
