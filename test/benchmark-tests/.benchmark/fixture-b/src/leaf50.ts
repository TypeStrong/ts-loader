import { HubValue, describeHub } from './hub';

export interface Leaf50Result {
  value: number;
  description: string;
}

export function leaf50(seed: number): Leaf50Result {
  const hubValue: HubValue = { id: seed + 50, label: 'leaf50' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
