import React, { useState, useEffect, Component } from 'react';
import { TitleBar } from './components/TitleBar';
import { HeaderHud } from './components/HeaderHud';
import { MediaDropzone } from './components/MediaDropzone';
import { PipelineStages } from './components/PipelineStages';
import { SplitSlider, type ViewMode } from './components/SplitSlider';
import { BatchQueue, type BatchItem } from './components/BatchQueue';
import { PreferencesModal } from './components/PreferencesModal';
import { MediaInspectorModal } from './components/MediaInspectorModal';
import type {
  GpuInfo,
  MediaMetadata,
  PipelineConfig,
  ProgressPayload,
  PipelineResult,
  AppPreferences,
  RenderHistoryItem,
} from './types/pipeline';
import { Sparkles, Square, CheckCircle2, FolderOpen, Save, Download, Info, Settings, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save, open } from '@tauri-apps/plugin-dialog';

const defaultPipelineConfig: PipelineConfig = {
  input_path: '',
  enable_nr: true,
  dlss5: {
    preset: 0,
    style: 2, // Cinematic
    intensity: 1.0,
    local_tone: 1.0,
    local_structure: 1.0,
    skin_structure: -1.0,
    auto_mask: 1,
    ui_correction: 0,
    dlss_model_preset: 0,
    perf_quality: 5, // DLAA / native
    global_tone: 1.0,
    color_strength: 1.0,
    transfer_strength: 1.0,
    diffuse_white_nits: 203.0,
    paper_white_scale: 1.0,
    depth_mode: 0,
    mvec_scale_x: 1.0,
    mvec_scale_y: 1.0,
    cas_sharpening: 0.0,
    clarity: 0.0,
    bloom_threshold: 0.0,
    chroma_aberration: 0.0,
    vignette: 0.0,
    deband: 0,
    tonemapper: 0,
    ray_reconstruction: false,
    realism_mode: 'real_to_ultra_real',
    delineation: 0.0,
    texture_synthesis: 1.0,
    cel_shade_smoothing: 0.0,
    hard_detail_dlss: 1.5,
    specular_restoration: 1.2,
    gamut_rebalance: 1.0,
  },
  enable_upscale: false,
  upscale_engine: 'DLSS Super Resolution',
  target_resolution: '4k',
  upscale_factor: 2.0,
  custom_width: 3840,
  custom_height: 2160,
  vsr_quality: 4,
  enable_rtx_hdr: false,
  rtx_hdr_contrast: 100,
  rtx_hdr_saturation: 100,
  rtx_hdr_middle_gray: 18,
  rtx_hdr_peak_nits: 1000,
  enable_frame_gen: false,
  target_fps: '60',
  video_codec: 'hevc_nvenc',
  video_quality: 'p6',
  bitrate_cq: 24,
  audio_codec: 'aac',
  film_grain: 0,
  bit_depth_10bit: false,
  color_range: 'full',
  image_format: 'PNG',
  image_quality: 95,
};

const defaultAppPreferences: AppPreferences = {
  defaultOutputDir: '',
  hardwareDecoder: 'cuda',
  nvencPreset: 'p6',
  audioPassthrough: true,
  themeAccent: 'nvidia',
  maxVramUsagePercent: 85,
};

