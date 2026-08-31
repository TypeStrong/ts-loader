import { HubValue, describeHub } from './hub';

export interface Leaf90Result {
  value: number;
  description: string;
}

export function leaf90(seed: number): Leaf90Result {
  const hubValue: HubValue = { id: seed + 90, label: 'leaf90' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
