import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import pngToIco from 'png-to-ico'

app.whenReady().then(async () => {
  const svgContent = readFileSync(join(process.cwd(), 'logo.svg'), 'utf-8')
  const html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
    svg { width: 512px; height: 512px; display: block; }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`

  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      offscreen: true
    }
  })

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  // Wait a moment for rendering
  await new Promise((resolve) => setTimeout(resolve, 500))

  const image = await win.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const png512 = image.toPNG()
  writeFileSync('logo.png', png512)
  console.log('Saved logo.png (512x512)')

  const ico = await pngToIco('logo.png')
  writeFileSync('logo.ico', ico)
  console.log('Saved logo.ico')

  app.quit()
})
