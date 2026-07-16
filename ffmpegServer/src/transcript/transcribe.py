#!/usr/bin/env python3
import argparse
import json
import os
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Local Whisper transcription")
    parser.add_argument("--file", required=True)
    parser.add_argument("--task", choices=["transcribe", "translate"], default="transcribe")
    parser.add_argument("--model", default="whisper-1")
    parser.add_argument("--language")
    parser.add_argument("--prompt")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        print(
            "faster-whisper is not installed. Build the transcript Docker image or install it with pip.",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        return 2

    local_model = os.environ.get("LOCAL_WHISPER_MODEL") or os.environ.get("WHISPER_MODEL") or "tiny"
    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

    model = WhisperModel(local_model, device=device, compute_type=compute_type)
    segments_iter, info = model.transcribe(
        args.file,
        task=args.task,
        language=args.language,
        initial_prompt=args.prompt,
        vad_filter=os.environ.get("WHISPER_VAD_FILTER", "true").lower() != "false",
    )

    segments = []
    texts = []
    for index, segment in enumerate(segments_iter):
        text = segment.text.strip()
        texts.append(text)
        segments.append(
            {
                "id": index,
                "start": float(segment.start),
                "end": float(segment.end),
                "text": text,
            }
        )

    print(
        json.dumps(
            {
                "text": " ".join(texts).strip(),
                "language": getattr(info, "language", args.language),
                "duration": float(getattr(info, "duration", 0) or 0),
                "segments": segments,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
