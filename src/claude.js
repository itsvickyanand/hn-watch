// claude.js — the ONE place that runs `claude -p`, plus a shared queue.
//
// Why a queue?  Two very different callers use this file:
//   • monitors — one call every few minutes (calm, steady)
//   • the swarm — several calls fired at the same instant (bursty)
// If both hit at once we could spawn a dozen `claude` processes and melt the
// laptop. So every call goes through ONE gate that runs at most MAX_CONCURRENT
// at a time; anything extra waits in a FIFO line. This is the single knob that
// keeps the "one per tick" and "many at once" workloads from fighting.

const { spawn } = require('child_process');

const MAX_CONCURRENT = 3; // how many `claude -p` processes may run simultaneously

let running = 0;
const queue = []; // pending jobs waiting for a free slot

// Public entry point. Returns a promise for the final text answer.
//   opts.stream   — if true, use streaming output and call opts.onChunk(text)
//   opts.onChunk  — called with incremental text as it arrives (swarm live view)
//   opts.label    — a human name for logs / the live view
function runClaude(prompt, opts = {}) {
  return new Promise((resolve, reject) => {
    queue.push({ prompt, opts, resolve, reject });
    pump();
  });
}

// Start as many queued jobs as our concurrency budget allows.
function pump() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    running++;
    execJob(job).finally(() => {
      running--;
      pump(); // a slot freed up — try to start the next waiting job
    });
  }
}

// Actually spawn one `claude -p` process for a single job.
// Returns a promise that settles when the process finishes (so pump() can free
// the slot). The caller's result is delivered via the job's resolve/reject;
// `done()` just signals "slot free" to the queue.
function execJob(job) {
  return new Promise((done) => runOne(job, done));
}

function runOne({ prompt, opts, resolve, reject }, done) {
  const stream = !!opts.stream;

  // stream-json gives us live events; plain json gives one final envelope.
  const args = stream
    ? ['-p', '--output-format', 'stream-json', '--verbose']
    : ['-p', '--output-format', 'json'];

  const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });

  let stdout = '';
  let stderr = '';
  let finalText = '';
  let carry = ''; // buffer for partial NDJSON lines while streaming

  child.stdout.on('data', (buf) => {
    stdout += buf.toString();
    if (stream) handleStreamChunk(buf.toString());
  });
  child.stderr.on('data', (buf) => (stderr += buf.toString()));

  // Parse streaming NDJSON: one JSON object per line.
  function handleStreamChunk(text) {
    carry += text;
    const lines = carry.split('\n');
    carry = lines.pop(); // last piece may be incomplete; keep it for next time
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt;
      try {
        evt = JSON.parse(trimmed);
      } catch {
        continue; // ignore non-JSON noise
      }
      // Assistant text arrives inside message.content[].text
      if (evt.type === 'assistant' && evt.message?.content) {
        for (const part of evt.message.content) {
          if (part.type === 'text' && part.text) {
            finalText += part.text;
            opts.onChunk?.(part.text);
          }
        }
      }
      // The final result event is authoritative for the complete answer.
      if (evt.type === 'result' && typeof evt.result === 'string') {
        finalText = evt.result;
      }
    }
  }

  child.on('error', (err) => {
    // e.g. `claude` isn't installed / not on PATH
    reject(new Error(`Could not start claude: ${err.message}`));
    done();
  });

  child.on('close', (code) => {
    if (stream) {
      resolve(finalText.trim());
      return done();
    }
    // Non-streaming: parse the single JSON envelope.
    try {
      const env = JSON.parse(stdout);
      if (env.is_error) {
        // e.g. "Not logged in · Please run /login" — surface it, don't crash.
        reject(new Error(env.result || 'claude returned an error'));
      } else {
        resolve((env.result || '').trim());
      }
    } catch {
      reject(
        new Error(
          `claude exited ${code} with unparseable output. stderr: ${stderr.slice(0, 200)}`
        )
      );
    }
    done();
  });

  // Feed the prompt in via stdin (safer than the command line for long text).
  child.stdin.write(prompt);
  child.stdin.end();
}

module.exports = { runClaude, MAX_CONCURRENT };
