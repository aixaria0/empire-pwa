# Empire Chat PWA

Installable chat app with **WebLLM** (in-browser AI), optional cloud/Ollama API, service worker, and push hooks.

## Live URL

After GitHub Pages is on:

https://aixaria0.github.io/empire-pwa/chat.html

## Files

| File | Purpose |
|------|---------|
| `chat.html` | Main chat + WebLLM |
| `index.html` | PWA / push settings |
| `sw.js` | Service worker |
| `manifest.json` | Install manifest |
| `icon.svg` | App icon |
| `push-manager.js` | Push subscription helpers |

## Use WebLLM

1. Open chat in **Chrome**
2. Settings → Mode: **WebLLM**
3. Model: **Llama 3.2 1B**
4. **Load / switch model**
5. Wait for download → chat

Needs **WebGPU**. First load is large; later uses cache.
