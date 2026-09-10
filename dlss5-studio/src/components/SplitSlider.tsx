import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sliders,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Columns,
  ZoomIn,
  ZoomOut,
  SkipBack,
  SkipForward,
  Repeat,
  Eye,
  Crosshair,
} from 'lucide-react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';

export type ViewMode = 'split' | 'side' | 'enhanced' | 'original';

interface SplitSliderProps {
  originalSrc?: string;
  enhancedSrc?: string;
  isVideo?: boolean;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  isLoupeActive?: boolean;
  onToggleLoupe?: () => void;
}

/**
 * Resolve a local file path to a URL the WebView can render.
 *
 * Videos: use Tauri's asset:// streaming protocol (convertFileSrc).
 *   This streams bytes on-demand directly from disk — zero memory copy,
 *   zero IPC overhead. Works for any file size.
 *
 * Images: use a data URL (base64) via the Rust command, but only if the
 *   file is small enough (<= 50 MB). Larger images also fall back to
 *   streaming to avoid OOM.
 */
const resolveMediaSrc = async (path?: string, isVideo: boolean = false): Promise<string> => {
  if (!path) return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:') ||
    path.startsWith('asset://')
  ) {
    return path;
  }

  // Videos: ALWAYS stream — never load into memory.
  if (isVideo) {
    try {
      return convertFileSrc(path);
    } catch (err) {
      console.warn('[SplitSlider] convertFileSrc failed, using raw path:', err);
      return path;
    }
  }

  // Images: try data URL (fine for typical images).
  // Fall back to streaming if the command fails or file is too large.
  try {
    const fileInfo = await invoke<{ size: number }>('get_file_info', { path });
    const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB
    if (fileInfo.size > MAX_IMAGE_BYTES) {
      return convertFileSrc(path);
    }
    const dataUrl = await invoke<string>('load_media_data_url', { path });
    return dataUrl;
  } catch {
    // Fallback: stream even for images
    try {
      return convertFileSrc(path);
    } catch {
      return path;
    }
  }
};

