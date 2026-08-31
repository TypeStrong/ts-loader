import { HubValue, describeHub } from './hub';

export interface Leaf48Result {
  value: number;
  description: string;
}

export function leaf48(seed: number): Leaf48Result {
  const hubValue: HubValue = { id: seed + 48, label: 'leaf48' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
