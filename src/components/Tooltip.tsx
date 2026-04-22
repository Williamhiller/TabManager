import {
  FloatingArrow,
  FloatingPortal,
  type Placement,
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFocus,
  useFloating,
  useHover,
  useInteractions,
  useRole
} from '@floating-ui/react';
import { useRef, useState, type ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
  disabled?: boolean;
  placement?: Placement;
  arrowPadding?: number;
}

export function Tooltip({
  children,
  content,
  disabled = false,
  placement = 'bottom',
  arrowPadding = 10
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const arrowRef = useRef<SVGSVGElement | null>(null);
  const { refs, floatingStyles, context, placement: actualPlacement } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      // Keep the arrow away from rounded corners to avoid visible seams.
      arrow({ element: arrowRef, padding: arrowPadding })
    ]
  });

  const hover = useHover(context, {
    enabled: !disabled,
    move: false,
    delay: { open: 250, close: 50 }
  });
  const focus = useFocus(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  return (
    <>
      <span
        ref={refs.setReference}
        className="tm-floating-tooltip-anchor"
        {...getReferenceProps()}
      >
        {children}
      </span>

      {!disabled && open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            className="tm-floating-tooltip"
            data-side={actualPlacement.split('-')[0]}
            style={floatingStyles}
            {...getFloatingProps()}
          >
            <div className="tm-floating-tooltip-content">{content}</div>
            <FloatingArrow
              ref={arrowRef}
              className="tm-floating-tooltip-arrow"
              context={context}
              fill="var(--tm-tooltip-surface)"
              height={6}
              stroke="var(--tm-tooltip-border)"
              strokeWidth={1}
              tipRadius={2}
              width={12}
            />
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
