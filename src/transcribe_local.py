#!/usr/bin/env python3
import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="使用本机 Whisper 生成视频逐字稿")
    parser.add_argument("audio", help="16kHz 单声道音频文件")
    parser.add_argument("--model", default="base", help="Whisper 模型，默认 base")
    parser.add_argument("--language", default="zh", help="语言代码，默认 zh")
    parser.add_argument("--prompt", default="", help="标题或主题提示词")
    args = parser.parse_args()

    import whisper

    cache_dir = os.environ.get("WHISPER_CACHE_DIR", ".whisper-cache")
    model = whisper.load_model(args.model, device="cpu", download_root=cache_dir)
    result = model.transcribe(
        args.audio,
        language=args.language,
        task="transcribe",
        fp16=False,
        verbose=False,
        condition_on_previous_text=True,
        initial_prompt=args.prompt
        or "以下是中文短视频的普通话逐字稿，请保留完整语义和自然标点。",
    )
    text = "".join(segment.get("text", "") for segment in result.get("segments", []))
    text = " ".join(text.split()).strip() or result.get("text", "").strip()
    payload = {
        "text": text,
        "language": result.get("language") or args.language,
        "segments": len(result.get("segments", [])),
        "model": args.model,
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise
