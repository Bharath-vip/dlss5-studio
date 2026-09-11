import React from 'react';
import { X, Film, Image as ImageIcon, Activity, Layers } from 'lucide-react';
import type { MediaMetadata } from '../types/pipeline';

interface MediaInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: MediaMetadata | null;
}

export const MediaInspectorModal: React.FC<MediaInspectorModalProps> = ({
  isOpen,
  onClose,
  metadata,
}) => {
  if (!isOpen || !metadata) return null;

  const aspectRatio = (metadata.width / metadata.height).toFixed(2);
  const sizeMb = (metadata.size_bytes / (1024 * 1024)).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-[#0a0f18] border border-[#1e2e46] rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans text-xs">
        {/* Modal Header */}
        <div className="bg-[#0e1624] px-5 py-3.5 border-b border-[#1b263b] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded bg-[#162234] flex items-center justify-center text-cyan-400">
              {metadata.is_video ? <Film className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
            </div>
            <div>
              <span className="text-sm font-semibold text-white tracking-wide font-mono block">
                SOURCE STREAM INSPECTOR
              </span>
              <span className="text-[10px] text-gray-500 font-mono">
                BITSTREAM METADATA & TELEMETRY
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#1a263c] text-gray-400 hover:text-white rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[460px] overflow-y-auto">
          {/* File Overview Card */}
          <div className="p-3 bg-[#0d1421] border border-[#1b283c] rounded-xl space-y-1.5">
            <span className="text-gray-400 text-[10px] font-mono">FILE ASSET</span>
            <p className="text-sm font-semibold text-gray-200 break-all">{metadata.filename}</p>
            <p className="text-[10px] text-gray-500 font-mono break-all select-all">{metadata.path}</p>
          </div>

          {/* Video Stream Characteristics */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono text-gray-400 flex items-center space-x-1.5 font-semibold">
              <Layers className="w-3.5 h-3.5 text-[#76b900]" />
              <span>VISUAL STREAM CHARACTERISTICS</span>
            </span>

            <div className="grid grid-cols-2 gap-2.5 font-mono text-[11px]">
              <div className="p-2.5 bg-[#090e17] border border-[#162233] rounded-lg">
                <span className="text-gray-500 text-[10px] block">DIMENSIONS</span>
                <strong className="text-gray-200">{metadata.width} × {metadata.height}</strong>
                <span className="text-gray-500 text-[10px] block mt-0.5">({aspectRatio}:1 Aspect)</span>
              </div>

              <div className="p-2.5 bg-[#090e17] border border-[#162233] rounded-lg">
                <span className="text-gray-500 text-[10px] block">CODEC & COMPRESSION</span>
                <strong className="text-cyan-400 uppercase">{metadata.codec}</strong>
                <span className="text-gray-500 text-[10px] block mt-0.5">{metadata.format.toUpperCase()}</span>
              </div>

              {metadata.is_video ? (
                <>
                  <div className="p-2.5 bg-[#090e17] border border-[#162233] rounded-lg">
                    <span className="text-gray-500 text-[10px] block">NATIVE FRAMERATE</span>
                    <strong className="text-[#76b900]">{metadata.fps.toFixed(2)} FPS</strong>
                    <span className="text-gray-500 text-[10px] block mt-0.5">{metadata.frame_count} Total Frames</span>
                  </div>

                  <div className="p-2.5 bg-[#090e17] border border-[#162233] rounded-lg">
                    <span className="text-gray-500 text-[10px] block">DURATION</span>
                    <strong className="text-gray-200">{metadata.duration_seconds.toFixed(2)}s</strong>
                    <span className="text-gray-500 text-[10px] block mt-0.5">File Size: {sizeMb} MB</span>
                  </div>
                </>
              ) : (
                <div className="p-2.5 bg-[#090e17] border border-[#162233] rounded-lg">
                  <span className="text-gray-500 text-[10px] block">STORAGE FOOTPRINT</span>
                  <strong className="text-gray-200">{sizeMb} MB</strong>
                </div>
              )}
            </div>
          </div>

          {/* Colorimetric Profile */}
          <div className="p-3 bg-[#0d1421] border border-[#1b283c] rounded-xl flex items-center justify-between text-[11px] font-mono">
            <div>
              <span className="text-gray-500 text-[10px] block">DYNAMIC RANGE CONTAINER</span>
              <strong className={metadata.is_hdr ? 'text-amber-400 font-bold' : 'text-gray-300'}>
                {metadata.is_hdr ? 'High Dynamic Range (HDR10 / BT.2020)' : 'Standard Dynamic Range (SDR / Rec.709)'}
              </strong>
            </div>
            <span className={`px-2 py-0.5 rounded text-[10px] border ${
              metadata.is_hdr ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-gray-800 text-gray-400 border-gray-700'
            }`}>
              {metadata.is_hdr ? 'HDR10' : 'SDR'}
            </span>
          </div>

          {/* Deep Pixel Telemetry & Signal Intelligence */}
          {metadata.pixel_telemetry && (
            <div className="space-y-2">
              <span className="text-[11px] font-mono text-fuchsia-400 flex items-center space-x-1.5 font-semibold">
                <Activity className="w-3.5 h-3.5 text-fuchsia-400" />
                <span>DEEP PIXEL INFORMATION & REALISM TELEMETRY</span>
              </span>

              <div className="p-3 bg-[#0d0c1c] border border-fuchsia-950/80 rounded-xl space-y-3 font-mono text-[11px]">
                {/* Content Classifier Gauge */}
                <div>
                  <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
                    <span>Source Content Profile:</span>
                    <span className="font-bold text-fuchsia-300">
                      {metadata.pixel_telemetry.detected_type} ({(Math.max(metadata.pixel_telemetry.anime_score, metadata.pixel_telemetry.photoreal_score) * 100).toFixed(1)}% Confidence)
                    </span>
                  </div>
                  <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden flex">
                    <div
                      className="bg-fuchsia-500 h-full transition-all duration-500"
                      style={{ width: `${metadata.pixel_telemetry.anime_score * 100}%` }}
                      title={`Anime / 2D Likelihood: ${(metadata.pixel_telemetry.anime_score * 100).toFixed(1)}%`}
                    />
                    <div
                      className="bg-emerald-500 h-full transition-all duration-500"
                      style={{ width: `${metadata.pixel_telemetry.photoreal_score * 100}%` }}
                      title={`Photoreal Likelihood: ${(metadata.pixel_telemetry.photoreal_score * 100).toFixed(1)}%`}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                    <span>Anime / Cel-Shaded</span>
                    <span>Live-Action / Real</span>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">PEAK LUMINANCE</span>
                    <strong className="text-[#76b900]">{metadata.pixel_telemetry.peak_luminance_nits.toFixed(0)} Nits</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">DYNAMIC RANGE</span>
                    <strong className="text-cyan-400">{metadata.pixel_telemetry.dynamic_range_db.toFixed(1)} dB</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">DETAIL ENTROPY</span>
                    <strong className="text-purple-300">{metadata.pixel_telemetry.detail_entropy.toFixed(2)} b/px</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">MICRO-CONTRAST</span>
                    <strong className="text-[#76b900]">{(metadata.pixel_telemetry.micro_contrast_index * 100).toFixed(0)}%</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">CEL FLATNESS</span>
                    <strong className="text-amber-300">{(metadata.pixel_telemetry.flat_region_ratio * 100).toFixed(1)}%</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">OUTLINE DENSITY</span>
                    <strong className="text-fuchsia-300">{(metadata.pixel_telemetry.outline_density * 100).toFixed(1)}%</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">SKIN DERMAL</span>
                    <strong className="text-rose-300">{(metadata.pixel_telemetry.skin_tone_ratio * 100).toFixed(1)}%</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">BANDING SEVERITY</span>
                    <strong className="text-amber-400">{(metadata.pixel_telemetry.color_banding_index * 100).toFixed(1)}%</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">SPECULAR POP</span>
                    <strong className="text-cyan-300">{(metadata.pixel_telemetry.specular_highlight_ratio * 100).toFixed(2)}%</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">WHITE BALANCE</span>
                    <strong className="text-cyan-200">{metadata.pixel_telemetry.color_temperature_kelvin}K</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">SNR NOISE FLOOR</span>
                    <strong className="text-emerald-300">{metadata.pixel_telemetry.snr_db.toFixed(1)} dB</strong>
                  </div>
                  <div className="p-2 bg-[#090714] border border-[#231538] rounded-lg">
                    <span className="text-gray-500 block text-[9px]">HYPER-REAL SCORE</span>
                    <strong className="text-emerald-400">{(metadata.pixel_telemetry.hyper_real_score * 100).toFixed(0)}%</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Pipeline Recommendation */}
          <div className="p-3 bg-[#091517] border border-[#103038] rounded-xl text-[11px] font-mono text-cyan-300 space-y-1">
            <div className="flex items-center space-x-1.5 text-cyan-400 font-bold">
              <Activity className="w-3.5 h-3.5" />
              <span>AI RECONSTRUCTION RECOMMENDATION</span>
            </div>
            <p className="text-[10px] text-gray-400">
              {metadata.pixel_telemetry?.recommended_mode === 'anime_to_real'
                ? 'High cel-shading flatness and line-art detected: Anime ➔ Real Live-Action mode recommended (Bilateral de-lineation, cel-smoothing, and epidermal pore synthesis).'
                : metadata.pixel_telemetry?.recommended_mode === 'real_to_ultra_real'
                ? 'Photorealistic camera sensor noise and high entropy detected: Real ➔ Hyper Ultra Real mode recommended (DLSS 5 Hard Detail, TrueHDR 2000 Nits, and RTX VSR L4 Cascade).'
                : 'Balanced visual stream: 4K Master Studio mode with DLSS 5 Neural Reconstruction and RenoDRT Tonemapping is optimal.'}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-[#0b101a] px-5 py-3 border-t border-[#1a2538] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-[#172338] hover:bg-[#20314f] text-cyan-400 border border-cyan-500/30 font-bold rounded-lg transition-colors cursor-pointer text-xs"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
