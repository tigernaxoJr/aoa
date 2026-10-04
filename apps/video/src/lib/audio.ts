// Audio recording and conversion utilities for Cast Studio (SPEC §4.6)
// Converts recorded audio Blob to standard 16kHz mono 16-bit PCM WAV (ideal for CosyVoice 3 zero-shot clone)

export async function audioBlobToWav(blob: Blob, sampleRate = 16000): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer()
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const audioCtx = new AudioCtx()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

  // Resample to mono at target sample rate
  const offlineCtx = new OfflineAudioContext(1, Math.max(1, Math.ceil(audioBuffer.duration * sampleRate)), sampleRate)
  const source = offlineCtx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(offlineCtx.destination)
  source.start()
  const resampled = await offlineCtx.startRendering()

  // Convert Float32Array PCM samples to 16-bit linear PCM WAV
  const channelData = resampled.getChannelData(0)
  const buffer = new ArrayBuffer(44 + channelData.length * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  // RIFF identifier
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + channelData.length * 2, true)
  writeString(8, 'WAVE')
  // fmt sub-chunk
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // subchunk1 size (16 for PCM)
  view.setUint16(20, 1, true)  // audio format (1 = PCM)
  view.setUint16(22, 1, true)  // num channels (1 = mono)
  view.setUint32(24, sampleRate, true) // sample rate
  view.setUint32(28, sampleRate * 2, true) // byte rate (sampleRate * numChannels * bitsPerSample/8)
  view.setUint16(32, 2, true)  // block align (numChannels * bitsPerSample/8)
  view.setUint16(34, 16, true) // bits per sample
  // data sub-chunk
  writeString(36, 'data')
  view.setUint32(40, channelData.length * 2, true)

  // Write PCM audio samples
  let offset = 44
  for (let i = 0; i < channelData.length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}
