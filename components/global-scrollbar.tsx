"use client"

import { useEffect } from "react"

export function GlobalScrollbar() {
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null
    const activeElements = new Set<Element>()

    const handleScroll = (e: Event) => {
      document.documentElement.classList.add("is-scrolling")

      const target = e.target as Element | null
      if (
        target &&
        target instanceof HTMLElement &&
        target !== document.documentElement &&
        target !== document.body
      ) {
        target.classList.add("is-scrolling")
        activeElements.add(target)
      }

      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      timeoutId = setTimeout(() => {
        document.documentElement.classList.remove("is-scrolling")
        activeElements.forEach((el) => el.classList.remove("is-scrolling"))
        activeElements.clear()
      }, 1000)
    }

    // Capture phase listener catches window, document, and all overflow container scroll events across all pages
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true })

    return () => {
      window.removeEventListener("scroll", handleScroll, { capture: true })
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      document.documentElement.classList.remove("is-scrolling")
      activeElements.forEach((el) => el.classList.remove("is-scrolling"))
      activeElements.clear()
    }
  }, [])

  return null
}
