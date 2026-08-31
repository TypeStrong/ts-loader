import { HubValue, describeHub } from './hub';

export interface Leaf28Result {
  value: number;
  description: string;
}

export function leaf28(seed: number): Leaf28Result {
  const hubValue: HubValue = { id: seed + 28, label: 'leaf28' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
