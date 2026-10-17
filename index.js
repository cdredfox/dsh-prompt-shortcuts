/**
 * Host half of the prompt-shortcuts bundle.
 *
 * Owns the durable shortcut list as one JSON document under `$DSH_HOME`, and
 * serves it to the Client half over a Connection RPC channel.
 *
 * Storage deliberately lives here rather than in the browser: `localStorage` is
 * cleared along with site data, so saved prompts would silently disappear.
 * The document path follows DSH's own convention so it survives browser changes
 * and can be backed up or version-controlled with the rest of the profile.
 *
 * Writes are atomic (temp file then rename) and serialized, so an interrupted
 * write cannot leave a truncated document behind and two concurrent saves
 * cannot lose each other's edits.
 */
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** Absolute path of the plugin's own browser-facing endpoint. */
const ROUTE_PATH = '/api/dsh-prompt-shortcuts';

/** Upper bound on a request body, so one call cannot exhaust memory. */
const MAX_BODY_BYTES = 1024 * 1024;

/** Longest accepted button label, matching the Client half's input limit. */
const MAX_LABEL = 24;

/** Seed list used when no document exists yet. */
const SEED = [
  { id: 'seed-continue', label: '继续', prompt: '继续', enabled: true },
  { id: 'seed-suggest', label: '建议', prompt: '给我下一步的建议', enabled: true },
  { id: 'seed-accept', label: '采纳', prompt: '按你的建议继续', enabled: true },
];

/** @returns a fresh, collision-resistant shortcut id. */
function newId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalize one stored or submitted record.
 * @returns `{ value }` when usable, otherwise `{ error }` naming the problem.
 */
function normalizeEntry(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: `第 ${index + 1} 条不是对象。` };
  }
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
  if (label === '') return { error: `第 ${index + 1} 条缺少名称。` };
  if (prompt.trim() === '') return { error: `第 ${index + 1} 条「${label}」缺少提示词内容。` };
  return {
    value: {
      id: typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id : newId(),
      label: label.slice(0, MAX_LABEL),
      prompt,
      enabled: raw.enabled !== false,
    },
  };
}

/**
 * Coerce a parsed document into a valid list.
 * Unusable records are dropped instead of failing the whole read, so one bad
 * hand-edit cannot take the composer row down.
 * @param parsed - value read from the JSON document.
 * @returns the normalized list.
 */
function normalizeDocument(parsed) {
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.shortcuts) ? parsed.shortcuts : [];
  const out = [];
  for (const [index, raw] of list.entries()) {
    const result = normalizeEntry(raw, index);
    if (result.value) out.push(result.value);
  }
  return out;
}

/**
 * Serialized, atomic JSON document holding the shortcut list.
 */
class ShortcutStore {
  /** @param file - absolute path of the JSON document this store owns. */
  constructor(file) {
    this.file = file;
    /** Tail of the mutation queue; always resolves so one failure cannot stall later writes. */
    this.queue = Promise.resolve();
  }

