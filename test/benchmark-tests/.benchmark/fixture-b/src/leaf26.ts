import { HubValue, describeHub } from './hub';

export interface Leaf26Result {
  value: number;
  description: string;
}

export function leaf26(seed: number): Leaf26Result {
  const hubValue: HubValue = { id: seed + 26, label: 'leaf26' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
