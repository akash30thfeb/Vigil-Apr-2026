import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Navigate with View Transitions API (Chrome 111+).
 * Falls back to normal router.push on unsupported browsers.
 */
export function smoothNavigate(router: AppRouterInstance, url: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = document as any;
  if (doc.startViewTransition) {
    doc.startViewTransition(() => {
      router.push(url);
    });
  } else {
    router.push(url);
  }
}

export function smoothRefresh(router: AppRouterInstance) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = document as any;
  if (doc.startViewTransition) {
    doc.startViewTransition(() => {
      router.refresh();
    });
  } else {
    router.refresh();
  }
}
