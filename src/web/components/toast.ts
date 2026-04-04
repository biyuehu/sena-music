import { html } from 'lit-html'
import { defineComponent, State } from '@/romi/web'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration: number
}

export const toast = defineComponent(
  'toast-container',
  {
    toasts: State<ToastItem[]>([])
  },
  {
    useGlobalStyles: true,
    connectedCallback: (host) => {
      const showToast = (message: string, type: ToastType = 'info', duration: number = 3000) => {
        const id = Math.random().toString(36).slice(2, 9)
        const toastItem: ToastItem = { id, message, type, duration }

        host.toasts = [...host.toasts, toastItem]

        if (duration > 0) {
          setTimeout(() => {
            host.toasts = host.toasts.filter((t) => t.id !== id)
          }, duration)
        }
      }

      const handleToastEvent = (e: CustomEvent) => {
        const { message, type, duration } = e.detail
        showToast(message, type, duration)
      }

      document.addEventListener('show-toast', handleToastEvent as EventListener)

      return () => {
        document.removeEventListener('show-toast', handleToastEvent as EventListener)
      }
    },

    render: (host) => {
      const getBorderClass = (type: ToastType) => {
        switch (type) {
          case 'success':
            return 'border-l-4 border-l-green-500'
          case 'error':
            return 'border-l-4 border-l-red-500'
          case 'warning':
            return 'border-l-4 border-l-yellow-500'
          default:
            return 'border-l-4 border-l-blue-500'
        }
      }

      const getIcon = (type: ToastType) => {
        switch (type) {
          case 'success':
            return '✅'
          case 'error':
            return '❌'
          case 'warning':
            return '⚠️'
          default:
            return 'ℹ️'
        }
      }

      return html`
        <div class="fixed top-5 right-5 z-1000 flex flex-col gap-3 pointer-events-none">
          ${host.toasts.map(
            (t) => html`
              <div class="flex items-center gap-3 p-4 rounded bg-[var(--lx-main)] border border-[var(--lx-border)] shadow-xl min-w-64 max-w-xs pointer-events-auto ${getBorderClass(t.type)}">
                <div class="text-base flex-shrink-0">
                  ${getIcon(t.type)}
                </div>
                <div class="flex-1 text-sm text-[var(--lx-text)] font-medium leading-relaxed">
                  ${t.message}
                </div>
                <button 
                  class="p-1 rounded hover:bg-[var(--lx-border)] text-[var(--lx-text-muted)] hover:text-[var(--lx-text)] transition-colors"
                  @click=${() => {
                    host.toasts = host.toasts.filter((item) => item.id !== t.id)
                  }}
                >
                  <div class="i-carbon-close text-base block"></div>
                </button>
              </div>
            `
          )}
        </div>
      `
    }
  }
)

export const showToast = (message: string, type: ToastType = 'info', duration: number = 3000) => {
  const event = new CustomEvent('show-toast', {
    detail: { message, type, duration }
  })
  document.dispatchEvent(event)
}
