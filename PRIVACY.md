# Privacy Policy — Unlimited Pins for WhatsApp Web (unofficial)

_Last updated: 10 November 2026_

Unlimited Pins for WhatsApp Web is an unofficial browser extension that lets you pin more than 3 chats in WhatsApp Web at `web.whatsapp.com`. It is not affiliated with WhatsApp or Meta.

## Summary

The extension does not collect, sell or share your personal data. It stores only the list of chats you pinned past WhatsApp's limit, in your own browser. Nothing is sent to the developer, to WhatsApp, or to any third party.

## What the extension accesses, and why

| Data | What it is used for | Where it goes |
|---|---|---|
| **Your chat list in WhatsApp Web** (chat ids and whether each chat is pinned) | To show your extra pins at the top of the list and to count your normal pins | Read in the page; never stored or sent anywhere |
| **Your extra pins** (the chat id of each chat you pinned past the limit, and when) | To keep those chats pinned after a reload | Saved with Chrome's `storage.local`, on this computer only. Not `storage.sync`: a chat id contains the contact's phone number, and sync would copy it into your Google account. While WhatsApp Web is open, the list is also written into the page so the two parts of the extension can share it; the WhatsApp page can read it there |

The extension does not read your messages, contacts' names, or anything else in WhatsApp.

## What the extension does not do

- It sends no data anywhere. It makes no network requests at all.
- It does not send your extra pins to WhatsApp. Pins within WhatsApp's own limit are made by WhatsApp itself, as without the extension.
- It has no analytics, tracking, ads or remote code.
- It does not run on any website other than `https://web.whatsapp.com/`.

## Permissions

- **storage** — to save your extra pins.
- **Access to `web.whatsapp.com`** (via content scripts) — to show the pins in WhatsApp Web's chat list.

## Data retention and deletion

Unpinning a chat removes it from the list. Removing the extension deletes the whole list.

## Changes

If this policy changes, the new version will be published at this address with a new "Last updated" date.

## Contact

Questions: open an issue in the project repository.
