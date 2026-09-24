// Two per-browser conveniences, nothing else (the privacy page says so). Storage can be missing or blocked
// (private windows, strict settings): every access is guarded and the site works without it.
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not remembered; the page carries on.
  }
};

export const soundOn = () => read("td.sound") !== "off";
export const setSoundOn = (on: boolean) => write("td.sound", on ? null : "off");
export const lastAside = () => read("td.aside");
export const setLastAside = (id: string) => write("td.aside", id);
