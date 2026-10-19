// Plain names for Slidev's layouts and the parser's visual types (lib/slide-parser.ts); unknown ones show as written.

const LAYOUT: Record<string, string> = {
  default: '一般',
  cover: '封面',
  intro: '開場',
  center: '置中',
  section: '章節',
  'two-cols': '雙欄',
  'two-cols-header': '雙欄附標題',
  'image-left': '左圖',
  'image-right': '右圖',
  image: '滿版圖',
  'iframe-left': '左側網頁',
  'iframe-right': '右側網頁',
  iframe: '網頁',
  quote: '引言',
  fact: '數據',
  statement: '主張',
  full: '滿版',
  end: '結尾',
  none: '無版型',
}

const VISUAL: Record<string, string> = {
  SVG: '圖解',
  'Three.js / 3D': '3D',
  Mermaid: '流程圖',
  'Motion / Clicks': '逐步顯示',
}

export const layoutLabel = (layout: string) => LAYOUT[layout] ?? layout
export const visualLabel = (type: string) => VISUAL[type] ?? type
