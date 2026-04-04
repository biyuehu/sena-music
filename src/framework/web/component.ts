// import type { TemplateResult } from 'lit-html'
// import { html, render } from 'lit-html'

import type { TemplateResult } from 'lit-html'
import { html, render } from 'lit-html'
import { batch, effect, signal } from 'usignal'
import { Variant } from '@/romi/utils/adt'
import { buildSheets, globalStyleWatcher } from './sheets'

export type { TemplateResult }
export { batch, html, render }

class Prop_<T = unknown> extends Variant<'DefineField:Prop', T> {}

class State_<T = unknown> extends Variant<'DefineField:State', T> {}

class Ref_<T = unknown> extends Variant<'DefineField:Ref', T> {}

export type Prop<T = unknown> = Prop_<T>

export type State<T = unknown> = State_<T>
export type Ref<T = unknown> = Ref_<T>
export type DefineField = Prop | State | Ref

export const Prop = <T>(value: T): Prop<T> => new Prop_(value)

export const State = <T>(value: T): State<T> => new State_(value)

export const Ref = <T>(value: T): Ref<T> => new Ref_(value)

export type AnyFields = Record<string, Prop | State | Ref>

export type InferFields<T extends AnyFields> = {
  [K in keyof T]: T[K] extends Prop<infer V> | State<infer V> | Ref<infer V> ? V : never
}

export type Host<T extends AnyFields> = InferFields<T> & HTMLElement

export type ComponentConstructor<T extends AnyFields> = new () => Host<T>

export type Definition<T extends AnyFields> = {
  useGlobalStyles?: boolean
  styles?: string | CSSStyleSheet | Array<string | CSSStyleSheet>
  render?: (host: Host<T>) => TemplateResult
  connectedCallback?: (host: Host<T>) => (() => void) | undefined
  disconnectedCallback?: (host: Host<T>) => void
  willUpdate?: (host: Host<T>) => void
  firstUpdated?: (host: Host<T>) => void
  updated?: (host: Host<T>) => void
} /*  & ({ shadow?: false } | { shadow: true; styles?: string | CSSStyleSheet | Array<string | CSSStyleSheet> }) */

const RESERVED_KEYS = new Set([
  'styles',
  'render',
  'connectedCallback',
  'disconnectedCallback',
  'willUpdate',
  'firstUpdated',
  'updated'
])

function parseAttr(attrVal: string | null, defaultVal: unknown): unknown {
  if (attrVal === null) return defaultVal
  switch (typeof defaultVal) {
    case 'number':
      return Number(attrVal)
    case 'boolean':
      return attrVal !== 'false'
    default:
      return attrVal
  }
}

function serializeAttr(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === 'boolean') return val ? '' : null
  return String(val)
}

/* 

let cachedGlobalSheet = null;

function getGlobalSheet() {
  if (cachedGlobalSheet) return cachedGlobalSheet;

  const sheet = new CSSStyleSheet();
  // 提取 UnoCSS 或全局样式
  // 注意：跨域的 <link> 样式表由于安全限制无法通过 cssRules 读取
  const allCss = Array.from(document.styleSheets)
    .filter(s => !s.href || s.href.startsWith(location.origin)) // 过滤掉跨域样式
    .map(s => {
      try {
        return Array.from(s.cssRules).map(r => r.cssText).join('');
      } catch (e) { return ''; }
    }).join('\n');

  sheet.replaceSync(allCss);
  cachedGlobalSheet = sheet;
  return sheet;
}
*/

export function defineComponentFrom<T extends AnyFields>(
  fields: T,
  definition: Definition<T>
): ComponentConstructor<T> {
  const sheets = definition.styles ? buildSheets(definition.styles) : null

  type AnySignal = ReturnType<typeof signal<unknown>>

  class El extends HTMLElement {
    private readonly root: ShadowRoot /* | this */
    private readonly signals = new Map<string, AnySignal>()
    private readonly refs = new Map<string, unknown>()
    private stopEffect: (() => void) | null = null
    private userCleanup: (() => void) | undefined = void 0
    private firstRendered = false

    public constructor() {
      super()
      this.root = this.attachShadow({ mode: 'open' })
      this.root.adoptedStyleSheets = definition.useGlobalStyles
        ? [globalStyleWatcher.sheet, ...(sheets ?? [])]
        : (sheets ?? [])
      this.initFields()
    }

    private initFields(): void {
      for (const [key, field] of Object.entries(fields).filter(([k]) => !RESERVED_KEYS.has(k))) {
        if (field instanceof Ref_) {
          this.refs.set(key, field.value)
          Object.defineProperty(this, key, {
            get: () => this.refs.get(key),
            set: (v: unknown) => {
              this.refs.set(key, v)
            },
            enumerable: true,
            configurable: true
          })
        } else {
          const sig = signal((field as Prop | State).value)
          this.signals.set(key, sig)
          Object.defineProperty(this, key, {
            get: () => sig.value,
            set: (v: unknown) => {
              sig.value = v
              if (field instanceof Prop_) {
                const attr = serializeAttr(v)
                if (attr === null) this.removeAttribute(key)
                else this.setAttribute(key, attr)
              }
            },
            enumerable: true,
            configurable: true
          })
        }
      }
    }

    public connectedCallback(): void {
      this.stopEffect = this.setupEffect()
      this.userCleanup = definition.connectedCallback?.(this as unknown as Host<T>)
    }

    public disconnectedCallback(): void {
      // 停止渲染 effect
      this.stopEffect?.()
      this.stopEffect = null
      // 执行用户在 connectedCallback 里返回的清理函数
      if (typeof this.userCleanup === 'function') this.userCleanup()
      definition.disconnectedCallback?.(this as unknown as Host<T>)
      // 重置首次渲染标记（元素可能被重新挂载）
      this.firstRendered = false
    }

    public attributeChangedCallback(name: string, _prev: string | null, next: string | null): void {
      const field = fields[name]
      if (!(field instanceof Prop_)) return
      const sig = this.signals.get(name)
      if (!sig) return
      const parsed = parseAttr(next, (field as Prop).value)
      // 避免 setAttribute ↔ signal 之间无限循环
      if (sig.value !== parsed) sig.value = parsed
    }

    private setupEffect(): (() => void) | null {
      if (!definition.render) return null
      const host = this as unknown as Host<T>

      /**
       * effect 立即执行一次（首次渲染），
       * 之后每当 render 函数读取的任意 signal 变更时自动重跑。
       *
       * 批量更新场景（同一 tick 设多个 signal）请在调用处包裹 batch()：
       *   batch(() => { host.a = 1; host.b = 2 })
       */
      return effect(() => {
        definition.willUpdate?.(host)

        if (definition.render)
          render(
            /* definition.css ? html`<style>${definition.css}</style>${definition.render(host)}` :  */ definition.render(
              host
            ),
            this.root
          )

        if (!this.firstRendered) {
          this.firstRendered = true
          definition.firstUpdated?.(host)
        }

        definition.updated?.(host)
      })
    }
  }

  return El as ComponentConstructor<T>
}

export function defineComponent<T extends AnyFields>(
  tag: string,
  fields: T,
  definition: Definition<T>
): ComponentConstructor<T> {
  const el = defineComponentFrom(fields, definition)
  customElements.define(tag, el)
  return el
}
