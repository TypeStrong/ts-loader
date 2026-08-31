import { HubValue, describeHub } from './hub';

export interface Leaf8Result {
  value: number;
  description: string;
}

export function leaf8(seed: number): Leaf8Result {
  const hubValue: HubValue = { id: seed + 8, label: 'leaf8' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
