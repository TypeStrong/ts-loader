import { HubValue, describeHub } from './hub';

export interface Leaf7Result {
  value: number;
  description: string;
}

export function leaf7(seed: number): Leaf7Result {
  const hubValue: HubValue = { id: seed + 7, label: 'leaf7' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
