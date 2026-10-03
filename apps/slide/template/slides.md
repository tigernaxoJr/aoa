---
theme: default
title: Agent Offload Front Architecture
class: text-center
transition: slide-left
aspectRatio: '16/9'
---

# Agent Studio Slidev

基於 **AOFA** 架構的新一代簡報生成平台

<div class="pt-8">
  <span class="px-3 py-1 text-xs font-semibold rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
    Slidev + Three.js + SVG + Coding Agent
  </span>
</div>

<!--
講者備忘：歡迎大家參加本次簡報，今天將展示如何透過 Coding Agent 結合 Slidev 與前端視覺能力快速生成簡報。
-->

---
layout: two-cols
---

# 核心優勢

運用 Coding Agent 的前端視覺三劍客

- 🎨 **HTML + Tailwind CSS**
  - 不受傳統模板束縛，自由排版 Bento Grid
- 📐 **原生向量 SVG**
  - 複雜架構圖直接以向量繪製，放大不失真
- 🌐 **Three.js 3D 視覺**
  - 封裝為 Vue 組件，一行標籤嵌入立體動效
- 📄 **無損向量 PDF 輸出**
  - 結合 Playwright Headless 引擎直接輸出標準 PDF

::right::

<div class="p-6 rounded-xl border border-slate-700 bg-slate-900/40 mt-12">
  <h3 class="text-sky-400 font-semibold mb-2">逐步揭示動畫 (v-click)</h3>
  <div v-click class="p-3 my-2 bg-slate-800/80 rounded border-l-4 border-emerald-500 text-sm">
    1. 透過 FSA API 授權本機目錄
  </div>
  <div v-click class="p-3 my-2 bg-slate-800/80 rounded border-l-4 border-sky-500 text-sm">
    2. Coding Agent 在本機自動撰寫 slides.md
  </div>
  <div v-click class="p-3 my-2 bg-slate-800/80 rounded border-l-4 border-purple-500 text-sm">
    3. 本機執行匯出腳本產出 output/slides.pdf
  </div>
</div>

---

# 系統架構

前後端純靜態檔案通訊模式 (AOFA)

<div class="mt-8">
  <SvgDiagram title="零後端通訊管線" />
</div>

<div class="mt-8 text-sm text-slate-400 text-center">
  前端透過 File System Access API 輪詢 <code>slide.activity.json</code>，全程通訊不出本機。
</div>

---

# 3D 互動視覺展示

封裝 Three.js 組件，直接在簡報內渲染 3D 場景

<div class="mt-4">
  <ThreeGlobe />
</div>

<p class="text-center text-xs text-slate-400 mt-2">
  使用 <code>&lt;ThreeGlobe /&gt;</code> 自動註冊組件，支援動態旋轉與自適應縮放
</p>

---
layout: center
class: text-center
---

# 立即開始

以 Coding Agent 釋放前所未有的簡報表現力

[前往工作台]({{SITE_URL}}/slide/) · [Slidev 文件](https://sli.dev/)
