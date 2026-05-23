import { FloatingArrow, FloatingPortal, arrow, autoUpdate, flip, offset, shift, useClick, useDismiss, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { RiDashboardLine, RiExternalLinkLine, RiFileCopyLine, RiLayoutRightLine, RiMoonLine, RiShareForwardLine, RiSunLine, RiTextSnippet, RiWindowLine } from '@remixicon/react';
import { useRef, useState } from 'react';

import type { ManagerSettings } from '../../lib/contracts';
import { Tooltip } from '../Tooltip';

import dashboardLogo from '../../assets/icons/icon-128.png';

type DashboardHeaderProps = {
  launchSurface: ManagerSettings['launchSurface'];
  shareCta: string;
  shareFeedback: string | null;
  shareLabel: string;
  shareCopyLabel: string;
  shareCopyTextLabel: string;
  shareOpenStoreLabel: string;
  onCopyShareLink: () => void;
  onCopyShareText: () => void;
  onOpenStore: () => void;
  onLaunchSurfaceToggle: () => void;
  onThemeToggle: () => void;
  launchSurfaceToggleLabel: string;
  tagline: string;
  themeLabel: string;
  themeChoice: 'light' | 'dark';
  title: string;
};

export function DashboardHeader({
  launchSurface,
  shareCta,
  shareFeedback,
  shareLabel,
  shareCopyLabel,
  shareCopyTextLabel,
  shareOpenStoreLabel,
  onCopyShareLink,
  onCopyShareText,
  onOpenStore,
  onLaunchSurfaceToggle,
  onThemeToggle,
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
  const shareMenuClick = useClick(shareMenuContext, { event: 'mousedown' });
  const shareMenuDismiss = useDismiss(shareMenuContext);
  const shareMenuRole = useRole(shareMenuContext, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([shareMenuClick, shareMenuDismiss, shareMenuRole]);

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
                <button
                  className="tm-header-group-picker-button tm-dashboard-share-menu-button"
                  onClick={() => {
                    setShareMenuOpen(false);
                    onCopyShareLink();
                  }}
                  type="button"
                >
                  <RiFileCopyLine size={13} />
                  <span>{shareCopyLabel}</span>
                </button>
                <button
                  className="tm-header-group-picker-button tm-dashboard-share-menu-button"
                  onClick={() => {
                    setShareMenuOpen(false);
                    onCopyShareText();
                  }}
                  type="button"
                >
                  <RiTextSnippet size={13} />
                  <span>{shareCopyTextLabel}</span>
                </button>
                <button
                  className="tm-header-group-picker-button tm-dashboard-share-menu-button"
                  onClick={() => {
                    setShareMenuOpen(false);
                    onOpenStore();
                  }}
                  type="button"
                >
                  <RiExternalLinkLine size={13} />
                  <span>{shareOpenStoreLabel}</span>
                </button>
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
            className="tm-dashboard-theme-toggle"
            onClick={onLaunchSurfaceToggle}
            type="button"
          >
            {launchSurface === 'dashboard' ? (
              <RiDashboardLine size={22} />
            ) : launchSurface === 'popup' ? (
              <RiWindowLine size={22} />
            ) : (
              <RiLayoutRightLine size={22} />
            )}
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
