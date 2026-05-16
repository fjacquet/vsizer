import { registerSW as viteRegisterSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import i18n from '@/i18n'

// StrictMode invokes effects twice in development; without this guard the
// service worker would be registered (and update listeners wired) twice.
let registered = false

export function registerSW() {
  if (registered) return
  registered = true

  const updateSW = viteRegisterSW({
    immediate: true,
    onNeedRefresh() {
      // ADR-0004: a reload drops the in-memory dataset, so the new version
      // is never activated silently — the user opts in explicitly.
      toast(i18n.t('common:pwa.updateAvailable'), {
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: i18n.t('common:pwa.reload'),
          onClick: () => {
            void updateSW(true)
          },
        },
      })
    },
    onOfflineReady() {
      toast.success(i18n.t('common:pwa.offlineReady'))
    },
    onRegisterError(error) {
      // No user data is involved; a console error is enough.
      console.error('vsizer: service worker registration failed', error)
    },
  })
}
