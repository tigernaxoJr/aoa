#!/usr/bin/env python3
"""
CosyVoice 3 (Fun-CosyVoice 3.0) 本地 HTTP API 服務 (Agent Video Producer)
提供與 template/scripts/tts.mjs 相容的 REST 端點。
支援 CosyVoice 3 核心優勢：
- 自然語言指令控制 (Instruct Control: 情緒、語氣、方言、外語)
- 零樣本聲音克隆 (Zero-shot Voice Cloning)
- 富文字情感標籤 (Rich text tags: <laughter>, <whisper> 等)
使用 CosyVoice 3 代 Basic 模型 (Fun-CosyVoice3-0.5B-2512，嚴格排除 RL 版本)。
預設監聽: http://127.0.0.1:50000
"""
import argparse
import io
import json
import os
import re
import sys
from typing import Optional

try:
    from fastapi import FastAPI, HTTPException, Response
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    print("錯誤: 缺少必要模組。請先執行: pnpm run cosyvoice:setup")
    sys.exit(1)

app = FastAPI(title="CosyVoice 3 Basic Local Server (Instruct & Multilingual)", version="3.0.0")

DEFAULT_COSYVOICE3_MODEL_DIR = os.path.join(os.path.dirname(__file__), "pretrained_models", "Fun-CosyVoice3-0.5B")

cosyvoice_model = None
is_mock_mode = False

def get_current_device_info():
    try:
        import torch
        if torch.cuda.is_available():
            return f"cuda:0 ({torch.cuda.get_device_name(0)})"
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            return "mps (Apple Silicon Metal)"
        else:
            return "cpu"
    except Exception:
        return "unknown"

def init_model(model_dir: str, mock: bool = False):
    global cosyvoice_model, is_mock_mode
    if mock:
        print("! 以 Mock 模擬模式啟動 (不進行真實推論，僅供介面測試)")
        is_mock_mode = True
        return

    dev = get_current_device_info()
    print(f"目前推論裝置: {dev}")
    import shutil
    if "cpu" in dev and shutil.which("nvidia-smi"):
        print("! 警告: 系統偵測到有 NVIDIA 顯卡，但目前的 PyTorch 是 CPU 版本！")
        print("  建議執行: 'pnpm run cosyvoice:setup' 自動升級至 CUDA 12.4 加速版。")

    # 檢查是否為 RL 模型，若使用者不小心傳入則阻擋
    if "-RL" in model_dir or "_RL" in model_dir:
        print("警告: 偵測到 RL 模型路徑。本系統要求使用 CosyVoice 3 Basic (Fun-CosyVoice3-0.5B-2512) 基礎版本以確保環境相容。")

    # 確保 config.json 存在且 model_type 標記為 cosyvoice3
    config_path = os.path.join(model_dir, "config.json")
    if os.path.isdir(model_dir) and not os.path.exists(config_path):
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump({"model_type": "cosyvoice3"}, f)
        except Exception:
            pass

    try:
        from cosyvoice.cli.cosyvoice import CosyVoice
        print(f"正在載入 CosyVoice 3 代 Basic 模型權重: {model_dir} ...")
        cosyvoice_model = CosyVoice(model_dir)
        print("✓ CosyVoice 3 (Fun-CosyVoice3-0.5B-2512) 模型載入成功！")
    except Exception as e:
        print(f"! 無法載入 CosyVoice 3 權重: {e}")
        print("提示: 若尚未下載權重，請先執行 'pnpm run cosyvoice:setup'，或加上 --mock 啟動測試伺服器。")

class TTSRequest(BaseModel):
    text: str
    speaker: str = "default"
    instruct: Optional[str] = None  # 自然語言情感、風格、語言或方言指令
    speed: float = 1.0
    format: str = "wav"

def parse_speaker_and_instruct(speaker_str: str, explicit_instruct: Optional[str] = None):
    """
    自 speaker 字串中解析發音人與情緒指令，例如:
    - '中文女 <用熱情興奮的語氣說>' -> speaker='中文女', instruct='用熱情興奮的語氣說'
    - '@/assets/voices/star.wav (生氣)' -> speaker='@/assets/voices/star.wav', instruct='生氣'
    """
    instruct = explicit_instruct
    speaker = speaker_str.strip()
    match = re.search(r'[<\(](.+?)[>\)]\s*$', speaker)
    if match:
        extracted = match.group(1).strip()
        speaker = speaker[:match.start()].strip()
        if not instruct:
            instruct = extracted
    return speaker, instruct

def resolve_audio_path(path: str) -> str:
    """若音色傳入的是相對檔案路徑 (Zero-shot 聲音克隆)，解析其實際路徑"""
    if path.startswith("@/"):
        base = os.getcwd()
        return os.path.normpath(os.path.join(base, path[2:]))
    return path

@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "cosyvoice3",
        "model_type": "basic",
        "model": "Fun-CosyVoice3-0.5B-2512",
        "device": get_current_device_info(),
        "features": ["instruct_control", "multilingual_9_languages", "dialects_18", "zero_shot_clone"],
        "mock": is_mock_mode,
        "model_loaded": cosyvoice_model is not None
    }

