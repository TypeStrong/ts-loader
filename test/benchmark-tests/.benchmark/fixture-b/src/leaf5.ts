import { HubValue, describeHub } from './hub';

export interface Leaf5Result {
  value: number;
  description: string;
}

export function leaf5(seed: number): Leaf5Result {
  const hubValue: HubValue = { id: seed + 5, label: 'leaf5' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
