import { HubValue, describeHub } from './hub';

export interface Leaf40Result {
  value: number;
  description: string;
}

export function leaf40(seed: number): Leaf40Result {
  const hubValue: HubValue = { id: seed + 40, label: 'leaf40' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
