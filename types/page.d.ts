// Page world (MAIN): WhatsApp Web's own module loader. Untyped on purpose — WhatsApp's internals change often.
interface Window { require?: (name: string) => any }
