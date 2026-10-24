"use client"

import React, { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Palette, Sun, Moon, Check, Sparkles } from "lucide-react"

export type UiAccent = "orange" | "yellow" | "red" | "black" | "blue" | "green"

interface AccentOption {
  id: UiAccent
  name: string
  color: string
  border: string
}

const ACCENT_OPTIONS: AccentOption[] = [
  { id: "orange", name: "Warm Orange (Brand)", color: "#f08c2b", border: "rgba(240, 140, 43, 0.4)" },
  { id: "yellow", name: "Sun Yellow", color: "#eab308", border: "rgba(234, 179, 8, 0.4)" },
  { id: "red", name: "Crimson Red", color: "#dc2626", border: "rgba(220, 38, 38, 0.4)" },
  { id: "black", name: "Slate Black", color: "#0f172a", border: "rgba(15, 23, 42, 0.4)" },
  { id: "blue", name: "Classic Blue", color: "#0077eb", border: "rgba(0, 119, 235, 0.4)" },
  { id: "green", name: "Emerald Green", color: "#16a34a", border: "rgba(22, 163, 74, 0.4)" },
]

export function ThemePaletteSwitcher() {
  const [currentAccent, setCurrentAccent] = useState<UiAccent>("orange")
  const [isDark, setIsDark] = useState<boolean>(false)
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [mounted, setMounted] = useState<boolean>(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    try {
      let savedAccent = (localStorage.getItem("senteloans_ui_accent") as UiAccent) || "orange"
      if ((savedAccent as string) === "amber") {
        savedAccent = "yellow"
      }
      setCurrentAccent(savedAccent)
      document.documentElement.setAttribute("data-ui-accent", savedAccent)

      const savedTheme = localStorage.getItem("senteloans_theme_mode")
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      const activeDark = savedTheme === "dark" || (!savedTheme && prefersDark)
      setIsDark(activeDark)
      if (activeDark) {
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
    } catch {
      // ignore SSR / storage restrictions
    }
  }, [])

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  const selectAccent = (accent: UiAccent) => {
    setCurrentAccent(accent)
    try {
      localStorage.setItem("senteloans_ui_accent", accent)
      document.documentElement.setAttribute("data-ui-accent", accent)
    } catch {
      // ignore
    }
  }

  const toggleDarkMode = () => {
    const nextDark = !isDark
    setIsDark(nextDark)
    try {
      localStorage.setItem("senteloans_theme_mode", nextDark ? "dark" : "light")
      if (nextDark) {
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
    } catch {
      // ignore
    }
  }

  if (!mounted) return null

  const activeColor = ACCENT_OPTIONS.find((a) => a.id === currentAccent)?.color || "#f08c2b"

  return (
    <div
      ref={menuRef}
      className="fixed top-4 right-4 z-[100] flex items-center select-none font-sans print:hidden"
      aria-label="Theme Customizer"
    >
      <div className="relative">
        {/* Floating Pill Trigger Button */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200/90 dark:border-zinc-800 shadow-lg shadow-black/10 hover:shadow-xl transition-all cursor-pointer text-zinc-700 dark:text-zinc-200"
          title="Customize Theme & Palette"
          aria-expanded={isOpen}
        >
          <Palette className="w-3.5 h-3.5" style={{ color: activeColor }} />
          {/* Active Accent Color Dot */}
          <span
            className="w-2.5 h-2.5 rounded-full shadow-xs ring-2 ring-white dark:ring-zinc-900"
            style={{ backgroundColor: activeColor }}
          />
          <span className="text-[11px] font-semibold tracking-wide uppercase">
            {currentAccent}
          </span>
        </motion.button>

        {/* Dropdown Palette Panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute right-0 mt-2 w-64 p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-black/20 backdrop-blur-xl z-[100]"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-white">
                  <Sparkles className="w-3.5 h-3.5" style={{ color: activeColor }} />
                  <span>Theme Palette</span>
                </div>

                {/* Dark / Light Mode Toggle */}
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                  title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                  {isDark ? (
                    <>
                      <Moon className="w-3 h-3 text-yellow-400" />
                      <span className="text-[10px]">Dark</span>
                    </>
                  ) : (
                    <>
                      <Sun className="w-3 h-3 text-yellow-500" />
                      <span className="text-[10px]">Light</span>
                    </>
                  )}
                </button>
              </div>

              {/* Accent Color Swatches */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1.5 px-1">
                  Accent Color
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {ACCENT_OPTIONS.map((option) => {
                    const isSelected = currentAccent === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => selectAccent(option.id)}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                          isSelected
                            ? "bg-zinc-100/90 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white shadow-xs"
                            : "bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50 border-transparent text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: option.color }}
                          />
                          <span className="capitalize text-[11px] font-medium">{option.id}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-zinc-900 dark:text-white" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Footer Indicator */}
              <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400">
                <span>Active Accent:</span>
                <span className="font-mono font-semibold uppercase" style={{ color: activeColor }}>
                  {currentAccent}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
