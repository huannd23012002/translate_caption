import { translateSrtToAss } from '@/lib/srtTranslator';

// Vercel: tăng timeout lên 60s (Pro plan). Hobby plan mặc định 10s.
export const maxDuration = 60;

export async function POST(request) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: 'Request không hợp lệ.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ error: 'Không có file được gửi lên.' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.srt')) {
    return Response.json({ error: 'Chỉ chấp nhận file .srt' }, { status: 400 });
  }

  // Đọc file vào buffer, thử decode UTF-8 rồi fallback latin-1
  const buffer = await file.arrayBuffer();
  let content;
  try {
    content = new TextDecoder('utf-8').decode(buffer);
    // Detect mojibake: nếu có ký tự replacement thì thử latin-1
    if (content.includes('\uFFFD')) throw new Error('bad encoding');
  } catch {
    content = new TextDecoder('latin1').decode(buffer);
  }

  try {
    const assContent = await translateSrtToAss(content);
    const stem = file.name.replace(/\.srt$/i, '');
    const outputFilename = `${stem}.ass`;

    // Trả file trực tiếp — không lưu disk, không job store
    return new Response(assContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${outputFilename}"`,
      },
    });
  } catch (err) {
    return Response.json({ error: `Lỗi dịch thuật: ${err.message}` }, { status: 500 });
  }
}
