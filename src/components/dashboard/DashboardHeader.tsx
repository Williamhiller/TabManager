import { FloatingArrow, FloatingPortal, arrow, autoUpdate, flip, offset, shift, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { RiDashboardLine, RiExternalLinkLine, RiFeedbackLine, RiFileCopyLine, RiKeyboardLine, RiLayoutRightLine, RiMailLine, RiMoonLine, RiShareForwardLine, RiSunLine, RiTextSnippet, RiTwitterXLine, RiWindowLine } from '@remixicon/react';
import { useRef, useState } from 'react';

import type { BrowserCommandShortcutState, ManagerSettings } from '../../lib/contracts';
import { Tooltip } from '../Tooltip';

import dashboardLogo from '../../assets/icons/icon-128.png';

type DashboardHeaderProps = {
  browserShortcutState: BrowserCommandShortcutState | null;
  feedbackLabel: string;
  highlightBrowserShortcutSetup: boolean;
  launchSurface: ManagerSettings['launchSurface'];
  shareCta: string;
  shareFeedback: string | null;
  shareLabel: string;
  shareCopyLabel: string;
  shareCopyTextLabel: string;
  shareOpenStoreLabel: string;
  shareTwitterLabel: string;
  shareEmailLabel: string;
  onCopyShareLink: () => void;
  onCopyShareText: () => void;
  onShareTwitter: () => void;
  onShareEmail: () => void;
  onOpenStore: () => void;
  onFeedback: () => void;
  onLaunchSurfaceToggle: () => void;
  onThemeToggle: () => void;
  launchSurfaceCurrentLabel: string;
  launchSurfaceToggleLabel: string;
  tagline: string;
  themeLabel: string;
  themeChoice: 'light' | 'dark';
  title: string;
};

const CHROME_SHORTCUTS_URL = 'chrome://extensions/shortcuts';

export function DashboardHeader({
  browserShortcutState,
  feedbackLabel,
  highlightBrowserShortcutSetup,
  launchSurface,
  shareCta,
  shareFeedback,
  shareLabel,
  shareCopyLabel,
  shareCopyTextLabel,
  shareOpenStoreLabel,
  shareTwitterLabel,
  shareEmailLabel,
  onCopyShareLink,
  onCopyShareText,
  onShareTwitter,
  onShareEmail,
  onOpenStore,
  onFeedback,
  onLaunchSurfaceToggle,
  onThemeToggle,
  launchSurfaceCurrentLabel,
  launchSurfaceToggleLabel,
  tagline,
  themeLabel,
  themeChoice,
  title
}: DashboardHeaderProps) {
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareArrowRef = useRef<SVGSVGElement | null>(null);
  const {
    refs: shareMenuRefs,
    floatingStyles: shareMenuStyles,
    context: shareMenuContext,
    placement: shareMenuPlacement
  } = useFloating({
    open: shareMenuOpen,
    onOpenChange: setShareMenuOpen,
    placement: 'bottom-end',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: shareArrowRef, padding: 10 })]
  });
  const shareMenuDismiss = useDismiss(shareMenuContext);
  const shareMenuRole = useRole(shareMenuContext, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([shareMenuDismiss, shareMenuRole]);

  const handleShareButtonClick = () => {
    setShareMenuOpen((prev) => !prev);
  };

  const handleShareAction = (action: () => void) => {
    setShareMenuOpen(false);
    action();
  };

  const handleOpenChromeShortcuts = () => {
    chrome.tabs.create({ url: CHROME_SHORTCUTS_URL }).catch((error) => {
      console.warn('Failed to open Chrome shortcuts page.', error);
    });
  };

  return (
    <header className="tm-dashboard-header">
      <div className="tm-dashboard-header-brand">
        <img alt="" className="tm-dashboard-logo" src={dashboardLogo} />
        <div className="tm-dashboard-header-brand-copy">
          <strong>{title}</strong>
          <span>{tagline}</span>
        </div>
      </div>

      <div className="tm-dashboard-header-actions">
        {browserShortcutState && !browserShortcutState.active ? (
          <Tooltip content="Set Chrome shortcut">
            <button
              aria-label="Set Chrome shortcut"
              className="tm-dashboard-shortcut-warning"
              data-highlight={highlightBrowserShortcutSetup}
              onClick={handleOpenChromeShortcuts}
              title="Set Chrome shortcut"
              type="button"
            >
              <RiKeyboardLine size={16} />
              <span>Set shortcut</span>
            </button>
          </Tooltip>
        ) : null}
        <Tooltip content={feedbackLabel}>
          <button
            aria-label={feedbackLabel}
            className="tm-dashboard-feedback-button"
            onClick={onFeedback}
            title={feedbackLabel}
            type="button"
          >
            <RiFeedbackLine size={16} />
            <span>{feedbackLabel}</span>
          </button>
        </Tooltip>
        <div className="tm-dashboard-share-cluster">
          <Tooltip content={shareLabel}>
            <div className="tm-dashboard-share-anchor">
              <button
                ref={shareMenuRefs.setReference}
                aria-label={shareLabel}
                className="tm-dashboard-share-button"
                data-open={shareMenuOpen}
                title={shareLabel}
                type="button"
                onClick={handleShareButtonClick}
                {...getReferenceProps()}
              >
                <RiShareForwardLine size={17} />
                <span>{shareCta}</span>
              </button>
            </div>
          </Tooltip>
          {shareMenuOpen ? (
            <FloatingPortal>
              <div
                ref={shareMenuRefs.setFloating}
                className="tm-header-group-picker tm-header-group-picker-floating tm-dashboard-compact-menu tm-dashboard-share-menu"
                data-side={shareMenuPlacement.split('-')[0]}
                style={shareMenuStyles}
                {...getFloatingProps()}
              >
                <div className="tm-dashboard-compact-menu-title">{shareLabel}</div>
                <div className="tm-dashboard-share-menu-group">
                  <button
                    className="tm-header-group-picker-button tm-dashboard-share-menu-button"
                    onClick={() => handleShareAction(onShareTwitter)}
                    type="button"
                  >
                    <RiTwitterXLine size={14} />
                    <span>{shareTwitterLabel}</span>
                  </button>
                  <button
                    className="tm-header-group-picker-button tm-dashboard-share-menu-button"
                    onClick={() => handleShareAction(onShareEmail)}
                    type="button"
                  >
                    <RiMailLine size={14} />
                    <span>{shareEmailLabel}</span>
                  </button>
                </div>
                <div className="tm-dashboard-share-menu-divider" />
                <div className="tm-dashboard-share-menu-group">
                  <button
                    className="tm-header-group-picker-button tm-dashboard-share-menu-button"
                    onClick={() => handleShareAction(onCopyShareLink)}
                    type="button"
                  >
                    <RiFileCopyLine size={14} />
                    <span>{shareCopyLabel}</span>
                  </button>
                  <button
                    className="tm-header-group-picker-button tm-dashboard-share-menu-button"
                    onClick={() => handleShareAction(onCopyShareText)}
                    type="button"
                  >
                    <RiTextSnippet size={14} />
                    <span>{shareCopyTextLabel}</span>
                  </button>
                  <button
                    className="tm-header-group-picker-button tm-dashboard-share-menu-button"
                    onClick={() => handleShareAction(onOpenStore)}
                    type="button"
                  >
                    <RiExternalLinkLine size={14} />
                    <span>{shareOpenStoreLabel}</span>
                  </button>
                </div>
                <FloatingArrow
                  ref={shareArrowRef}
                  className="tm-header-group-picker-arrow"
                  context={shareMenuContext}
                  fill="var(--tm-header-group-picker-surface)"
                  height={6}
                  stroke="var(--tm-header-group-picker-border)"
                  strokeWidth={1}
                  tipRadius={2}
                  width={12}
                />
              </div>
            </FloatingPortal>
          ) : null}
          {shareFeedback ? <span className="tm-dashboard-share-feedback">{shareFeedback}</span> : null}
        </div>
        <Tooltip content={launchSurfaceToggleLabel}>
          <button
            aria-label={launchSurfaceToggleLabel}
            className="tm-dashboard-launch-surface-toggle"
            onClick={onLaunchSurfaceToggle}
            type="button"
          >
            {launchSurface === 'dashboard' ? (
              <RiDashboardLine size={16} />
            ) : launchSurface === 'popup' ? (
              <RiWindowLine size={16} />
            ) : (
              <RiLayoutRightLine size={16} />
            )}
            <span>{launchSurfaceCurrentLabel}</span>
          </button>
        </Tooltip>
        <button
          aria-label={themeLabel}
          className="tm-dashboard-theme-toggle"
          onClick={onThemeToggle}
          title={themeLabel}
          type="button"
        >
          {themeChoice === 'light' ? <RiSunLine size={22} /> : <RiMoonLine size={22} />}
        </button>
      </div>
    </header>
  );
}
