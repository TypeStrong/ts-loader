import { HubValue, describeHub } from './hub';

export interface Leaf21Result {
  value: number;
  description: string;
}

export function leaf21(seed: number): Leaf21Result {
  const hubValue: HubValue = { id: seed + 21, label: 'leaf21' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
