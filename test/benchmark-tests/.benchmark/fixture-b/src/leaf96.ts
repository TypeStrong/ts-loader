import { HubValue, describeHub } from './hub';

export interface Leaf96Result {
  value: number;
  description: string;
}

export function leaf96(seed: number): Leaf96Result {
  const hubValue: HubValue = { id: seed + 96, label: 'leaf96' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
