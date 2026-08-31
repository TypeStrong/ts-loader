import { HubValue, describeHub } from './hub';

export interface Leaf36Result {
  value: number;
  description: string;
}

export function leaf36(seed: number): Leaf36Result {
  const hubValue: HubValue = { id: seed + 36, label: 'leaf36' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
