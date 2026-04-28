/**
 * SRT subtitle parser + bilingual ASS translator (JavaScript port).
 *
 * Input : English SRT content (string)
 * Output: Bilingual ASS content (string)
 *   - Default style   → English   (bottom, white, font 70)
 *   - Secondary style → Vietnamese (above English, cyan, font 55)
 *
 * Translation: Google Translate free "gtx" endpoint — no API key needed.
 * Strategy   : Promise.all — 1 request per block, all fired concurrently with small stagger.
 */

// ─────────────────────────────────────────────
// ASS header template
// ─────────────────────────────────────────────
const ASS_HEADER = `[Script Info]
Title: Bilingual Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: Yes
PlayResX: 1920
PlayResY: 1080
Collisions: Normal

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans,70,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1
Style: Secondary,Noto Sans,55,&H003CF7F4,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,35,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

// ─────────────────────────────────────────────
// Time conversion: SRT → ASS
// SRT : 00:00:00,920  →  ASS : 0:00:00.92
// ─────────────────────────────────────────────
function srtTimeToAss(srtTime) {
  const m = srtTime.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return srtTime;
  const [, h, mi, s, ms] = m;
  const cs = (ms + '000').slice(0, 3).slice(0, 2); // centiseconds
  return `${parseInt(h)}:${mi.padStart(2, '0')}:${s.padStart(2, '0')}.${cs}`;
}

// ─────────────────────────────────────────────
// SRT parser
// ─────────────────────────────────────────────
export function parseSrt(content) {
  const normalized = content.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawBlocks = normalized.split(/\n{2,}/);
  const blocks = [];

  for (const raw of rawBlocks) {
    const lines = raw.trim().split('\n').map((l) => l.trim());
    if (lines.length < 3) continue;

    const index = parseInt(lines[0]);
    if (isNaN(index)) continue;

    const tcMatch = lines[1].match(/(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)/);
    if (!tcMatch) continue;

    const textLines = lines.slice(2).filter(Boolean);
    if (!textLines.length) continue;

    blocks.push({ index, startSrt: tcMatch[1], endSrt: tcMatch[2], lines: textLines });
  }

  return blocks;
}

// ─────────────────────────────────────────────
// Google gtx translation
// ─────────────────────────────────────────────
const GTX_URL = 'https://translate.googleapis.com/translate_a/single';

async function gtxTranslate(text, src = 'en', tgt = 'vi') {
  const params = new URLSearchParams({ client: 'gtx', sl: src, tl: tgt, dt: 't', q: text });
  const res = await fetch(`${GTX_URL}?${params}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`gtx HTTP ${res.status}`);
  const data = await res.json();
  // data[0] = [[translated_chunk, original_chunk, ...], ...]
  return data[0].map((seg) => seg[0] ?? '').join('');
}

// ─────────────────────────────────────────────
// Translate all blocks — 1 request per block, fully parallel
//
// WHY no batching:
//   Joining multiple subtitles with a separator and splitting back is fragile —
//   Google Translate modifies the separator text (e.g. ⟦SEP⟧ → ⟦Tháng 9⟧),
//   causing splits to fail and blocks to shift/merge. Fixed by sending each
//   block as its own request, all fired concurrently via Promise.all.
//   A small per-block stagger (30ms × index) avoids hammering Google at once.
// ─────────────────────────────────────────────
export async function translateBlocks(blocks, { src = 'en', tgt = 'vi', staggerMs = 30 } = {}) {
  const promises = blocks.map((block, idx) =>
    new Promise((resolve) => setTimeout(resolve, idx * staggerMs))
      .then(() => gtxTranslate(block.lines.join(' '), src, tgt))
      .catch(() => block.lines.join(' ')) // fallback: giữ nguyên EN nếu lỗi
  );
  return Promise.all(promises);
}

// ─────────────────────────────────────────────
// ASS builder
// ─────────────────────────────────────────────
function escapeAss(text) {
  return text.replace(/\n/g, '\\N').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

export function buildBilingualAss(blocks, translations) {
  const lines = [ASS_HEADER];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const s = srtTimeToAss(block.startSrt);
    const e = srtTimeToAss(block.endSrt);
    const en = escapeAss(block.lines.join(' '));
    const vi = escapeAss(translations[i] ?? '');

    // Secondary (VI) first → bottom; Default (EN) second → stacked above
    lines.push(`Dialogue: 0,${s},${e},Secondary,NTP,0000,0000,0000,,${vi}`);
    lines.push(`Dialogue: 0,${s},${e},Default,NTP,0000,0000,0000,,${en}`);
  }

  return lines.join('\n') + '\n';
}

// ─────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────
export async function translateSrtToAss(srtContent) {
  const blocks = parseSrt(srtContent);
  if (!blocks.length) throw new Error('Không tìm thấy subtitle nào hợp lệ trong file SRT.');

  const translations = await translateBlocks(blocks);
  return buildBilingualAss(blocks, translations);
}
