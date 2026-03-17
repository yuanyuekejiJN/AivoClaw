import { html } from "lit";

export function renderToggle(active: boolean, onClick: (e: Event) => void, disabled = false) {
  return html`
    <button
      class="settings-general-toggle ${active ? "active" : ""}"
      ?disabled=${disabled}
      style="${disabled ? "opacity:0.5;cursor:not-allowed;" : ""}"
      @click=${disabled ? undefined : onClick}
    >
      <span class="settings-general-toggle-knob"></span>
    </button>
  `;
}
