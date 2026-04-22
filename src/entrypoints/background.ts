import { defineBackground } from 'wxt/utils/define-background';

import { installBackgroundService } from '../lib/background-service';

async function enableSidePanelOnActionClick(): Promise<void> {
  if (!chrome.sidePanel?.setPanelBehavior) return;

  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
}

export default defineBackground(() => {
  installBackgroundService();
  void enableSidePanelOnActionClick().catch((error) => {
    console.warn('Failed to enable side panel action click behavior.', error);
  });
});
