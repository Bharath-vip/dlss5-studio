import React, { useState } from 'react';
import type { PipelineConfig, MediaMetadata } from '../types/pipeline';
import {
  Sparkles,
  ZoomIn,
  Zap,
  FolderOpen,
  RotateCcw,
  Sun,
  Activity,
  Maximize2,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

interface PipelineStagesProps {
  config: PipelineConfig;
  onChange: (config: PipelineConfig) => void;
  isVideo: boolean;
  metadata?: MediaMetadata;
}

export const PipelineStages: React.FC<PipelineStagesProps> = ({ config, onChange, isVideo, metadata }) => {
  const [stage1Tab, setStage1Tab] = useState<'neural' | 'renodx' | 'reshade'>('neural');

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

  // Calculate live output resolution for display
  const calculateDisplayResolution = (): { width: number; height: number; scale: number; tag: string } => {
    const inW = metadata?.width || 1920;
    const inH = metadata?.height || 1080;

    if (!config.enable_upscale) {
      return { width: inW, height: inH, scale: 1.0, tag: '1:1 Native' };
    }

    const target = config.target_resolution || '4k';
    let outW = inW;
    let outH = inH;
    let tag = 'Enhanced';

    switch (target) {
      case '4k':
      case '4K':
      case '2160p': {
        tag = '4K UHD';
        if (inW >= inH) {
          const s = 2160 / inH;
          outW = Math.round(inW * s) & ~1;
          outH = 2160;
          if (outW < 3840) outW = 3840;
        } else {
          const s = 3840 / inH;
          outW = 2160;
          outH = Math.round(inW * s) & ~1;
          if (outH < 3840) outH = 3840;
        }
        break;
      }
      case 'cinema_4k': {
        tag = 'Cinema 4K';
        outW = 4096;
        outH = 2160;
        break;
      }
      case '1440p': {
        tag = '1440p QHD';
        if (inW >= inH) {
          const s = 1440 / inH;
          outW = Math.max(2560, Math.round(inW * s)) & ~1;
          outH = 1440;
        } else {
          const s = 2560 / inH;
          outW = 1440;
          outH = Math.max(2560, Math.round(inW * s)) & ~1;
        }
        break;
      }
      case '1080p': {
        tag = '1080p FHD';
        if (inW >= inH) {
          const s = 1080 / inH;
          outW = Math.max(1920, Math.round(inW * s)) & ~1;
          outH = 1080;
        } else {
          const s = 1920 / inH;
          outW = 1080;
          outH = Math.max(1920, Math.round(inW * s)) & ~1;
        }
        break;
      }
      case '8k':
      case '8K': {
        tag = '8K UHD';
        if (inW >= inH) {
          const s = 4320 / inH;
          outW = Math.max(7680, Math.round(inW * s)) & ~1;
          outH = 4320;
        } else {
          const s = 7680 / inH;
          outW = 4320;
          outH = Math.max(7680, Math.round(inW * s)) & ~1;
        }
        break;
      }
      case 'custom': {
        tag = 'Custom';
        outW = (config.custom_width || 3840) & ~1;
        outH = (config.custom_height || 2160) & ~1;
        break;
      }
      default: {
        const factor = config.upscale_factor || 2.0;
        tag = `${factor.toFixed(2)}×`;
        outW = Math.round(inW * factor) & ~1;
        outH = Math.round(inH * factor) & ~1;
        break;
      }
    }

    const scale = Math.max(outW / inW, outH / inH);
    return { width: outW, height: outH, scale, tag };
  };

  const targetRes = calculateDisplayResolution();

  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case '4k_master':
        onChange({
          ...config,
          enable_nr: true,
          dlss5: {
            ...config.dlss5,
            preset: 1, // Sharp
            style: 2,  // Cinematic
            intensity: 1.25,
            local_tone: 1.1,
            local_structure: 1.2,
            cas_sharpening: 0.35,
            vignette: 0.1,
            deband: 1,
            ray_reconstruction: true,
          },
          enable_upscale: true,
          target_resolution: '4k',
          upscale_engine: 'DLSS Super Resolution',
          vsr_quality: 4,
          video_codec: 'hevc_nvenc',
          video_quality: 'p7',
          bitrate_cq: 18,
          bit_depth_10bit: true,
        });
        break;
      case 'cinema_4k':
        onChange({
          ...config,
          enable_nr: true,
          dlss5: {
            ...config.dlss5,
            preset: 1,
            style: 2,
            intensity: 1.2,
            global_tone: 1.15,
            color_strength: 1.15,
            cas_sharpening: 0.25,
            bloom_threshold: 0.15,
            vignette: 0.18,
            tonemapper: 1, // ACES Filmic
          },
          enable_upscale: true,
          target_resolution: 'cinema_4k',
          upscale_engine: 'DLSS Super Resolution',
          film_grain: 12,
          video_quality: 'p7',
          bitrate_cq: 16,
          bit_depth_10bit: true,
        });
        break;
      case 'reshade_optics':
        onChange({
          ...config,
          enable_nr: true,
          dlss5: {
            ...config.dlss5,
            preset: 1,
            style: 2,
            intensity: 1.15,
            local_structure: 1.3,
            cas_sharpening: 0.5,
            clarity: 0.4,
            bloom_threshold: 0.2,
            chroma_aberration: 0.15,
            vignette: 0.2,
            deband: 1,
          },
          enable_upscale: true,
          target_resolution: '4k',
          film_grain: 8,
        });
        break;
      case 'truehdr_4k':
        onChange({
          ...config,
          enable_nr: true,
          dlss5: {
            ...config.dlss5,
            preset: 2,
            style: 3, // HDR Expansion
            diffuse_white_nits: 250,
            global_tone: 1.2,
            color_strength: 1.2,
          },
          enable_upscale: true,
          target_resolution: '4k',
          enable_rtx_hdr: true,
          rtx_hdr_contrast: 110,
          rtx_hdr_saturation: 115,
          rtx_hdr_peak_nits: 1000,
          bit_depth_10bit: true,
        });
        break;
      case 'fast_60':
        onChange({
          ...config,
          enable_nr: true,
          dlss5: {
            ...config.dlss5,
            preset: 0,
            style: 0,
            intensity: 1.0,
            cas_sharpening: 0.2,
          },
          enable_upscale: false,
          enable_frame_gen: true,
          target_fps: '60',
          video_quality: 'p5',
        });
        break;
    }
  };

  return (
    <div className="space-y-3">
      {/* Quick Enhancement Presets */}
      <div className="bg-[#0b101c] border border-[#1b263b] rounded-xl p-2.5 flex items-center justify-between text-xs font-mono">
        <span className="text-gray-400 font-semibold text-[11px] px-1 flex items-center gap-1">
          <Activity className="w-3 h-3 text-[#76b900]" />
          PRESETS:
        </span>
        <div className="flex items-center space-x-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => applyPreset('4k_master')}
            className="px-2 py-1 bg-[#14231a] hover:bg-[#1a3022] text-[#76b900] hover:text-[#90e000] rounded border border-[#76b900]/40 text-[11px] font-bold transition-colors cursor-pointer"
          >
            ⭐ 4K Master
          </button>
          <button
            type="button"
            onClick={() => applyPreset('cinema_4k')}
            className="px-2 py-1 bg-[#141e2e] hover:bg-[#1d2b40] text-cyan-300 hover:text-white rounded border border-[#20324d] text-[11px] transition-colors cursor-pointer"
          >
            Cinema 4K
          </button>
          <button
            type="button"
            onClick={() => applyPreset('reshade_optics')}
            className="px-2 py-1 bg-[#141e2e] hover:bg-[#1d2b40] text-amber-300 hover:text-white rounded border border-[#20324d] text-[11px] transition-colors cursor-pointer"
          >
            ReShade Suite
          </button>
          <button
            type="button"
            onClick={() => applyPreset('truehdr_4k')}
            className="px-2 py-1 bg-[#141e2e] hover:bg-[#1d2b40] text-purple-300 hover:text-white rounded border border-[#20324d] text-[11px] transition-colors cursor-pointer"
          >
            TrueHDR
          </button>
          {isVideo && (
            <button
              type="button"
              onClick={() => applyPreset('fast_60')}
              className="px-2 py-1 bg-[#141e2e] hover:bg-[#1d2b40] text-gray-300 hover:text-white rounded border border-[#20324d] text-[11px] transition-colors cursor-pointer"
            >
              60 FPS
            </button>
          )}
        </div>
      </div>

      {/* ================= STAGE 1: DLSS 5 NEURAL RECONSTRUCTION & RESHADE ================= */}
      <div className={`border rounded-xl transition-all duration-200 ${
        config.enable_nr ? 'bg-[#0c121e] border-[#1d2b42]' : 'bg-[#080d14]/60 border-[#141c2b]'
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
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono">
                  + ReShade / RenoDX
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
            {/* Stage 1 Sub-Navigation Tabs */}
            <div className="flex items-center space-x-1 border-b border-[#1b263b] pb-2 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => setStage1Tab('neural')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  stage1Tab === 'neural'
                    ? 'bg-[#18281a] text-[#76b900] border border-[#76b900]/40 font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Neural Core
              </button>
              <button
                type="button"
                onClick={() => setStage1Tab('renodx')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  stage1Tab === 'renodx'
                    ? 'bg-[#112338] text-cyan-400 border border-cyan-500/40 font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                RenoDX Optics & Tone
              </button>
              <button
                type="button"
                onClick={() => setStage1Tab('reshade')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  stage1Tab === 'reshade'
                    ? 'bg-[#291b36] text-purple-300 border border-purple-500/40 font-semibold'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                ReShade Shaders
              </button>
            </div>

            {/* TAB 1: NEURAL CORE */}
            {stage1Tab === 'neural' && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-gray-400 mb-1">NR Preset</label>
                    <select
                      value={config.dlss5.preset}
                      onChange={(e) => updateDlss5({ preset: Number(e.target.value) })}
                      className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none cursor-pointer"
                    >
                      <option value={0}>Default</option>
                      <option value={1}>Preset #1 (Sharp Detail)</option>
                      <option value={2}>Preset #2 (Balanced Studio)</option>
                      <option value={3}>Preset #3 (Soft Filmic)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1">NR Style</label>
                    <select
                      value={config.dlss5.style}
                      onChange={(e) => updateDlss5({ style: Number(e.target.value) })}
                      className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none cursor-pointer"
                    >
                      <option value={0}>Default</option>
                      <option value={1}>Natural Color</option>
                      <option value={2}>Cinematic Contrast</option>
                      <option value={3}>HDR Dynamic Expansion</option>
                      <option value={4}>Vivid Studio</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1">DLSS Architecture</label>
                    <select
                      value={config.dlss5.dlss_model_preset}
                      onChange={(e) => updateDlss5({ dlss_model_preset: Number(e.target.value) })}
                      className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none cursor-pointer"
                    >
                      <option value={0}>Default (Driver Auto)</option>
                      <option value={10}>Model J (Stable)</option>
                      <option value={11}>Model K (High Texture)</option>
                      <option value={12}>Model L (Temporal Lock)</option>
                      <option value={13}>Model M (High Fidelity)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-gray-400 mb-1">
                    <span>Neural Reconstruction Intensity</span>
                    <span className="font-mono text-[#76b900]">{config.dlss5.intensity.toFixed(2)}×</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.05"
                    value={config.dlss5.intensity}
                    onChange={(e) => updateDlss5({ intensity: parseFloat(e.target.value) })}
                    className="w-full accent-[#76b900] bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Ray Reconstruction Engine */}
                <div className="flex items-center justify-between p-2.5 bg-[#0e1624] border border-[#1b2a40] rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Sun className="w-4 h-4 text-amber-400" />
                    <div>
                      <div className="text-gray-200 font-semibold text-[11px]">DLSS Ray Reconstruction (DLSS-RR)</div>
                      <div className="text-gray-400 text-[10px]">AI neural lighting denoiser for path-traced reflections & indirect shadows</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.dlss5.ray_reconstruction}
                    onChange={(e) => updateDlss5({ ray_reconstruction: e.target.checked })}
                    className="rounded accent-[#76b900] cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: RENODX OPTICS & TONE */}
            {stage1Tab === 'renodx' && (
              <div className="space-y-3 bg-[#0a111b] p-3 border border-[#1b2c45] rounded-lg">
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
                      <span>Color Vibrancy Gamut</span>
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
                      <span>Local Tone Mapping</span>
                      <span className="font-mono text-cyan-400">{config.dlss5.local_tone.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
                      value={config.dlss5.local_tone}
                      onChange={(e) => updateDlss5({ local_tone: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>Local Structure (Micro-Contrast)</span>
                      <span className="font-mono text-cyan-400">{config.dlss5.local_structure.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
                      value={config.dlss5.local_structure}
                      onChange={(e) => updateDlss5({ local_structure: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>Skin Texture Preservation</span>
                      <span className="font-mono text-cyan-400">
                        {config.dlss5.skin_structure === -1 ? 'Auto (-1.0)' : config.dlss5.skin_structure.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.1"
                      value={config.dlss5.skin_structure}
                      onChange={(e) => updateDlss5({ skin_structure: parseFloat(e.target.value) })}
                      className="w-full accent-cyan-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>Diffuse White (Nits)</span>
                      <span className="font-mono text-cyan-400">{config.dlss5.diffuse_white_nits.toFixed(0)} nits</span>
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
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-[#18263c]">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="ui-correction"
                      checked={config.dlss5.ui_correction === 1}
                      onChange={(e) => updateDlss5({ ui_correction: e.target.checked ? 1 : 0 })}
                      className="rounded accent-cyan-400 cursor-pointer"
                    />
                    <label htmlFor="ui-correction" className="text-gray-300 cursor-pointer">
                      Preserve UI / Subtitle Text
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="auto-mask"
                      checked={config.dlss5.auto_mask === 1}
                      onChange={(e) => updateDlss5({ auto_mask: e.target.checked ? 1 : 0 })}
                      className="rounded accent-cyan-400 cursor-pointer"
                    />
                    <label htmlFor="auto-mask" className="text-gray-300 cursor-pointer">
                      Auto Motion Ghost Masking
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: RESHADE SHADERS */}
            {stage1Tab === 'reshade' && (
              <div className="space-y-3 bg-[#110e1a] p-3 border border-[#291b36] rounded-lg">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>Contrast Adaptive Sharpen (CAS)</span>
                      <span className="font-mono text-purple-300">{Math.round(config.dlss5.cas_sharpening * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.dlss5.cas_sharpening}
                      onChange={(e) => updateDlss5({ cas_sharpening: parseFloat(e.target.value) })}
                      className="w-full accent-purple-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>Clarity / Texture Pop</span>
                      <span className="font-mono text-purple-300">{Math.round(config.dlss5.clarity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.dlss5.clarity}
                      onChange={(e) => updateDlss5({ clarity: parseFloat(e.target.value) })}
                      className="w-full accent-purple-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>Cinematic Highlight Bloom</span>
                      <span className="font-mono text-purple-300">{Math.round(config.dlss5.bloom_threshold * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.dlss5.bloom_threshold}
                      onChange={(e) => updateDlss5({ bloom_threshold: parseFloat(e.target.value) })}
                      className="w-full accent-purple-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>Chromatic Aberration</span>
                      <span className="font-mono text-purple-300">{Math.round(config.dlss5.chroma_aberration * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.dlss5.chroma_aberration}
                      onChange={(e) => updateDlss5({ chroma_aberration: parseFloat(e.target.value) })}
                      className="w-full accent-purple-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>Optical Lens Vignette</span>
                      <span className="font-mono text-purple-300">{Math.round(config.dlss5.vignette * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={config.dlss5.vignette}
                      onChange={(e) => updateDlss5({ vignette: parseFloat(e.target.value) })}
                      className="w-full accent-purple-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 mb-1">Gradient Debanding</label>
                    <select
                      value={config.dlss5.deband}
                      onChange={(e) => updateDlss5({ deband: parseInt(e.target.value) })}
                      className="w-full bg-[#1b1526] border border-[#3b244d] rounded-lg px-2.5 py-1 text-gray-200 focus:border-purple-400 outline-none cursor-pointer"
                    >
                      <option value={0}>Disabled</option>
                      <option value={1}>Subtle (10-bit Dither)</option>
                      <option value={2}>High Precision (Sky & Gradients)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-400 mb-1">Tonemapping Profile</label>
                  <select
                    value={config.dlss5.tonemapper}
                    onChange={(e) => updateDlss5({ tonemapper: parseInt(e.target.value) })}
                    className="w-full bg-[#1b1526] border border-[#3b244d] rounded-lg px-2.5 py-1 text-gray-200 focus:border-purple-400 outline-none cursor-pointer"
                  >
                    <option value={0}>RenoDRT Studio (Universal HDR / SDR)</option>
                    <option value={1}>ACES Filmic (Hollywood Cinema Standard)</option>
                    <option value={2}>AgX Cinematic (Smooth Highlight Roll-off)</option>
                    <option value={3}>Neutral Linear (Unmodified Spectrum)</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================= STAGE 2: 4K TARGET SUPER RESOLUTION ================= */}
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
                <span className="text-sm font-semibold text-gray-200">Super Resolution (4K / 8K)</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">
                  Stage 2
                </span>
                {config.enable_upscale && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#76b900]/20 text-[#76b900] font-mono font-bold">
                    {targetRes.tag}
                  </span>
                )}
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
          <div className="px-4 pb-4 pt-1 border-t border-[#1b2a42] space-y-3.5 text-xs">
            {/* Dynamic Real-Time Resolution Transformation HUD Banner */}
            <div className="p-2.5 bg-[#09111c] border border-cyan-500/30 rounded-lg flex items-center justify-between font-mono">
              <div className="flex items-center space-x-2">
                <Maximize2 className="w-4 h-4 text-cyan-400" />
                <span className="text-gray-400">Resolution Target:</span>
                <span className="text-gray-300">{metadata ? `${metadata.width}×${metadata.height}` : '1080p'}</span>
                <span className="text-cyan-400">➔</span>
                <span className="text-[#76b900] font-bold text-sm">{targetRes.width}×{targetRes.height}</span>
              </div>
              <div className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold">
                {targetRes.scale.toFixed(2)}× ({targetRes.tag})
              </div>
            </div>

            {/* Target Resolution Fast Selection Grid */}
            <div>
              <label className="block text-gray-400 mb-1.5 font-semibold">Target Output Standard</label>
              <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
                {[
                  { id: '1080p', label: '1080p FHD' },
                  { id: '1440p', label: '1440p QHD' },
                  { id: '4k', label: '⭐ 4K UHD' },
                  { id: 'cinema_4k', label: 'Cinema 4K' },
                  { id: '8k', label: '8K UHD' },
                  { id: 'factor', label: 'Multiplier' },
                  { id: 'custom', label: 'Custom' },
                ].map((item) => {
                  const isSelected = (config.target_resolution || '4k') === item.id;
                  const is4K = item.id === '4k';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => update({ target_resolution: item.id })}
                      className={`py-1.5 px-1 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? is4K
                            ? 'bg-[#122b17] border-[#76b900] text-[#76b900] font-bold shadow-sm shadow-[#76b900]/20'
                            : 'bg-cyan-950/50 border-cyan-400 text-cyan-300 font-bold'
                          : 'bg-[#141e30] border-[#233550] text-gray-400 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Multiplier or Dimensions */}
            {config.target_resolution === 'factor' && (
              <div>
                <label className="block text-gray-400 mb-1">Scale Multiplier</label>
                <div className="grid grid-cols-5 gap-1.5 font-mono">
                  {[1.25, 1.5, 1.724, 2.0, 3.0, 4.0].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => update({ upscale_factor: f })}
                      className={`py-1 rounded border text-xs cursor-pointer ${
                        config.upscale_factor === f
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                          : 'bg-[#141e30] border-[#233550] text-gray-400 hover:text-white'
                      }`}
                    >
                      {f}×
                    </button>
                  ))}
                </div>
              </div>
            )}

            {config.target_resolution === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 mb-1">Custom Width (px)</label>
                  <input
                    type="number"
                    step="2"
                    value={config.custom_width || 3840}
                    onChange={(e) => update({ custom_width: parseInt(e.target.value) || 3840 })}
                    className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-cyan-400 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">Custom Height (px)</label>
                  <input
                    type="number"
                    step="2"
                    value={config.custom_height || 2160}
                    onChange={(e) => update({ custom_height: parseInt(e.target.value) || 2160 })}
                    className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-cyan-400 outline-none font-mono"
                  />
                </div>
              </div>
            )}

            {/* Upscale Engine Selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-400 mb-1">Upscale Engine</label>
                <select
                  value={config.upscale_engine}
                  onChange={(e) => update({ upscale_engine: e.target.value })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-cyan-400 outline-none cursor-pointer"
                >
                  <option value="DLSS Super Resolution">DLSS 5 Super Resolution</option>
                  <option value="NVIDIA RTX Video (VSR)">NVIDIA RTX Video (VSR)</option>
                  <option value="DLSS + RTX VSR Dual Cascade">DLSS + RTX VSR Dual Cascade</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">RTX VSR Quality Level</label>
                <select
                  value={config.vsr_quality}
                  onChange={(e) => update({ vsr_quality: parseInt(e.target.value) })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-cyan-400 outline-none cursor-pointer"
                >
                  <option value={4}>Level 4 (Ultimate / Maximum VRAM)</option>
                  <option value={3}>Level 3 (High Precision)</option>
                  <option value={2}>Level 2 (Balanced)</option>
                  <option value={1}>Level 1 (Performance)</option>
                </select>
              </div>
            </div>

            {/* NVIDIA RTX Video TrueHDR Section */}
            <div className="p-3 bg-[#110e1a] border border-purple-500/30 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sun className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-gray-200 text-xs">NVIDIA RTX Video TrueHDR</span>
                  <span className="text-[10px] px-1 rounded bg-purple-500/20 text-purple-300 font-mono">
                    SDR ➔ HDR10
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.enable_rtx_hdr || false}
                  onChange={(e) => update({ enable_rtx_hdr: e.target.checked })}
                  className="rounded accent-purple-400 cursor-pointer"
                />
              </div>

              {config.enable_rtx_hdr && (
                <div className="space-y-2 pt-1 border-t border-purple-500/20">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-gray-400 mb-1 text-[11px]">
                        <span>Peak Luminance (Nits)</span>
                        <span className="font-mono text-purple-300">{config.rtx_hdr_peak_nits || 1000} nits</span>
                      </div>
                      <input
                        type="range"
                        min="400"
                        max="2000"
                        step="50"
                        value={config.rtx_hdr_peak_nits || 1000}
                        onChange={(e) => update({ rtx_hdr_peak_nits: parseInt(e.target.value) })}
                        className="w-full accent-purple-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-gray-400 mb-1 text-[11px]">
                        <span>HDR Contrast</span>
                        <span className="font-mono text-purple-300">{config.rtx_hdr_contrast || 100}%</span>
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="180"
                        value={config.rtx_hdr_contrast || 100}
                        onChange={(e) => update({ rtx_hdr_contrast: parseInt(e.target.value) })}
                        className="w-full accent-purple-400 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
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
                  <span className="text-sm font-semibold text-gray-200">DLSS-G Optical Flow Frame Gen</span>
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
                <label className="block text-gray-400 mb-1">Target Framerate Synthesis</label>
                <div className="grid grid-cols-4 gap-2 font-mono">
                  {['60', '120', '2x', '4x'].map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      onClick={() => update({ target_fps: fps })}
                      className={`py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
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
            <span className="w-2 h-2 rounded-full bg-[#76b900]"></span>
            <span>Broadcast Output & Encoding Master</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono">
              Stage 4
            </span>
          </div>
        </div>

        {/* Output Directory Path */}
        <div>
          <label className="block text-gray-400 mb-1 font-medium">Destination Directory</label>
          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-[#101726] border border-[#233550] rounded-lg px-3 py-1.5 text-gray-300 font-mono text-[11px] truncate">
              {config.output_dir || '(Default) outputs/ in project directory'}
            </div>
            <button
              type="button"
              onClick={handleBrowseOutputDir}
              className="p-1.5 bg-[#172338] hover:bg-[#203250] text-gray-300 hover:text-white border border-[#263c5e] rounded-lg text-xs transition-colors shrink-0 cursor-pointer"
              title="Browse Output Folder"
            >
              <FolderOpen className="w-4 h-4" />
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
                  value={config.bitrate_cq ?? 20}
                  onChange={(e) => update({ bitrate_cq: parseInt(e.target.value) })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none font-mono cursor-pointer"
                >
                  <option value={16}>CQ 16 (Archival / Near Lossless)</option>
                  <option value={18}>CQ 18 (Mastering 4K Standard)</option>
                  <option value={20}>CQ 20 (Cinema Standard)</option>
                  <option value={24}>CQ 24 (Broadcast Quality)</option>
                  <option value={28}>CQ 28 (Streaming Distribution)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Color Bit Depth</label>
                <select
                  value={config.bit_depth_10bit ? '10bit' : '8bit'}
                  onChange={(e) => update({ bit_depth_10bit: e.target.value === '10bit' })}
                  className="w-full bg-[#141e30] border border-[#233550] rounded-lg px-2.5 py-1.5 text-gray-200 focus:border-[#76b900] outline-none font-mono cursor-pointer"
                >
                  <option value="8bit">8-bit SDR (YUV420p)</option>
                  <option value="10bit">10-bit HDR (p010le / Main 10)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

              <div>
                <div className="flex items-center justify-between text-gray-400 mb-1">
                  <span>Temporal Film Grain</span>
                  <span className="font-mono text-gray-200">{config.film_grain ?? 0}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.film_grain ?? 0}
                  onChange={(e) => update({ film_grain: parseInt(e.target.value) })}
                  className="w-full accent-[#76b900] bg-gray-800 h-1.5 rounded-lg cursor-pointer mt-1"
                />
              </div>
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
                <option value="PNG">PNG (Lossless 16-bit RGBA)</option>
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
