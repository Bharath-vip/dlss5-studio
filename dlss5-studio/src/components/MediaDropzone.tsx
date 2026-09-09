import React, { useRef } from 'react';
import type { MediaMetadata } from '../types/pipeline';
import { UploadCloud, Film, Image as ImageIcon } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface MediaDropzoneProps {
  onFilesSelected: (paths: string[]) => void;
  currentMeta: MediaMetadata | null;
  fileCount: number;
}

export const MediaDropzone: React.FC<MediaDropzoneProps> = ({
  onFilesSelected,
  currentMeta,
  fileCount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    } catch (e) {
      // Fallback to hidden HTML file input
      fileInputRef.current?.click();
    }
  };

  const handleHTMLFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const paths: string[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        // In browser/webview, file.path may exist
        const f = e.target.files[i] as any;
        if (f.path) paths.push(f.path);
        else paths.push(f.name);
      }
      onFilesSelected(paths);
    }
  };

  return (
    <div className="bg-[#0c121e] border border-[#1b263b] rounded-xl p-2.5 shadow-md">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleHTMLFileChange}
        multiple
        className="hidden"
        accept="video/*,image/*"
      />

      <div
        onClick={handleBrowse}
        className="border border-dashed border-[#24334e] hover:border-[#76b900]/70 bg-[#080d16]/70 hover:bg-[#0d1522] rounded-lg px-3 py-2 flex items-center justify-between cursor-pointer transition-all duration-200 group"
      >
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded bg-[#141f33] group-hover:bg-[#76b900]/20 flex items-center justify-center transition-colors">
            <UploadCloud className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#76b900] transition-colors" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-200 group-hover:text-white">
              Drop media or <span className="text-[#76b900] underline">browse</span>
            </span>
            <span className="text-[10px] text-gray-500 font-mono block">
              MP4, MKV, MOV • PNG, JPG, WEBP
            </span>
          </div>
        </div>

        {fileCount > 0 && (
          <div className="px-2 py-0.5 bg-[#1a263c] rounded text-[10px] text-cyan-400 font-mono border border-cyan-500/20">
            {fileCount} {fileCount === 1 ? 'file' : 'files'}
          </div>
        )}
      </div>

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
                <span>{currentMeta.width}×{currentMeta.height}</span>
                <span>•</span>
                {currentMeta.is_video ? (
                  <span>{currentMeta.fps.toFixed(0)}fps • {currentMeta.duration_seconds.toFixed(1)}s</span>
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

          <button
            type="button"
            onClick={handleBrowse}
            className="text-[10px] px-2 py-1 bg-[#1a263c] hover:bg-[#253655] text-gray-300 hover:text-white rounded border border-[#2b3c58] shrink-0 font-mono cursor-pointer"
            title="Select different files"
          >
            Change
          </button>
        </div>
      )}
    </div>
  );
};
