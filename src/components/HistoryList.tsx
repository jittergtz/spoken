import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatDateGroup } from "../utils/dateFormatting";

interface HistoryListProps<Item> {
  items: Item[];
  renderItem: (item: Item) => ReactNode;
  actions?: ReactNode;
}

export default function HistoryList<Item extends { id: number; timestamp: string }>({
  items,
  renderItem,
  actions,
}: HistoryListProps<Item>) {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const grouped: { label: string; items: Item[] }[] = [];
    for (const item of items) {
      const label = formatDateGroup(item.timestamp, t);
      const last = grouped[grouped.length - 1];
      if (last?.label === label) last.items.push(item);
      else grouped.push({ label, items: [item] });
    }
    return grouped;
  }, [items, t]);

  return (
    <div className="group">
      {groups.map((group, index) => (
        <div key={group.label} className={index > 0 ? "mt-4" : ""}>
          <div className="sticky -top-1 z-10 -mx-4 px-5 pt-2 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground dark:text-muted-foreground uppercase tracking-wide">
              {group.label}
            </span>
            {index === 0 && actions && (
              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                {actions}
              </div>
            )}
          </div>
          <div className="space-y-1.5 relative z-0">
            {group.items.map((item) => (
              <div key={item.id}>{renderItem(item)}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
