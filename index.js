/**
 * Host half of the prompt-shortcuts bundle.
 *
 * The shortcut list is browser-owned state persisted in the page's
 * localStorage, so the Host registers nothing and only marks the plugin as
 * present. Keeping this half inert also keeps the bundle installable without a
 * build step.
 */
export function apply() {}
