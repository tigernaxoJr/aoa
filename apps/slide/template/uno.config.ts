// Slidev turns on UnoCSS attributify, which reads SVG presentation attributes as utilities:
// <text font-size="16"> becomes font-size-16 (4rem, four times too big), stroke="red" becomes
// Uno's red-400. Blocking those attribute selectors leaves the SVG attributes in charge.
// Slidev merges this file into its own UnoCSS config.
export default {
  blocklist: [/^\[(?:font-size|word-spacing|letter-spacing|rotate|scale|color|stroke|stroke-width|fill|fill-opacity|stroke-opacity)~?="/],
}
