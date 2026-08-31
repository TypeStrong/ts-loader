import { HubValue, describeHub } from './hub';

export interface Leaf27Result {
  value: number;
  description: string;
}

export function leaf27(seed: number): Leaf27Result {
  const hubValue: HubValue = { id: seed + 27, label: 'leaf27' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
