// PROTOTYPE (#84). Hand-written ground truth, read off the original source
// (not off the transform's output). `expect` is the line To-handoff should
// cite as the usage: the app-code JSX site of the Code Library component,
// icon or host element. `instance` is the call site of an app wrapper.

const F = "app/request-access-form.tsx"
const P = "app/page.tsx"
const S = "components/submit-button.tsx"

export const v0 = {
  default: [
    ["[data-slot=card]", 0, `${P}:18`],
    ["[data-slot=card-header]", 0, `${P}:19`],
    ["[data-slot=card-header] svg", 0, `${P}:21`],
    ["[data-slot=card-title]", 0, `${P}:22`],
    ["[data-slot=card-description]", 0, `${P}:24`],
    ["[data-slot=card-content]", 0, `${P}:28`],
    ["[data-slot=card-footer]", 0, `${P}:31`],
    ["[data-slot=card-footer] > span", 0, `${P}:32`],
    ["a[href='/signin']", 0, `${P}:33`, "asChild"],
    ["form", 0, `${F}:56`],
    ["label[for=name]", 0, `${F}:65`],
    ["#name", 0, `${F}:66`],
    ["label[for=email]", 0, `${F}:69`],
    ["#email", 0, `${F}:70`],
    ["label[for=team]", 0, `${F}:73`],
    ["#team", 0, `${F}:75`],
    ["#team [data-slot=select-value]", 0, `${F}:76`],
    ["#team > svg", 0, `${F}:75`, "inside-library"],
    ["label[for=reason]", 0, `${F}:86`],
    ["#reason", 0, `${F}:87`],
    ["button[type=submit]", 0, `${S}:11`, "wrapper", `${F}:89`],
  ],
  "select-open": [
    ["[data-slot=select-content]", 0, `${F}:78`, "portal"],
    ["[data-slot=select-item]", 0, `${F}:79`, "portal"],
    ["[data-slot=select-item]", 1, `${F}:80`, "portal"],
    ["[data-slot=select-item]", 2, `${F}:81`, "portal"],
    ["[data-slot=select-item] svg", 0, `${F}:79`, "inside-library"],
  ],
  loading: [
    ["button[type=submit]", 0, `${S}:11`, "wrapper", `${F}:89`],
    ["button[type=submit] svg", 0, `${S}:12`, "wrapper", `${F}:89`],
  ],
  error: [
    ["[data-slot=alert]", 0, `${F}:58`],
    ["[data-slot=alert] > svg", 0, `${F}:59`],
    ["[data-slot=alert-title]", 0, `${F}:60`],
    ["[data-slot=alert-description]", 0, `${F}:61`],
  ],
  success: [
    ["svg.text-emerald-600", 0, `${F}:46`],
    ["p.font-medium", 0, `${F}:47`],
    ["button[data-variant=outline]", 0, `${F}:48`],
    ["[data-sonner-toast]", 0, "app/layout.tsx:32", "node_modules"],
  ],
}

const I = "src/pages/Index.tsx"
const C = "src/components/PlanCard.tsx"

export const lovable = {
  default: [
    ["h1", 0, `${I}:47`],
    ["header p", 0, `${I}:48`],
    ["[data-slot=card]", 0, `${C}:15`, "wrapper", `${I}:53`],
    ["[data-slot=card]", 1, `${C}:15`, "wrapper", `${I}:53`],
    ["[data-slot=card]", 2, `${C}:15`, "wrapper", `${I}:53`],
    ["[data-slot=card-header]", 0, `${C}:16`],
    ["[data-slot=card-title]", 0, `${C}:17`],
    ["[data-slot=card-title] svg", 0, `${C}:19`],
    ["[data-slot=card-description]", 0, `${C}:21`],
    ["label[for=name]", 0, `${I}:76`],
    ["#name", 0, `${I}:77`],
    ["label[for=email]", 0, `${I}:80`],
    ["#email", 0, `${I}:81`],
    ["label[for=size]", 0, `${I}:85`],
    ["#size", 0, `${I}:87`],
    ["#size [data-slot=select-value]", 0, `${I}:88`],
    ["#size > svg", 0, `${I}:87`, "inside-library"],
    ["label[for=notes]", 0, `${I}:98`],
    ["#notes", 0, `${I}:99`],
    ["button[type=submit]", 0, `${I}:101`],
  ],
  "select-open": [
    ["[data-slot=select-content]", 0, `${I}:90`, "portal"],
    ["[data-slot=select-item]", 0, `${I}:91`, "portal"],
    ["[data-slot=select-item]", 1, `${I}:92`, "portal"],
    ["[data-slot=select-item]", 2, `${I}:93`, "portal"],
    ["[data-slot=select-item] svg", 0, `${I}:92`, "inside-library"],
  ],
  loading: [
    ["button[type=submit]", 0, `${I}:101`],
    ["button[type=submit] svg", 0, `${I}:102`],
  ],
  error: [
    ["[data-slot=alert]", 0, `${I}:68`],
    ["[data-slot=alert] > svg", 0, `${I}:69`],
    ["[data-slot=alert-title]", 0, `${I}:70`],
    ["[data-slot=alert-description]", 0, `${I}:71`],
  ],
  success: [
    ["svg.text-emerald-600", 0, `${I}:59`],
    ["p.font-medium", 0, `${I}:60`],
    ["button[data-variant=outline]", 0, `${I}:61`],
    ["[data-sonner-toast]", 0, "src/App.tsx:9", "node_modules"],
  ],
}
