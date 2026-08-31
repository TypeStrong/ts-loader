import { HubValue, describeHub } from './hub';

export interface Leaf37Result {
  value: number;
  description: string;
}

export function leaf37(seed: number): Leaf37Result {
  const hubValue: HubValue = { id: seed + 37, label: 'leaf37' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
