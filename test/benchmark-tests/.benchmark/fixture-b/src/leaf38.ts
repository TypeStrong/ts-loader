import { HubValue, describeHub } from './hub';

export interface Leaf38Result {
  value: number;
  description: string;
}

export function leaf38(seed: number): Leaf38Result {
  const hubValue: HubValue = { id: seed + 38, label: 'leaf38' };
  return {
    value: hubValue.id * 2,
    description: describeHub(hubValue),
  };
}
