/** The element matching `sel`; throws if the page is missing it (a markup bug, not a runtime state). */
export const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
