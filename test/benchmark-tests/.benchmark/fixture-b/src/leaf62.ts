import { HubValue, describeHub } from './hub';

export interface Leaf62Result {
  value: number;
  description: string;
}

export function leaf62(seed: number): Leaf62Result {
  const hubValue: HubValue = { id: seed + 62, label: 'leaf62' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
