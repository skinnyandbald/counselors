#!/usr/bin/env node
// openrouter-agent — cross-platform Node.js wrapper for OpenRouter API
//
// Reads a prompt from stdin, sends it to OpenRouter's API, and prints the response.
// Use this with counselors' custom adapter to access 200+ models via a single API key.
//
// Usage:
//   echo "prompt" | openrouter-agent --model anthropic/claude-sonnet-4
//
// Requires:
//   - OPENROUTER_API_KEY in environment (get one at https://openrouter.ai/keys)
//   - Node.js 20+ (uses built-in fetch)

// Parse --model flag from argv (supports --model foo and --model=foo)
let model = '';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--model' && args[i + 1]) {
    model = args[i + 1];
    i++;
  } else if (args[i].startsWith('--model=')) {
    model = args[i].slice('--model='.length);
  }
}

if (!model) {
  process.stderr.write('Error: --model is required\n');
  process.exit(1);
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  process.stderr.write('Error: OPENROUTER_API_KEY not set\n');
  process.exit(1);
}

// Read full prompt from stdin (pipe mode — works cross-platform, no readline)
async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const prompt = await readStdin();

  if (!prompt.trim()) {
    process.stderr.write('Error: no prompt received on stdin\n');
    process.exit(1);
  }

  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'counselors',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 16384,
      }),
    });
  } catch (err) {
    process.stderr.write(`Error: fetch failed — ${err.message}\n`);
    process.exit(1);
  }

  let body;
  try {
    body = await response.json();
  } catch (err) {
    process.stderr.write(`Error: failed to parse response JSON — ${err.message}\n`);
    process.exit(1);
  }

  if (!response.ok) {
    process.stderr.write(`Error: OpenRouter returned HTTP ${response.status}\n`);
    process.stderr.write(JSON.stringify(body, null, 2) + '\n');
    process.exit(1);
  }

  const choices = body?.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    process.stderr.write('Error: no choices in response\n');
    process.stderr.write(JSON.stringify(body, null, 2) + '\n');
    process.exit(1);
  }

  const content = choices[0]?.message?.content;
  if (typeof content !== 'string') {
    process.stderr.write('Error: unexpected response shape — missing choices[0].message.content\n');
    process.stderr.write(JSON.stringify(body, null, 2) + '\n');
    process.exit(1);
  }

  process.stdout.write(content + '\n');
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
