import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

export function useIsMobile() {
  // The media query is external state: subscribe to it instead of pushing it
  // into React with setState from an effect. Same breakpoint, same boolean —
  // but the value is correct on first render, not only after the effect.
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
