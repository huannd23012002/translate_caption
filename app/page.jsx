'use client';

import { useState, useRef, useCallback } from 'react';

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(2)} MB`;
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [dragover, setDragover] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [result, setResult] = useState(null); // { type: 'success'|'error', message, downloadUrl, filename }

  const fileInputRef = useRef(null);
  const progressRef = useRef(null);

  const pickFile = useCallback((f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.srt')) {
      setResult({ type: 'error', message: 'Chỉ chấp nhận file .srt' });
      return;
    }
    setFile(f);
    setResult(null);
  }, []);

  const clearFile = () => {
    setFile(null);
    setResult(null);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Fake progress ticker
  const startProgress = () => {
    setProgress(0);
    setProgressText('Đang phân tích file SRT...');
    let pct = 0;
    progressRef.current = setInterval(() => {
      pct += Math.random() * 2.5;
      if (pct > 88) pct = 88;
      setProgress(parseFloat(pct.toFixed(1)));
      if (pct < 20) setProgressText('Đang phân tích file SRT...');
      else if (pct < 50) setProgressText('Đang gọi Google Translate...');
      else if (pct < 75) setProgressText('Đang dịch phụ đề...');
      else setProgressText('Đang tạo file ASS...');
    }, 450);
  };

  const finishProgress = () => {
    clearInterval(progressRef.current);
    setProgress(100);
    setProgressText('Hoàn tất!');
  };

  const handleTranslate = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    startProgress();

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/translate', { method: 'POST', body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        finishProgress();
        setResult({ type: 'error', message: data.error || 'Có lỗi xảy ra.' });
        return;
      }

      // Response IS the .ass file — trigger download from blob
      const blob = await res.blob();
      const stem = file.name.replace(/\.srt$/i, '');
      const outputFilename = `${stem}.ass`;
      const downloadUrl = URL.createObjectURL(blob);

      finishProgress();
      setResult({ type: 'success', downloadUrl, filename: outputFilename });

      // Auto-trigger download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = outputFilename;
      a.click();
    } catch {
      finishProgress();
      setResult({ type: 'error', message: 'Không kết nối được tới server.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header>
        <div className="badge">Subtitle Translator</div>
        <h1>
          SRT → ASS Song Ngữ
          <br />
          Anh → Việt
        </h1>
        <p>
          Upload file phụ đề <strong>.srt</strong> tiếng Anh.
          <br />
          Kết quả trả về file <strong>.ass</strong> song ngữ — tiếng Anh trên, tiếng Việt dưới.
          <br />
          Dịch bằng <strong>Google Translate (miễn phí)</strong>, không cần API key.
        </p>
      </header>

      <div className="card">
        {/* Drop zone */}
        <div
          className={`drop-zone${dragover ? ' dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragover(false);
            pickFile(e.dataTransfer.files[0]);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt"
            onChange={(e) => pickFile(e.target.files[0])}
          />
          <span className="drop-icon">📄</span>
          <div className="drop-label">Kéo thả file .srt vào đây</div>
          <div className="drop-sub">hoặc click để chọn file</div>
        </div>

        {/* File info */}
        {file && (
          <div className="file-info">
            <span className="fi-icon">🗂️</span>
            <div className="fi-meta">
              <div className="fi-name">{file.name}</div>
              <div className="fi-size">{formatBytes(file.size)}</div>
            </div>
            <button className="remove-btn" onClick={clearFile} title="Xóa file">✕</button>
          </div>
        )}

        {/* Action button */}
        <button className="btn" onClick={handleTranslate} disabled={!file || loading}>
          <span>⚡</span> {loading ? 'Đang dịch...' : 'Dịch & Tạo file ASS'}
        </button>

        {/* Progress */}
        {loading && (
          <div className="progress-wrap">
            <div className="progress-label">
              <span>{progressText}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Result */}
        {result?.type === 'success' && (
          <div className="result-success">
            <span>✅ Xong! <strong>{result.filename}</strong></span>
            <a className="download-btn" href={result.downloadUrl} download={result.filename}>
              ⬇ Tải về
            </a>
          </div>
        )}
        {result?.type === 'error' && (
          <div className="result-error">⚠️ {result.message}</div>
        )}
      </div>

      {/* Format preview */}
      <div className="format-box">
        <div className="format-title">📋 Format output (.ass)</div>
        <div className="format-preview">
          <span className="format-tc">0:00:00.92 → 0:00:05.51</span>
          <br />
          <span className="format-en">▸ [Default]&nbsp;&nbsp; In this lecture, we want to have a look…</span>
          <br />
          <span className="format-vi">▸ [Secondary] Trong bài giảng này, chúng ta muốn tìm hiểu…</span>
        </div>
      </div>

      <div className="info-strip">
        <div className="info-chip">
          <div className="chip-icon">📥</div>
          <div className="chip-label">Đầu vào</div>
          <div className="chip-value">.srt (EN)</div>
        </div>
        <div className="info-chip">
          <div className="chip-icon">📤</div>
          <div className="chip-label">Đầu ra</div>
          <div className="chip-value">.ass (EN+VI)</div>
        </div>
        <div className="info-chip">
          <div className="chip-icon">🆓</div>
          <div className="chip-label">Chi phí</div>
          <div className="chip-value">Miễn phí</div>
        </div>
      </div>

      <footer>Powered by Google Translate gtx · Không lưu file trên server · Parallel translation</footer>
    </div>
  );
}
