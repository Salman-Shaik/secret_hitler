"use client";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

export default function ThemeSwitch() {
  const [preference, setPreference] = useState("system");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let saved = "system";
    try {
      saved = localStorage.getItem("sh-theme") || "system";
    } catch {}
    if (!["light", "dark"].includes(saved)) saved = "system";
    setPreference(saved);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const value =
        preference === "system" ? media.matches : preference === "dark";
      setDark(value);
      document.documentElement.dataset.theme = value ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  function choose(value) {
    setPreference(value);
    try {
      localStorage.setItem("sh-theme", value);
    } catch {}
  }
  return (
    <div className="theme-control">
      <button
        className="theme-switch"
        role="switch"
        aria-label="Dark mode"
        aria-checked={dark}
        onClick={() => choose(dark ? "light" : "dark")}
        title="Switch light / dark theme"
      >
        <Sun size={13} />
        <Moon size={13} />
        <span className="theme-thumb" />
      </button>
      <button
        className={`theme-system ${preference === "system" ? "selected" : ""}`}
        aria-label="Use system theme"
        aria-pressed={preference === "system"}
        title="Use system theme"
        onClick={() => choose("system")}
      >
        <Monitor size={13} />
        <span>Auto</span>
      </button>
    </div>
  );
}
