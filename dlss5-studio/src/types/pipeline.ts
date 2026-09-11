export interface GpuInfo {
  index: number;
  name: string;
  driver_version: string;
  memory_mb: number;
  luid: string;
  is_rtx: boolean;
  dlss5_ready: boolean;
}

export interface MediaMetadata {
  path: string;
  filename: string;
  is_video: boolean;
  width: number;
  height: number;
  fps: number;
  duration_seconds: number;
  frame_count: number;
  codec: string;
  format: string;
  is_hdr: boolean;
  size_bytes: number;
}

export interface Dlss5Settings {
  preset: number;
  style: number;
  intensity: number;
  local_tone: number;
  local_structure: number;
  skin_structure: number;
  auto_mask: number;
  ui_correction: number;
  dlss_model_preset: number;
  perf_quality: number;
  // RenoDX ReShade parameters
  global_tone: number;
  color_strength: number;
  transfer_strength: number;
  diffuse_white_nits: number;
  paper_white_scale: number;
  depth_mode: number;
  mvec_scale_x: number;
  mvec_scale_y: number;
  // ReShade Shader Suite & RenoDX Post-Passes
  cas_sharpening: number;      // Contrast Adaptive Sharpening (0.0 to 1.0)
  clarity: number;             // Micro-contrast edge sharpness (0.0 to 1.0)
  bloom_threshold: number;     // Cinematic bloom highlight glow (0.0 to 1.0)
  chroma_aberration: number;   // Lens chromatic fringing (0.0 to 1.0)
  vignette: number;            // Optical vignette falloff (0.0 to 1.0)
  deband: number;              // Gradient debanding filter (0: off, 1: subtle, 2: strong)
  tonemapper: number;          // 0: RenoDRT, 1: ACES Filmic, 2: AgX, 3: Neutral
  ray_reconstruction: boolean; // DLSS-RR Neural Ray Reconstruction
}

export interface PipelineConfig {
  input_path: string;
  output_dir?: string;
  enable_nr: boolean;
  dlss5: Dlss5Settings;
  // Stage 2: Super Resolution & 4K Targets
  enable_upscale: boolean;
  upscale_engine: string;       // "DLSS Super Resolution", "NVIDIA RTX Video (VSR)", "DLSS + RTX VSR Dual Cascade"
  target_resolution: string;    // "4k", "1080p", "1440p", "cinema_4k", "8k", "factor", "custom"
  upscale_factor: number;       // 1.25, 1.5, 1.724, 2.0, 3.0, 4.0
  custom_width?: number;
  custom_height?: number;
  vsr_quality: number;
  // NVIDIA RTX Video TrueHDR (SDR -> HDR10)
  enable_rtx_hdr: boolean;
  rtx_hdr_contrast?: number;      // 0 to 200 (default 100)
  rtx_hdr_saturation?: number;    // 0 to 200 (default 100)
  rtx_hdr_middle_gray?: number;   // 10 to 50 (default 18)
  rtx_hdr_peak_nits?: number;     // 400 to 2000 (default 1000)
  // Stage 3: Frame Gen
  enable_frame_gen: boolean;
  target_fps: string;
  // Stage 4: Export & Encoding
  video_codec: string;
  video_quality: string;
  bitrate_cq?: number;
  audio_codec?: string;
  film_grain?: number;
  bit_depth_10bit?: boolean;     // 10-bit HDR export (p010le / Main 10)
  color_range?: 'limited' | 'full';
  image_format: string;
  image_quality: number;
}

export interface ProgressPayload {
  job_id: string;
  stage: string;
  progress: number;
  current_frame: number;
  total_frames: number;
  fps: number;
  message: string;
}

export interface PipelineResult {
  input_path: string;
  output_path: string;
  elapsed_seconds: number;
  stages_run: string[];
  input_resolution: string;
  output_resolution: string;
}

export interface RenderHistoryItem {
  id: string;
  filename: string;
  inputPath: string;
  outputPath: string;
  resolution: string;
  elapsedSeconds: number;
  completedAt: string;
  stages: string[];
  isVideo: boolean;
}

export interface AppPreferences {
  defaultOutputDir: string;
  hardwareDecoder: 'cuda' | 'd3d11va' | 'auto';
  nvencPreset: string;
  audioPassthrough: boolean;
  themeAccent: 'nvidia' | 'cyan' | 'amber';
  maxVramUsagePercent: number;
}
