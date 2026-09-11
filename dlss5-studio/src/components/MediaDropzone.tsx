import React, { useRef, useState, useEffect } from 'react';
import type { MediaMetadata } from '../types/pipeline';
import { UploadCloud, Film, Image as ImageIcon, X, Trash2, Layers, Check } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';

interface MediaDropzoneProps {
  onFilesSelected: (paths: string[]) => void;
  metadataList?: MediaMetadata[];
  activeMetaIndex?: number;
  onSelectIndex?: (index: number) => void;
  onRemoveIndex?: (index: number) => void;
  onClearAll?: () => void;
  currentMeta: MediaMetadata | null;
  fileCount: number;
}

export const MediaDropzone: React.FC<MediaDropzoneProps> = ({
  onFilesSelected,
  metadataList = [],
  activeMetaIndex = 0,
  onSelectIndex,
  onRemoveIndex,
  onClearAll,
  currentMeta,
  fileCount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Tauri v2 native window drag-drop event integration
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type === 'over') {
            setIsDragOver(true);
          } else if (event.payload.type === 'leave') {
            setIsDragOver(false);
          } else if (event.payload.type === 'drop') {
            setIsDragOver(false);
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              onFilesSelected(paths);
            }
          }
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {
          // Non-Tauri fallback
        });
    } catch {
      // Non-Tauri fallback
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [onFilesSelected]);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Supported Media',
            extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'png', 'jpg', 'jpeg', 'webp', 'tiff'],
          },
        ],
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        if (paths.length > 0) {
          onFilesSelected(paths);
        }
      }
    } catch {
      // Fallback to hidden HTML file input
      fileInputRef.current?.click();
    }
  };

  const handleHTMLFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const paths: string[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const f = e.target.files[i] as any;
        if (f.path) {
          paths.push(f.path);
        } else if (f.name) {
          paths.push(f.name);
        }
      }
      onFilesSelected(paths);
    }
  };

  // HTML5 Drag and Drop Handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const paths: string[] = [];
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i] as any;
        if (f.path) {
          paths.push(f.path);
        } else if (f.name) {
          paths.push(f.name);
        }
      }
      if (paths.length > 0) {
        onFilesSelected(paths);
      }
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`bg-[#0c121e] border rounded-xl p-2.5 shadow-md transition-all duration-200 ${
        isDragOver
          ? 'border-[#76b900] bg-[#0c1a18] ring-2 ring-[#76b900]/50 shadow-[0_0_20px_rgba(118,185,0,0.3)]'
          : 'border-[#1b263b]'
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleHTMLFileChange}
        multiple
        className="hidden"
        accept="video/*,image/*"
      />

      {/* Main Clickable / Droppable Target */}
      <div
        onClick={handleBrowse}
        className={`border border-dashed rounded-lg px-3 py-2.5 flex items-center justify-between cursor-pointer transition-all duration-200 group ${
          isDragOver
            ? 'border-[#76b900] bg-[#122316]'
            : 'border-[#24334e] hover:border-[#76b900]/70 bg-[#080d16]/70 hover:bg-[#0d1522]'
        }`}
      >
        <div className="flex items-center space-x-2.5">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isDragOver
                ? 'bg-[#76b900] text-black animate-bounce'
                : 'bg-[#141f33] group-hover:bg-[#76b900]/20 text-gray-400 group-hover:text-[#76b900]'
            }`}
          >
            <UploadCloud className="w-4 h-4 transition-colors" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-200 group-hover:text-white">
              {isDragOver ? (
                <span className="text-[#76b900] font-bold">Release to load media into DLSS 5</span>
              ) : (
                <>
                  Drop media or <span className="text-[#76b900] underline font-semibold">browse files</span>
                </>
              )}
            </span>
            <span className="text-[10px] text-gray-500 font-mono block">
              MP4, MKV, MOV, WEBM • PNG, JPG, WEBP, TIFF
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {fileCount > 0 && (
            <div className="px-2 py-0.5 bg-[#1a263c] rounded text-[10px] text-cyan-400 font-mono border border-cyan-500/20 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              <span>
                {fileCount} {fileCount === 1 ? 'source' : 'sources'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Multi-file switcher strip when 2+ files loaded */}
      {metadataList.length > 1 && (
        <div className="mt-2 pt-2 border-t border-[#182436] space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-gray-400">
            <span className="flex items-center gap-1 font-semibold text-gray-300">
              <Layers className="w-3 h-3 text-[#76b900]" />
              LOADED QUEUE ({metadataList.length} FILES):
            </span>
            {onClearAll && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearAll();
                }}
                className="text-rose-400 hover:text-rose-300 flex items-center gap-0.5 cursor-pointer"
                title="Clear all loaded sources"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>Clear All</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 max-h-24 scrollbar-thin">
            {metadataList.map((meta, idx) => {
              const isActive = idx === activeMetaIndex;
              return (
                <div
                  key={`${meta.path}-${idx}`}
                  onClick={() => onSelectIndex?.(idx)}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono flex items-center space-x-1.5 shrink-0 cursor-pointer border transition-all ${
                    isActive
                      ? 'bg-[#15271a] border-[#76b900] text-white shadow-sm shadow-[#76b900]/20'
                      : 'bg-[#0e1625] border-[#1d2b42] text-gray-400 hover:text-gray-200 hover:bg-[#142033]'
                  }`}
                  title={meta.path}
                >
                  {meta.is_video ? (
                    <Film className={`w-3 h-3 ${isActive ? 'text-[#76b900]' : 'text-cyan-400'}`} />
                  ) : (
                    <ImageIcon className={`w-3 h-3 ${isActive ? 'text-[#76b900]' : 'text-emerald-400'}`} />
                  )}
                  <span className="truncate max-w-[100px] font-medium">{meta.filename}</span>
                  {isActive && <Check className="w-2.5 h-2.5 text-[#76b900] shrink-0" />}
                  {onRemoveIndex && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveIndex(idx);
                      }}
                      className="ml-0.5 p-0.5 text-gray-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                      title="Remove from queue"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Media Detailed Metadata Card */}
      {currentMeta && (
        <div className="mt-2 px-2.5 py-1.5 bg-[#111928] border border-[#1d2c44] rounded-lg flex items-center justify-between">
          <div className="flex items-center space-x-2.5 truncate">
            <div className="w-6 h-6 rounded bg-[#1b273d] flex items-center justify-center shrink-0">
              {currentMeta.is_video ? (
                <Film className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </div>
            <div className="truncate">
              <span className="text-xs font-semibold text-gray-200 truncate block">{currentMeta.filename}</span>
              <div className="flex items-center space-x-1.5 text-[10px] text-gray-400 font-mono">
                <span>
                  {currentMeta.width}×{currentMeta.height}
                </span>
                <span>•</span>
                {currentMeta.is_video ? (
                  <span>
                    {currentMeta.fps.toFixed(0)}fps • {currentMeta.duration_seconds.toFixed(1)}s
                  </span>
                ) : (
                  <span>{(currentMeta.size_bytes / (1024 * 1024)).toFixed(1)}MB</span>
                )}
                <span>•</span>
                <span className="uppercase">{currentMeta.codec}</span>
                {currentMeta.is_hdr && (
                  <>
                    <span>•</span>
                    <span className="text-amber-400 font-bold">HDR</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={handleBrowse}
              className="text-[10px] px-2 py-1 bg-[#1a263c] hover:bg-[#253655] text-gray-300 hover:text-white rounded border border-[#2b3c58] shrink-0 font-mono cursor-pointer transition-colors"
              title="Add or change media files"
            >
              Add / Change
            </button>
            {metadataList.length <= 1 && onClearAll && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-[10px] p-1 bg-[#1c1822] hover:bg-[#2e1d27] text-rose-400 hover:text-rose-300 rounded border border-rose-900/40 shrink-0 cursor-pointer transition-colors"
                title="Remove this file"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
