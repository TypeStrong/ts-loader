// Example from https://basarat.gitbooks.io/typescript/docs/types/generics.html

/** A class definition with a generic parameter */
class Queue<T> {
  private data = [];
  public push = (item: T) => this.data.push(item);
  public pop = (): T => this.data.shift();
}

/** Again sample usage */
const queue = new Queue<number>();
queue.push(0);