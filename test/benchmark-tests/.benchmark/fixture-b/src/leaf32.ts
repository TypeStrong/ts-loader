import { HubValue, describeHub } from './hub';

export interface Leaf32Result {
  value: number;
  description: string;
}

export function leaf32(seed: number): Leaf32Result {
  const hubValue: HubValue = { id: seed + 32, label: 'leaf32' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
