import React, { useState, useRef, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Sparkles } from 'lucide-react';

interface TitleBarProps {
  onOpenFile?: () => void;
  onExportAs?: () => void;
  onOpenPreferences?: () => void;
  onOpenInspector?: () => void;
  onResetPipeline?: () => void;
  onStartPipeline?: () => void;
  onToggleLoupe?: () => void;
  onSelectViewMode?: (mode: 'split' | 'side' | 'enhanced' | 'original') => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  onOpenFile,
  onExportAs,
  onOpenPreferences,
  onOpenInspector,
  onResetPipeline,
  onStartPipeline,
  onToggleLoupe,
  onSelectViewMode,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const appWindow = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ 
    ? getCurrentWindow() 
    : null;

  const handleMinimize = () => appWindow?.minimize();
  const handleMaximize = () => appWindow?.toggleMaximize();
  const handleClose = () => appWindow?.close();

  // Close menus when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleMenu = (menuName: string) => {
    setActiveMenu(activeMenu === menuName ? null : menuName);
  };

  const handleAction = (action?: () => void) => {
    setActiveMenu(null);
    if (action) action();
  };

  return (
    <div
      data-tauri-drag-region
      className="h-10 bg-[#090d16] border-b border-[#1c2638] flex items-center justify-between px-3 select-none z-50 text-xs font-mono"
    >
      {/* Brand & Menu Bar */}
      <div className="flex items-center space-x-3 no-drag" ref={menuBarRef}>
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-[#76b900]/10 border border-[#76b900]/30 text-[#76b900] font-bold">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span>DLSS 5 STUDIO</span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#162032] border border-[#23334d] text-gray-400 font-mono">
          WORKSTATION
        </span>

        {/* Top Desktop Menus */}
        <div className="relative flex items-center space-x-1 ml-2 text-gray-300">
          {/* FILE MENU */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu('file')}
              className={`px-2.5 py-1 rounded hover:bg-[#162234] transition-colors cursor-pointer ${
                activeMenu === 'file' ? 'bg-[#162234] text-white font-semibold' : ''
              }`}
            >
              File
            </button>
            {activeMenu === 'file' && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-[#0c121e] border border-[#1e2e46] rounded-lg shadow-2xl py-1 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => handleAction(onOpenFile)}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-200 cursor-pointer"
                >
                  <span>Open Media File...</span>
                  <span className="text-gray-500 text-[10px]">Ctrl+O</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(onExportAs)}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-200 cursor-pointer"
                >
                  <span>Export Master File As...</span>
                  <span className="text-gray-500 text-[10px]">Ctrl+S</span>
                </button>
                <div className="h-px bg-[#1a2538] my-1" />
                <button
                  type="button"
                  onClick={() => handleAction(onOpenPreferences)}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-200 cursor-pointer"
                >
                  <span>Workstation Preferences...</span>
                  <span className="text-gray-500 text-[10px]">Ctrl+,</span>
                </button>
                <div className="h-px bg-[#1a2538] my-1" />
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-rose-950 hover:text-rose-300 text-gray-400 cursor-pointer"
                >
                  <span>Exit Application</span>
                  <span className="text-gray-500 text-[10px]">Alt+F4</span>
                </button>
              </div>
            )}
          </div>

          {/* VIEW MENU */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu('view')}
              className={`px-2.5 py-1 rounded hover:bg-[#162234] transition-colors cursor-pointer ${
                activeMenu === 'view' ? 'bg-[#162234] text-white font-semibold' : ''
              }`}
            >
              View
            </button>
            {activeMenu === 'view' && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-[#0c121e] border border-[#1e2e46] rounded-lg shadow-2xl py-1 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => handleAction(() => onSelectViewMode?.('split'))}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-200 cursor-pointer"
                >
                  <span>Split Comparison Slider</span>
                  <span className="text-gray-500 text-[10px]">1</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(() => onSelectViewMode?.('side'))}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-200 cursor-pointer"
                >
                  <span>Side-by-Side Dual View</span>
                  <span className="text-gray-500 text-[10px]">2</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(() => onSelectViewMode?.('enhanced'))}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-200 cursor-pointer"
                >
                  <span>Enhanced Bitstream Only</span>
                  <span className="text-gray-500 text-[10px]">3</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(() => onSelectViewMode?.('original'))}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-200 cursor-pointer"
                >
                  <span>Source Bitstream Only</span>
                  <span className="text-gray-500 text-[10px]">4</span>
                </button>
                <div className="h-px bg-[#1a2538] my-1" />
                <button
                  type="button"
                  onClick={() => handleAction(onToggleLoupe)}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-[#76b900] cursor-pointer"
                >
                  <span>Toggle Pixel Loupe (4x)</span>
                  <span className="text-gray-500 text-[10px]">L</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(onOpenInspector)}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-cyan-300 cursor-pointer"
                >
                  <span>Source Bitstream Inspector...</span>
                  <span className="text-gray-500 text-[10px]">I</span>
                </button>
              </div>
            )}
          </div>

          {/* PROCESSING MENU */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu('processing')}
              className={`px-2.5 py-1 rounded hover:bg-[#162234] transition-colors cursor-pointer ${
                activeMenu === 'processing' ? 'bg-[#162234] text-white font-semibold' : ''
              }`}
            >
              Processing
            </button>
            {activeMenu === 'processing' && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-[#0c121e] border border-[#1e2e46] rounded-lg shadow-2xl py-1 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => handleAction(onStartPipeline)}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-emerald-400 cursor-pointer"
                >
                  <span>Execute DLSS 5 Pipeline</span>
                  <span className="text-gray-500 text-[10px]">Space</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(onResetPipeline)}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-300 cursor-pointer"
                >
                  <span>Reset Pipeline Parameters</span>
                  <span className="text-gray-500 text-[10px]">Ctrl+R</span>
                </button>
              </div>
            )}
          </div>

          {/* DIAGNOSTICS MENU */}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggleMenu('diagnostics')}
              className={`px-2.5 py-1 rounded hover:bg-[#162234] transition-colors cursor-pointer ${
                activeMenu === 'diagnostics' ? 'bg-[#162234] text-white font-semibold' : ''
              }`}
            >
              Diagnostics
            </button>
            {activeMenu === 'diagnostics' && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-[#0c121e] border border-[#1e2e46] rounded-lg shadow-2xl py-1 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => handleAction(onOpenPreferences)}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-200 cursor-pointer"
                >
                  <span>Tensor Core & VRAM Telemetry</span>
                  <span className="text-gray-500 text-[10px]">Ctrl+,</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(onOpenInspector)}
                  className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#162438] text-gray-200 cursor-pointer"
                >
                  <span>Video Codec & Format Diagnostics</span>
                  <span className="text-gray-500 text-[10px]">I</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Window Controls */}
      <div className="flex items-center space-x-1 no-drag">
        <button
          onClick={handleMinimize}
          className="w-8 h-7 flex items-center justify-center hover:bg-[#162032] text-gray-400 hover:text-white rounded transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-8 h-7 flex items-center justify-center hover:bg-[#162032] text-gray-400 hover:text-white rounded transition-colors"
          title="Maximize"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          className="w-8 h-7 flex items-center justify-center hover:bg-rose-600 text-gray-400 hover:text-white rounded transition-colors"
          title="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

