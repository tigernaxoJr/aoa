import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffPronunciation, suggestPatches } from '../../template/scripts/lib/pronunciation.mjs'

test('diffPronunciation: exact match returns passed with score 1', () => {
  const result = diffPronunciation('今天天氣真好。', '今天天氣真好。')
  assert.equal(result.passed, true)
  assert.equal(result.score, 1)
  assert.equal(result.issues.length, 0)
})

test('diffPronunciation: detects mispronounced polyphone and suggests homophone patch', () => {
  // TTS pronounced "重慶" as "中慶", ASR heard "中慶"
  const result = diffPronunciation('歡迎來到重慶遊玩。', '歡迎來到中慶遊玩。')
  assert.equal(result.passed, false)
  assert.ok(result.issues.length > 0)
  assert.equal(result.issues[0].char, '重')
  assert.equal(result.issues[0].suggestedReplacement, '蟲慶')

  const patches = suggestPatches(result)
  assert.deepEqual(patches, { 重慶: '蟲慶' })
})

test('diffPronunciation: detects mispronounced "一行行" and suggests "一航航"', () => {
  const result = diffPronunciation('檢查這一行行代碼。', '檢查這一形形代碼。')
  assert.equal(result.passed, false)
  const patches = suggestPatches(result)
  assert.deepEqual(patches, { 一行行: '一航航' })
})

import { existsSync, readFileSync } from 'node:fs'
import { baseProject, makeProject } from './helpers.mjs'

test('tts script: separates captions from spoken audio and auto-patches via ASR', () => {
  const p = makeProject({
    scenes: [
      {
        id: 'scene-001',
        dir: 'scenes/001-hook',
        script: '歡迎來到[重慶](tts: 蟲慶)遊玩！\n',
      },
    ],
  })

  // Run tts.mjs with fake TTS and fake ASR simulating pronunciation divergence
  const env = {
    VIDEO_AGENT_FAKE_TTS: '1',
    VIDEO_AGENT_FAKE_ASR: '1',
    VIDEO_AGENT_FAKE_ASR_TRANSCRIPT: '歡迎來到中慶遊玩。',
  }
  const r = p.run('tts.mjs', ['scene-001', '--verify'], env)
  assert.equal(r.code, 0, r.stderr)

  // 1. Verify captions keep clean display text "重慶", not "蟲慶"
  const captions = JSON.parse(readFileSync(p.path('scenes/001-hook/assets/captions.json'), 'utf8'))
  assert.equal(captions[0].text, '歡迎來到重慶遊玩！')

  // 2. Verify pronunciation report was written and recorded auto-patching
  const reportPath = p.path('scenes/001-hook/assets/pronunciation-report.json')
  assert.ok(existsSync(reportPath))
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  assert.equal(report.autoPatched, true)
  assert.deepEqual(report.appliedPatches, { 重慶: '蟲慶' })
})

import { detectHardwareAndRecommendModel } from '../../template/scripts/lib/asr-providers.mjs'

test('detectHardwareAndRecommendModel: returns valid Qwen3-ASR model and reason', () => {
  const rec = detectHardwareAndRecommendModel()
  assert.ok(['Qwen/Qwen3-ASR-1.7B', 'Qwen/Qwen3-ASR-0.6B'].includes(rec.model))
  assert.ok(typeof rec.reason === 'string' && rec.reason.length > 0)
  assert.ok(typeof rec.hasGpu === 'boolean')
})

test('gate asrConsent: running real ASR without consent fails with gate prompt', () => {
  const p = makeProject({
    project: {
      ...baseProject(),
      project: {
        ...baseProject().project,
        asr: { provider: 'qwen-asr' }, // no consent
      },
    },
    scenes: [{ id: 'scene-001', dir: 'scenes/001-hook', script: '測試句子。\n' }],
  })

  // Do not set VIDEO_AGENT_FAKE_ASR so it checks gate
  const env = { VIDEO_AGENT_FAKE_TTS: '1' }
  const r = p.run('tts.mjs', ['scene-001', '--verify'], env)
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /gate asrConsent/)
  assert.match(r.stderr, /Qwen3-ASR/)
})


