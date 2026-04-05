"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ItemCard } from "@/components/ItemCard";
import { RecordEditor } from "@/components/RecordEditor";

type DomainData = Record<string, unknown>;

type Item = {
  id: string;
  name: string;
  type: string;
  department: string;
  status: string;
  key_date: string | null;
  purchase_price: number | null;
  currency: string | null;
  billing_cycle: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  vendor: string | null;
  assigned_to_name: string | null;
  needs_review: boolean;
  confidence: string | null;
  created_at: string;
  employees?: DomainData[];
  contracts?: DomainData[];
  assets?: DomainData[];
};

export function ItemList({ items }: { items: Item[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [highlightedName, setHighlightedName] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Capture logged name once, then clear after 5s
  useEffect(() => {
    const logged = searchParams.get("logged");
    if (logged) {
      setHighlightedName(decodeURIComponent(logged));
      const t = setTimeout(() => setHighlightedName(null), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  function getDomainData(item: Item): DomainData | null {
    if (item.employees?.[0]) return item.employees[0];
    if (item.contracts?.[0]) return item.contracts[0];
    if (item.assets?.[0]) return item.assets[0];
    return null;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        const domainData = getDomainData(item);

        return (
          <div key={item.id}>
            <div
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
              className="cursor-pointer"
            >
              <ItemCard
                item={item as never}
                highlightReminders={highlightedName === item.name}
              />
            </div>

            {isExpanded && domainData && (
              <div className="mt-2 ml-5">
                <RecordEditor
                  itemId={item.id}
                  itemType={item.type}
                  domainData={domainData}
                  onClose={() => setExpandedId(null)}
                  onSaved={() => {
                    setExpandedId(null);
                    router.refresh();
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
      {items.length === 0 && (
        <p className="text-zinc-600 text-sm">No items yet.</p>
      )}
    </div>
  );
}
