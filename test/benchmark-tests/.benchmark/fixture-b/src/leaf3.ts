import { HubValue, describeHub } from './hub';

export interface Leaf3Result {
  value: number;
  description: string;
}

export function leaf3(seed: number): Leaf3Result {
  const hubValue: HubValue = { id: seed + 3, label: 'leaf3' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
