export class NumericMinHeap {
    private priorities: Float64Array;
    private values: Int32Array;
    private length = 0;

    constructor(capacity = 1024) {
        this.priorities = new Float64Array(capacity);
        this.values = new Int32Array(capacity);
    }

    get size(): number {
        return this.length;
    }

    push(priority: number, value: number): void {
        if (this.length === this.priorities.length) {
            this.grow();
        }

        this.priorities[this.length] = priority;
        this.values[this.length] = value;
        this.bubbleUp(this.length++);
    }

    pop(): number {
        const top = this.values[0];
        this.length--;

        if (this.length > 0) {
            this.priorities[0] = this.priorities[this.length];
            this.values[0] = this.values[this.length];
            this.bubbleDown(0);
        }

        return top;
    }

    private grow(): void {
        const priorities = new Float64Array(this.priorities.length * 2);
        const values = new Int32Array(this.values.length * 2);
        priorities.set(this.priorities);
        values.set(this.values);
        this.priorities = priorities;
        this.values = values;
    }

    private swap(a: number, b: number): void {
        const priority = this.priorities[a];
        const value = this.values[a];
        this.priorities[a] = this.priorities[b];
        this.values[a] = this.values[b];
        this.priorities[b] = priority;
        this.values[b] = value;
    }

    private bubbleUp(index: number): void {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.priorities[parent] <= this.priorities[index]) {
                break;
            }
            this.swap(parent, index);
            index = parent;
        }
    }

    private bubbleDown(index: number): void {
        for (;;) {
            const left = index * 2 + 1;
            const right = index * 2 + 2;
            let smallest = index;

            if (left < this.length && this.priorities[left] < this.priorities[smallest]) {
                smallest = left;
            }
            if (right < this.length && this.priorities[right] < this.priorities[smallest]) {
                smallest = right;
            }
            if (smallest === index) {
                break;
            }

            this.swap(smallest, index);
            index = smallest;
        }
    }
}

export class MinHeap<T> {
    private readonly heap: { priority: number; value: T }[] = [];

    get size(): number {
        return this.heap.length;
    }

    push(priority: number, value: T): void {
        this.heap.push({ priority, value });
        this.bubbleUp(this.heap.length - 1);
    }

    pop(): T | undefined {
        const top = this.heap[0];
        const last = this.heap.pop();

        if (this.heap.length > 0 && last !== undefined) {
            this.heap[0] = last;
            this.bubbleDown(0);
        }

        return top?.value;
    }

    private bubbleUp(index: number): void {
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.heap[parent].priority <= this.heap[index].priority) {
                break;
            }
            [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
            index = parent;
        }
    }

    private bubbleDown(index: number): void {
        const length = this.heap.length;

        while (true) {
            const left = index * 2 + 1;
            const right = index * 2 + 2;
            let smallest = index;

            if (left < length && this.heap[left].priority < this.heap[smallest].priority) {
                smallest = left;
            }
            if (right < length && this.heap[right].priority < this.heap[smallest].priority) {
                smallest = right;
            }
            if (smallest === index) {
                break;
            }

            [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
            index = smallest;
        }
    }
}
