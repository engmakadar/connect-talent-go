import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "sj-theme";

function applyTheme(t: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  useEffect(() => {
    const saved = (typeof localStorage !== "undefined" && (localStorage.getItem(KEY) as "dark" | "light" | null)) || "light";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try { localStorage.setItem(KEY, next); } catch { /* noop */ }
  };

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className={`grid h-9 w-9 place-items-center rounded-full bg-white/80 ring-1 ring-black/5 hover:bg-secondary text-ink ${className}`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
