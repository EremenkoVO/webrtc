import { create } from 'zustand'

type SidebarState = {
  isOpen: boolean
  isMobile: boolean
  checkMobile: () => void
  toggle: () => void
  open: () => void
  close: () => void
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  isOpen: false,
  /** Breakpoint (px): below = overlay sidebar, above = static sidebar. Matches Tailwind md (768). */
  isMobile: typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  checkMobile: () => {
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false
    const current = get()
    const nextOpen = isMobile ? current.isOpen : true
    if (current.isMobile === isMobile && current.isOpen === nextOpen) return
    set({ isMobile, isOpen: nextOpen })
  },
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  open: () => set({ isOpen: true }),
  close: () => set((s) => (s.isMobile ? { isOpen: false } : s)),
}))