@app.get("/api/speakers")
def list_capabilities():
    """回傳 CosyVoice 3 支援的基礎音色、自然語言指令與方言語法指南。"""
    builtin = [
        {"id": "default", "name": "預設中文聲音 (自然流暢)", "locale": "zh-TW"},
        {"id": "中文女", "name": "中文女聲 (柔和清晰)", "locale": "zh-TW"},
        {"id": "中文男", "name": "中文男聲 (沉穩大氣)", "locale": "zh-TW"},
        {"id": "粵語女", "name": "粵語女聲 (生動自然)", "locale": "zh-HK"},
        {"id": "英文女", "name": "英文女聲 (國際標準)", "locale": "en-US"},
        {"id": "英文男", "name": "英文男聲 (專業播音)", "locale": "en-US"},
        {"id": "日語男", "name": "日語男聲 (沉穩)", "locale": "ja-JP"},
        {"id": "韓語女", "name": "韓語女聲 (溫柔)", "locale": "ko-KR"},
    ]
    dialects = ["閩南語(台語)", "粵語", "四川話", "東北話", "上海話", "陝西話", "天津話", "山東話", "甘肅話", "寧夏話"]
    languages = ["中文", "英語", "日語", "韓語", "德語", "西班牙語", "法語", "義大利語", "俄語"]
    instructions_sample = [
        "用興奮且熱情的語氣說",
        "生氣憤怒地大喊",
        "悲傷失落、帶著哭腔",
        "用低沉神秘的耳語說",
        "用台語(閩南語)親切地說",
        "用四川話搞笑地說",
        "用專業嚴肅的紀錄片旁白語氣"
    ]
    return {
        "speakers": builtin,
        "dialects": dialects,
        "languages": languages,
        "instruct_samples": instructions_sample,
        "rich_text_tags": ["<laughter>", "<whisper>", "<sigh>", "<screaming>"]
    }

@app.post("/api/tts")
def synthesize(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    speaker, instruct = parse_speaker_and_instruct(req.speaker, req.instruct)

    # Mock 測試模式
    if is_mock_mode or cosyvoice_model is None:
        if cosyvoice_model is None and not is_mock_mode:
            raise HTTPException(
                status_code=503,
                detail="CosyVoice 3 Basic model not loaded. Run 'pnpm run cosyvoice:setup' or start with --mock."
            )
        import wave
        import math
        import struct
        buf = io.BytesIO()
        sample_rate = 24000
        duration_sec = max(0.5, len(req.text) * 0.15 / req.speed)
        num_samples = int(sample_rate * duration_sec)
        with wave.open(buf, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            for i in range(num_samples):
                val = int(32767.0 * 0.05 * math.sin(2.0 * math.pi * 440.0 * i / sample_rate))
                wf.writeframesraw(struct.pack('<h', val))
        return Response(content=buf.getvalue(), media_type="audio/wav")

    # 真實 CosyVoice 3 推論
    try:
        import torchaudio
        buf = io.BytesIO()
        audio_prompt_path = resolve_audio_path(speaker)
        
        # 1. 聲音克隆模式 (Zero-shot Voice Clone)
        if os.path.isfile(audio_prompt_path):
            output = cosyvoice_model.inference_zero_shot(
                req.text,
                prompt_text=req.text,
                prompt_speech_16k=audio_prompt_path,
                stream=False,
                speed=req.speed
            )
        # 2. 自然語言指令控制模式 (Instruct Mode: 情感/方言/風格)
        elif instruct and hasattr(cosyvoice_model, "inference_instruct"):
            spk = speaker if speaker != "default" else "中文女"
            output = cosyvoice_model.inference_instruct(
                req.text,
                spk,
                instruct_text=instruct,
                stream=False,
                speed=req.speed
            )
        # 3. 預設/內置發音人基礎模式 (SFT Mode)
        else:
            spk = speaker if speaker != "default" else "中文女"
            output = cosyvoice_model.inference_sft(req.text, spk, stream=False, speed=req.speed)
        
        for out in output:
            torchaudio.save(buf, out['tts_speech'], cosyvoice_model.sample_rate, format="wav")
            break
            
        return Response(content=buf.getvalue(), media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

def main():
    parser = argparse.ArgumentParser(description="CosyVoice 3 Basic Local HTTP Server")
    parser.add_argument("--host", default="127.0.0.1", help="Binding host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=50000, help="Port to listen (default: 50000)")
    parser.add_argument("--model-dir", default=DEFAULT_COSYVOICE3_MODEL_DIR, help="Path to Fun-CosyVoice3-0.5B-2512 model weights")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode without heavy GPU weights")
    args = parser.parse_args()

    init_model(args.model_dir, mock=args.mock)
    print(f"啟動 CosyVoice 3 (Fun-CosyVoice3-0.5B-2512) 服務於 http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")

if __name__ == "__main__":
    main()
