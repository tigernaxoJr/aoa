#!/usr/bin/env python3
"""
CosyVoice 3 (Fun-CosyVoice 3.0) 本地環境初始化腳本 (Agent Video Producer)
具備智慧硬體加速偵測 (NVIDIA CUDA / AMD ROCm / Apple Silicon MPS / CPU)，
自動安裝對應硬體的最佳 PyTorch 加速版本，並下載 CosyVoice 3 代 Basic 基礎模型 (Fun-CosyVoice3-0.5B-2512)。
嚴格避開 RL (Fun-CosyVoice3-0.5B-2512_RL) 版本。
環境與權重裝在跨專案共用的 ~/.aoa/cosyvoice/（見 aoa_home.py），每台機器只需安裝一次。
"""
import os
import sys
import shutil
import platform
import subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import aoa_home

REQUIRED_PYTHON_VERSION = (3, 10)
COSYVOICE3_BASIC_MODEL_ID = "FunAudioLLM/Fun-CosyVoice3-0.5B-2512"
TARGET_MODEL_DIR = aoa_home.MODEL_DIR

def check_python_version():
    current = sys.version_info[:2]
    if current < REQUIRED_PYTHON_VERSION:
        print(f"錯誤: Python 版本需為 3.10 以上 (目前為 {current[0]}.{current[1]})")
        sys.exit(1)
    print(f"✓ Python 版本符合: {sys.version.split()[0]}")

def detect_hardware():
    """偵測系統硬體加速環境 (CUDA, ROCm, MPS 或 CPU)"""
    print("\n[硬體加速偵測 (Hardware Acceleration Detection)]")

    # 1. 偵測 NVIDIA GPU (CUDA)
    if shutil.which("nvidia-smi"):
        try:
            res = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                                 capture_output=True, text=True, check=True)
            gpu_name = res.stdout.strip().split("\n")[0]
            print(f"✓ 偵測到 NVIDIA 顯卡: {gpu_name}")
            print("  推薦加速後端: NVIDIA CUDA (PyTorch cu124)")
            return "cuda", gpu_name
        except Exception:
            pass

    # 2. 偵測 AMD GPU (ROCm)
    if shutil.which("rocm-smi"):
        try:
            print("✓ 偵測到 AMD GPU 且環境支援 ROCm")
            print("  推薦加速後端: AMD ROCm (PyTorch rocm6.1)")
            return "rocm", "AMD GPU (ROCm)"
        except Exception:
            pass

    # 3. 檢查 Windows 環境下的 AMD 顯卡
    if platform.system() == "Windows":
        try:
            cmd = ["powershell", "-NoProfile", "-Command",
                   "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Caption"]
            out = subprocess.run(cmd, capture_output=True, text=True).stdout
            for line in out.splitlines():
                line = line.strip()
                if "Radeon" in line or "AMD" in line:
                    print(f"✓ 偵測到 AMD 顯卡: {line}")
                    print("  提示: Windows 上 AMD 建議使用 DirectML 或在 WSL2 環境下配合 ROCm 進行硬體加速。")
                    return "amd_windows", line
                elif "GeForce" in line or "NVIDIA" in line:
                    print(f"✓ 偵測到 NVIDIA 顯卡: {line}")
                    return "cuda", line
        except Exception:
            pass

    # 4. 偵測 Apple Silicon (MPS)
    if platform.system() == "Darwin" and platform.machine() in ("arm64", "aarch64"):
        print("✓ 偵測到 Apple Silicon 晶片 (M 系列)")
        print("  推薦加速後端: Apple MPS (Metal Performance Shaders)")
        return "mps", "Apple Silicon MPS"

    print("! 未偵測到獨立加速顯卡或已啟用之驅動，將使用 CPU 模式")
    print("  提示: CPU 推論速度較慢 (約 10~30 秒/鏡頭)；若需要極速合成，可使用雲端 API (DASHSCOPE_API_KEY)。")
    return "cpu", "CPU"

def install_pytorch(hw_type: str):
    """依據偵測到的硬體安裝最佳 PyTorch 加速版本"""
    print(f"\n[安裝相容之 PyTorch 加速函式庫 ({hw_type})]")

    # 檢查現有 PyTorch 是否已經支援加速
    try:
        import torch
        import torchaudio
        if hw_type == "cuda" and torch.cuda.is_available():
            print(f"✓ 目前已安裝 PyTorch 且支援 CUDA ({torch.cuda.get_device_name(0)})")
            return
        elif hw_type == "mps" and hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            print("✓ 目前已安裝 PyTorch 且支援 Apple MPS 加速")
            return
        elif hw_type == "rocm" and torch.cuda.is_available():
            print(f"✓ 目前已安裝 PyTorch 且支援 ROCm ({torch.cuda.get_device_name(0)})")
            return
        elif hw_type == "cpu" and not torch.cuda.is_available():
            print(f"✓ 目前已安裝 PyTorch CPU 版本 ({torch.__version__})")
            return
        else:
            print("! 偵測到目前 PyTorch 版本與硬體加速不符 (可能是 CPU 版)，準備重新安裝加速版...")
    except ImportError:
        print("尚未安裝 PyTorch，準備安裝加速版...")

    # 依硬體選擇最佳下載來源
    if hw_type == "cuda":
        print("正在為 NVIDIA 顯卡安裝 PyTorch CUDA 12.4 版本...")
        cmd = [sys.executable, "-m", "pip", "install", "torch", "torchaudio",
               "--index-url", "https://download.pytorch.org/whl/cu124"]
    elif hw_type == "rocm":
        print("正在為 AMD GPU 安裝 PyTorch ROCm 6.1 版本...")
        cmd = [sys.executable, "-m", "pip", "install", "torch", "torchaudio",
               "--index-url", "https://download.pytorch.org/whl/rocm6.1"]
    elif hw_type == "amd_windows":
        print("Windows AMD 平台安裝標準 PyTorch (可選配 torch-directml)...")
        cmd = [sys.executable, "-m", "pip", "install", "torch", "torchaudio"]
    else:
        print("安裝標準/CPU 支援 PyTorch...")
        cmd = [sys.executable, "-m", "pip", "install", "torch", "torchaudio"]

    try:
        subprocess.check_call(cmd)
        print("✓ PyTorch 安裝成功！")
    except Exception as e:
        print(f"! PyTorch 自動安裝失敗: {e}")
        print("手動安裝指引:")
        if hw_type == "cuda":
            print("  pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu124")
        elif hw_type == "rocm":
            print("  pip install torch torchaudio --index-url https://download.pytorch.org/whl/rocm6.1")

