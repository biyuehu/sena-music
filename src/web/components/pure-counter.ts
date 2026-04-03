import { defineComponent, html, Prop, Ref, State } from '@/romi/web'
import { httpClient } from '../client'

defineComponent(
  'pure-counter',
  {
    count: State(0),
    step: Prop(1),
    memo: Ref<number[]>([])
  },
  {
    useGlobalStyles: true,
    styles: /* css */ `
      :host {
        display: block;
        padding: 16px;
        background: #f0f0f0;
        border-radius: 8px;
      }
      p {
        color: #333;
        font-family: sans-serif;
      }
    `,
    connectedCallback: (host) => {
      const timer = setInterval(() => host.count++, 1000)
      return () => clearInterval(timer)
    },
    willUpdate: (host) => {
      host.memo.push(host.count)
    },
    render: (host) => html`
      <button class="bg-red" @click=${() => (host.count += host.step)}>
        count: ${host.count}
      </button>
      <button @click=${() => {
        httpClient
          .getUser({ int: 2333 })
          .then((x) => console.log(x.value))
          .catch((e) => console.error('Err', e))
        httpClient.addDecade({ date: new Date() }).then((v) => {
          if (v.isLeft()) {
            console.error('Err', v.value)
            return
          }
          console.log(v.value.date instanceof Date)
          console.log(v.value.date.getFullYear())
        })
      }}>Request</button>
    `,
    firstUpdated: (host) => {
      console.log('first render, host:', host)
    }
  }
)
