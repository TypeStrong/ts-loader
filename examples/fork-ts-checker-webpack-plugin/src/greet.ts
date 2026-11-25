export interface Greeting {
  name: string;
  emoji?: string;
}

export function greet({ name, emoji = '👋' }: Greeting): string {
  return `${emoji} Hello, ${name}! Nice to see you!`;
}
