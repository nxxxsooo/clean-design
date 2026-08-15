import type { PluginUseAction } from '../plugins-home/useActions';

export interface HomePromptHandoff {
  id: number;
  pluginId: string;
  focus: boolean;
  source: 'plugin-use';
  action: PluginUseAction;
  inputs?: Record<string, unknown>;
}

export function createPluginUseHandoff(
  id: number,
  pluginId: string,
  options: {
    action?: PluginUseAction;
    inputs?: Record<string, unknown>;
  } = {},
): HomePromptHandoff {
  return {
    id,
    pluginId,
    action: options.action ?? 'use',
    ...(options.inputs ? { inputs: options.inputs } : {}),
    focus: true,
    source: 'plugin-use',
  };
}
