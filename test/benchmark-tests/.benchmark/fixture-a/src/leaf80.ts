import { HubValue, describeHub } from './hub';

export interface Leaf80Result {
  value: number;
  description: string;
}

export function leaf80(seed: number): Leaf80Result {
  const hubValue: HubValue = { id: seed + 80, label: 'leaf80' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
