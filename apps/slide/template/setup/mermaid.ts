// Mermaid options for every ```mermaid block (a block's own {…} options override these).
// A fixed seed keeps `look: 'handDrawn'` diagrams the same in the check screenshots, the PDF and the web deck.
//
// Colours follow the deck palette in the slidev-deck visual guide (sky / emerald / amber borders) instead of
// Mermaid's purple default. Slidev renders Mermaid with theme 'dark' in dark mode and our theme otherwise, and
// the themeVariables below apply on top of either, so each mode gets its own set: on the default white page,
// shapes take a light tint of each accent with slate-800 text; in dark mode (`colorSchema: dark`, or the
// viewer's dark preference when it is `auto`), shapes are slate-800 with slate-50 text. Each fill/text pair
// reads on its own, also under a hand-drawn hachure fill. The mode is read once, when the first diagram draws.
const sky = '#38bdf8'
const emerald = '#34d399'
const amber = '#f59e0b'

const light = {
  page: '#ffffff', text: '#1e293b', line: '#64748b', soft: '#f8fafc', grid: '#e2e8f0',
  sky: '#e0f2fe', emerald: '#d1fae5', amber: '#fef3c7', slate: '#f1f5f9', slateBorder: '#94a3b8',
}
const dark = {
  page: '#0f172a', text: '#f8fafc', line: '#94a3b8', soft: '#1e293b', grid: '#334155',
  sky: '#1e293b', emerald: '#14342b', amber: '#3b2a0a', slate: '#1e293b', slateBorder: '#64748b',
}

export default () => {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const c = isDark ? dark : light
  return {
    handDrawnSeed: 1,
    theme: 'base',
    themeVariables: {
      darkMode: isDark,
      fontFamily: 'inherit',
      background: c.page,
      // flowchart nodes, sequence actors, state boxes, class boxes
      primaryColor: c.sky,
      primaryBorderColor: sky,
      primaryTextColor: c.text,
      // second / third series (e.g. subgraph fill, alternate nodes)
      secondaryColor: c.emerald,
      secondaryBorderColor: emerald,
      secondaryTextColor: c.text,
      tertiaryColor: c.slate,
      tertiaryBorderColor: c.slateBorder,
      tertiaryTextColor: c.text,
      mainBkg: c.sky,
      nodeBorder: sky,
      nodeTextColor: c.text,
      clusterBkg: c.soft,
      clusterBorder: c.slateBorder,
      noteBkgColor: c.amber,
      noteBorderColor: amber,
      noteTextColor: c.text,
      // text and lines drawn directly on the page
      textColor: c.text,
      lineColor: c.line,
      edgeLabelBackground: c.soft,
      titleColor: c.text,
      // sequence diagrams
      actorBkg: c.sky,
      actorBorder: sky,
      actorTextColor: c.text,
      actorLineColor: c.line,
      signalColor: c.line,
      signalTextColor: c.text,
      labelBoxBkgColor: c.amber,
      labelBoxBorderColor: amber,
      labelTextColor: c.text,
      loopTextColor: c.text,
      activationBkgColor: c.emerald,
      activationBorderColor: emerald,
      // pie / gantt / timeline series
      pie1: sky,
      pie2: emerald,
      pie3: amber,
      pie4: '#94a3b8',
      pie5: '#0ea5e9',
      pie6: '#10b981',
      pie7: '#d97706',
      pieStrokeColor: c.page,
      pieOuterStrokeColor: c.page,
      pieTitleTextColor: c.text,
      pieSectionTextColor: '#1e293b',
      pieLegendTextColor: c.text,
      taskBkgColor: c.sky,
      taskBorderColor: sky,
      taskTextColor: c.text,
      taskTextOutsideColor: c.text,
      activeTaskBkgColor: c.emerald,
      activeTaskBorderColor: emerald,
      doneTaskBkgColor: c.slate,
      doneTaskBorderColor: c.slateBorder,
      critBkgColor: c.amber,
      critBorderColor: amber,
      sectionBkgColor: c.soft,
      altSectionBkgColor: c.page,
      gridColor: c.grid,
      todayLineColor: amber,
      cScale0: c.sky,
      cScale1: c.emerald,
      cScale2: c.amber,
      cScale3: c.slate,
    },
  }
}
