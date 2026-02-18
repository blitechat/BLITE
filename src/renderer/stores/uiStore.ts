import { create } from 'zustand'
import { THEMES, DEFAULT_THEME_ID, getThemeById } from '@renderer/config/themes'

type ModalType =
  | 'createServer'
  | 'joinServer'
  | 'serverSettings'
  | 'createChannel'
  | 'invite'
  | 'userSettings'
  | 'addFriend'
  | 'inbox'
  | 'feedback'
  | null

type View = 'servers' | 'dms'

type LeftPanelTab = 'rooms' | 'dms' | 'friends'

type RightPanel = 'none' | 'search' | 'pinned' | 'members'

interface UIState {
  activeModal: ModalType
  activeView: View
  leftPanelTab: LeftPanelTab
  rightPanel: RightPanel
  contextMenu: { x: number; y: number; items: ContextMenuItem[] } | null
  theme: string

  openModal: (modal: ModalType) => void
  closeModal: () => void
  setActiveView: (view: View) => void
  setLeftPanelTab: (tab: LeftPanelTab) => void
  setRightPanel: (panel: RightPanel) => void
  toggleRightPanel: (panel: RightPanel) => void
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void
  hideContextMenu: () => void
  toggleTheme: () => void
  setTheme: (theme: string) => void

  // Legacy compatibility getters (computed from new state)
  showMemberSidebar: boolean
  showFriendsPanel: boolean
  toggleMemberSidebar: () => void
  setShowFriendsPanel: (show: boolean) => void
}

export interface ContextMenuItem {
  label: string
  icon?: string
  danger?: boolean
  onClick: () => void
}

function getInitialTheme(): string {
  try {
    const stored = localStorage.getItem('blite_theme')
    if (stored && getThemeById(stored)) return stored
    // Migrate legacy values
    if (stored === 'dark') return 'blite-dark'
    if (stored === 'light') return 'cyberpunk-light'
  } catch {}
  return DEFAULT_THEME_ID
}

function applyTheme(themeId: string) {
  const theme = getThemeById(themeId)
  if (!theme) return

  const root = document.documentElement

  // Set all CSS variables
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value)
  }

  // Toggle dark class for Tailwind
  if (theme.isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  try {
    localStorage.setItem('blite_theme', themeId)
  } catch {}
}

// Apply initial theme immediately
const initialTheme = getInitialTheme()
applyTheme(initialTheme)

export const useUIStore = create<UIState>((set, get) => ({
  activeModal: null,
  activeView: 'servers',
  leftPanelTab: 'rooms',
  rightPanel: 'none' as RightPanel,
  contextMenu: null,
  theme: initialTheme,

  // Legacy computed fields
  get showMemberSidebar() {
    return get().rightPanel === 'members'
  },
  get showFriendsPanel() {
    return get().leftPanelTab === 'friends'
  },

  openModal: (modal) => set({ activeModal: modal }),
  closeModal: () => set({ activeModal: null }),
  setActiveView: (view) => {
    const tab: LeftPanelTab = view === 'dms' ? 'dms' : 'rooms'
    set({ activeView: view, leftPanelTab: tab })
  },
  setLeftPanelTab: (tab) => {
    const view: View = tab === 'rooms' ? 'servers' : 'dms'
    set({ leftPanelTab: tab, activeView: view })
  },

  // Legacy compatibility
  toggleMemberSidebar: () => set((state) => ({
    rightPanel: state.rightPanel === 'members' ? 'none' : 'members',
  })),
  setShowFriendsPanel: (show) => {
    if (show) {
      set({ leftPanelTab: 'friends', activeView: 'dms' })
    } else {
      set({ leftPanelTab: 'dms' })
    }
  },

  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) => set((state) => ({
    rightPanel: state.rightPanel === panel ? 'none' : panel,
  })),
  showContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  hideContextMenu: () => set({ contextMenu: null }),
  toggleTheme: () =>
    set((state) => {
      const idx = THEMES.findIndex((t) => t.id === state.theme)
      const next = THEMES[(idx + 1) % THEMES.length]
      applyTheme(next.id)
      return { theme: next.id }
    }),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
}))
