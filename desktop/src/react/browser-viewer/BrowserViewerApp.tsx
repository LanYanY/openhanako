/**
 * BrowserViewerApp.tsx — 浏览器查看器工具栏
 *
 * 工具栏只负责按钮和标题显示。
 * WebContentsView 由 main.cjs 管理，attach 在工具栏下方区域。
 */

import { useState, useEffect } from 'react';
import { initTheme } from '../bootstrap';

declare function t(key: string): string;
declare function setTheme(name: string): void;

initTheme();

export function BrowserViewerApp() {
  const isWebFallback = !(window as any).hana && !!(window as any).platform;
  const [title, setTitle] = useState('');
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  const [webHistory, setWebHistory] = useState<string[]>([]);
  const [webIndex, setWebIndex] = useState(-1);
  const [stopped, setStopped] = useState(false);
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    const hana = (window as any).hana || (window as any).platform;
    const qs = new URLSearchParams(location.search);
    const initial = qs.get('url') || 'https://example.com';
    if (isWebFallback) {
      setWebHistory([initial]);
      setWebIndex(0);
      setWebUrl(initial);
      setTitle(initial);
    }

    // 监听主题切换
    hana?.onSettingsChanged?.((type: string, data: any) => {
      if (type === 'theme-changed' && data?.theme) setTheme(data.theme);
    });

    // 接收浏览器状态更新
    hana?.onBrowserUpdate?.((data: any) => {
      if (data.title) setTitle(data.title);
      if (data.canGoBack !== undefined) setCanBack(data.canGoBack);
      if (data.canGoForward !== undefined) setCanForward(data.canGoForward);
      if (data.running === false) {
        setTitle('');
        setCanBack(false);
        setCanForward(false);
      }
    });

    // i18n
    window.i18n?.load?.(navigator.language || 'zh');
  }, []);

  const hana = (window as any).hana || (window as any).platform;
  const canBackReal = isWebFallback ? webIndex > 0 : canBack;
  const canForwardReal = isWebFallback ? webIndex >= 0 && webIndex < webHistory.length - 1 : canForward;

  const goBack = () => {
    if (!isWebFallback) return hana?.browserGoBack?.();
    if (webIndex <= 0) return;
    const next = webHistory[webIndex - 1];
    setWebIndex(webIndex - 1);
    setWebUrl(next);
    setStopped(false);
  };
  const goForward = () => {
    if (!isWebFallback) return hana?.browserGoForward?.();
    if (webIndex < 0 || webIndex >= webHistory.length - 1) return;
    const next = webHistory[webIndex + 1];
    setWebIndex(webIndex + 1);
    setWebUrl(next);
    setStopped(false);
  };
  const reload = () => {
    if (!isWebFallback) return hana?.browserReload?.();
    setFrameKey((k) => k + 1);
    setStopped(false);
  };
  const emergencyStop = () => {
    if (!isWebFallback) return hana?.browserEmergencyStop?.();
    setStopped(true);
  };

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-left">
          {/* Close */}
          <button
            className="tb-btn close-btn"
            title={t?.('browser.closeBtn') || ''}
            onClick={() => hana?.closeBrowserViewer?.()}
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <path d="M4 4l6 6M10 4l-6 6" />
            </svg>
          </button>

          <div className="nav-sep" />

          {/* Back */}
          <button
            className={`tb-btn${canBackReal ? '' : ' disabled'}`}
            title={t?.('browser.back') || ''}
            onClick={goBack}
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 2.5L4.5 7l4 4.5" />
            </svg>
          </button>

          {/* Forward */}
          <button
            className={`tb-btn${canForwardReal ? '' : ' disabled'}`}
            title={t?.('browser.forward') || ''}
            onClick={goForward}
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5.5 2.5L9.5 7l-4 4.5" />
            </svg>
          </button>

          {/* Reload */}
          <button
            className="tb-btn"
            title={t?.('browser.reload') || ''}
            onClick={reload}
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 7a4 4 0 1 1-4-4" />
              <path d="M11 3v2.5H8.5" />
            </svg>
          </button>
        </div>

        {/* Drag area + title */}
        <div className="toolbar-drag">
          <span className="page-title">{title}</span>
        </div>

        {/* Emergency stop */}
        <div className="toolbar-right">
          <button
            className="stop-btn"
            title={t?.('browser.emergencyStop') || ''}
            onClick={emergencyStop}
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
      </div>

      {/* Card shadow frame (WebContentsView sits on top) */}
      <div className="card-frame" />
      {isWebFallback && !stopped && (
        <iframe
          key={frameKey}
          title="browser-viewer-web"
          src={webUrl}
          style={{
            position: 'absolute',
            top: 48,
            left: 8,
            right: 8,
            bottom: 8,
            border: 'none',
            borderRadius: 10,
            background: 'var(--bg-card)',
            zIndex: 2,
          }}
          onLoad={(e) => {
            try {
              const frame = e.currentTarget;
              const href = frame.contentWindow?.location?.href || webUrl;
              const ttl = frame.contentDocument?.title || href;
              setTitle(ttl);
              if (href && href !== webHistory[webIndex]) {
                const next = webHistory.slice(0, webIndex + 1);
                next.push(href);
                setWebHistory(next);
                setWebIndex(next.length - 1);
              }
            } catch {
              setTitle(webUrl);
            }
          }}
        />
      )}
    </>
  );
}
