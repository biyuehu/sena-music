import { Just, type Maybe, Nothing } from '@/romi/utils/adt/maybe'
import type { AnyFields, Definition } from './component'

class GlobalStyleWatcher {
  private static instance: GlobalStyleWatcher

  public readonly sheet: CSSStyleSheet = new CSSStyleSheet()

  private observer: Maybe<MutationObserver> = Nothing()

  private constructor() {
    this.sync()
    this.initObserver()
  }

  public static getInstance(): GlobalStyleWatcher {
    if (!GlobalStyleWatcher.instance) {
      GlobalStyleWatcher.instance = new GlobalStyleWatcher()
    }
    return GlobalStyleWatcher.instance
  }

  public sync() {
    try {
      const allCss = Array.from(document.styleSheets)
        .filter((s) => {
          // 避开跨域限制，否则访问 cssRules 会报错
          try {
            return !s.href || s.href.startsWith(location.origin)
          } catch {
            return false
          }
        })
        .map((s) => {
          try {
            return Array.from(s.cssRules)
              .map((rule) => rule.cssText)
              .join('\n')
          } catch {
            return ''
          }
        })
        .join('\n')

      this.sheet.replaceSync(allCss)
    } catch (err) {
      console.error('杂鱼！同步全局样式失败了:', err)
    }
  }

  private initObserver() {
    if (typeof window === 'undefined') return

    this.observer = Just(
      new MutationObserver(() => {
        // 当 head 里的 style 变动时，延迟同步（防抖建议自行添加）
        this.sync()
      })
    )

    this.observer.map((observer) =>
      observer.observe(document.head, {
        childList: true,
        subtree: true,
        characterData: true
      })
    )
  }
}

export const globalStyleWatcher = GlobalStyleWatcher.getInstance()

export function buildSheets(styles: NonNullable<Definition<AnyFields>['styles']>): CSSStyleSheet[] {
  return (Array.isArray(styles) ? styles : [styles]).map((s) => {
    if (s instanceof CSSStyleSheet) return s
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(s as string)
    return sheet
  })
}
