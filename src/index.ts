import {Worker} from 'worker_threads';
import * as path from 'path';
import { worker } from 'cluster';

type Microseconds = number;

interface WorkerWithName extends Worker {
  name?: number;
}

function now(): Microseconds {
  const [sec, nsec] = process.hrtime();
  return (sec * 1e6) + (nsec / 1e3);
}

export interface PoolOptions {
  filename: string;
  size?: number;
  // TODO: maxQueue
}

export interface WorkerMessage {
  functionName: string;
  args: any[];
}

interface Work {
  packet: WorkerMessage;
  id?: number;
  resolve: Function;
  reject: Function;
  queueTime: Microseconds
}

interface Result {
  // The result produced by the invoked function on the worker.
  result: any;
  timings: {
    // Amount of time waiting for a worker to be available.
    queue: Microseconds;
    // Amount of time spent running the work on the worker.
    run: Microseconds;
  }
}

export class ThreadQueue {
  private filename: string;
  private size: number;

  private workers: WorkerWithName[];
  private available: WorkerWithName[];
  private workQueue: Work[];

  constructor(opts: PoolOptions) {
    if (!opts.filename) throw new Error('opts.filename must be provided');

    this.filename = opts.filename;
    this.size = opts.size || 1;
    
    this.workers = [];
    this.available = [];
    this.workQueue = [];

    for (let i = 0; i < this.size; ++i) {
      const worker = new Worker(path.join(__dirname, 'worker.js'), {
        workerData: {
          workerName: i,
          filename: this.filename
        }
      }) as WorkerWithName;

      worker.name = i;
      this.workers.push(worker);
      this.available.push(worker);
    }
  }

  // TODO: maybe queue is a better name for this.
  queue(functionName: string, ...args: any[]) {
    const queueTime = now();

    return new Promise((resolve, reject) => {
      const work: Work = {
        packet: {
          functionName,
          args,
        },
        resolve,
        reject,
        queueTime: queueTime,
      };
      // TODO: create an async hooks AsyncResource for the work.
      this.workQueue.push(work);
      this.turn();
    });
  }

  private turn(): void {
    // Return if nothing to do.
    if (this.workQueue.length === 0) return;

    // Return if no workers available. Another turn will happen once a worker
    // is available.
    if (this.available.length === 0) return;

    // We have work and worker to run it on.
    const work = this.workQueue.shift()!;  // FIFO.
    const worker = this.available.pop()!;  // LIFO for warm CPU caches?

    const dequeTime = now();

    worker.postMessage(work.packet);
    // TODO: assert that there are no listeners on 'message'.
    worker.once('message', message => {
      const doneTime = now();

      this.available.push(worker);
      // TODO: perhaps queueMicrotask is better for this. We don't want IO to
      // starve the queue.
      setImmediate(() => { this.turn(); });

      const timings = {
        queue: dequeTime - work.queueTime,
        run: doneTime - dequeTime
      };

      work.resolve({
        result: message,
        timings
      })
    });
  }
}
