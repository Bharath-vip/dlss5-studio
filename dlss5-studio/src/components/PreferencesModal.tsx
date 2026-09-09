import React, { useState } from 'react';
import { X, Cpu, HardDrive, Volume2, ShieldCheck, Check, FolderOpen } from 'lucide-react';
import type { GpuInfo, AppPreferences } from '../types/pipeline';
import { open } from '@tauri-apps/plugin-dialog';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  gpu: GpuInfo | null;
  preferences: AppPreferences;
  onSavePreferences: (prefs: AppPreferences) => void;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  gpu,
  preferences,
  onSavePreferences,
}) => {
  const [prefs, setPrefs] = useState<AppPreferences>(preferences);
  const [activeTab, setActiveTab] = useState<'hardware' | 'storage' | 'audio'>('hardware');

  if (!isOpen) return null;

  const handleBrowseDefaultDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Choose Default Render Output Folder',
      });
      if (selected && typeof selected === 'string') {
        setPrefs((p) => ({ ...p, defaultOutputDir: selected }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = () => {
    onSavePreferences(prefs);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-xl bg-[#0a0f18] border border-[#1e2e46] rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans text-xs">
        {/* Modal Header */}
        <div className="bg-[#0e1624] px-5 py-3.5 border-b border-[#1b263b] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-2 h-2 rounded-full bg-[#76b900] shadow-[0_0_8px_#76b900]" />
            <span className="text-sm font-semibold text-white tracking-wide font-mono">
              WORKSTATION PREFERENCES & HARDWARE DIAGNOSTICS
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#1a263c] text-gray-400 hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-[#070b13] px-5 flex border-b border-[#182336] text-[11px] font-mono">
          <button
            onClick={() => setActiveTab('hardware')}
            className={`py-2.5 px-3 flex items-center space-x-1.5 border-b-2 font-medium transition-colors ${
              activeTab === 'hardware'
                ? 'border-[#76b900] text-[#76b900]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Hardware & AI Engine</span>
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`py-2.5 px-3 flex items-center space-x-1.5 border-b-2 font-medium transition-colors ${
              activeTab === 'storage'
                ? 'border-[#76b900] text-[#76b900]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Storage & Output</span>
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`py-2.5 px-3 flex items-center space-x-1.5 border-b-2 font-medium transition-colors ${
              activeTab === 'audio'
                ? 'border-[#76b900] text-[#76b900]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Audio & Encoding</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[420px] overflow-y-auto">
          {activeTab === 'hardware' && (
            <div className="space-y-3.5">
              {/* GPU Diagnostics Card */}
              <div className="p-3.5 bg-[#0e1625] border border-[#1f3049] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-200">{gpu?.name || 'NVIDIA Graphics Processor'}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#76b900]/15 text-[#76b900] border border-[#76b900]/30">
                    TENSOR ENGINE READY
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-gray-400 pt-1">
                  <div>
                    <span className="block text-gray-500 text-[10px]">DRIVER VERSION</span>
                    <strong className="text-gray-200">{gpu?.driver_version || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="block text-gray-500 text-[10px]">VIDEO MEMORY</span>
                    <strong className="text-gray-200">{gpu?.memory_mb || 4096} MB</strong>
                  </div>
                  <div>
                    <span className="block text-gray-500 text-[10px]">HARDWARE LUID</span>
                    <strong className="text-gray-200 truncate block">{gpu?.luid || 'PCIe Dev'}</strong>
                  </div>
                </div>
              </div>

              {/* Hardware Acceleration Backend */}
              <div className="space-y-1.5">
                <label className="block text-gray-300 font-medium">Hardware Video Decoder</label>
                <select
                  value={prefs.hardwareDecoder}
                  onChange={(e) => setPrefs({ ...prefs, hardwareDecoder: e.target.value as any })}
                  className="w-full bg-[#111a2a] border border-[#21344e] rounded-lg px-3 py-2 text-gray-200 font-mono outline-none"
                >
                  <option value="cuda">CUDA (NVIDIA NVDEC Hardware Accelerated) [Recommended]</option>
                  <option value="d3d11va">Direct3D 11 Video Acceleration (D3D11VA)</option>
                  <option value="auto">Automatic Platform Detection</option>
                </select>
              </div>

              {/* VRAM Utilization Cap */}
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-gray-300">
                  <span>Maximum GPU Memory Allocation</span>
                  <span className="font-mono text-[#76b900]">{prefs.maxVramUsagePercent}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={5}
                  value={prefs.maxVramUsagePercent}
                  onChange={(e) => setPrefs({ ...prefs, maxVramUsagePercent: parseInt(e.target.value) })}
                  className="w-full accent-[#76b900] bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] text-gray-500 block">
                  Prevents VRAM overflow during simultaneous 4K frame generation and temporal neural reconstruction.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-3.5">
              {/* Default Output Folder */}
              <div className="space-y-1.5">
                <label className="block text-gray-300 font-medium">Default Export Directory</label>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-[#101827] border border-[#20324d] rounded-lg px-3 py-2 text-gray-300 font-mono truncate text-[11px]">
                    {prefs.defaultOutputDir || 'Default (outputs/ inside source directory)'}
                  </div>
                  <button
                    type="button"
                    onClick={handleBrowseDefaultDir}
                    className="px-3 py-2 bg-[#172439] hover:bg-[#203350] text-cyan-400 border border-cyan-500/30 rounded-lg flex items-center space-x-1.5 transition-colors shrink-0 cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Browse...</span>
                  </button>
                </div>
              </div>

              {/* NVENC Encoder Preset */}
              <div className="space-y-1.5">
                <label className="block text-gray-300 font-medium">Default NVENC Encoding Profile</label>
                <select
                  value={prefs.nvencPreset}
                  onChange={(e) => setPrefs({ ...prefs, nvencPreset: e.target.value })}
                  className="w-full bg-[#111a2a] border border-[#21344e] rounded-lg px-3 py-2 text-gray-200 font-mono outline-none"
                >
                  <option value="p7">P7: Highest Quality (Archival Master)</option>
                  <option value="p6">P6: High Quality (Balanced Workstation Default)</option>
                  <option value="p5">P5: Fast Throughput (Batch Production)</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-3.5">
              <div className="p-3.5 bg-[#0e1625] border border-[#1f3049] rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-semibold text-gray-200 block">Lossless Audio Stream Passthrough</span>
                  <span className="text-[10px] text-gray-500 block mt-0.5">
                    Directly multiplexes original multi-channel AAC, Dolby, or PCM streams without recompression.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.audioPassthrough}
                  onChange={(e) => setPrefs({ ...prefs, audioPassthrough: e.target.checked })}
                  className="w-4 h-4 accent-[#76b900] cursor-pointer"
                />
              </div>

              <div className="p-3 bg-[#111928] rounded-xl text-gray-400 space-y-1 text-[11px] font-mono">
                <div className="flex items-center space-x-1 text-[#76b900]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="font-bold">STUDIO AUDIO INTEGRITY ASSURANCE</span>
                </div>
                <p className="text-gray-500 text-[10px]">
                  When disabled, audio is re-encoded with broadcast-grade 256 kbps AAC with sample-accurate lip-sync timestamps.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-[#0b101a] px-5 py-3 border-t border-[#1a2538] flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#141d2c] hover:bg-[#1b273b] text-gray-300 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-1.5 bg-[#76b900] hover:bg-[#8cee00] text-black font-bold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer shadow-md"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save Preferences</span>
          </button>
        </div>
      </div>
    </div>
  );
};
