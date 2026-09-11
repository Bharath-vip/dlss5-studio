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
import { Sparkles, Square, CheckCircle2, FolderOpen, Save, Download, Info, Settings } from 'lucide-react';
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
            currentMeta={activeMeta}
            fileCount={selectedPaths.length}
          />

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
          <div className="bg-[#0c121e] border border-[#1b263b] rounded-xl p-3 flex items-center justify-between shadow-md">
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
