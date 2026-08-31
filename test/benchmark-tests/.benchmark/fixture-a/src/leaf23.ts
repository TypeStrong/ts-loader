import { HubValue, describeHub } from './hub';

export interface Leaf23Result {
  value: number;
  description: string;
}

export function leaf23(seed: number): Leaf23Result {
  const hubValue: HubValue = { id: seed + 23, label: 'leaf23' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
