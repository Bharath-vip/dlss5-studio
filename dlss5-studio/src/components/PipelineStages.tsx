import React, { useState } from 'react';
import type { PipelineConfig } from '../types/pipeline';
import { Sparkles, ZoomIn, Zap, Package, ChevronDown, ChevronRight, Sliders, FolderOpen, RotateCcw } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface PipelineStagesProps {
  config: PipelineConfig;
  onChange: (config: PipelineConfig) => void;
  isVideo: boolean;
}

export const PipelineStages: React.FC<PipelineStagesProps> = ({ config, onChange, isVideo }) => {
  const [showAdvancedNR, setShowAdvancedNR] = useState(false);

  const handleBrowseOutputDir = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Export / Output Destination Folder',
      });
      if (selected && typeof selected === 'string') {
        update({ output_dir: selected });
      }
    } catch (e) {
      console.error('Failed to browse output directory:', e);
    }
  };

  const update = (partial: Partial<PipelineConfig>) => {
    onChange({ ...config, ...partial });
  };

  const updateDlss5 = (partial: Partial<PipelineConfig['dlss5']>) => {
    onChange({
      ...config,
      dlss5: { ...config.dlss5, ...partial },
    });
  };

  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'balanced':
        onChange({
          ...config,
          enable_nr: true,
          dlss5: {
            ...config.dlss5,
            preset: 0,
            style: 2,
            intensity: 1.0,
            dlss_model_preset: 0,
          },
          enable_upscale: false,
          enable_frame_gen: false,
        });
        break;
      case 'cinema':
        onChange({
          ...config,
          enable_nr: true,
          dlss5: {
            ...config.dlss5,
            preset: 1,
            style: 2,
            intensity: 1.2,
            dlss_model_preset: 13,
            global_tone: 1.1,
            color_strength: 1.15,
          },
          enable_upscale: true,
          upscale_factor: 2.0,
          vsr_quality: 4,
          enable_frame_gen: false,
        });
        break;
      case 'highfps':
        onChange({
          ...config,
          enable_nr: true,
          enable_upscale: false,
          enable_frame_gen: true,
          target_fps: '60',
        });
        break;
      case 'fast':
        onChange({
          ...config,
          enable_nr: true,
          dlss5: {
            ...config.dlss5,
            preset: 2,
            style: 0,
            intensity: 0.9,
          },
          enable_upscale: false,
          enable_frame_gen: false,
          video_quality: 'p5',
        });
        break;
    }
  };

  return (
    <div className="space-y-3">
      {/* Quick Enhancement Presets */}
      <div className="bg-[#0b101c] border border-[#1b263b] rounded-xl p-2.5 flex items-center justify-between text-xs font-mono">
        <span className="text-gray-400 font-semibold text-[11px] px-1">PRESETS:</span>
        <div className="flex items-center space-x-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => applyPreset('balanced')}
            className="px-2.5 py-1 bg-[#141e2e] hover:bg-[#1d2b40] text-gray-300 hover:text-white rounded border border-[#20324d] text-[11px] transition-colors cursor-pointer"
          >
            Balanced
          </button>
          <button
            type="button"
            onClick={() => applyPreset('cinema')}
            className="px-2.5 py-1 bg-[#141e2e] hover:bg-[#1d2b40] text-gray-300 hover:text-white rounded border border-[#20324d] text-[11px] transition-colors cursor-pointer"
          >
            Cinema 4K
          </button>
          {isVideo && (
            <button
              type="button"
              onClick={() => applyPreset('highfps')}
              className="px-2.5 py-1 bg-[#141e2e] hover:bg-[#1d2b40] text-gray-300 hover:text-white rounded border border-[#20324d] text-[11px] transition-colors cursor-pointer"
            >
              60 FPS
            </button>
          )}
          <button
            type="button"
            onClick={() => applyPreset('fast')}
            className="px-2.5 py-1 bg-[#141e2e] hover:bg-[#1d2b40] text-gray-300 hover:text-white rounded border border-[#20324d] text-[11px] transition-colors cursor-pointer"
          >
            Fast
          </button>
        </div>
      </div>

      {/* ================= STAGE 1: DLSS 5 NEURAL RECONSTRUCTION ================= */}
      <div className={`border rounded-xl transition-all duration-200 ${
        config.enable_nr ? 'bg-[#0f1726] border-[#223552]' : 'bg-[#0a0f18]/60 border-[#152033]'
      }`}>
        <div className="p-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              config.enable_nr ? 'bg-[#76b900]/20 text-[#76b900]' : 'bg-gray-800/40 text-gray-500'
            }`}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-gray-200">DLSS 5 Neural Reconstruction</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                  Stage 1
                </span>
              </div>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_nr}
              onChange={(e) => update({ enable_nr: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#76b900]"></div>
          </label>
        </div>

        {config.enable_nr && (
          <div className="px-4 pb-4 pt-1 border-t border-[#1b2a42] space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-gray-400 mb-1">NR Preset</label>
                <select
                  value={config.dlss5.preset}
                  onChange={(e) => updateDlss5({ preset: Number(e.target.value) })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none"
                >
                  <option value={0}>Default</option>
                  <option value={1}>Preset #1 (Sharp)</option>
                  <option value={2}>Preset #2 (Balanced)</option>
                  <option value={3}>Preset #3 (Soft)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">NR Style</label>
                <select
                  value={config.dlss5.style}
                  onChange={(e) => updateDlss5({ style: Number(e.target.value) })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none"
                >
                  <option value={0}>Default</option>
                  <option value={1}>Natural</option>
                  <option value={2}>Cinematic</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Model Architecture</label>
                <select
                  value={config.dlss5.dlss_model_preset}
                  onChange={(e) => updateDlss5({ dlss_model_preset: Number(e.target.value) })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none"
                >
                  <option value={0}>Default (Standard)</option>
                  <option value={10}>Model J</option>
                  <option value={11}>Model K</option>
                  <option value={12}>Model L</option>
                  <option value={13}>Model M (High Fidelity)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-gray-400 mb-1">
                <span>Neural Intensity</span>
                <span className="font-mono text-[#76b900]">{config.dlss5.intensity.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={config.dlss5.intensity}
                onChange={(e) => updateDlss5({ intensity: parseFloat(e.target.value) })}
                className="w-full accent-[#76b900] bg-gray-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Advanced RenoDX ReShade Accordion */}
            <div className="pt-2 border-t border-[#18263c]">
              <button
                type="button"
                onClick={() => setShowAdvancedNR(!showAdvancedNR)}
                className="flex items-center space-x-1.5 text-cyan-400 hover:text-cyan-300 font-medium"
              >
                {showAdvancedNR ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Sliders className="w-3.5 h-3.5" />
                <span>Advanced Optics & Tone</span>
              </button>

              {showAdvancedNR && (
                <div className="mt-3 p-3 bg-[#0a111b] border border-[#1b2c45] rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-gray-400 mb-1">
                        <span>Global Tone Strength</span>
                        <span className="font-mono text-cyan-400">{config.dlss5.global_tone.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.05"
                        value={config.dlss5.global_tone}
                        onChange={(e) => updateDlss5({ global_tone: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-gray-400 mb-1">
                        <span>Color Vibrancy Strength</span>
                        <span className="font-mono text-cyan-400">{config.dlss5.color_strength.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.05"
                        value={config.dlss5.color_strength}
                        onChange={(e) => updateDlss5({ color_strength: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-gray-400 mb-1">
                        <span>Diffuse White (Nits)</span>
                        <span className="font-mono text-cyan-400">{config.dlss5.diffuse_white_nits.toFixed(0)}</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="1000"
                        step="10"
                        value={config.dlss5.diffuse_white_nits}
                        onChange={(e) => updateDlss5({ diffuse_white_nits: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div className="flex items-center space-x-2 pt-4">
                      <input
                        type="checkbox"
                        id="ui-correction"
                        checked={config.dlss5.ui_correction === 1}
                        onChange={(e) => updateDlss5({ ui_correction: e.target.checked ? 1 : 0 })}
                        className="rounded accent-cyan-400"
                      />
                      <label htmlFor="ui-correction" className="text-gray-300">
                        Preserve HUD / Text Masking
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ================= STAGE 2: UPSCALING ENGINE ================= */}
      <div className={`border rounded-xl transition-all duration-200 ${
        config.enable_upscale ? 'bg-[#0f1726] border-[#223552]' : 'bg-[#0a0f18]/60 border-[#152033]'
      }`}>
        <div className="p-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              config.enable_upscale ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-800/40 text-gray-500'
            }`}>
              <ZoomIn className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-gray-200">Super Resolution</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">
                  Stage 2
                </span>
              </div>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={config.enable_upscale}
              onChange={(e) => update({ enable_upscale: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
          </label>
        </div>

        {config.enable_upscale && (
          <div className="px-4 pb-4 pt-1 border-t border-[#1b2a42] space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 mb-1">Upscale Engine</label>
                <select
                  value={config.upscale_engine}
                  onChange={(e) => update({ upscale_engine: e.target.value })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-cyan-400 outline-none"
                >
                  <option value="DLSS Super Resolution">DLSS Super Resolution</option>
                  <option value="NVIDIA RTX Video (VSR)">NVIDIA RTX Video (VSR)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Scale Factor</label>
                <select
                  value={config.upscale_factor}
                  onChange={(e) => update({ upscale_factor: parseFloat(e.target.value) })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-cyan-400 outline-none font-mono"
                >
                  <option value={1.5}>1.5× (Quality)</option>
                  <option value={1.724}>1.724× (Balanced)</option>
                  <option value={2.0}>2.0× (Performance)</option>
                  <option value={3.0}>3.0× (Ultra Performance)</option>
                  <option value={4.0}>4.0× (Maximum)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= STAGE 3: DLSS-G FRAME INTERPOLATION ================= */}
      {isVideo && (
        <div className={`border rounded-xl transition-all duration-200 ${
          config.enable_frame_gen ? 'bg-[#0f1726] border-[#223552]' : 'bg-[#0a0f18]/60 border-[#152033]'
        }`}>
          <div className="p-3.5 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                config.enable_frame_gen ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800/40 text-gray-500'
              }`}>
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-semibold text-gray-200">DLSS-G Frame Generation</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                    Stage 3
                  </span>
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enable_frame_gen}
                onChange={(e) => update({ enable_frame_gen: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {config.enable_frame_gen && (
            <div className="px-4 pb-4 pt-1 border-t border-[#1b2a42] space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Target Framerate</label>
                <div className="grid grid-cols-4 gap-2 font-mono">
                  {['60', '120', '2x', '4x'].map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => update({ target_fps: fps })}
                      className={`py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                        config.target_fps === fps
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-[#141e30] border-[#233550] text-gray-400 hover:text-white'
                      }`}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= STAGE 4: EXPORT DESTINATION & FORMAT ================= */}
      <div className="bg-[#0c121e] border border-[#1b263b] rounded-xl p-3.5 space-y-3.5 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-gray-200 font-semibold">
            <Package className="w-4 h-4 text-[#76b900]" />
            <span>Export & Destination</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#162132] text-gray-400 border border-[#23354f]">
            Stage 4
          </span>
        </div>

        {/* Destination Output Directory */}
        <div className="space-y-1.5">
          <label className="block text-gray-400 font-medium">Output Directory</label>
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-[#101726] border border-[#20304a] rounded-lg px-2.5 py-1.5 text-gray-300 font-mono truncate text-[11px] select-all">
              {config.output_dir ? config.output_dir : 'Default (outputs/)'}
            </div>
            <button
              type="button"
              onClick={handleBrowseOutputDir}
              className="px-2.5 py-1.5 bg-[#172338] hover:bg-[#20324f] text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-mono flex items-center space-x-1 transition-colors shrink-0 cursor-pointer"
              title="Select custom export folder"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Browse...</span>
            </button>
            {config.output_dir && (
              <button
                type="button"
                onClick={() => update({ output_dir: undefined })}
                className="p-1.5 bg-[#172338] hover:bg-rose-950 text-gray-400 hover:text-rose-400 border border-gray-700 hover:border-rose-600/40 rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
                title="Reset to default outputs/ folder"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Format & Encoding Details */}
        {isVideo ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 mb-1">Hardware Video Codec</label>
                <select
                  value={config.video_codec}
                  onChange={(e) => update({ video_codec: e.target.value })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none font-mono cursor-pointer"
                >
                  <option value="hevc_nvenc">HEVC / H.265 (NVIDIA NVENC)</option>
                  <option value="av1_nvenc">AV1 (NVIDIA NVENC)</option>
                  <option value="h264_nvenc">H.264 (NVIDIA NVENC)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">NVENC Preset</label>
                <select
                  value={config.video_quality}
                  onChange={(e) => update({ video_quality: e.target.value })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none font-mono cursor-pointer"
                >
                  <option value="p7">P7 (Mastering / Highest Quality)</option>
                  <option value="p6">P6 (Broadcast / High Quality)</option>
                  <option value="p5">P5 (Standard Speed)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 mb-1">Rate Control (Constant Quality CQ)</label>
                <select
                  value={config.bitrate_cq ?? 24}
                  onChange={(e) => update({ bitrate_cq: parseInt(e.target.value) })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none font-mono cursor-pointer"
                >
                  <option value={16}>CQ 16 (Archival / Near Lossless)</option>
                  <option value={20}>CQ 20 (Mastering Standard)</option>
                  <option value={24}>CQ 24 (Broadcast Quality)</option>
                  <option value={28}>CQ 28 (Streaming Distribution)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Audio Stream Channel</label>
                <select
                  value={config.audio_codec ?? 'aac'}
                  onChange={(e) => update({ audio_codec: e.target.value })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none font-mono cursor-pointer"
                >
                  <option value="aac">AAC Stereo (256 kbps Studio)</option>
                  <option value="copy">Direct Passthrough (Original Stream)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-gray-400 mb-1">
                <span>Temporal Film Grain Synthesis</span>
                <span className="font-mono text-gray-200">{config.film_grain ?? 0}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={config.film_grain ?? 0}
                onChange={(e) => update({ film_grain: parseInt(e.target.value) })}
                className="w-full accent-[#76b900] bg-gray-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 mb-1">Image Format</label>
              <select
                value={config.image_format}
                onChange={(e) => update({ image_format: e.target.value })}
                className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none font-mono cursor-pointer"
              >
                <option value="PNG">PNG (Lossless 16-bit)</option>
                <option value="JPEG">JPEG (Compressed)</option>
                <option value="WEBP">WebP (Modern)</option>
              </select>
            </div>

            <div>
              <label className="block text-gray-400 mb-1">Quality ({config.image_quality}%)</label>
              <input
                type="range"
                min="50"
                max="100"
                value={config.image_quality}
                onChange={(e) => update({ image_quality: parseInt(e.target.value) })}
                className="w-full accent-[#76b900] bg-gray-800 h-1.5 rounded-lg cursor-pointer mt-2"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
