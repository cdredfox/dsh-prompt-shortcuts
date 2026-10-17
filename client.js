/**
 * Client half of the prompt-shortcuts bundle.
 *
 * Registers two things:
 *   1. the shortcut button row in `conversation.input.dock` — the full-width
 *      seat above the composer card — whose buttons fill the composer draft;
 *   2. a floating maintenance panel opened by the row's trailing 设置 entry.
 *
 * The shortcut list is browser-owned state persisted through the shared
 * Client store engine, so it survives reloads without a Host round trip.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-prompt-shortcuts',
  factory(require) {
    const React = require('react');
    const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store');
    const h = React.createElement;

    const STORAGE_KEY = 'dsh-prompt-shortcuts/v1';
    const MAX_LABEL = 24;

    /** Seed list: gives the row something useful before the first edit. */
    function seed() {
      return [
        { id: 'seed-summarize', label: '总结', prompt: '请总结一下我们刚才讨论的内容要点。', enabled: true },
        { id: 'seed-continue', label: '继续', prompt: '请继续。', enabled: true },
        { id: 'seed-review', label: '代码审查', prompt: '请审查最近的改动，指出问题并给出修改建议。', enabled: true },
      ];
    }

    /** @returns a fresh id for a new shortcut. */
    function newId() {
      return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Normalize one record.
     * @returns the clean shortcut, or null when it lacks a label or body.
     */
    function normalize(raw) {
      if (raw === null || typeof raw !== 'object') return null;
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
      if (label === '' || prompt.trim() === '') return null;
      return {
        id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId(),
        label: label.slice(0, MAX_LABEL),
        prompt,
        enabled: raw.enabled !== false,
      };
    }

    /** Coerce an arbitrary parsed value into a clean list, seeding when empty. */
    function normalizeList(value) {
      const list = Array.isArray(value) ? value : [];
      const out = [];
      for (const raw of list) {
        const entry = normalize(raw);
        if (entry) out.push(entry);
      }
      return out.length > 0 ? out : seed();
    }

    /**
     * Create the shortcut store, persisted under one localStorage key.
     * Persistence rehydrates in the constructor, so the document is normalized
     * once afterwards to drop records that predate current validation.
     * @returns the snapshot store.
     */
    function createStore() {
      const store = createSnapshotStore(normalizeList(undefined), { persist: { name: STORAGE_KEY } });
      store.set(normalizeList(store.getSnapshot()));
      return store;
    }

    /**
     * Track one snapshot store's current value.
     * @param store - the snapshot store to observe.
     * @returns the current value, re-rendered on every change.
     */
    function useSnapshot(store) {
      const [value, setValue] = React.useState(() => store.getSnapshot());
      React.useEffect(
        () => store.subscribe(() => setValue(store.getSnapshot())),
        [store],
      );
      return value;
    }

    const CSS = `
/*
 * Docks in this slot are calibrated against the composer card, which is
 * centered at --dsh-composer-card-max-width inside a full-width seat. Without
 * the same width, max-width, auto margins, and inset padding the row stretches
 * edge to edge and visually detaches from the card below it.
 */
.ps-row {
  box-sizing: border-box;
  display: flex; flex-wrap: nowrap; align-items: center; gap: 6px;
  position: relative;
  width: calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));
  max-width: calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));
  margin: 0 auto;
  padding: 0 var(--dsh-composer-dock-inset);
  flex: none;
}
/*
 * Offscreen copies used only to measure chip widths. They must keep real layout
 * metrics (so text and padding render identically) while occupying no space:
 * the wrapper is taken out of flow entirely and clamped to zero width, or its
 * intrinsic width would otherwise squeeze the real chips beside it.
 */
.ps-probe {
  position: absolute; top: 0; left: 0;
  display: flex; gap: 6px;
  width: 0; height: 0; overflow: hidden;
  flex: none;
  visibility: hidden; pointer-events: none;
}
.ps-probe > .ps-chip { flex: none; }
/*
 * The row borrows the composer card's own surface language rather than
 * inventing one: a solid fill, no hard border (the elevation's 0.5px spread
 * IS the hairline stroke), a soft drop shadow, and a radius well short of the
 * card's pill-shaped 28px so the buttons read as smaller siblings, not peers.
 */
.ps-chip {
  display: inline-flex; align-items: center; gap: 5px; max-width: 220px;
  box-sizing: border-box;
  padding: 4px 11px; border-radius: var(--dsw-radius-md, 12px); cursor: pointer;
  font: inherit; font-size: 13px; line-height: 18px; white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-base));
  border: 0;
  box-shadow: var(--dsw-elevation-soft);
  transition: color 120ms ease, box-shadow 120ms ease;
}
.ps-chip > .ps-chip-label { overflow: hidden; text-overflow: ellipsis; }
.ps-chip:hover {
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 .5px var(--dsw-alias-border-l2), 0 4px 16px 0 rgba(0, 0, 0, .06);
}
.ps-chip:active { transform: translateY(.5px); }
.ps-chip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

/* The settings seat stays deliberately quieter than the prompts it follows. */
.ps-gear {
  display: inline-flex; align-items: center; gap: 5px;
  box-sizing: border-box;
  padding: 4px 11px; border-radius: var(--dsw-radius-md, 12px); cursor: pointer;
  font: inherit; font-size: 13px; line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0;
  box-shadow: 0 0 0 .5px var(--dsw-alias-border-l1);
  transition: color 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.ps-gear:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-base));
  box-shadow: var(--dsw-elevation-soft);
}
.ps-gear:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

/*
 * The trailing controls sit at the far end, away from the prompt buttons. The
 * auto margin belongs to the first of them so both travel together: 更多 is
 * pushed right and 添加指令 follows immediately after it. Neither may shrink —
 * a squeezed control wraps its own label and makes the row taller, which is the
 * very overflow this row is meant to avoid.
 */
.ps-gear-end { margin-left: auto; }
.ps-gear[data-ps-trailing] { flex: none; }

/* Badge counting the prompts that are kept out of the row. */
.ps-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box;
  border-radius: 999px;
  font-size: 11px; line-height: 1;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}

/*
 * 更多 opens a menu rather than a dialog: it picks one value and closes, so a
 * light anchored surface fits better than a modal that would cover the composer.
 * It is absolutely positioned against the row, which is the anchored ancestor.
 */
.ps-menu {
  position: absolute; z-index: 40;
  top: calc(100% - 2px); right: 0;
  min-width: 240px; max-width: min(420px, 90vw); max-height: 280px; overflow: auto;
  padding: 4px; box-sizing: border-box;
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-overlay));
  border: 0;
  box-shadow: 0 0 0 .5px var(--dsw-alias-border-l2), 0 8px 28px rgba(0, 0, 0, .16);
}
.ps-menu-item {
  display: flex; flex-direction: column; gap: 1px; width: 100%;
  box-sizing: border-box; padding: 7px 9px;
  border-radius: var(--dsw-radius-sm, 8px); cursor: pointer; text-align: left;
  font: inherit;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 0;
}
.ps-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05)); }
.ps-menu-item:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -1px; }
.ps-menu-label { font-size: 13px; font-weight: 500; line-height: 18px; }
.ps-menu-body {
  font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
.ps-menu-empty { padding: 14px 9px; font-size: 12px; color: var(--dsw-alias-label-secondary); text-align: center; }
/* Menu header row: label on the left, close control on the right. */
.ps-menu-head {
  display: flex; align-items: center; gap: 8px;
  padding: 2px 4px 6px 9px; margin-bottom: 2px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.ps-menu-title { flex: 1; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.ps-menu-close {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: var(--dsw-radius-sm, 8px); cursor: pointer;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0;
  transition: color 120ms ease, background 120ms ease;
}
.ps-menu-close:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05));
}
.ps-menu-close:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

/* Icons inherit text color so one drawing serves every state and theme. */
.ps-ico { display: block; flex: none; }
.ps-empty { font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 4px 2px; }
.ps-backdrop {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(0, 0, 0, 0.35);
  display: flex; align-items: center; justify-content: center;
}
.ps-panel {
  display: flex; flex-direction: column;
  width: min(900px, 92vw); max-height: 82vh;
  border-radius: var(--dsw-radius-panel, 28px); padding: 20px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-overlay));
  border: 0;
  box-shadow: 0 0 0 .5px var(--dsw-alias-border-l2), 0 16px 48px rgba(0, 0, 0, .18);
}
.ps-title { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
.ps-hint { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 0; }

/* Header: the copy block, with the close control pinned to the top right. */
.ps-head-row { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.ps-head-text { flex: 1; min-width: 0; }
.ps-head-text .ps-hint { margin-bottom: 0; }
.ps-close {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: var(--dsw-radius-sm, 8px); cursor: pointer;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0;
  transition: color 120ms ease, background 120ms ease;
}
.ps-close:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05));
}
.ps-close:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

/* Header: search field plus the create action. */
.ps-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; flex: none; }
.ps-search {
  flex: 1; box-sizing: border-box; font: inherit; font-size: 13px;
  padding: 8px 12px; border-radius: var(--dsw-radius-md, 12px);
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 0;
  box-shadow: 0 0 0 .5px var(--dsw-alias-border-l2);
}
.ps-search::placeholder { color: var(--dsw-alias-label-secondary); }
.ps-search:focus {
  outline: none;
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary);
}
.ps-icon-btn {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: var(--dsw-radius-md, 12px); cursor: pointer;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 0;
  box-shadow: 0 0 0 .5px var(--dsw-alias-border-l2);
  transition: background 120ms ease, box-shadow 120ms ease;
}
.ps-icon-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .04));
  box-shadow: var(--dsw-elevation-soft);
}
.ps-icon-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

/* Browse state: a responsive card grid, one card per saved prompt. */
.ps-grid {
  display: grid; gap: 10px; overflow: auto; padding: 2px;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}
/*
 * White tiles need a visible edge against this white panel: DSH's soft
 * elevation gets its outline from a white card sitting on a grey page, which a
 * transparent tile here had none of. border-l2 (10% black) carries the outline,
 * and the hover shadow adds the lift.
 */
.ps-tile {
  display: flex; flex-direction: column; gap: 6px;
  box-sizing: border-box; min-height: 104px;
  padding: 12px; border-radius: var(--dsw-radius-lg, 16px); cursor: pointer; text-align: left;
  font: inherit;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-base));
  border: 0;
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2);
  transition: box-shadow 120ms ease, background 120ms ease;
}
.ps-tile:hover {
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2), 0 4px 16px 0 rgba(0, 0, 0, .07);
}
.ps-tile:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.ps-tile-head { display: flex; align-items: flex-start; gap: 6px; }
.ps-tile-label { flex: 1; font-size: 13px; font-weight: 600; line-height: 20px; }
.ps-tile-body {
  font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ps-tile-foot { display: flex; align-items: center; gap: 2px; margin-top: auto; flex-wrap: wrap; }
.ps-tile-act {
  display: inline-flex; align-items: center; gap: 3px;
  font: inherit; font-size: 12px; padding: 2px 6px; border-radius: var(--dsw-radius-sm, 8px); cursor: pointer;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0;
  transition: color 120ms ease, background 120ms ease;
}
.ps-tile-act:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05));
}
.ps-tile-act:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
/* Lit 置顶 state: this entry is one of the buttons above the composer. */
.ps-tile-act-on { color: var(--dsw-alias-brand-primary); }
.ps-tile-act-danger:hover { color: var(--dsw-alias-state-error-primary); }
.ps-confirm { display: inline-flex; align-items: center; gap: 4px; }
.ps-grid-empty {
  padding: 36px 8px; text-align: center;
  font-size: 13px; color: var(--dsw-alias-label-secondary);
}

/* Edit state: one shortcut at a time, reusing the composer's own depth cues. */
.ps-editor { display: flex; flex-direction: column; gap: 14px; overflow: auto; padding: 2px; }
.ps-field { display: flex; flex-direction: column; gap: 6px; }
.ps-field-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.ps-input, .ps-area {
  width: 100%; box-sizing: border-box; font: inherit; font-size: 13px;
  padding: 8px 12px; border-radius: var(--dsw-radius-md, 12px);
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 0;
  box-shadow: 0 0 0 .5px var(--dsw-alias-border-l2);
}
.ps-area { min-height: 150px; resize: vertical; line-height: 20px; font-family: inherit; }
.ps-input::placeholder, .ps-area::placeholder { color: var(--dsw-alias-label-secondary); }
.ps-input:focus, .ps-area:focus {
  outline: none;
  box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary);
}
.ps-grow { flex: 1; }
.ps-check {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.ps-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font: inherit; font-size: 13px; padding: 6px 14px;
  border-radius: var(--dsw-radius-md, 12px); cursor: pointer;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 0;
  box-shadow: 0 0 0 .5px var(--dsw-alias-border-l2);
  transition: background 120ms ease, box-shadow 120ms ease;
}
.ps-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .04)); }
.ps-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.ps-btn-primary {
  color: #fff; background: var(--dsw-alias-brand-primary);
  box-shadow: none;
}
.ps-btn-primary:hover { background: var(--dsw-alias-brand-primary); filter: brightness(1.08); }
.ps-btn-danger { color: var(--dsw-alias-state-error-primary); }
.ps-foot { display: flex; align-items: center; gap: 8px; margin-top: 16px; flex: none; }
.ps-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; margin: 0 0 10px; }
`;

    /*
     * Icons redraw the artwork the shipped UI uses for these exact concepts
     * (16x16 grid, 1px stroke, currentColor), inlined because the primitives
     * package is not an importable module for an installed bundle. Passing
     * currentColor keeps one drawing correct in every state and both themes.
     */
    const STROKE = 1;

    /** Build one 16x16 icon from its path descriptors. */
    function icon(paths, size) {
      return h(
        'svg',
        {
          className: 'ps-ico',
          width: size, height: size, viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: STROKE,
          'aria-hidden': 'true',
          focusable: 'false',
        },
        paths.map((p, i) => h('path', { key: i, ...p })),
      );
    }

    const IconPin = (size) =>
      icon(
        [
          {
            d: 'M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z',
            strokeLinejoin: 'round',
          },
          {
            d: 'M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z',
            fill: 'currentColor',
          },
        ],
        size,
      );

    const IconEdit = (size) =>
      icon(
        [
          {
            d: 'M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z',
            fill: 'currentColor',
            stroke: 'none',
          },
          { d: 'M7.7849 8.23878L13.888 2.13574' },
        ],
        size,
      );

    const IconTrash = (size) =>
      icon(
        [
          { d: 'M1.28149 3.88831H14.7187' },
          {
            d: 'M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833',
          },
          {
            d: 'M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831',
          },
          { d: 'M6.44946 6.98926V11.1238' },
          { d: 'M9.55054 6.98926V11.1238' },
        ],
        size,
      );

    const IconPlus = (size) => icon([{ d: 'M8 2V14' }, { d: 'M2 8H14' }], size);

    const IconChevronDown = (size) =>
      icon(
        [{ d: 'M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6' }],
        size,
      );

    // Named for the row slot it fills: a short list that opens a longer one.
    const IconMore = IconChevronDown;

    const IconClose = (size) => icon([{ d: 'M2.5 2.5L13.5 13.5' }, { d: 'M13.5 2.5L2.5 13.5' }], size);

    // The row's 添加指令 entry opens the same panel the grid's + creates in, so
    // both carry the same plus rather than a settings gear that no longer
    // describes what the button does.
    const IconAdd = IconPlus;

    /**
     * The composer-attached shortcut row.
     * @param props - the slot supplies the current session's input actions.
     */
    function ShortcutRow(props) {
      const store = props.store;
      const list = useSnapshot(store);
      const [open, setOpen] = React.useState(false);
      const [moreOpen, setMoreOpen] = React.useState(false);
      const inputActions = props.inputActions;

      const visible = list.filter((entry) => entry.enabled);

      /**
       * Replace the composer draft with one shortcut's body.
       * @param entry - the shortcut that was clicked.
       */
      const fill = (entry) => {
        if (!inputActions) return;
        // The user chose replace semantics: the draft becomes exactly the preset.
        inputActions.setDraft(entry.prompt);
        if (typeof inputActions.focus === 'function') inputActions.focus();
      };

      // Without a live session the composer stack collapses to zero height, so
      // buttons here would mount but stay invisible and unclickable. Only the
      // maintenance panel stays reachable from the blank-session Hero.
      if (!inputActions) {
        return h(
          React.Fragment,
          null,
          h(
            'div',
            { className: 'ps-row ps-row-inert' },
            h(
              'button',
              {
                type: 'button',
                className: 'ps-gear',
                title: '添加或维护快捷提示词',
                'aria-haspopup': 'dialog',
                'aria-expanded': open,
                onClick: () => setOpen(true),
              },
              IconAdd(14),
              '添加指令',
            ),
          ),
          open ? h(MaintenancePanel, { store, onClose: () => setOpen(false) }) : null,
        );
      }

      const rowRef = React.useRef(null);
      // How many pinned entries actually fit before the trailing controls.
      const [fitted, setFitted] = React.useState(visible.length);

      /*
       * Decide the row's contents from real rendered widths rather than a
       * character estimate, so mixed CJK/latin labels and font-size changes all
       * come out right. Chips are measured offscreen at their real styles, then
       * as many as fit beside 更多 + 添加指令 are kept and the rest overflow into
       * the menu. The row therefore never wraps.
       *
       * At least one chip stays on the row whenever any are pinned: a row that
       * dropped every button would hide the very thing it exists to offer.
       */
      React.useLayoutEffect(() => {
        const row = rowRef.current;
        if (!row) return undefined;

        const measure = () => {
          const style = getComputedStyle(row);
          const gap = parseFloat(style.columnGap) || 0;
          const padL = parseFloat(style.paddingLeft) || 0;
          const padR = parseFloat(style.paddingRight) || 0;
          const available = row.clientWidth - padL - padR;

          // Trailing controls keep their rendered width; measure them live.
          const trailing = row.querySelectorAll('[data-ps-trailing]');
          let trailingW = 0;
          for (const el of trailing) trailingW += el.getBoundingClientRect().width;
          if (trailing.length > 0) trailingW += gap * trailing.length;

          const probe = row.querySelector('[data-ps-probe]');
          const widths = probe
            ? [...probe.children].map((el) => el.getBoundingClientRect().width)
            : [];

          let used = 0;
          let count = 0;
          for (const w of widths) {
            const next = used + w + (count > 0 ? gap : 0);
            if (next + trailingW > available) break;
            used = next;
            count += 1;
          }
          // Keep one chip on the row whenever anything is pinned, so an
          // extremely narrow row still shows a usable button.
          if (count === 0 && widths.length > 0) count = 1;
          setFitted((prev) => (prev === count ? prev : count));
        };

        measure();
        /*
         * Watch the trailing controls as well as the row: their width changes
         * with the badge text, and the badge text changes with the fit count.
         * Observing only the row could settle one render behind, which showed
         * already-visible chips again inside 更多.
         */
        const observer = new ResizeObserver(measure);
        observer.observe(row);
        for (const el of row.querySelectorAll('[data-ps-trailing]')) observer.observe(el);
        return () => observer.disconnect();
      }, [visible.map((e) => `${e.id}:${e.label}`).join('|'), fitted]);

      const shown = visible.slice(0, fitted);
      // Everything not on the row — explicitly unpinned entries plus the ones
      // that did not fit — stays reachable through 更多.
      const overflow = visible.slice(fitted);
      const menuEntries = [...overflow, ...list.filter((entry) => !entry.enabled)];

      const chipFor = (entry, extra) =>
        h(
          'button',
          {
            key: entry.id,
            type: 'button',
            className: 'ps-chip',
            title: entry.prompt,
            onClick: () => fill(entry),
            ...extra,
          },
          h('span', { className: 'ps-chip-label' }, entry.label),
        );

      const chips = shown.map((entry) => chipFor(entry));

      if (visible.length === 0) {
        chips.push(h('span', { key: 'empty', className: 'ps-empty' }, '还没有置顶的提示词'));
      }

      const moreRef = React.useRef(null);
      const menuRef = React.useRef(null);

      // Close the popover on an outside click or Escape, the way a menu should.
      React.useEffect(() => {
        if (!moreOpen) return undefined;
        const onDown = (event) => {
          if (menuRef.current?.contains(event.target)) return;
          if (moreRef.current?.contains(event.target)) return;
          setMoreOpen(false);
        };
        const onKey = (event) => {
          if (event.key === 'Escape') setMoreOpen(false);
        };
        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
          document.removeEventListener('mousedown', onDown, true);
          document.removeEventListener('keydown', onKey, true);
        };
      }, [moreOpen]);

      chips.push(
        h(
          'button',
          {
            key: 'more',
            type: 'button',
            ref: moreRef,
            // ps-gear-end carries the auto margin, so this button and the one
            // after it are pushed together to the far end of the row.
            className: 'ps-gear ps-gear-end',
            'data-ps-trailing': '',
            title: menuEntries.length > 0 ? `还有 ${menuEntries.length} 条未显示` : '没有其他提示词',
            'aria-haspopup': 'menu',
            'aria-expanded': moreOpen,
            onClick: () => setMoreOpen((v) => !v),
          },
          IconMore(14),
          '更多',
          menuEntries.length > 0 ? h('span', { className: 'ps-count' }, String(menuEntries.length)) : null,
        ),
      );

      chips.push(
        h(
          'button',
          {
            key: 'settings',
            type: 'button',
            className: 'ps-gear',
            'data-ps-trailing': '',
            title: '添加或维护快捷提示词',
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            onClick: () => setOpen(true),
          },
          IconAdd(14),
          '添加指令',
        ),
      );

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'ps-row', ref: rowRef },
          chips,
          // Offscreen copies of every visible chip at their real styles, so the
          // fit calculation measures text instead of guessing at it. Hidden from
          // layout, painting, and assistive technology.
          h(
            'div',
            { className: 'ps-probe', 'data-ps-probe': '', 'aria-hidden': 'true' },
            visible.map((entry) => chipFor(entry, { tabIndex: -1 })),
          ),
          moreOpen
            ? h(
                'div',
                { className: 'ps-menu', ref: menuRef, role: 'menu' },
                h(
                  'div',
                  { className: 'ps-menu-head' },
                  h('span', { className: 'ps-menu-title' }, '更多指令'),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ps-menu-close',
                      title: '关闭',
                      'aria-label': '关闭',
                      onClick: () => setMoreOpen(false),
                    },
                    IconClose(12),
                  ),
                ),
                menuEntries.length === 0
                  ? h('div', { className: 'ps-menu-empty' }, '所有提示词都已显示')
                  : menuEntries.map((entry) =>
                      h(
                        'button',
                        {
                          key: entry.id,
                          type: 'button',
                          className: 'ps-menu-item',
                          role: 'menuitem',
                          title: entry.prompt,
                          onClick: () => {
                            fill(entry);
                            setMoreOpen(false);
                          },
                        },
                        h('span', { className: 'ps-menu-label' }, entry.label),
                        h('span', { className: 'ps-menu-body' }, entry.prompt),
                      ),
                    ),
              )
            : null,
        ),
        open
          ? h(MaintenancePanel, {
              store,
              // Clicking a card fills the draft, then closes so the user sees
              // the composer they just filled.
              onFill: (entry) => {
                fill(entry);
                setOpen(false);
              },
              onClose: () => setOpen(false),
            })
          : null,
      );
    }

    /**
     * Maintenance dialog: a searchable card grid, with one card open for
     * editing at a time.
     *
     * Two actions per card, matching how the row behaves:
     *   - clicking the card fills the composer draft (same as a row button);
     *   - the card's 编辑 control opens that entry in the editor.
     *
     * Edits are held in a local draft and committed on 保存, so 取消 leaves the
     * saved list untouched.
     *
     * @param props - store, the composer fill callback, and the close callback.
     */
    function MaintenancePanel(props) {
      const store = props.store;
      const saved = useSnapshot(store);
      // The dialog is a short-lived modal: it seeds its draft once on mount and
      // owns it until 保存 or 取消. Re-seeding on later store changes would
      // discard unsaved edits, so the live snapshot is deliberately not synced.
      const [draft, setDraft] = React.useState(() => saved);
      const [editingId, setEditingId] = React.useState(null);
      /*
       * Ids created by 新增 during this visit. Only these may be discarded when
       * 返回列表 abandons an incomplete entry: a pre-existing entry that the user
       * blanked out must survive, because backing out of an edit means "keep it
       * as it was", not "delete it".
       */
      const addedIds = React.useRef(new Set());
      const [query, setQuery] = React.useState('');
      const [error, setError] = React.useState('');
      // Card id whose delete button is currently showing its confirm prompt.
      const [confirmId, setConfirmId] = React.useState(null);

      const editing = editingId === null ? null : draft.find((entry) => entry.id === editingId) ?? null;

      /** Patch one draft entry by id. */
      const patch = (id, changes) => {
        setDraft((current) => current.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)));
      };

      /** Append a fresh entry and open it for editing immediately. */
      const add = () => {
        const entry = { id: newId(), label: '', prompt: '', enabled: true };
        addedIds.current.add(entry.id);
        setDraft((current) => [...current, entry]);
        setEditingId(entry.id);
        setError('');
      };

      /** Remove one entry, leaving the editor when it was the open one. */
      const remove = (id) => {
        addedIds.current.delete(id);
        setDraft((current) => current.filter((entry) => entry.id !== id));
        if (editingId === id) setEditingId(null);
      };

      /** Validate and persist the whole draft. */
      const save = () => {
        const cleaned = [];
        for (const [index, entry] of draft.entries()) {
          const label = (entry.label ?? '').trim();
          const prompt = entry.prompt ?? '';
          if (label === '') {
            setError(`第 ${index + 1} 条缺少名称。`);
            return;
          }
          if (prompt.trim() === '') {
            setError(`第 ${index + 1} 条「${label}」缺少提示词内容。`);
            return;
          }
          cleaned.push({ ...entry, label, prompt });
        }
        setError('');
        store.set(cleaned.length > 0 ? cleaned : seed());
        props.onClose();
      };

      /**
       * Leave the editor for the list, abandoning whatever was in progress.
       *
       * Validation belongs to 保存, not to navigation: 返回列表 means "never mind
       * this one", so it must never be blocked by an empty field. An entry left
       * incomplete is discarded outright — keeping a blank card in the grid
       * would only stall the next 保存 with the same complaint.
       */
      const backToList = () => {
        const entry = draft.find((item) => item.id === editingId);
        const incomplete =
          entry !== undefined &&
          ((entry.label ?? '').trim() === '' || (entry.prompt ?? '').trim() === '');
        // Drop the entry only when this visit created it and never finished it.
        // An existing entry left half-edited simply reverts to its stored form,
        // which is what abandoning an edit is supposed to mean.
        if (incomplete && addedIds.current.has(editingId)) {
          addedIds.current.delete(editingId);
          setDraft((current) => current.filter((item) => item.id !== editingId));
        } else if (incomplete) {
          const original = saved.find((item) => item.id === editingId);
          if (original) {
            setDraft((current) => current.map((item) => (item.id === editingId ? original : item)));
          }
        }
        setError('');
        setEditingId(null);
      };

      const needle = query.trim().toLowerCase();
      const matches = needle === ''
        ? draft
        : draft.filter(
            (entry) =>
              entry.label.toLowerCase().includes(needle) || entry.prompt.toLowerCase().includes(needle),
          );

      // Without a session there is no composer to fill, so a card click would
      // be a silent no-op; the card is then only a way into the editor.
      const canFill = typeof props.onFill === 'function';

      const head = h(
        'div',
        { className: 'ps-head' },
        h('input', {
          className: 'ps-search',
          type: 'search',
          value: query,
          placeholder: '搜索自定义指令…',
          'aria-label': '搜索自定义指令',
          onChange: (event) => setQuery(event.target.value),
        }),
        h(
          'button',
          { type: 'button', className: 'ps-icon-btn', title: '新增提示词', 'aria-label': '新增提示词', onClick: add },
          IconPlus(15),
        ),
      );

      /** Browse state: the card grid. */
      const grid = h(
        'div',
        { className: 'ps-grid' },
        matches.length === 0
          ? h(
              'div',
              { className: 'ps-grid-empty' },
              draft.length === 0 ? '还没有提示词，点右上角「+」新增。' : '没有匹配的提示词。',
            )
          : matches.map((entry) =>
              h(
                'div',
                {
                  key: entry.id,
                  className: 'ps-tile',
                  role: 'button',
                  tabIndex: 0,
                  title: canFill ? '点击填入输入框' : '点「编辑」查看内容',
                  onClick: () => {
                    if (canFill) props.onFill(entry);
                  },
                  onKeyDown: (event) => {
                    if (!canFill) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      props.onFill(entry);
                    }
                  },
                },
                h(
                  'div',
                  { className: 'ps-tile-head' },
                  h('span', { className: 'ps-tile-label' }, entry.label || '未命名'),
                ),
                h('div', { className: 'ps-tile-body' }, entry.prompt || '（还没有内容）'),
                h(
                  'div',
                  { className: 'ps-tile-foot' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'ps-tile-act',
                      onClick: (event) => {
                        // Card actions must not also fire the card's fill action.
                        event.stopPropagation();
                        setEditingId(entry.id);
                        setError('');
                        setConfirmId(null);
                      },
                    },
                    IconEdit(13),
                    '编辑',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: `ps-tile-act${entry.enabled ? ' ps-tile-act-on' : ''}`,
                      title: entry.enabled
                        ? '已显示在输入框上方，点击取消'
                        : '点击后显示在输入框上方',
                      'aria-pressed': entry.enabled,
                      onClick: (event) => {
                        event.stopPropagation();
                        patch(entry.id, { enabled: !entry.enabled });
                        setConfirmId(null);
                      },
                    },
                    IconPin(13),
                    entry.enabled ? '已置顶' : '置顶',
                  ),
                  // Deletion is confirmed in place: the button becomes the
                  // confirm prompt, so one card can never be removed by a
                  // single stray click while its neighbours stay untouched.
                  confirmId === entry.id
                    ? h(
                        'span',
                        { className: 'ps-confirm' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'ps-tile-act ps-tile-act-danger',
                            onClick: (event) => {
                              event.stopPropagation();
                              remove(entry.id);
                              setConfirmId(null);
                            },
                          },
                          IconTrash(13),
                          '确认删除',
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'ps-tile-act',
                            onClick: (event) => {
                              event.stopPropagation();
                              setConfirmId(null);
                            },
                          },
                          '取消',
                        ),
                      )
                    : h(
                        'button',
                        {
                          type: 'button',
                          className: 'ps-tile-act ps-tile-act-danger',
                          onClick: (event) => {
                            event.stopPropagation();
                            setConfirmId(entry.id);
                          },
                        },
                        IconTrash(13),
                        '删除',
                      ),
                ),
              ),
            ),
      );

      /** Edit state: one entry's fields plus its own actions. */
      const editor = editing
        ? h(
            'div',
            { className: 'ps-editor' },
            h(
              'div',
              { className: 'ps-field' },
              h('label', { className: 'ps-field-label', htmlFor: 'ps-edit-label' }, '名称（显示在按钮上，最多 24 字）'),
              h('input', {
                id: 'ps-edit-label',
                className: 'ps-input',
                value: editing.label,
                maxLength: MAX_LABEL,
                placeholder: '例如：代码评审',
                onChange: (event) => patch(editing.id, { label: event.target.value }),
              }),
            ),
            h(
              'div',
              { className: 'ps-field' },
              h('label', { className: 'ps-field-label', htmlFor: 'ps-edit-prompt' }, '提示词内容'),
              h('textarea', {
                id: 'ps-edit-prompt',
                className: 'ps-area',
                value: editing.prompt,
                placeholder: '点击按钮时会替换输入框内容',
                onChange: (event) => patch(editing.id, { prompt: event.target.value }),
              }),
            ),
            h(
              'label',
              { className: 'ps-check', title: '勾选后出现在输入框上方的按钮栏中' },
              h('input', {
                type: 'checkbox',
                checked: editing.enabled,
                onChange: (event) => patch(editing.id, { enabled: event.target.checked }),
              }),
              '置顶（显示在输入框上方）',
            ),
          )
        : null;

      return h(
        'div',
        {
          className: 'ps-backdrop',
          role: 'presentation',
          onClick: (event) => {
            if (event.target === event.currentTarget) props.onClose();
          },
        },
        h(
          'div',
          {
            className: 'ps-panel',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': '提示词快捷按钮设置',
            onKeyDown: (event) => {
              if (event.key !== 'Escape') return;
              // Escape steps back out of the editor before closing the dialog.
              if (editingId !== null) backToList();
              else props.onClose();
            },
          },
          h(
            'div',
            { className: 'ps-head-row' },
            h(
              'div',
              { className: 'ps-head-text' },
              h('h2', { className: 'ps-title' }, editing ? '编辑提示词' : '提示词快捷按钮'),
              h(
                'p',
                { className: 'ps-hint' },
                editing
                  ? '改完点「返回列表」回到卡片，再点「保存」写入。删除和置顶在卡片上进行。'
                  : '点击卡片即填入输入框；卡片底部可编辑、置顶或删除。',
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'ps-close',
                title: '关闭',
                'aria-label': '关闭',
                onClick: props.onClose,
              },
              IconClose(14),
            ),
          ),
          editing ? null : head,
          error ? h('div', { className: 'ps-error', role: 'alert' }, error) : null,
          editing ? editor : grid,
          h(
            'div',
            { className: 'ps-foot' },
            h('span', { className: 'ps-grow' }),
            // 返回列表 backs out of the editor first; only from the grid does
            // the same control discard the draft and close the dialog.
            h(
              'button',
              {
                type: 'button',
                className: 'ps-btn',
                onClick: () => {
                  if (editingId !== null) backToList();
                  else props.onClose();
                },
              },
              editing ? '返回列表' : '取消',
            ),
            h('button', { type: 'button', className: 'ps-btn ps-btn-primary', onClick: save }, '保存'),
          ),
        ),
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const store = createStore();

        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () =>
          ctx.slots.register(
            { name: 'conversation.input.dock', id: 'prompt-shortcuts', order: 20, label: '提示词快捷按钮' },
            (props) => h(ShortcutRow, { ...props, store }),
          ),
        ));

        // The panel is styled with theme tokens; the sheet lives with the plugin run.
        ctx.effect(() => {
          const style = document.createElement('style');
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        });
      },
    };
  },
});
