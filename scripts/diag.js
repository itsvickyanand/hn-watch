// diag.js — reproduce the app's claude -p call OUTSIDE Electron, and write the
// full result to /tmp/hn-diag.txt so we can see the real error.
//
// Run from YOUR terminal:   node scripts/diag.js
const fs = require('fs');
const { spawn } = require('child_process');

const OUT = '/tmp/hn-diag.txt';
const lines = [];
const log = (...a) => {
  const s = a.join(' ');
  lines.push(s);
  console.log(s);
};

log('=== HN Watch diagnostic ===');
log('node:', process.version);
log('PATH:', process.env.PATH);
log('ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);

// 1) Can we even find the claude binary this process sees?
const which = spawn('/bin/sh', ['-c', 'command -v claude || echo NOT_FOUND']);
let whichOut = '';
which.stdout.on('data', (d) => (whichOut += d));
which.on('close', () => {
  log('claude resolved to:', whichOut.trim());

  // 2) Run the exact same invocation the app uses.
  log('\n--- running: claude -p --output-format json ---');
  const child = spawn('claude', ['-p', '--output-format', 'json'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  child.on('error', (e) => {
    log('SPAWN ERROR:', e.message);
    fs.writeFileSync(OUT, lines.join('\n'));
  });
  child.on('close', (code) => {
    log('exit code:', code);
    log('stderr:', err.slice(0, 500));
    log('stdout (first 800 chars):', out.slice(0, 800));
    try {
      const j = JSON.parse(out);
      log('\nPARSED -> is_error:', j.is_error, '| result:', JSON.stringify(j.result));
    } catch {
      log('\n(could not parse stdout as JSON)');
    }
    fs.writeFileSync(OUT, lines.join('\n'));
    log('\nwrote', OUT);
  });
  child.stdin.write('Reply with exactly the word: PONG');
  child.stdin.end();
});
