
A thread pool to schedule work on top on Node.js `worker_threads`. This module spawns the requested number of threads. Work can be dispatched to the worker threads.
Use this if you need to run heavy CPU bound work. Running such work on the main Node.js would block the event loop. With this module, the main thread does the IO and
load balancing functions while threads do the heavy CPU bound work.

```ts
import {Pool} from 'thread-pool';

const pool = new Pool({
  size: 5,
  filename: path.join(__dirname, 'fib.js')
});

///...

// fibonacci service. GET localhost:8080/fib/32
app.get('/fib/:n', wrap(async (req, res) => {
  const n = req.params.n;
  const result = await pool.run('fib', n);  // calls fib(n) on a worker thread.
  res.end(`worker responded with fib(${n}) = ${result.result}. Timings: ${util.inspect(result.timings)}`);
}));

```
