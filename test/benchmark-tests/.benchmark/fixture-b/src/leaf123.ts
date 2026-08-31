import { HubValue, describeHub } from './hub';

export interface Leaf123Result {
  value: number;
  description: string;
}

export function leaf123(seed: number): Leaf123Result {
  const hubValue: HubValue = { id: seed + 123, label: 'leaf123' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
