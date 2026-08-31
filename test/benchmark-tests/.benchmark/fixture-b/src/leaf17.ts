import { HubValue, describeHub } from './hub';

export interface Leaf17Result {
  value: number;
  description: string;
}

export function leaf17(seed: number): Leaf17Result {
  const hubValue: HubValue = { id: seed + 17, label: 'leaf17' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
