# #322 prototype run

Page: `.scratch/plain-html-families/health-check-main/banner-app.html`, read 2026-10-22. Browser: system Chrome (/Applications/Google Chrome.app/Contents/MacOS/Google Chrome), 390px wide.

## Cost

| | static | rendered |
|---|---|---|
| wall time, run 1 / run 2 | 100 ms / 7 ms | 12205 ms / 11838 ms |
| of which | parse only | load 795 ms, text samples 5007 ms, read 40 ms, hover and press 2239 ms |
| network | none | unpkg.com 200, site-assets.fontawesome.com 403, site-assets.fontawesome.com net::ERR_ABORTED, site-assets.fontawesome.com 403, site-assets.fontawesome.com net::ERR_ABORTED |
| packages | parse5 | parse5, playwright-core, a Chrome |
| output | 7.4 KB | 27.0 KB |
| rerun diff | identical | identical |

## Groups

| | static | rendered |
|---|---|---|
| elements in body | 22 | 22 |
| naive groups | 22 (one per class list) | 21 (one per computed signature); 1 repeated: .header + .body |
| similarity over every element | n/a | 9: .container + .header + .ai-icon + .body + .input-area + .action + .action-left + .action-right + .info-section + .cta-section · .chat-card · img · .typed-text + .cursor · .add-button + .send-button · .fa-sharp.fa-solid.fa-plus + .fa-sharp.fa-solid.fa-arrow-up + .fa-sharp.fa-solid.fa-chevron-right · .title · .intro · .cta-button |
| candidates | 5: interactive, own paint or own state rules | 5: painted or pointer |
| families proposed | chat-card, add-button, send-button, cta-button; parts: cursor of chat-card | .chat-card · .cursor · .add-button + .send-button · .cta-button (no names: labels shown here only) |
| merge proposals | add-button + send-button (jaccard 1; differ: width, background-color, border-radius, color); add-button + cta-button (jaccard 0.43, same paint token; differ: display, border-radius); send-button + cta-button (jaccard 0.43; differ: display, background-color, border-radius, color) | the similarity groups above |
| slots | chat-card: add-button, send-button | none: no nesting rule |
| states | chat-card: none; add-button: hover, pressed; send-button: hover, pressed; cta-button: hover, pressed, from `:hover`/`:active` rules | forced on 3 pointer elements: .add-button hover rgba(1, 23, 43, 0.15), pressed matrix(0.95, 0, 0, 0.95, 0, 0); .send-button hover rgb(10, 42, 74), pressed matrix(0.95, 0, 0, 0.95, 0, 0); .cta-button hover rgba(1, 23, 43, 0.15), pressed matrix(0.98, 0, 0, 0.98, 0, 0) |
| axis names | from tokens: icon: highlight | primary; text: information | primary; button: primary | secondary | spacing | pill | rect | min | values only, e.g. rgb(1, 23, 43) vs rgba(1, 23, 43, 0.1) |
| icons | plus (sharp solid), arrow-up (sharp solid), chevron-right (sharp solid) | .fa-sharp.fa-solid.fa-plus 0×0; .fa-sharp.fa-solid.fa-arrow-up 0×0; .fa-sharp.fa-solid.fa-chevron-right 0×0 |
| icons, Free CDN experiment | n/a | .fa-sharp.fa-solid.fa-plus 14×16 "+" in "Font Awesome 6 Free"; .fa-sharp.fa-solid.fa-arrow-up 12×16 "" in "Font Awesome 6 Free"; .fa-sharp.fa-solid.fa-chevron-right 8.9×14 "" in "Font Awesome 6 Free" |
| image icon | assets/ai-icon.svg; unused: assets/chevron-right.svg | assets/ai-icon.svg 24×24 |
| script text | #typed-output: 6 strings | one element changes over 5 samples: "" → "คุยกับ Ch" → "คุยกับ Charlie AI" → "คุยกับ Charlie AI" → "วิเคราะห์พอร์ตหุ" |
| inline style from script | .send-button touchstart: transform scale(0.95); .send-button touchend: transform scale(1) | not seen (no touch events) |
| classes toggled by script | none | n/a |
| fonts | declared: var(--body-font-family) → 'Finnomena Trek', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif | @font-face fonts: none; the text renders in whatever font this machine has installed under that name (Finnomena Trek is installed on the owner's Mac, so the metrics differ elsewhere) |
| media rules | (max-width: 480px) → body; (max-width: 320px) → .header, .body, .action; (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) → .chat-card | at DPR 2: .chat-card border 1px → 2px |
| browser CSSOM | n/a | releases/v6.5.1/css/all.css blocked (SecurityError); releases/v6.5.1/css/sharp-solid.css blocked (SecurityError); styles.css 36 rules; `.send-button` matched: .send-button, .send-button:hover, .send-button:active |
