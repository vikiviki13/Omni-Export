import type { PluginToUIMessage, UIToPluginMessage } from '../shared/types';

export type { PluginToUIMessage, UIToPluginMessage };

export function postToUI(message: PluginToUIMessage): void {
  figma.ui.postMessage(message);
}

export function isUIMessage(value: unknown): value is UIToPluginMessage {
  return (
    !!value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
  );
}
