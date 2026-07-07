// swarm.js — the "dig deeper" research swarm.
//
// One feed item -> several `claude -p` agents launched AT THE SAME TIME, each
// told to study the story from a different angle. Their text streams live to
// the UI; when all finish, a final `claude -p` call stitches them into one
// combined brief.
//
// This is the "many at once" workload. Note it uses the exact same runClaude()
// queue as the monitors, so the shared concurrency gate throttles it too.
//
// Events (forwarded to the UI by main.js):
//   'agent-start' { swarmId, agentId, angle }
//   'agent-chunk' { swarmId, agentId, text }     // live streaming text
//   'agent-done'  { swarmId, agentId }
//   'brief'       { swarmId, text }               // final combined brief
//   'error'       { swarmId, message }

const { EventEmitter } = require('events');
const { runClaude } = require('./claude');

// The angles each agent investigates. Add/remove freely — the swarm size
// simply follows this list.
const ANGLES = [
  {
    id: 'what',
    angle: 'What & who',
    instruction:
      'Explain what this is and who is behind it. What actually happened or was announced?',
  },
  {
    id: 'competition',
    angle: 'Landscape',
    instruction:
      'Who are the competitors or prior art? Is this crowded, novel, or incremental?',
  },
  {
    id: 'skeptic',
    angle: 'Skeptic',
    instruction:
      'Play devil’s advocate. What are the risks, weaknesses, or reasons for skepticism?',
  },
  {
    id: 'why',
    angle: 'Why it matters',
    instruction:
      'Why might this matter, and to whom? What is the significance or likely impact?',
  },
];

class SwarmManager extends EventEmitter {
  constructor() {
    super();
    this.counter = 0;
  }

  // Kick off a swarm for one feed item. Returns a swarmId immediately; work
  // continues in the background and is reported via events.
  start(story) {
    const swarmId = `swarm-${++this.counter}`;
    this.run(swarmId, story); // fire and forget
    return { swarmId, angles: ANGLES.map((a) => ({ id: a.id, angle: a.angle })) };
  }

  async run(swarmId, story) {
    const context = `Story: "${story.title}"
URL: ${story.url}
Points: ${story.points ?? 0}, Comments: ${story.comments ?? 0}
${story.summary ? `Prior summary: ${story.summary}` : ''}`;

    // Launch all agents at once. Each resolves to its finished text.
    const agentRuns = ANGLES.map((a) => this.runAgent(swarmId, a, context));
    const results = await Promise.allSettled(agentRuns);

    // Collect whatever succeeded for the synthesis step.
    const findings = results
      .map((r, i) =>
        r.status === 'fulfilled'
          ? `## ${ANGLES[i].angle}\n${r.value}`
          : `## ${ANGLES[i].angle}\n(failed: ${r.reason?.message || 'error'})`
      )
      .join('\n\n');

    try {
      const brief = await this.synthesize(story, findings);
      this.emit('brief', { swarmId, text: brief });
    } catch (err) {
      this.emit('error', { swarmId, message: err.message });
    }
  }

  // One streaming agent for one angle.
  async runAgent(swarmId, angle, context) {
    this.emit('agent-start', { swarmId, agentId: angle.id, angle: angle.angle });
    const prompt = `You are a research analyst investigating a Hacker News story
from ONE specific angle.

${context}

Your angle — ${angle.angle}: ${angle.instruction}

Write 2–4 tight sentences from this angle only. Be concrete. No preamble.`;

    const text = await runClaude(prompt, {
      stream: true,
      label: `${swarmId}/${angle.id}`,
      onChunk: (chunk) =>
        this.emit('agent-chunk', { swarmId, agentId: angle.id, text: chunk }),
    });
    this.emit('agent-done', { swarmId, agentId: angle.id });
    return text;
  }

  // Final call: merge the angle findings into one brief.
  async synthesize(story, findings) {
    const prompt = `Combine these research notes about a Hacker News story into
one short brief (a punchy title line, then 4–6 bullet points). Be specific and
non-repetitive.

Story: "${story.title}"

Notes:
${findings}`;
    return runClaude(prompt); // non-streaming, still through the shared queue
  }
}

module.exports = { SwarmManager, ANGLES };
