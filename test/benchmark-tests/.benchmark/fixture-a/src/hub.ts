export interface HubValue {
  id: number;
  label: string;
}

export function describeHub(value: HubValue): string {
  return `${value.id}:${value.label}`;
}

export function combineHub(values: HubValue[]): HubValue {
  return values.reduce(
    (acc, v) => ({ id: acc.id + v.id, label: acc.label + v.label }),
    { id: 0, label: '' }
  );
}
