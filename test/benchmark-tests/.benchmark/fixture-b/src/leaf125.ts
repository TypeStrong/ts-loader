import { HubValue, describeHub } from './hub';

export interface Leaf125Result {
  value: number;
  description: string;
}

export function leaf125(seed: number): Leaf125Result {
  const hubValue: HubValue = { id: seed + 125, label: 'leaf125' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
