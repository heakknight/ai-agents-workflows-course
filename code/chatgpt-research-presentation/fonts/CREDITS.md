# Bundled fonts

Both files are the Latin subsets of variable Google Fonts, downloaded from
`fonts.gstatic.com` and stored locally so the deck makes no network requests
at presentation time.

| File | Family | License | Source |
|---|---|---|---|
| `rubik-latin-var.woff2` | Rubik (wght 400–800) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Rubik |
| `shantell-sans-latin-var.woff2` | Shantell Sans (wght 300–800) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Shantell+Sans |

Rubik is used for titles, Shantell Sans for body copy (readable sans with a
hand-drawn touch).

`fonts.css` embeds both files as base64 data URIs — browsers refuse to load
`@font-face` files over `file://`, so this is what makes the deck work when
`index.html` is opened by double-clicking it. Regenerate it from the two
`.woff2` files if you swap a font.
