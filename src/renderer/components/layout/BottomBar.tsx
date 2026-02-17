import React from 'react'
import { MessageSquare, Plus } from 'lucide-react'
import Tooltip from '@renderer/components/common/Tooltip'
import { useServerStore } from '@renderer/stores/serverStore'
import { useUIStore } from '@renderer/stores/uiStore'
import { getAssetUrl } from '@renderer/services/config'
import type { Server } from '@shared/types'

export default function BottomBar() {
  const servers = useServerStore((s) => s.servers)
  const activeServerId = useServerStore((s) => s.activeServerId)
  const setActiveServer = useServerStore((s) => s.setActiveServer)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const openModal = useUIStore((s) => s.openModal)
  const showContextMenu = useUIStore((s) => s.showContextMenu)

  const handleDMClick = () => {
    setActiveView('dms')
    setActiveServer(null)
  }

  const handleServerClick = (serverId: string) => {
    setActiveView('servers')
    setActiveServer(serverId)
  }

  const handleServerContextMenu = (e: React.MouseEvent, server: Server) => {
    e.preventDefault()
    showContextMenu(e.clientX, e.clientY, [
      {
        label: 'Invite People',
        onClick: () => {
          setActiveServer(server.id)
          openModal('invite')
        },
      },
      {
        label: 'Room Settings',
        onClick: () => {
          setActiveServer(server.id)
          openModal('serverSettings')
        },
      },
      {
        label: 'Leave Room',
        danger: true,
        onClick: () => {
          import('@renderer/services/api').then(({ serverAPI }) => {
            serverAPI.leave(server.id).then(() => {
              useServerStore.getState().removeServer(server.id)
            })
          })
        },
      },
    ])
  }

  const isDMActive = activeView === 'dms'

  return (
    <div className="h-14 bg-blite-bg-secondary flex items-center justify-center px-2 flex-shrink-0 no-select border-t border-blite-border gap-1">
      {/* DMs */}
      <Tooltip content="Direct Messages (Ctrl+0)" position="top">
        <button
          onClick={handleDMClick}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            isDMActive
              ? 'gradient-accent text-white glow-accent-sm rounded-2xl'
              : 'text-blite-text-secondary hover:text-blite-text-primary hover:bg-blite-bg-hover'
          }`}
        >
          <MessageSquare size={20} />
        </button>
      </Tooltip>

      {/* Divider */}
      <div className="w-px h-6 bg-blite-border flex-shrink-0 mx-1" />

      {/* Server icons - scrollable */}
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none justify-center">
        {servers.map((server, index) => {
          const isActive = activeView === 'servers' && activeServerId === server.id
          const shortcut = index < 9 ? ` (Ctrl+${index + 1})` : ''
          return (
            <Tooltip key={server.id} content={`${server.name}${shortcut}`} position="top">
              <button
                onClick={() => handleServerClick(server.id)}
                onContextMenu={(e) => handleServerContextMenu(e, server)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                  isActive
                    ? 'gradient-accent text-white glow-accent-sm rounded-2xl'
                    : 'text-blite-text-secondary hover:text-blite-text-primary hover:bg-blite-bg-hover'
                }`}
              >
                {server.iconUrl ? (
                  <img
                    src={getAssetUrl(server.iconUrl)}
                    alt={server.name}
                    className={`w-10 h-10 object-cover transition-all ${
                      isActive ? 'rounded-2xl' : 'rounded-xl'
                    }`}
                  />
                ) : (
                  <span className={`w-10 h-10 flex items-center justify-center text-sm font-bold transition-all ${
                    isActive
                      ? 'gradient-accent text-white rounded-2xl'
                      : 'bg-blite-bg-tertiary text-blite-text-primary rounded-xl'
                  }`}>
                    {server.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </button>
            </Tooltip>
          )
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-blite-border flex-shrink-0 mx-1" />

      {/* Add Room */}
      <Tooltip content="Add a Room" position="top">
        <button
          onClick={() => openModal('createServer')}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-blite-success hover:bg-blite-success/10 transition-all border-2 border-dashed border-blite-border hover:border-blite-success/50"
        >
          <Plus size={20} />
        </button>
      </Tooltip>
    </div>
  )
}