export const App: React.FC = () => {
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [metadataList, setMetadataList] = useState<MediaMetadata[]>([]);
  const [activeMetaIndex, setActiveMetaIndex] = useState<number>(0);
  const [config, setConfig] = useState<PipelineConfig>(defaultPipelineConfig);
  const [processing, setProcessing] = useState<boolean>(false);
  const [currentProgress, setCurrentProgress] = useState<ProgressPayload | null>(null);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [enhancedResult, setEnhancedResult] = useState<PipelineResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Workstation ready. Import source media to begin.');
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState<boolean>(false);

  const handleSelectActiveMeta = (index: number) => {
    if (index >= 0 && index < metadataList.length) {
      setActiveMetaIndex(index);
      setConfig((prev) => ({
        ...prev,
        input_path: metadataList[index].path,
      }));
      setStatusMessage(`Active media: ${metadataList[index].filename}`);
    }
  };

  const handleRemoveMeta = (index: number) => {
    const newMetas = metadataList.filter((_, i) => i !== index);
    const newPaths = selectedPaths.filter((_, i) => i !== index);
    const newBatch = batchItems.filter((_, i) => i !== index);
    setMetadataList(newMetas);
    setSelectedPaths(newPaths);
    setBatchItems(newBatch);
    const newActive = Math.max(0, Math.min(index, newMetas.length - 1));
    setActiveMetaIndex(newActive);
    if (newMetas[newActive]) {
      setConfig((prev) => ({
        ...prev,
        input_path: newMetas[newActive].path,
      }));
    } else {
      setConfig((prev) => ({
        ...prev,
        input_path: '',
      }));
      setEnhancedResult(null);
    }
  };

  const handleClearAllMedia = () => {
    setMetadataList([]);
    setSelectedPaths([]);
    setBatchItems([]);
    setActiveMetaIndex(0);
    setEnhancedResult(null);
    setConfig((prev) => ({
      ...prev,
      input_path: '',
    }));
    setStatusMessage('Workstation cleared. Ready for new media.');
  };

  // Modal Dialogs & Workstation State
  const [isPreferencesOpen, setIsPreferencesOpen] = useState<boolean>(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isLoupeActive, setIsLoupeActive] = useState<boolean>(false);

  // Workstation Persistent Preferences
  const [preferences, setPreferences] = useState<AppPreferences>(() => {
    try {
      const stored = localStorage.getItem('dlss5_preferences');
      return stored ? JSON.parse(stored) : defaultAppPreferences;
    } catch {
      return defaultAppPreferences;
    }
  });

  // Render History
  const [historyItems, setHistoryItems] = useState<RenderHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem('dlss5_render_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Load GPU info on mount
  useEffect(() => {
    invoke<GpuInfo>('get_gpu_info')
      .then((info) => setGpu(info))
      .catch((e) => console.error('Failed to get GPU info:', e));

    // Listen for real-time progress events from Rust
    const unlistenPromise = listen<ProgressPayload>('pipeline-progress', (event) => {
      setCurrentProgress(event.payload);
      setStatusMessage(`${event.payload.stage}: ${event.payload.message}`);

      setBatchItems((prev) =>
        prev.map((item) =>
          item.id === event.payload.job_id
            ? { ...item, progress: event.payload.progress, stage: event.payload.stage }
            : item
        )
      );
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Handle files selected via drag-and-drop or picker
  const handleFilesSelected = async (paths: string[]) => {
    setSelectedPaths(paths);
    try {
      const metas = await invoke<MediaMetadata[]>('probe_media', { paths });
      setMetadataList(metas);
      setActiveMetaIndex(0);

      if (metas.length > 0) {
        setConfig((prev) => ({
          ...prev,
          input_path: metas[0].path,
        }));
      }

      setBatchItems(
        metas.map((m, idx) => ({
          id: `item-${idx}`,
          filename: m.filename,
          status: 'pending',
          progress: 0,
          stage: 'Queued',
        }))
      );
    } catch (err) {
      console.error('Probe failed:', err);
    }
  };

  const handlePickFiles = async () => {
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
          handleFilesSelected(paths);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Run the multi-stage pipeline
  const handleRunPipeline = async () => {
    if (metadataList.length === 0 || !config.input_path) {
      alert('Please select a video or image file first!');
      return;
    }

    setProcessing(true);
    setStatusMessage('Starting DLSS 5 AI Pipeline...');

    for (let i = 0; i < metadataList.length; i++) {
      const currentMeta = metadataList[i];
      const currentConfig = { ...config, input_path: currentMeta.path };

      setBatchItems((prev) =>
        prev.map((item, idx) =>
          idx === i ? { ...item, status: 'processing', stage: 'Executing DLSS 5 Pipeline' } : item
        )
      );

      try {
        const result = await invoke<PipelineResult>('start_pipeline', {
          config: currentConfig,
        });

        setEnhancedResult(result);
        setStatusMessage(`Mastering Complete: ${result.output_resolution} rendered in ${result.elapsed_seconds.toFixed(1)}s`);

        setBatchItems((prev) =>
          prev.map((item, idx) =>
            idx === i
              ? {
                  ...item,
                  status: 'done',
                  progress: 1.0,
                  stage: 'Complete',
                  outputPath: result.output_path,
                  resolution: result.output_resolution,
                }
              : item
          )
        );

        // Record in persistent Render History
        const newHistoryItem: RenderHistoryItem = {
          id: `hist-${Date.now()}-${i}`,
          filename: currentMeta.filename,
          inputPath: currentMeta.path,
          outputPath: result.output_path,
          resolution: result.output_resolution,
          elapsedSeconds: result.elapsed_seconds,
          completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          stages: result.stages_run,
          isVideo: currentMeta.is_video,
        };
        setHistoryItems((prev) => {
          const updated = [newHistoryItem, ...prev].slice(0, 50);
          try {
            localStorage.setItem('dlss5_render_history', JSON.stringify(updated));
          } catch {}
          return updated;
        });
      } catch (err) {
        console.error('Pipeline error:', err);
        setStatusMessage(`Pipeline Execution Error: ${err}`);

        setBatchItems((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: 'failed', stage: `Failed: ${err}` } : item
          )
        );
      }
    }

    setProcessing(false);
  };

  const handleStopPipeline = async () => {
    try {
      await invoke('cancel_pipeline');
      setProcessing(false);
      setStatusMessage('Pipeline execution halted by user request.');
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  const handleRevealOutput = async (path: string) => {
    try {
      await invoke('open_output_dir', { path });
    } catch (err) {
      console.error('Open dir error:', err);
    }
  };

  const handleExportAs = async (sourcePath?: string) => {
    const target = sourcePath || enhancedResult?.output_path;
    if (!target) return;

    try {
      const filename = target.split(/[/\\]/).pop() || 'enhanced_output';
      const parts = filename.split('.');
      const ext = parts.length > 1 ? parts.pop()! : 'png';

      const destination = await save({
        defaultPath: filename,
        filters: [
          {
            name: 'Master Bitstream',
            extensions: [ext],
          },
          {
            name: 'All Files',
            extensions: ['*'],
          },
        ],
      });

      if (destination) {
        setStatusMessage(`Exporting master bitstream to: ${destination}...`);
        await invoke('export_file_as', {
          sourcePath: target,
          destinationPath: destination,
        });
        setStatusMessage(`Master bitstream exported successfully: ${destination}`);
      }
    } catch (err) {
      console.error('Export error:', err);
      setStatusMessage(`Export failed: ${err}`);
    }
  };

  const handleAutoTuneRealism = () => {
    const meta = metadataList[activeMetaIndex];
    if (!meta?.pixel_telemetry) return;
    const pt = meta.pixel_telemetry;
    const rec = pt.recommended_mode;

    if (rec === 'anime_to_real') {
      setConfig((prev) => ({
        ...prev,
        enable_nr: true,
        dlss5: {
          ...prev.dlss5,
          realism_mode: 'anime_to_real',
          preset: 2,
          style: 1,
          dlss_model_preset: 13,
          intensity: 1.45,
          local_tone: 1.25,
          local_structure: 1.45,
          skin_structure: pt.skin_tone_ratio > 0.05 ? 0.9 : 0.6,
          delineation: pt.recommended_delineation,
          texture_synthesis: pt.recommended_texture_synthesis,
          cel_shade_smoothing: Math.max(1.2, pt.recommended_delineation),
          gamut_rebalance: 1.2,
          cas_sharpening: pt.recommended_cas,
          clarity: 0.35,
          bloom_threshold: 0.2,
          chroma_aberration: 0.1,
          vignette: 0.12,
          deband: pt.recommended_deband,
          tonemapper: 2,
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
      }));
      setStatusMessage(
        `Auto-Tuned for Anime ➔ Real Live-Action (Delineation: ${pt.recommended_delineation.toFixed(2)}x, Texture: ${pt.recommended_texture_synthesis.toFixed(2)}x, Deband: L${pt.recommended_deband})`
      );
    } else {
      setConfig((prev) => ({
        ...prev,
        enable_nr: true,
        dlss5: {
          ...prev.dlss5,
          realism_mode: 'real_to_ultra_real',
          preset: 1,
          style: 2,
          dlss_model_preset: 13,
          intensity: 1.65,
          local_tone: 1.3,
          local_structure: 1.6,
          skin_structure: pt.skin_tone_ratio > 0.08 ? 1.1 : 0.85,
          hard_detail_dlss: pt.recommended_hard_detail,
          specular_restoration: Math.min(1.8, Math.max(1.2, 1.2 + pt.specular_highlight_ratio * 4.0)),
          texture_synthesis: pt.recommended_texture_synthesis,
          cas_sharpening: pt.recommended_cas,
          clarity: 0.5,
          bloom_threshold: 0.15,
          vignette: 0.08,
          deband: pt.recommended_deband,
          tonemapper: 1,
          ray_reconstruction: true,
        },
        enable_upscale: true,
        target_resolution: '4k',
        upscale_engine: 'DLSS + RTX VSR Dual Cascade',
        vsr_quality: 4,
        enable_rtx_hdr: true,
        rtx_hdr_contrast: 115,
        rtx_hdr_saturation: 110,
        rtx_hdr_peak_nits: Math.round(Math.min(2000, Math.max(1000, pt.peak_luminance_nits))),
        video_codec: 'hevc_nvenc',
        video_quality: 'p7',
        bitrate_cq: 16,
        bit_depth_10bit: true,
      }));
      const peakTarget = Math.round(Math.min(2000, Math.max(1000, pt.peak_luminance_nits)));
      setStatusMessage(
        `Auto-Tuned for Real ➔ Hyper Ultra Real (Hard Detail: ${pt.recommended_hard_detail.toFixed(2)}x, CAS: ${pt.recommended_cas.toFixed(2)}, TrueHDR: ${peakTarget} Nits)`
      );
    }
  };


  // Global keyboard shortcuts (Ctrl+O to open, Ctrl+S to export, Ctrl+, for prefs, I for inspector, L for loupe)
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
        e.preventDefault();
        handlePickFiles();
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        if (enhancedResult) {
          handleExportAs();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.code === 'Comma') {
        e.preventDefault();
        setIsPreferencesOpen(true);
      } else if (e.code === 'KeyI' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsInspectorOpen((prev) => !prev);
      } else if (e.code === 'KeyL' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsLoupeActive((prev) => !prev);
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
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [enhancedResult]);

  const activeMeta = metadataList[activeMetaIndex] || null;

  return (
    <div className="flex flex-col h-screen bg-[#07090e] text-gray-100 overflow-hidden select-none">
      {/* Frameless Titlebar with Workstation Menu Bar */}
      <TitleBar
        onOpenFile={handlePickFiles}
        onExportAs={() => enhancedResult && handleExportAs(enhancedResult.output_path)}
        onOpenPreferences={() => setIsPreferencesOpen(true)}
        onOpenInspector={() => setIsInspectorOpen(true)}
        onResetPipeline={() => {
          setConfig(defaultPipelineConfig);
          setStatusMessage('Pipeline configuration restored to factory parameters.');
        }}
        onStartPipeline={handleRunPipeline}
        onToggleLoupe={() => setIsLoupeActive((prev) => !prev)}
        onSelectViewMode={(mode) => setViewMode(mode)}
      />

      {/* GPU Hardware Telemetry HUD */}
      <HeaderHud gpu={gpu} processing={processing} fps={currentProgress?.fps || 0} />

      {/* Main Studio Body: Side-by-Side Dual-Pane Workspace */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* ================= LEFT PANE: INPUT & CONFIGURATION ================= */}
        <div className="w-[460px] flex flex-col space-y-3 overflow-y-auto pr-1">
          {/* Universal Dropzone */}
          <MediaDropzone
            onFilesSelected={handleFilesSelected}
            metadataList={metadataList}
            activeMetaIndex={activeMetaIndex}
            onSelectIndex={handleSelectActiveMeta}
            onRemoveIndex={handleRemoveMeta}
            onClearAll={handleClearAllMedia}
            currentMeta={activeMeta}
            fileCount={selectedPaths.length}
          />

          {/* Deep Pixel Intelligence Telemetry Card with Collapsibility */}
          {activeMeta?.pixel_telemetry && (
            <div className="bg-[#0b101c] border border-fuchsia-900/40 rounded-xl p-3 space-y-2.5 font-mono shadow-md transition-all">
              <div
                onClick={() => setIsTelemetryExpanded((prev) => !prev)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#76b900]" />
                  <span className="text-[11px] font-bold text-gray-200 uppercase tracking-wider">Deep Pixel Intelligence</span>
                </div>

                <div className="flex items-center space-x-2">
                  <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    activeMeta.pixel_telemetry.detected_type.includes('Anime')
                      ? 'bg-fuchsia-950/70 text-fuchsia-300 border-fuchsia-500/50 shadow-sm shadow-fuchsia-950'
                      : 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-950'
                  }`}>
                    {activeMeta.pixel_telemetry.detected_type} ({(Math.max(activeMeta.pixel_telemetry.anime_score, activeMeta.pixel_telemetry.photoreal_score) * 100).toFixed(0)}%)
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsTelemetryExpanded((prev) => !prev);
                    }}
                    className="p-1 text-gray-400 hover:text-white rounded hover:bg-[#162438] transition-colors"
                  >
                    {isTelemetryExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Quick Summary Pill & Auto-Tune in Compact Mode */}
              {!isTelemetryExpanded && (
                <div className="flex items-center justify-between text-[10px] pt-0.5 border-t border-[#162238] mt-1">
                  <span className="text-gray-400 truncate max-w-[200px]">
                    Peak: <strong className="text-[#76b900]">{activeMeta.pixel_telemetry.peak_luminance_nits.toFixed(0)}N</strong> • {activeMeta.pixel_telemetry.dynamic_range_db.toFixed(0)}dB
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoTuneRealism}
                    className="px-2 py-0.5 bg-[#16271c] hover:bg-[#203c29] text-[#76b900] hover:text-[#9af300] border border-[#76b900]/40 rounded text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-[#76b900]" />
                    <span>⚡ Auto-Tune</span>
                  </button>
                </div>
              )}

              {/* Full Spectrum Matrix when Expanded */}
              {isTelemetryExpanded && (
                <>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-[#070b14] p-2 rounded-lg border border-[#162238]">
                    <div className="flex justify-between items-center pr-1">
                      <span className="text-gray-400">Peak Luma:</span>
                      <span className="text-[#76b900] font-bold">{activeMeta.pixel_telemetry.peak_luminance_nits.toFixed(0)} Nits</span>
                    </div>
                    <div className="flex justify-between items-center pl-1">
                      <span className="text-gray-400">Dynamic Range:</span>
                      <span className="text-cyan-300 font-bold">{activeMeta.pixel_telemetry.dynamic_range_db.toFixed(1)} dB</span>
                    </div>
                    <div className="flex justify-between items-center pr-1">
                      <span className="text-gray-400">Detail Entropy:</span>
                      <span className="text-purple-300 font-bold">{activeMeta.pixel_telemetry.detail_entropy.toFixed(2)} b/px</span>
                    </div>
                    <div className="flex justify-between items-center pl-1">
                      <span className="text-gray-400">Micro-Contrast:</span>
                      <span className="text-[#76b900] font-bold">{(activeMeta.pixel_telemetry.micro_contrast_index * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between items-center pr-1">
                      <span className="text-gray-400">Cel Flatness:</span>
                      <span className="text-amber-300 font-bold">{(activeMeta.pixel_telemetry.flat_region_ratio * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center pl-1">
                      <span className="text-gray-400">Outlines:</span>
                      <span className="text-fuchsia-300 font-bold">{(activeMeta.pixel_telemetry.outline_density * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center pr-1">
                      <span className="text-gray-400">Skin Dermal:</span>
                      <span className="text-rose-300 font-bold">{(activeMeta.pixel_telemetry.skin_tone_ratio * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center pl-1">
                      <span className="text-gray-400">Banding Step:</span>
                      <span className="text-amber-400 font-bold">{(activeMeta.pixel_telemetry.color_banding_index * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center pl-1">
                      <span className="text-gray-400">White Balance:</span>
                      <span className="text-cyan-200 font-bold">{activeMeta.pixel_telemetry.color_temperature_kelvin}K</span>
                    </div>
                    <div className="flex justify-between items-center pl-1">
                      <span className="text-gray-400">Hyper-Real Fit:</span>
                      <span className="text-emerald-400 font-bold">{(activeMeta.pixel_telemetry.hyper_real_score * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* Auto-Tune One-Click Button */}
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[10px] text-gray-400">
                      Optimal: <span className="text-white font-bold">{activeMeta.pixel_telemetry.recommended_mode === 'anime_to_real' ? '🎨 Anime ➔ Real' : '💎 Real ➔ Hyper Real'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoTuneRealism}
                      className="px-2.5 py-1 bg-[#16271c] hover:bg-[#203c29] text-[#76b900] hover:text-[#9af300] border border-[#76b900]/40 rounded-lg text-[10px] font-bold transition-all shadow-sm shadow-[#76b900]/10 cursor-pointer flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3 h-3 text-[#76b900]" />
                      <span>⚡ Auto-Tune DLSS 5</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* Multi-Stage Visual Node Configuration */}
          <PipelineStages
            config={config}
            onChange={setConfig}
            isVideo={activeMeta ? activeMeta.is_video : true}
            metadata={activeMeta}
          />
        </div>

        {/* ================= RIGHT PANE: INTERACTIVE VIEWPORT & TELEMETRY ================= */}
        <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
          {/* Master Action Bar */}
          <div className="bg-[#0c121e] border border-[#1b263b] rounded-xl p-3 flex flex-col space-y-2.5 shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {processing ? (
                  <button
                    type="button"
                    onClick={handleStopPipeline}
                    className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center space-x-2 transition-colors shadow-lg shadow-rose-600/20 cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>ABORT</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRunPipeline}
                    disabled={metadataList.length === 0}
                    className={`px-6 py-2.5 rounded-lg font-bold text-xs flex items-center space-x-2 transition-all duration-200 ${
                      metadataList.length > 0
                        ? 'bg-[#76b900] hover:bg-[#85ce00] text-black shadow-lg shadow-[#76b900]/25 cursor-pointer'
                        : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 fill-current" />
                    <span>MASTER & RENDER</span>
                  </button>
                )}

                <div className="text-xs text-gray-400 font-mono truncate max-w-md">
                  <span>{statusMessage}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
              {activeMeta && (
                <button
                  type="button"
                  onClick={() => setIsInspectorOpen(true)}
                  className="px-2.5 py-1.5 bg-[#141d2c] hover:bg-[#1b273b] text-cyan-400 border border-[#23354d] rounded-lg text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title="Source Stream Bitstream Inspector (I)"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Inspector</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsPreferencesOpen(true)}
                className="px-2.5 py-1.5 bg-[#141d2c] hover:bg-[#1b273b] text-gray-300 hover:text-white border border-[#23354d] rounded-lg text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer"
                title="Workstation Preferences (Ctrl+,)"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Preferences</span>
              </button>

              {enhancedResult && (
                <>
                  <button
                    type="button"
                    onClick={() => handleExportAs(enhancedResult.output_path)}
                    className="px-3 py-1.5 bg-[#142918] hover:bg-[#1c3a22] text-[#76b900] border border-[#76b900]/40 rounded-lg text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer shadow-sm"
                    title="Export copy (Ctrl+S)"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Export As</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevealOutput(enhancedResult.output_path)}
                    className="px-3 py-1.5 bg-[#172338] hover:bg-[#20314f] text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-mono flex items-center space-x-1.5 transition-colors cursor-pointer"
                    title="Open folder"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Folder</span>
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Live Progress Bar during execution */}
          {processing && currentProgress && (
            <div className="bg-[#0b101c] border border-cyan-500/30 rounded-xl p-2.5 flex flex-col space-y-1 font-mono text-[11px] shadow-md">
              <div className="flex items-center justify-between text-gray-300">
                <div className="flex items-center space-x-2 text-cyan-400">
                  <Activity className="w-3.5 h-3.5 animate-spin" />
                  <span className="font-bold">{currentProgress.stage}</span>
                  <span className="text-gray-400">• {currentProgress.message}</span>
                </div>
                <span className="text-[#76b900] font-bold">{(currentProgress.progress * 100).toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden border border-[#1b263b]">
                <div
                  className="bg-gradient-to-r from-cyan-500 via-[#76b900] to-emerald-400 h-full transition-all duration-200"
                  style={{ width: `${Math.max(2, currentProgress.progress * 100)}%` }}
                />
              </div>
            </div>
          )}
          </div>

          {/* Result Telemetry Banner */}
          {enhancedResult && (
            <div className="bg-[#09151c] border border-[#76b900]/30 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs font-mono shadow-md">
              <div className="flex items-center space-x-3 truncate">
                <div className="flex items-center space-x-1 text-[#76b900] font-bold shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>MASTER BITSTREAM:</span>
                </div>
                <span className="text-cyan-300 font-semibold shrink-0">{enhancedResult.output_resolution}</span>
                <span className="text-gray-500 shrink-0">({enhancedResult.elapsed_seconds.toFixed(1)}s)</span>
                <span className="text-gray-400 truncate text-[11px]" title={enhancedResult.output_path}>
                  {enhancedResult.output_path}
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => handleExportAs(enhancedResult.output_path)}
                  className="px-2.5 py-1 bg-[#76b900] hover:bg-[#8cee00] text-black font-bold rounded flex items-center space-x-1 text-[11px] transition-colors cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Save As</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRevealOutput(enhancedResult.output_path)}
                  className="px-2.5 py-1 bg-[#162438] hover:bg-[#1e324e] text-cyan-300 border border-cyan-500/30 rounded flex items-center space-x-1 text-[11px] transition-colors cursor-pointer"
                >
                  <FolderOpen className="w-3 h-3" />
                  <span>Folder</span>
                </button>
              </div>
            </div>
          )}

          {/* Hardware-Accelerated Split Comparison Viewport */}
          <div className="flex-1 min-h-0">
            <SplitSlider
              originalSrc={activeMeta?.path}
              enhancedSrc={enhancedResult?.output_path}
              isVideo={activeMeta?.is_video}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              isLoupeActive={isLoupeActive}
              onToggleLoupe={() => setIsLoupeActive((prev) => !prev)}
              onBrowseMedia={handlePickFiles}
              targetResolutionTag={
                config.enable_upscale
                  ? (config.target_resolution === '4k'
                      ? '4K UHD MASTER'
                      : config.target_resolution === 'cinema_4k'
                      ? 'CINEMA 4K'
                      : config.target_resolution === '8k'
                      ? '8K UHD'
                      : config.target_resolution === '1440p'
                      ? '1440p QHD'
                      : `${config.upscale_factor}× UPSCALE`)
                  : 'DLSS 5 NATIVE'
              }
            />
          </div>

          {/* Batch Render Queue & History */}
          <BatchQueue
            items={batchItems}
            historyItems={historyItems}
            activeItemIndex={activeMetaIndex}
            onSelectItem={handleSelectActiveMeta}
            onRemoveItem={handleRemoveMeta}
            onClearCompleted={() => setBatchItems((prev) => prev.filter((item) => item.status !== 'done'))}
            onClearHistory={() => {
              setHistoryItems([]);
              try {
                localStorage.removeItem('dlss5_render_history');
              } catch {}
              setStatusMessage('Render history cleared.');
            }}
            onPreviewHistory={(item) => {
              setEnhancedResult({
                input_path: item.inputPath,
                output_path: item.outputPath,
                input_resolution: 'Source Master',
                output_resolution: item.resolution,
                elapsed_seconds: item.elapsedSeconds,
                stages_run: item.stages,
              });
              setStatusMessage(`Previewing master render: ${item.filename} (${item.resolution})`);
            }}
            onOpenFolder={handleRevealOutput}
            onExportAs={handleExportAs}
          />
        </div>
      </div>

      {/* Workstation Modals */}
      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        gpu={gpu}
        preferences={preferences}
        onSavePreferences={(newPrefs) => {
          setPreferences(newPrefs);
          try {
            localStorage.setItem('dlss5_preferences', JSON.stringify(newPrefs));
          } catch {}
          if (newPrefs.defaultOutputDir) {
            setConfig((prev) => ({ ...prev, output_dir: newPrefs.defaultOutputDir }));
          }
        }}
      />

      <MediaInspectorModal
        isOpen={isInspectorOpen}
        onClose={() => setIsInspectorOpen(false)}
        metadata={activeMeta}
      />
    </div>
  );
};

export default App;

// ─── Global Error Boundary ────────────────────────────────────────────────────
// Catches unhandled JS/React exceptions and renders a recovery panel instead of
// freezing or showing a blank screen.
interface ErrorBoundaryState { hasError: boolean; message: string }

class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }
  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[DLSS 5 Studio] Unhandled error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#07090e', color: '#f0f6fc', fontFamily: 'system-ui, sans-serif', gap: 16
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>⚠️</div>
          <h2 style={{ color: '#ff4d4d', margin: 0, fontSize: 20, fontWeight: 600 }}>Application Error</h2>
          <p style={{ color: '#8b949e', margin: 0, maxWidth: 500, textAlign: 'center', fontSize: 14 }}>
            {this.state.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            style={{
              marginTop: 16, padding: '8px 24px', background: '#76b900', color: '#000', border: 'none',
              borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 14
            }}
          >
            Reload Session
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export { ErrorBoundary };
