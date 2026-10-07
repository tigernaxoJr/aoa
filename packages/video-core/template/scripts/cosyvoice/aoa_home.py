"""
CosyVoice 3 共用環境位置 (跨專案共用)

PyTorch、CosyVoice 與模型權重動輒數 GB，且 HTTP 服務與專案無關，
因此整台機器只裝一份，放在 ~/.aoa/cosyvoice/（可用環境變數 AOA_HOME 改位置）：

    ~/.aoa/cosyvoice/
    ├── .venv/                                 # Python 虛擬環境 (torch、cosyvoice、fastapi…)
    └── pretrained_models/Fun-CosyVoice3-0.5B/ # 模型權重

舊版範本把權重下載在專案內的 scripts/cosyvoice/pretrained_models/，由 migrate_legacy_models() 自動搬移。
"""
import os
import shutil
import subprocess
import sys

# Windows 非 UTF-8 主控台（如 cp950）印不出 ✓ 等字元；替換掉而不是在搬移途中崩潰
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

MODEL_NAME = "Fun-CosyVoice3-0.5B"

AOA_HOME = os.path.abspath(os.path.expanduser(os.environ.get("AOA_HOME") or os.path.join("~", ".aoa")))
COSYVOICE_HOME = os.path.join(AOA_HOME, "cosyvoice")
VENV_DIR = os.path.join(COSYVOICE_HOME, ".venv")
MODEL_DIR = os.path.join(COSYVOICE_HOME, "pretrained_models", MODEL_NAME)

LEGACY_MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pretrained_models")
LEGACY_MODEL_DIR = os.path.join(LEGACY_MODELS_DIR, MODEL_NAME)


def venv_python() -> str:
    if os.name == "nt":
        return os.path.join(VENV_DIR, "Scripts", "python.exe")
    return os.path.join(VENV_DIR, "bin", "python")


def in_venv() -> bool:
    return os.path.normcase(os.path.realpath(sys.prefix)) == os.path.normcase(os.path.realpath(VENV_DIR))


def model_ready(path: str = MODEL_DIR) -> bool:
    return os.path.isdir(path) and len(os.listdir(path)) > 3


def create_venv():
    print(f"建立共用 Python 虛擬環境: {VENV_DIR}")
    os.makedirs(COSYVOICE_HOME, exist_ok=True)
    subprocess.check_call([sys.executable, "-m", "venv", VENV_DIR])
    subprocess.check_call([venv_python(), "-m", "pip", "install", "--upgrade", "pip"])


def run_in_venv(script: str):
    """以共用虛擬環境的 Python 重新執行 script，並以它的結束碼離開。已在 venv 內則直接返回。"""
    if in_venv():
        return
    # Windows 上 os.execv 會讓主控台提早拿回控制權，改用子行程轉交
    code = subprocess.call([venv_python(), script, *sys.argv[1:]])
    sys.exit(code)


def migrate_legacy_models():
    """把舊版存在專案內的模型權重搬到共用位置；共用位置已有完整權重時，移除專案內的重複副本。"""
    if not os.path.isdir(LEGACY_MODEL_DIR):
        return
    if not model_ready(MODEL_DIR):
        print(f"搬移專案內的 CosyVoice 3 模型權重至共用位置:\n  {LEGACY_MODEL_DIR}\n  → {MODEL_DIR}")
        if os.path.isdir(MODEL_DIR):
            shutil.rmtree(MODEL_DIR)  # 不完整的下載殘留
        os.makedirs(os.path.dirname(MODEL_DIR), exist_ok=True)
        shutil.move(LEGACY_MODEL_DIR, MODEL_DIR)
        print("✓ 模型權重搬移完成，其他專案將共用這一份")
    elif model_ready(LEGACY_MODEL_DIR):
        print(f"共用位置已有模型權重，移除專案內的重複副本: {LEGACY_MODEL_DIR}")
        shutil.rmtree(LEGACY_MODEL_DIR)
    else:
        return  # 專案內只有不完整的殘留且共用位置已就緒，保留現場不動
    try:
        os.rmdir(LEGACY_MODELS_DIR)
    except OSError:
        pass  # 還有其他檔案，保留
