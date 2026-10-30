# Google Material Symbols

The bundled `material-symbols.woff2` is a 68-icon subset of Google Material Symbols Outlined, obtained from the Google Fonts CSS API with fixed axes (optical size 24, weight 400, fill 0, grade 0). No glyph designs were edited. The subset was selected by Magnet using the API's `icon_names` parameter.

Copyright Google LLC. Licensed under the Apache License, Version 2.0; see [material-symbols.LICENSE](material-symbols.LICENSE).

Official sources:
- https://developers.google.com/fonts/docs/material_symbols
- https://github.com/google/material-design-icons

Preset ligatures are listed in `material-icons.json`. Keep that manifest, the font subset and the server validation whitelist in sync. The font and manifest are embedded and served locally behind dashboard authentication; the application makes no runtime Google Fonts request.
