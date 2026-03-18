import { html, nothing } from "lit";
import type { TemplateResult } from "lit";
import { handleOverlayClick } from "../app-modals.ts";

export function renderModal(
  open: boolean,
  onClose: () => void,
  content: TemplateResult,
  width?: string
) {
  if (!open) return nothing;
  return html`
    <div
      class="channel-modal-overlay open"
      @click=${(e: MouseEvent) => handleOverlayClick(e, onClose)}
    >
      <div class="channel-modal" style="${width ? `width:${width}` : ""}">
        ${content}
      </div>
    </div>
  `;
}