const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '00:00.00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const SplitSlider: React.FC<SplitSliderProps> = ({
  originalSrc,
  enhancedSrc,
  isVideo = false,
  viewMode: controlledViewMode,
  onViewModeChange,
  isLoupeActive: controlledLoupeActive,
  onToggleLoupe: controlledOnToggleLoupe,
}) => {
  const [normOriginal, setNormOriginal] = useState<string>('');
  const [normEnhanced, setNormEnhanced] = useState<string>('');
  const [loadingMedia, setLoadingMedia] = useState<boolean>(false);

  // Viewport comparison mode (controlled or internal)
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>('split');
  const viewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = (mode: ViewMode) => {
    setInternalViewMode(mode);
    onViewModeChange?.(mode);
  };

  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Pixel Loupe (4x Inspection Tool)
  const [internalLoupeActive, setInternalLoupeActive] = useState<boolean>(false);
  const loupeActive = controlledLoupeActive ?? internalLoupeActive;
  const toggleLoupe = () => {
    if (controlledOnToggleLoupe) {
      controlledOnToggleLoupe();
    } else {
      setInternalLoupeActive(!internalLoupeActive);
    }
  };
  const [mousePos, setMousePos] = useState<{ x: number; y: number; containerW: number; containerH: number } | null>(null);

  // Video Synchronized Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [audioSource, setAudioSource] = useState<'enhanced' | 'original'>('enhanced');
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState<boolean>(true);

  // Video DOM element refs
  const origVideoRef = useRef<HTMLVideoElement>(null);
  const enhVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchronized audio routing: ensures no echo, routes to active selection or original
  useEffect(() => {
    const playOriginal = !normEnhanced || viewMode === 'original' || audioSource === 'original';

    if (origVideoRef.current) {
      origVideoRef.current.muted = playOriginal ? isMuted : true;
      origVideoRef.current.volume = volume;
    }
    if (enhVideoRef.current) {
      enhVideoRef.current.muted = !playOriginal ? isMuted : true;
      enhVideoRef.current.volume = volume;
    }
  }, [isMuted, volume, audioSource, normEnhanced, normOriginal, viewMode]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingMedia(true);
      if (originalSrc) {
        const oUrl = await resolveMediaSrc(originalSrc, isVideo);
        if (active) setNormOriginal(oUrl);
      } else {
        if (active) setNormOriginal('');
      }

      if (enhancedSrc) {
        const eUrl = await resolveMediaSrc(enhancedSrc, isVideo);
        if (active) setNormEnhanced(eUrl);
      } else {
        if (active) setNormEnhanced('');
      }
      if (active) setLoadingMedia(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [originalSrc, enhancedSrc, isVideo]);
  // Video Synchronization: Master/Slave time and playback sync
  const masterVideo = enhVideoRef.current || origVideoRef.current;
  const slaveVideo = enhVideoRef.current && origVideoRef.current ? origVideoRef.current : null;

  const handleMasterTimeUpdate = () => {
    if (!masterVideo) return;
    setCurrentTime(masterVideo.currentTime);
    if (masterVideo.duration && isFinite(masterVideo.duration)) {
      setDuration(masterVideo.duration);
    }
    if (slaveVideo) {
      const drift = Math.abs(masterVideo.currentTime - slaveVideo.currentTime);
      // If drift exceeds 25 milliseconds, snap slave to master currentTime
      if (drift > 0.025) {
        slaveVideo.currentTime = masterVideo.currentTime;
      }
    }
  };

  const handleMasterPlay = () => {
    setIsPlaying(true);
    if (slaveVideo && slaveVideo.paused) {
      slaveVideo.play().catch(() => {});
    }
  };

  const handleMasterPause = () => {
    setIsPlaying(false);
    if (slaveVideo && !slaveVideo.paused) {
      slaveVideo.pause();
    }
  };

  const handleMasterEnded = () => {
    if (isLooping) {
      if (masterVideo) {
        masterVideo.currentTime = 0;
        masterVideo.play().catch(() => {});
      }
      if (slaveVideo) {
        slaveVideo.currentTime = 0;
        slaveVideo.play().catch(() => {});
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (!masterVideo) return;
    if (isPlaying) {
      masterVideo.pause();
      if (slaveVideo) slaveVideo.pause();
      setIsPlaying(false);
    } else {
      masterVideo.play().catch(() => {});
      if (slaveVideo) slaveVideo.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleScrub = (newTime: number) => {
    setCurrentTime(newTime);
    if (masterVideo) masterVideo.currentTime = newTime;
    if (slaveVideo) slaveVideo.currentTime = newTime;
  };

  const handleStepFrame = (frames: number) => {
    if (!masterVideo) return;
    masterVideo.pause();
    if (slaveVideo) slaveVideo.pause();
    setIsPlaying(false);

    const step = frames / 30; // 30 fps default stepping interval
    const target = Math.max(0, Math.min(duration || 1000, masterVideo.currentTime + step));
    masterVideo.currentTime = target;
    if (slaveVideo) slaveVideo.currentTime = target;
    setCurrentTime(target);
  };

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (masterVideo) masterVideo.playbackRate = rate;
    if (slaveVideo) slaveVideo.playbackRate = rate;
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Split Slider Divider Movement
  const handleSliderMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    },
    []
  );

  // Mouse Pan Handling
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !isDraggingSlider && zoom > 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (loupeActive) {
        setMousePos({ x, y, containerW: rect.width, containerH: rect.height });
      }
    }
    if (isDraggingSlider) {
      handleSliderMove(e.clientX);
    } else if (isPanning && zoom > 1) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDraggingSlider(false);
    setIsPanning(false);
  };

  const resetTransform = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSliderPosition(50);
  };

  // Keyboard Shortcuts (Space to play, Arrows to step frame, L for Loupe, 1-4 for view modes)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if (e.code === 'Space' && isVideo) {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft' && isVideo) {
        e.preventDefault();
        handleStepFrame(-1);
      } else if (e.code === 'ArrowRight' && isVideo) {
        e.preventDefault();
        handleStepFrame(1);
      } else if (e.code === 'KeyR') {
        resetTransform();
      } else if (e.code === 'KeyL') {
        toggleLoupe();
      } else if (e.code === 'Digit1') {
        setViewMode('split');
      } else if (e.code === 'Digit2') {
        setViewMode('side');
      } else if (e.code === 'Digit3') {
        setViewMode('enhanced');
      } else if (e.code === 'Digit4') {
        setViewMode('original');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVideo, isPlaying, duration, masterVideo, slaveVideo, loupeActive]);

  if (!enhancedSrc && !originalSrc) {
    return (
      <div className="w-full h-full min-h-[380px] bg-[#070b12] border border-[#1b2537] rounded-xl flex flex-col items-center justify-center text-gray-500 font-mono text-xs">
        <Sliders className="w-10 h-10 mb-2 opacity-30 text-[#76b900]" />
        <span>No media loaded</span>
      </div>
    );
  }

  const transformStyle = {
    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
    transition: isPanning ? 'none' : 'transform 0.15s ease-out',
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#06090f] border border-[#1d2a3f] rounded-xl overflow-hidden shadow-2xl">
      {/* ================= VIEWPORT TOP TOOLBAR ================= */}
      <div className="bg-[#0b111c] border-b border-[#1b263b] px-3 py-2 flex items-center justify-between text-xs font-mono select-none">
        {/* Comparison Mode Toggles */}
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`px-2.5 py-1 rounded flex items-center space-x-1.5 transition-colors cursor-pointer ${
              viewMode === 'split' ? 'bg-[#76b900] text-black font-bold' : 'text-gray-400 hover:text-gray-200 bg-[#121a28]'
            }`}
            title="Split comparison slider"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('side')}
            className={`px-2.5 py-1 rounded flex items-center space-x-1.5 transition-colors cursor-pointer ${
              viewMode === 'side' ? 'bg-[#76b900] text-black font-bold' : 'text-gray-400 hover:text-gray-200 bg-[#121a28]'
            }`}
            title="Side-by-side comparison"
          >
            <Columns className="w-3.5 h-3.5" />
            <span>Side by Side</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'enhanced' ? 'split' : 'enhanced')}
            className={`px-2 py-1 rounded flex items-center space-x-1 transition-colors cursor-pointer ${
              viewMode === 'enhanced' ? 'bg-cyan-500 text-black font-bold' : 'text-gray-400 hover:text-gray-200 bg-[#121a28]'
            }`}
            title="Show enhanced only"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Enhanced</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'original' ? 'split' : 'original')}
            className={`px-2 py-1 rounded flex items-center space-x-1 transition-colors cursor-pointer ${
              viewMode === 'original' ? 'bg-gray-200 text-black font-bold' : 'text-gray-400 hover:text-gray-200 bg-[#121a28]'
            }`}
            title="Show original only"
          >
            <span>Original</span>
          </button>
        </div>

        {/* Zoom, Loupe & Inspection Controls */}
        <div className="flex items-center space-x-2">
          {/* 4x Loupe Toggle */}
          <button
            type="button"
            onClick={toggleLoupe}
            className={`px-2 py-1 rounded flex items-center space-x-1.5 transition-colors cursor-pointer border text-[11px] ${
              loupeActive
                ? 'bg-[#76b900]/20 border-[#76b900] text-[#76b900] font-bold'
                : 'text-gray-400 hover:text-gray-200 bg-[#121a28] border-[#1e2e46]'
            }`}
            title="Toggle 4x Pixel Loupe Magnifier (L)"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Loupe (4x)</span>
          </button>

          <div className="flex items-center space-x-1 bg-[#121a28] rounded p-0.5 border border-[#1e2e46]">
            <button
              type="button"
              onClick={() => setZoom(Math.max(1, zoom - 0.5))}
              className="p-1 hover:bg-[#1b283d] text-gray-400 hover:text-white rounded cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] text-gray-300 min-w-[36px] text-center font-bold">
              {zoom === 1 ? 'Fit' : `${zoom.toFixed(1)}x`}
            </span>
            <button
              type="button"
              onClick={() => setZoom(Math.min(4, zoom + 0.5))}
              className="p-1 hover:bg-[#1b283d] text-gray-400 hover:text-white rounded cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={resetTransform}
            className="p-1.5 bg-[#121a28] hover:bg-[#1b283d] text-gray-400 hover:text-white rounded border border-[#1e2e46] cursor-pointer"
            title="Reset view (R)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ================= MAIN INTERACTIVE VIEWPORT ================= */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          handleMouseUp();
          setMousePos(null);
        }}
        className={`relative flex-1 min-h-[340px] bg-black overflow-hidden select-none ${
          loupeActive ? 'cursor-crosshair' : zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : viewMode === 'split' ? 'cursor-ew-resize' : 'cursor-default'
        }`}
      >
        {/* ================= PIXEL LOUPE 4X INSPECTOR OVERLAY ================= */}
        {loupeActive && mousePos && (
          <div
            style={{
              left: `${mousePos.x - 90}px`,
              top: `${mousePos.y - 90}px`,
              width: '180px',
              height: '180px',
            }}
            className="absolute z-50 pointer-events-none rounded-full border-2 border-[#76b900] shadow-[0_0_25px_rgba(118,185,0,0.6)] overflow-hidden bg-black/90 ring-4 ring-black/60"
          >
            {/* Magnified Canvas Layer */}
            <div
              style={{
                width: `${mousePos.containerW}px`,
                height: `${mousePos.containerH}px`,
                transformOrigin: `${mousePos.x}px ${mousePos.y}px`,
                transform: `translate(${90 - mousePos.x}px, ${90 - mousePos.y}px) scale(4)`,
              }}
              className="absolute pointer-events-none flex items-center justify-center"
            >
              {normEnhanced ? (
                isVideo ? (
                  <video
                    src={normEnhanced}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <img src={normEnhanced} alt="Loupe Enhanced" className="max-w-full max-h-full object-contain" />
                )
              ) : normOriginal ? (
                isVideo ? (
                  <video
                    src={normOriginal}
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <img src={normOriginal} alt="Loupe Original" className="max-w-full max-h-full object-contain" />
                )
              ) : null}
            </div>

            {/* Precision Reticle Crosshair */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-full h-[1px] bg-[#76b900]/50" />
              <div className="h-full w-[1px] bg-[#76b900]/50 absolute" />
              <div className="w-2 h-2 rounded-full border border-[#76b900] bg-[#76b900]/30 absolute" />
            </div>

            {/* Loupe Coordinate HUD */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/85 border border-[#76b900]/40 text-[9px] font-mono text-[#76b900] whitespace-nowrap shadow-md">
              4x LOUPE [{Math.round(mousePos.x)}, {Math.round(mousePos.y)}]
            </div>
          </div>
        )}

        {loadingMedia && (
          <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center space-x-2 text-xs font-mono text-[#76b900]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading media...</span>
          </div>
        )}

        {/* ----------------- MODE A: SPLIT SLIDER ----------------- */}
        {viewMode === 'split' && (
          <>
            {/* Enhanced Layer (Bottom) */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              <div style={transformStyle} className="w-full h-full flex items-center justify-center">
                {normEnhanced ? (
                  isVideo ? (
                    <video
                      ref={enhVideoRef}
                      src={normEnhanced}
                      playsInline
                      muted={isMuted}
                      onTimeUpdate={handleMasterTimeUpdate}
                      onPlay={handleMasterPlay}
                      onPause={handleMasterPause}
                      onEnded={handleMasterEnded}
                      className="max-w-full max-h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <img src={normEnhanced} alt="Enhanced" className="max-w-full max-h-full object-contain pointer-events-none" />
                  )
                ) : (
                  <div className="text-xs text-gray-500 font-mono">Awaiting DLSS 5 Processing...</div>
                )}
              </div>
            </div>

            {/* Original Layer (Clipped Top) */}
            {normOriginal && (
              <div
                className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none"
                style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
              >
                <div style={transformStyle} className="w-full h-full flex items-center justify-center">
                  {isVideo ? (
                    <video
                      ref={origVideoRef}
                      src={normOriginal}
                      playsInline
                      muted={true}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <img src={normOriginal} alt="Original" className="max-w-full max-h-full object-contain" />
                  )}
                </div>
              </div>
            )}

            {/* Split Divider Handle */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDraggingSlider(true);
              }}
              style={{ left: `${sliderPosition}%` }}
              className="absolute top-0 bottom-0 w-[2px] bg-[#76b900] shadow-[0_0_12px_#76b900] cursor-ew-resize z-20 flex items-center justify-center -translate-x-1/2"
            >
              <div className="w-6 h-6 rounded-full bg-[#76b900] text-black shadow-lg flex items-center justify-center cursor-ew-resize">
                <Sliders className="w-3.5 h-3.5 rotate-90" />
              </div>
            </div>

            {/* Clean Floating Pills */}
            <div className="absolute top-3 left-3 z-30 pointer-events-none">
              <span className="px-2 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-mono text-gray-300 font-bold">
                ORIGINAL
              </span>
            </div>
            <div className="absolute top-3 right-3 z-30 pointer-events-none">
              <span className="px-2 py-0.5 rounded bg-[#76b900]/90 backdrop-blur-md border border-[#76b900] text-[10px] font-mono text-black font-bold">
                DLSS 5
              </span>
            </div>
          </>
        )}

        {/* ----------------- MODE B: SIDE BY SIDE ----------------- */}
        {viewMode === 'side' && (
          <div className="absolute inset-0 grid grid-cols-2 divide-x divide-[#1b263b]">
            {/* Left: Original */}
            <div className="relative flex flex-col items-center justify-center overflow-hidden bg-[#05080e]">
              <div className="absolute top-2 left-2 z-10">
                <span className="px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-gray-300 font-bold">
                  ORIGINAL
                </span>
              </div>
              <div style={transformStyle} className="w-full h-full flex items-center justify-center p-2">
                {normOriginal &&
                  (isVideo ? (
                    <video
                      ref={origVideoRef}
                      src={normOriginal}
                      playsInline
                      muted={true}
                      className="max-w-full max-h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <img src={normOriginal} alt="Original" className="max-w-full max-h-full object-contain pointer-events-none" />
                  ))}
              </div>
            </div>

            {/* Right: Enhanced */}
            <div className="relative flex flex-col items-center justify-center overflow-hidden bg-[#070b12]">
              <div className="absolute top-2 left-2 z-10">
                <span className="px-2 py-0.5 rounded bg-[#76b900]/90 text-[10px] font-mono text-black font-bold">
                  DLSS 5
                </span>
              </div>
              <div style={transformStyle} className="w-full h-full flex items-center justify-center p-2">
                {normEnhanced ? (
                  isVideo ? (
                    <video
                      ref={enhVideoRef}
                      src={normEnhanced}
                      playsInline
                      muted={isMuted}
                      onTimeUpdate={handleMasterTimeUpdate}
                      onPlay={handleMasterPlay}
                      onPause={handleMasterPause}
                      onEnded={handleMasterEnded}
                      className="max-w-full max-h-full object-contain pointer-events-none"
                    />
                  ) : (
                    <img src={normEnhanced} alt="Enhanced" className="max-w-full max-h-full object-contain pointer-events-none" />
                  )
                ) : (
                  <div className="text-xs text-gray-500 font-mono">Awaiting DLSS 5 Processing...</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----------------- MODE C: ENHANCED FULL ----------------- */}
        {viewMode === 'enhanced' && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div className="absolute top-2 left-2 z-10">
              <span className="px-2 py-0.5 rounded bg-[#76b900]/90 text-[10px] font-mono text-black font-bold">
                DLSS 5
              </span>
            </div>
            <div style={transformStyle} className="w-full h-full flex items-center justify-center">
              {normEnhanced ? (
                isVideo ? (
                  <video
                    ref={enhVideoRef}
                    src={normEnhanced}
                    playsInline
                    muted={isMuted}
                    onTimeUpdate={handleMasterTimeUpdate}
                    onPlay={handleMasterPlay}
                    onPause={handleMasterPause}
                    onEnded={handleMasterEnded}
                    className="max-w-full max-h-full object-contain pointer-events-none"
                  />
                ) : (
                  <img src={normEnhanced} alt="Enhanced" className="max-w-full max-h-full object-contain pointer-events-none" />
                )
              ) : (
                <div className="text-xs text-gray-500 font-mono">Awaiting DLSS 5 Processing...</div>
              )}
            </div>
          </div>
        )}

        {/* ----------------- MODE D: ORIGINAL FULL ----------------- */}
        {viewMode === 'original' && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div className="absolute top-2 left-2 z-10">
              <span className="px-2 py-0.5 rounded bg-black/80 text-[10px] font-mono text-gray-300 font-bold">
                ORIGINAL
              </span>
            </div>
            <div style={transformStyle} className="w-full h-full flex items-center justify-center">
              {normOriginal &&
                (isVideo ? (
                  <video
                    ref={origVideoRef}
                    src={normOriginal}
                    playsInline
                    muted={true}
                    className="max-w-full max-h-full object-contain pointer-events-none"
                  />
                ) : (
                  <img src={normOriginal} alt="Original" className="max-w-full max-h-full object-contain pointer-events-none" />
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ================= SYNCHRONIZED VIDEO PLAYER TRANSPORT BAR ================= */}
      {isVideo && (
        <div className="bg-[#0a0f18] border-t border-[#182335] px-4 py-2.5 flex items-center justify-between text-xs font-mono select-none">
          {/* Playback Controls & Frame Steppers */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={togglePlay}
              className="w-8 h-8 rounded-lg bg-[#76b900] hover:bg-[#8cee00] text-black flex items-center justify-center transition-colors cursor-pointer shadow-md"
              title="Play / Pause (Space)"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>

            <button
              type="button"
              onClick={() => handleStepFrame(-1)}
              className="p-1.5 bg-[#141e2e] hover:bg-[#1e2d44] text-gray-300 hover:text-white rounded border border-[#20314a] cursor-pointer"
              title="Previous Frame (Left Arrow)"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleStepFrame(1)}
              className="p-1.5 bg-[#141e2e] hover:bg-[#1e2d44] text-gray-300 hover:text-white rounded border border-[#20314a] cursor-pointer"
              title="Next Frame (Right Arrow)"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Scrubber Timeline Slider & Timestamps */}
          <div className="flex-1 flex items-center space-x-3 px-4">
            <span className="text-gray-300 text-[11px] min-w-[55px]">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.01}
              value={currentTime}
              onChange={(e) => handleScrub(parseFloat(e.target.value))}
              className="flex-1 accent-[#76b900] bg-gray-800 h-1.5 rounded-lg cursor-pointer"
            />
            <span className="text-gray-500 text-[11px] min-w-[55px]">{formatTime(duration)}</span>
          </div>

          {/* Speed, Loop & Volume Toggles */}
          <div className="flex items-center space-x-2">
            <select
              value={playbackRate}
              onChange={(e) => changePlaybackRate(parseFloat(e.target.value))}
              className="bg-[#141e2e] border border-[#20314a] text-gray-300 rounded px-1.5 py-1 text-[11px] cursor-pointer outline-none"
              title="Playback speed"
            >
              <option value={0.25}>0.25x</option>
              <option value={0.5}>0.5x</option>
              <option value={1.0}>1.0x</option>
              <option value={2.0}>2.0x</option>
            </select>

            <button
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`p-1.5 rounded border cursor-pointer transition-colors ${
                isLooping ? 'bg-[#76b900]/20 border-[#76b900]/50 text-[#76b900]' : 'bg-[#141e2e] border-[#20314a] text-gray-500'
              }`}
              title="Loop playback"
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>

            {normEnhanced && (
              <button
                type="button"
                onClick={() => setAudioSource(audioSource === 'enhanced' ? 'original' : 'enhanced')}
                className="px-2 py-1 bg-[#141e2e] hover:bg-[#1d2b40] text-[10px] font-mono text-cyan-300 rounded border border-[#20314a] cursor-pointer"
                title="Switch audio track between Enhanced and Original"
              >
                Audio: {audioSource === 'enhanced' ? 'DLSS 5' : 'Original'}
              </button>
            )}

            <div className="flex items-center space-x-1.5 bg-[#121a28] px-2 py-1 rounded border border-[#1e2e46]">
              <button
                type="button"
                onClick={toggleMute}
                className="text-gray-300 hover:text-white cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-[#76b900]" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (isMuted && v > 0) setIsMuted(false);
                }}
                className="w-14 accent-[#76b900] bg-gray-800 h-1 rounded cursor-pointer"
                title={`Volume: ${(volume * 100).toFixed(0)}%`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
