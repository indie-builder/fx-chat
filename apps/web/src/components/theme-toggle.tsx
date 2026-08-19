"use client";

import { Button } from "@/components/ui/button";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme } = useTheme();

  return (
    <Button
      aria-label="Toggle theme"
      onClick={() =>
        setTheme(
          document.documentElement.classList.contains("dark") ? "light" : "dark"
        )
      }
      size="icon"
      variant="ghost"
    >
      <SunIcon className="hidden dark:block" data-icon />
      <MoonIcon className="dark:hidden" data-icon />
    </Button>
  );
}
