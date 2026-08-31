import { HubValue, describeHub } from './hub';

export interface Leaf6Result {
  value: number;
  description: string;
}

export function leaf6(seed: number): Leaf6Result {
  const hubValue: HubValue = { id: seed + 6, label: 'leaf6' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
