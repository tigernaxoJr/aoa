// Pronunciation validation and polyphone auto-patching heuristics (SPEC §7.4).

/** Common Chinese polyphones with their context-dependent readings and homophone replacement suggestions. */
export const COMMON_POLYPHONES = [
  {
    char: '行',
    patterns: [
      { regex: /一行行|行數|行業|道行|同行|銀行/, reading: 'háng', homophone: '航', mistakeAs: ['形', '星', '型', 'xing'] },
      { regex: /行動|進行|行走|流行|旅行|行不行/, reading: 'xíng', homophone: '形', mistakeAs: ['航', '杭', 'hang'] },
    ],
  },
  {
    char: '重',
    patterns: [
      { regex: /重慶/, reading: 'chóng', homophone: '蟲', mistakeAs: ['仲', '中', '眾', 'zhong'] },
      { regex: /重新|重複|重疊|重現|重來/, reading: 'chóng', homophone: '蟲', mistakeAs: ['仲', '中', '眾', 'zhong'] },
      { regex: /重要|重量|重點|重視|沉重/, reading: 'zhòng', homophone: '仲', mistakeAs: ['蟲', '崇', 'chong'] },
    ],
  },
  {
    char: '長',
    patterns: [
      { regex: /長度|長條|漫長|長城|長江/, reading: 'cháng', homophone: '常', mistakeAs: ['掌', '漲', 'zhang'] },
      { regex: /成長|長大|長輩|部長|首長/, reading: 'zhǎng', homophone: '掌', mistakeAs: ['常', '嚐', 'chang'] },
    ],
  },
  {
    char: '朝',
    patterns: [
      { regex: /朝陽|朝氣|今朝|明朝|朝向/, reading: 'zhāo', homophone: '招', mistakeAs: ['巢', '潮', 'chao'] },
      { regex: /唐朝|漢朝|王朝|朝代/, reading: 'cháo', homophone: '巢', mistakeAs: ['招', '昭', 'zhao'] },
    ],
  },
  {
    char: '樂',
    patterns: [
      { regex: /音樂|樂隊|樂器|管弦樂/, reading: 'yuè', homophone: '月', mistakeAs: ['勒', '熱', 'le'] },
      { regex: /快樂|娛樂|樂趣|樂意/, reading: 'lè', homophone: '勒', mistakeAs: ['月', '岳', 'yue'] },
    ],
  },
  {
    char: '調',
    patterns: [
      { regex: /調查|調度|調動|協調/, reading: 'diào', homophone: '釣', mistakeAs: ['條', '桃', 'tiao'] },
      { regex: /調整|調節|調和/, reading: 'tiáo', homophone: '條', mistakeAs: ['釣', '吊', 'diao'] },
    ],
  },
]

const clean = (s) => (s ?? '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()

/**
 * Compares expected caption text against ASR transcribed text.
 * Returns an evaluation report with match score and any detected pronunciation issues.
 */
export function diffPronunciation(expectedText, heardText) {
  const normExpected = clean(expectedText)
  const normHeard = clean(heardText)

  if (normExpected === normHeard) {
    return {
      passed: true,
      score: 1.0,
      expected: normExpected,
      heard: normHeard,
      issues: [],
    }
  }

  const issues = []
  // Check polyphones in expected text to see if heard text reflects a known pronunciation divergence
  for (const entry of COMMON_POLYPHONES) {
    for (const pat of entry.patterns) {
      const m = normExpected.match(pat.regex)
      if (m) {
        const phrase = m[0]
        // Check if the heard text deviates on this phrase
        const isHeardMatchingPhrase = normHeard.includes(clean(phrase))
        if (!isHeardMatchingPhrase) {
          // Check if heard contains a known mispronunciation homophone or sound
          const hasMistake = pat.mistakeAs.some((mis) => normHeard.includes(clean(mis)))
          const replacedPhrase = phrase.replaceAll(entry.char, pat.homophone)
          const suggestedPatch = { [phrase]: replacedPhrase }
          issues.push({
            char: entry.char,
            phrase,
            expectedReading: pat.reading,
            suggestedReplacement: replacedPhrase,
            suggestedPatch,
            reason: hasMistake
              ? `ASR detected mistaken pronunciation for "${phrase}" (${pat.reading}); recommend patch "${replacedPhrase}"`
              : `ASR transcription difference around "${phrase}"; recommend checking pronunciation patch "${replacedPhrase}"`,
          })
        }
      }
    }
  }

  // Calculate simple character-level similarity
  const maxLen = Math.max(normExpected.length, normHeard.length) || 1
  let matches = 0
  for (let i = 0; i < Math.min(normExpected.length, normHeard.length); i++) {
    if (normExpected[i] === normHeard[i]) matches++
  }
  const score = Math.round((matches / maxLen) * 100) / 100

  // Consider passed if score >= 0.95 and no polyphone issues
  const passed = issues.length === 0 && score >= 0.95

  return {
    passed,
    score,
    expected: normExpected,
    heard: normHeard,
    issues,
  }
}

/**
 * Generates patch dictionary suggestions based on diff issues.
 */
export function suggestPatches(diffReport) {
  const patches = {}
  if (!diffReport?.issues) return patches
  for (const issue of diffReport.issues) {
    if (issue.suggestedPatch) {
      Object.assign(patches, issue.suggestedPatch)
    }
  }
  return patches
}
