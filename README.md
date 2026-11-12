# Unlimited Pins for WhatsApp Web (unofficial)

[![Test](https://github.com/VatslauX/unlimited-pins-for-whatsapp-web/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/VatslauX/unlimited-pins-for-whatsapp-web/actions/workflows/test.yml)

A small Chrome extension that lets you pin more than 3 chats in WhatsApp Web (web.whatsapp.com). The extra pins look and work like WhatsApp's own.

> **Unofficial.** Not affiliated with, endorsed or supported by WhatsApp or Meta. WhatsApp is a trademark of its owner.

## Features

**Pin more than 3 chats**
- Use WhatsApp's own **Pin chat** item in the chat menu, or its keyboard shortcut, as usual. WhatsApp's message that only 3 chats can be pinned no longer appears.
- Extra pins sit at the top of the chat list with WhatsApp's own pin icon. A new pin goes to the top.
- **Unpin** works as usual, from the same menu or shortcut.

**Your first 3 pins stay normal WhatsApp pins**
- While you have fewer than 3 pins, a new pin is a normal WhatsApp pin and shows on your phone too.
- Pins past 3 are kept only in this browser. They are never sent to WhatsApp, so they don't show on your phone or your other devices.
- When you unpin a normal pin, your next pin becomes a normal one again. Extra pins you already have stay in this browser.

**Kept after a reload, shown in every tab**
- Extra pins stay after you reload WhatsApp Web or restart Chrome.
- Pinning or unpinning in one WhatsApp Web tab shows up in every other open tab right away.

## Installation

Install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/flnjhmfjbpendkggmmbkdnankjojhbgg). Chrome keeps it up to date automatically.

Requires Chrome 111 or newer. There is nothing to set up: open or reload WhatsApp Web and pin chats as usual.

## Privacy & safety

- Runs only on `https://web.whatsapp.com/`. The only permission is `storage`, used to save your extra pins. It makes no network requests at all, and there is no analytics or remote code.
- Extra pins are saved only on this computer, in Chrome's local extension storage for your Chrome profile. They are not synced to your Google account, because a chat's id contains the contact's phone number.
- The extension never sends more pins to WhatsApp than WhatsApp itself allows. It doesn't read your messages or contacts' names.

## Notes & limitations

- Extra pins are per Chrome profile. Another computer, browser or Chrome profile doesn't have them.
- Turn the extension off and the extra pins disappear from the list after a reload; turn it on again and they come back. Removing the extension deletes them. Your normal WhatsApp pins are not affected either way.
- Channel (newsletter) pins keep WhatsApp's own limit.
- The extension relies on WhatsApp Web's internal structure, so a WhatsApp update may break it. If that happens, the extension does nothing and WhatsApp works as usual, with its own 3-pin limit.

See [CHANGELOG.md](CHANGELOG.md) for release notes and [PRIVACY.md](PRIVACY.md) for the privacy policy.

## License

[Apache License 2.0](LICENSE) — see also [NOTICE](NOTICE). WhatsApp is a trademark of its owner; this project is not affiliated with WhatsApp or Meta.