  /** Read the document, seeding it on first run. @returns the normalized list. */
  async read() {
    let text;
    try {
      text = await readFile(this.file, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const seeded = SEED.map((entry) => ({ ...entry }));
      await this.write(seeded);
      return seeded;
    }
    try {
      return normalizeDocument(JSON.parse(text));
    } catch {
      // A corrupt document must not break the row; the next write repairs it.
      return [];
    }
  }

  /**
   * Replace the document atomically.
   * @param shortcuts - already-normalized list to persist.
   */
  async write(shortcuts) {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify({ shortcuts }, null, 2)}\n`, 'utf8');
      await rename(temp, this.file);
    } catch (error) {
      await unlink(temp).catch(() => {});
      throw error;
    }
  }

  /**
   * Run one read-modify-write against the document without interleaving.
   * @param operation - receives the current list and returns the next one plus a result.
   * @returns the operation's result.
   */
  mutate(operation) {
    const run = this.queue.then(async () => {
      const current = await this.read();
      const { next, result } = await operation(current);
      if (next) await this.write(next);
      return result;
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

/**
 * Build the store, register the RPC channel, and expose an agent tool.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin row configuration.
 */
export function apply(ctx, config = {}) {
  const home = config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh');
  const file = config.file ?? join(home, 'prompt-shortcuts.json');
  const store = new ShortcutStore(file);

  /** The one implementation both the Client half and the agent tool call. */
  const service = {
    /** @returns the current list plus the backing path for display. */
    list: async () => ({ ok: true, shortcuts: await store.read(), file }),
    /** Create or update one shortcut. */
    save: (input) =>
      store.mutate((current) => {
        const normalized = normalizeEntry({ ...input, id: input?.id ?? newId() }, 0);
        if (normalized.error) return { result: { ok: false, error: normalized.error } };
        const index = current.findIndex((entry) => entry.id === normalized.value.id);
        const next = current.slice();
        if (index >= 0) next[index] = normalized.value;
        else next.push(normalized.value);
        return { next, result: { ok: true, shortcut: normalized.value, shortcuts: next } };
      }),
    /** Remove one shortcut by id. */
    remove: (id) =>
      store.mutate((current) => {
        const next = current.filter((entry) => entry.id !== id);
        if (next.length === current.length) return { result: { ok: false, error: `未找到 id 为 ${id} 的提示词。` } };
        return { next, result: { ok: true, shortcuts: next } };
      }),
    /** Replace the whole list; used by the maintenance panel's save. */
    replaceAll: (shortcuts) =>
      store.mutate(() => {
        if (!Array.isArray(shortcuts)) return { result: { ok: false, error: 'shortcuts 必须是数组。' } };
        const next = [];
        for (const [index, raw] of shortcuts.entries()) {
          const normalized = normalizeEntry(raw, index);
          if (normalized.error) return { result: { ok: false, error: normalized.error } };
          next.push(normalized.value);
        }
        return { next, result: { ok: true, shortcuts: next } };
      }),
  };

  ctx.effect(() =>
    ctx.provide('promptShortcuts', {
      ...service,
      /** @returns the backing document path. */
      file: () => file,
    }),
  );

  /*
   * Browser-facing endpoint. A plain webServer route is used rather than
   * connection.rpc because this plugin owns one fixed path, and an exact route
   * is verifiable end to end with curl. The route waits for the web server
   * through ctx.inject, which runs once the service is live.
   */
  ctx.inject(['webServer'], (wsCtx) => {
    const server = wsCtx.webServer;
    if (!server || typeof server.register !== 'function') return;

    wsCtx.effect(() =>
      server.register({
        kind: 'exact',
        path: ROUTE_PATH,
        handler: async (req, res) => {
          const reply = (status, body) => {
            const text = JSON.stringify(body);
            res.writeHead(status, {
              'content-type': 'application/json; charset=utf-8',
              'content-length': Buffer.byteLength(text),
              'cache-control': 'no-store',
            });
            res.end(text);
          };

          if (req.method !== 'POST') {
            res.setHeader('allow', 'POST');
            reply(405, { ok: false, error: '仅支持 POST。' });
            return;
          }

          // Read the body with a hard size cap so one request cannot exhaust memory.
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              reply(413, { ok: false, error: '请求体过大。' });
              return;
            }
            chunks.push(chunk);
          }

          let body;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          } catch {
            reply(400, { ok: false, error: '请求体不是合法 JSON。' });
            return;
          }

          try {
            switch (body?.action) {
              case 'list':
                reply(200, await service.list());
                return;
              case 'replaceAll':
                reply(200, await service.replaceAll(body?.shortcuts));
                return;
              default:
                reply(400, { ok: false, error: `未知操作：${String(body?.action)}` });
                return;
            }
          } catch (error) {
            reply(500, { ok: false, error: String(error?.message ?? error) });
          }
        },
      }),
    );
  });

  // Same deferred-registration reason as the RPC channel: the tools registry
  // may not be live yet when this plugin activates.
  ctx.inject(['tools'], (toolsCtx) => {
    const tools = toolsCtx.tools;
    if (!tools) return;

    toolsCtx.effect(() =>
      tools.register({
      name: 'prompt_shortcuts',
      description:
        'Manage the saved prompt shortcuts that appear as buttons above the composer. ' +
        'Actions: list (read all), save (create or update one by id), remove (delete one).',
      parameters: {
        action: {
          type: 'string',
          enum: ['list', 'save', 'remove'],
          description: 'Operation to perform.',
          required: true,
        },
        id: { type: 'string', description: 'Shortcut id; required for remove, optional for save (omit to create).' },
        label: { type: 'string', description: 'Button text, at most 24 characters; required when creating.' },
        prompt: { type: 'string', description: 'Text inserted into the composer when the button is clicked.' },
        enabled: { type: 'boolean', description: 'Whether the button shows in the composer row.' },
      },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      execute: async (args) => {
        switch (args.action) {
          case 'list':
            return service.list();
          case 'save':
            return service.save({ id: args.id, label: args.label, prompt: args.prompt, enabled: args.enabled });
          case 'remove':
            if (!args.id) return { ok: false, error: 'remove 需要 id。' };
            return service.remove(args.id);
          default:
            return { ok: false, error: `未知操作：${String(args.action)}` };
        }
      },
      }),
    );
  });
}
