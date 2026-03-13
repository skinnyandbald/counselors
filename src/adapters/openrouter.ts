import type { Invocation, RunRequest } from '../types.js';
import { BaseAdapter } from './base.js';

export class OpenRouterAdapter extends BaseAdapter {
  id = 'openrouter';
  displayName = 'OpenRouter';
  commands = ['openrouter-agent'];
  installUrl =
    'https://github.com/skinnyandbald/counselors#using-openrouter-single-api-key-for-all-models';
  readOnly = { level: 'enforced' as const };
  modelFlag = '--model';
  models = [
    {
      id: 'claude-opus',
      name: 'Claude Opus 4 — most capable (Anthropic)',
      recommended: true,
      compoundId: 'or-claude-opus',
      extraFlags: ['--model', 'anthropic/claude-opus-4'],
    },
    {
      id: 'gemini-3.1-pro',
      name: 'Gemini 3.1 Pro — fast and capable (Google)',
      recommended: true,
      compoundId: 'or-gemini-3.1-pro',
      extraFlags: ['--model', 'google/gemini-3.1-pro-preview'],
    },
    {
      id: 'codex-5.4',
      name: 'Codex 5.4 / GPT-5.4 — latest reasoning model (OpenAI)',
      recommended: true,
      compoundId: 'or-codex-5.4',
      extraFlags: ['--model', 'openai/gpt-5.4'],
    },
    {
      id: 'claude-sonnet',
      name: 'Claude Sonnet 4 — fast and capable (Anthropic)',
      compoundId: 'or-claude-sonnet',
      extraFlags: ['--model', 'anthropic/claude-sonnet-4'],
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o — fast multimodal (OpenAI)',
      compoundId: 'or-gpt-4o',
      extraFlags: ['--model', 'openai/gpt-4o'],
    },
    {
      id: 'llama-4-maverick',
      name: 'Llama 4 Maverick — open source (Meta)',
      compoundId: 'or-llama-4-maverick',
      extraFlags: ['--model', 'meta-llama/llama-4-maverick'],
    },
  ];

  buildInvocation(req: RunRequest): Invocation {
    const args: string[] = [];

    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }

    return {
      cmd: req.binary ?? 'openrouter-agent',
      args,
      stdin: req.prompt,
      cwd: req.cwd,
    };
  }
}
