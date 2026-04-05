"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export function LoggedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [itemName, setItemName] = useState("");

  useEffect(() => {
    const logged = searchParams.get("logged");
    if (logged) {
      setItemName(decodeURIComponent(logged));
      setVisible(true);
      // Remove the query param from the URL without re-navigating
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, router, pathname]);

  // Separate timer so it doesn't reset on re-render from router.replace
  useEffect(() => {
    if (visible) {
      const t = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 shadow-xl backdrop-blur-sm">
        <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
        <span className="text-sm text-emerald-300 font-medium">
          ✓ {itemName} logged successfully
        </span>
        <button
          onClick={() => setVisible(false)}
          className="text-emerald-500 hover:text-emerald-300 ml-2 text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
