import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockCues, parseScript, splitCaption } from '../../template/scripts/lib/narration.mjs'

test('parseScript splits text blocks at pause markers and drops other comments', () => {
  const blocks = parseScript('第一句。\n\n第二句。\n<!-- pause 0.5 -->\n<!-- note: ignore me -->\n第三句。\n')
  assert.deepEqual(blocks, [
    { type: 'text', lines: ['第一句。', '第二句。'] },
    { type: 'pause', sec: 0.5 },
    { type: 'text', lines: ['第三句。'] },
  ])
})

test('splitCaption balances pieces and prefers punctuation', () => {
  assert.deepEqual(splitCaption('設定伺服器、申請憑證、串接 CI，每一步都可能卡關。'), ['設定伺服器、申請憑證、', '串接 CI，每一步都可能卡關。'])
  assert.deepEqual(splitCaption('Deploying a website should not take half a day.'), ['Deploying a website should', 'not take half a day.'])
  for (const piece of splitCaption('這是一段完全沒有標點符號而且非常非常長的中文句子需要被切開才能放進字幕')) {
    assert.ok(piece.length <= 16, piece)
  }
  assert.deepEqual(splitCaption('Short one.'), ['Short one.'])
})

test('splitCaption keeps a product name in one piece', () => {
  // The space inside "Slide Studio" is nearest the ideal cut; a CJK caption keeps the name together.
  const pieces = splitCaption('現在就打開 Slide Studio，做出你的第一份簡報。')
  assert.ok(pieces.some((p) => p.includes('Slide Studio')), pieces.join(' / '))
  // A hard cut steps back to the start of the word instead of splitting it.
  assert.deepEqual(splitCaption('一二三四五六七八九十一二Kubernetes部署設定'), ['一二三四五六七八九十一二', 'Kubernetes部署設定'])
  for (const piece of splitCaption('Deploying a website should not take half a day.')) assert.ok(!/\w-|^\w{1,2}$/.test(piece), piece)
})

test('blockCues distributes time proportionally without word timings', () => {
  const cues = blockCues(['一二三四。', '五六。'], 3)
  assert.equal(cues.length, 2)
  assert.equal(cues[0].start, 0)
  assert.equal(cues.at(-1).end, 3)
  assert.ok(cues[0].end > cues[1].end - cues[1].start)
})

test('blockCues aligns to word boundaries when they match the text', () => {
  const words = [
    { start: 0.1, end: 0.4, text: '部署' },
    { start: 0.45, end: 0.7, text: '網站' },
    { start: 1.2, end: 1.5, text: '很' },
    { start: 1.5, end: 1.9, text: '簡單' },
  ]
  const cues = blockCues(['部署網站。', '很簡單。'], 2, words)
  assert.deepEqual(cues, [
    { start: 0, end: 1.2, text: '部署網站。' },
    { start: 0.7, end: 2, text: '很簡單。' },
  ].map((c, i) => (i === 1 ? { ...c, start: 1.2 } : c)))
})

test('blockCues falls back when word timings do not match the text', () => {
  const words = [{ start: 0, end: 1, text: 'three' }]
  const cues = blockCues(['3 個步驟。'], 2, words)
  assert.equal(cues[0].start, 0)
  assert.equal(cues[0].end, 2)
})

test('parseScript gives 【name】 lines to that character and the rest to the narrator', () => {
  const blocks = parseScript('夜深了。\n【小狐狸】月亮掉進水裡了！\n【小狐狸】我要把它撈起來。\n【貓頭鷹】那只是倒影喔。\n<!-- pause 0.3 -->\n小狐狸愣住了。\n')
  assert.deepEqual(blocks, [
    { type: 'text', lines: ['夜深了。'] },
    { type: 'text', lines: ['月亮掉進水裡了！', '我要把它撈起來。'], speaker: '小狐狸' },
    { type: 'text', lines: ['那只是倒影喔。'], speaker: '貓頭鷹' },
    { type: 'pause', sec: 0.3 },
    { type: 'text', lines: ['小狐狸愣住了。'] },
  ])
})

test('parseScript keeps ordinary brackets that do not start a line', () => {
  assert.deepEqual(parseScript('他說【小心】就跑了。\n'), [{ type: 'text', lines: ['他說【小心】就跑了。'] }])
})

test('parseScript separates display captions from spoken TTS text using inline tags', () => {
  const blocks = parseScript('歡迎來到[重慶](tts: 蟲慶)！\n')
  assert.deepEqual(blocks[0].lines, ['歡迎來到重慶！'])
  assert.deepEqual(blocks[0].spokenLines, ['歡迎來到蟲慶！'])
})

test('parseScript applies pronunciation dictionary without altering caption text', () => {
  const blocks = parseScript('閱讀這一行行程式碼。\n', { pronunciation: { 一行行: '一航航' } })
  assert.deepEqual(blocks[0].lines, ['閱讀這一行行程式碼。'])
  assert.deepEqual(blocks[0].spokenLines, ['閱讀這一航航程式碼。'])
})

