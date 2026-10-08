#!/usr/bin/env python3
"""
Pre-renders the store PA announcements (pa.* keys in src/i18n.ts) with Piper
neural TTS and bakes in a "ceiling speaker / megaphone" sound with ffmpeg:
band-limited, slightly overdriven, with a short hall echo.

  python3 -m venv .tts && .tts/bin/pip install piper-tts
  # voices (all CC0 / public domain), from github.com/rhasspy/piper/releases/tag/v0.0.2:
  #   voice-en-us-kathleen-low.tar.gz, voice-de-thorsten-low.tar.gz, voice-es-carlfm-x-low.tar.gz
  python3 scripts/build-announcements.py --piper .tts/bin/piper --voices <dir with the extracted voices>

Writes public/audio/pa/<lang>/<key>.mp3. Languages without a voice fall back
to the browser's speech synthesis at runtime.
"""
import argparse
import os
import re
import subprocess
import tempfile

VOICES = {
    'en': 'en-us-kathleen-low',
    'de': 'de-thorsten-low',
    'es': 'es-carlfm-x-low',
}
DICT_NAMES = {'en': ('EN', 'EN_CAREER'), 'de': ('DE', 'DE_CAREER'), 'es': ('ES', 'ES_CAREER')}

# PA speaker: no bass, no air, a little crunch, a boxy mid bump and a hall echo
FX = (
    'highpass=f=380,highpass=f=380,lowpass=f=3400,lowpass=f=3400,'
    'equalizer=f=1400:t=q:w=1.2:g=6,'
    'volume=2.2,asoftclip=type=tanh,'
    'aecho=0.85:0.55:45|95|160:0.32|0.2|0.12,'
    'loudnorm=I=-17:TP=-2'
)


def read_dict(src: str, name: str) -> dict:
    m = re.search(r'const %s: Dict = \{\n(.*?)\n\};' % name, src, re.S)
    if not m:
        return {}
    out = {}
    for line in m.group(1).split('\n'):
        mm = re.match(r"\s*'([^']+)':\s*(['\"])(.*)\2,\s*$", line)
        if mm:
            out[mm.group(1)] = mm.group(3).replace("\\'", "'")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--piper', required=True)
    ap.add_argument('--voices', required=True)
    ap.add_argument('--out', default='public/audio/pa')
    args = ap.parse_args()
    src = open('src/i18n.ts', encoding='utf-8').read()
    for lang, voice in VOICES.items():
        texts = {}
        for name in DICT_NAMES[lang]:
            texts.update({k: v for k, v in read_dict(src, name).items() if re.fullmatch(r'pa\.(\d+|open|closing)', k)})
        model = os.path.join(args.voices, voice, voice + '.onnx')
        os.makedirs(os.path.join(args.out, lang), exist_ok=True)
        for key, text in sorted(texts.items()):
            with tempfile.TemporaryDirectory() as tmp:
                wav = os.path.join(tmp, 'raw.wav')
                subprocess.run([args.piper, '-m', model, '-f', wav, '--length-scale', '1.05', '--sentence-silence', '0.25'], input=text.encode('utf-8'), check=True, capture_output=True)
                dst = os.path.join(args.out, lang, key.replace('pa.', '') + '.mp3')
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', FX, '-ac', '1', '-ar', '22050', '-b:a', '40k', dst], check=True)
                print(lang, key, os.path.getsize(dst), 'bytes')


if __name__ == '__main__':
    main()
