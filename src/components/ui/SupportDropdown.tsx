import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { createExternalLinkHandler } from "../../utils/externalLinks";

interface SupportDropdownProps {
  className?: string;
}

export default function SupportDropdown({ className }: SupportDropdownProps) {
  const { t } = useTranslation();
  return (
    <a
      href="https://github.com/jittergtz/spoken"
      target="_blank"
      rel="noopener noreferrer"
      onClick={createExternalLinkHandler("https://github.com/jittergtz/spoken")}
      aria-label={t("sidebar.support")}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-foreground/70 hover:text-foreground hover:bg-foreground/10",
        className
      )}
    >
      <HelpCircle size={16} />
    </a>
  );
}
