# Unlimited Pins for WhatsApp Web (unofficial)

Chrome extension: pin more than 3 chats in WhatsApp Web's own chat list.

Not affiliated with, endorsed or supported by WhatsApp or Meta.

## How it works

- Use WhatsApp's own **Pin chat** menu item or keyboard shortcut, as usual.
- While you have fewer than 3 normal pins, a new pin is a normal WhatsApp pin and syncs to your phone.
- Past 3, the extension keeps the pin in this browser and marks the chat as pinned in the page. It shows at the top of the list with WhatsApp's own pin icon, and **Unpin** works as usual.
- Extra pins are never sent to WhatsApp's servers. They don't show on your phone or other devices, and they are per Chrome profile.

## Install (development)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose the `extension/` folder.
3. Reload WhatsApp Web.

To check it's running: in DevTools, the `<html>` element has `data-up-status="ready"`.

## Development

```sh
npm install
npx playwright install chromium
npm test          # typecheck, lint, unit, integration and e2e tests
npm run build     # dist/unlimited-pins-for-whatsapp-web-<version>.zip
```

The tests use a fake of WhatsApp Web's internals and never contact WhatsApp. See `CLAUDE.md` for the project map.

## Limitations

- It relies on WhatsApp Web's internal module names. A WhatsApp update can break it; then the extension does nothing and WhatsApp behaves as usual.
- Newsletter (channel) pins keep WhatsApp's own limit.

## Privacy

Pins are stored only in Chrome's local extension storage on this computer. Nothing is sent anywhere. See [PRIVACY.md](PRIVACY.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
