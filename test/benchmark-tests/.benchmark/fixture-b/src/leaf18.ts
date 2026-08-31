import { HubValue, describeHub } from './hub';

export interface Leaf18Result {
  value: number;
  description: string;
}

export function leaf18(seed: number): Leaf18Result {
  const hubValue: HubValue = { id: seed + 18, label: 'leaf18' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
