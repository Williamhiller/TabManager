import type { AutoGroupConfig } from './contracts';

export function updateAutoGroupConfigTitleFromGroup(
  configs: AutoGroupConfig[],
  configId: string | null | undefined,
  title: string | null | undefined
): AutoGroupConfig[] | null {
  const nextTitle = title?.trim();
  if (!configId || !nextTitle) return null;

  let didUpdate = false;
  const nextConfigs = configs.map((config) => {
    if (config.id !== configId || config.title === nextTitle) return config;

    didUpdate = true;
    return {
      ...config,
      title: nextTitle
    };
  });

  return didUpdate ? nextConfigs : null;
}
