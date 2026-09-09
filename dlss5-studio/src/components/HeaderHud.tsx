import React from 'react';
import type { GpuInfo } from '../types/pipeline';
import { Activity, CheckCircle2 } from 'lucide-react';

interface HeaderHudProps {
  gpu: GpuInfo | null;
  processing: boolean;
  fps: number;
}

export const HeaderHud: React.FC<HeaderHudProps> = ({ gpu, processing, fps }) => {
  return (
    <div className="bg-[#0b101c] border-b border-[#1b2537] px-6 py-3 flex items-center justify-between shadow-lg">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#76b900] shadow-[0_0_8px_#76b900]"></span>
          <span className="text-sm font-semibold text-white tracking-wide">
            {gpu ? gpu.name : 'Detecting GPU...'}
          </span>
        </div>

        <div className="h-4 w-[1px] bg-gray-800" />

        <div className="flex items-center space-x-2 text-xs text-gray-400 font-mono">
          <span>Driver: <strong className="text-gray-200">{gpu?.driver_version || 'Loading'}</strong></span>
          <span>•</span>
          <span>VRAM: <strong className="text-gray-200">{gpu?.memory_mb ? `${gpu.memory_mb} MB` : '4096 MB'}</strong></span>
        </div>

        <div className="h-4 w-[1px] bg-gray-800" />

        <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#76b900]/15 border border-[#76b900]/40 text-[#76b900]">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          <span>DLSS 5 Ready</span>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {processing && (
          <div className="flex items-center space-x-2 bg-[#121c2e] border border-cyan-500/30 px-3 py-1 rounded-full text-xs font-mono text-cyan-400 animate-pulse">
            <Activity className="w-3.5 h-3.5 animate-spin" />
            <span>Processing {fps > 0 ? `(${fps.toFixed(1)} FPS)` : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
};
