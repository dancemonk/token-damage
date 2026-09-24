import { setSoundOn, soundOn } from "./prefs.js";

/** The header's speaker button: pressed = sound on. The build prints it; this keeps it in step with storage. */
export function wireSoundToggle(): void {
  const button = document.getElementById("sound");
  if (!button) return;
  const show = () => button.setAttribute("aria-pressed", String(soundOn()));
  show();
  button.addEventListener("click", () => {
    setSoundOn(!soundOn());
    show();
  });
}