def install_server_and_cosyvoice():
    print("\n[安裝 HTTP 服務與 CosyVoice 3 核心依賴]")
    pkgs = [
        "fastapi>=0.110.0",
        "uvicorn>=0.28.0",
        "soundfile>=0.12.1",
        "pydantic>=2.0.0",
        "modelscope>=1.15.0",
        "huggingface_hub>=0.20.0"
    ]
    subprocess.check_call([sys.executable, "-m", "pip", "install", *pkgs])
    print("✓ FastAPI 與音訊處理套件安裝完成")

    try:
        import cosyvoice
        print("✓ CosyVoice 函式庫已就緒")
    except ImportError:
        print("正在安裝 CosyVoice 核心庫 (從官方 repo 安裝以確保支援 CosyVoice 3)...")
        res = subprocess.run([sys.executable, "-m", "pip", "install", "git+https://github.com/QwenAudio/CosyVoice.git"])
        if res.returncode != 0:
            print("! Git 安裝失敗，嘗試 pip 安裝 cosyvoice...")
            subprocess.run([sys.executable, "-m", "pip", "install", "cosyvoice"])

def download_cosyvoice3_basic_model():
    print(f"\n[下載 CosyVoice 3 Basic 基礎模型權重 ({COSYVOICE3_BASIC_MODEL_ID})]")
    print("注意: 嚴格採用 3 代 Basic 基礎模型 (Fun-CosyVoice3-0.5B-2512)，排除不可用的 RL 實驗版本。")
    if aoa_home.model_ready(TARGET_MODEL_DIR):
        print(f"✓ CosyVoice 3 Basic 模型已存在於: {TARGET_MODEL_DIR}")
        return

    os.makedirs(os.path.dirname(TARGET_MODEL_DIR), exist_ok=True)
    downloaded = False
    try:
        from modelscope import snapshot_download
        print("嘗試透過 ModelScope 下載模型權重...")
        path = snapshot_download(COSYVOICE3_BASIC_MODEL_ID, local_dir=TARGET_MODEL_DIR)
        print(f"✓ CosyVoice 3 Basic 模型下載成功 (ModelScope): {path}")
        downloaded = True
    except Exception as e:
        print(f"! ModelScope 下載失敗: {e}")

    if not downloaded:
        try:
            from huggingface_hub import snapshot_download
            print("嘗試透過 Hugging Face 下載模型權重...")
            path = snapshot_download(repo_id=COSYVOICE3_BASIC_MODEL_ID, local_dir=TARGET_MODEL_DIR)
            print(f"✓ CosyVoice 3 Basic 模型下載成功 (HuggingFace): {path}")
            downloaded = True
        except Exception as e:
            print(f"! HuggingFace 下載失敗: {e}")

    if not downloaded:
        print(f"\n提示: 自動下載未完成，請手動下載 {COSYVOICE3_BASIC_MODEL_ID} 至:")
        print(f"  {TARGET_MODEL_DIR}")

if __name__ == "__main__":
    print("=================================================================")
    print("  Agent Video Producer - CosyVoice 3.0 (Basic) 硬體加速與環境安裝")
    print("=================================================================")
    check_python_version()
    aoa_home.migrate_legacy_models()
    if not aoa_home.in_venv():
        if not os.path.exists(aoa_home.venv_python()):
            aoa_home.create_venv()
        else:
            print(f"✓ 沿用共用 Python 虛擬環境: {aoa_home.VENV_DIR}")
        aoa_home.run_in_venv(os.path.abspath(__file__))
    hw_type, hw_name = detect_hardware()
    install_pytorch(hw_type)
    install_server_and_cosyvoice()
    download_cosyvoice3_basic_model()
    print("\n=================================================================")
    print("✓ 安裝設置完成！")
    print(f"  運行硬體: {hw_name} ({hw_type.upper()})")
    print(f"  共用環境: {aoa_home.COSYVOICE_HOME}（所有影片專案共用，不需重複安裝）")
    print("  啟動指令: pnpm run cosyvoice:serve   # 於背景啟動本地服務")
    print("=================================================================")
