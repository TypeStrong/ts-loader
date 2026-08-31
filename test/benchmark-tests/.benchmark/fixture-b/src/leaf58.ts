import { HubValue, describeHub } from './hub';

export interface Leaf58Result {
  value: number;
  description: string;
}

export function leaf58(seed: number): Leaf58Result {
  const hubValue: HubValue = { id: seed + 58, label: 'leaf58' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
