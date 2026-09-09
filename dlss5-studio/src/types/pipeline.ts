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
}

export interface PipelineConfig {
  input_path: string;
  output_dir?: string;
  enable_nr: boolean;
  dlss5: Dlss5Settings;
  enable_upscale: boolean;
  upscale_engine: string;
  upscale_factor: number;
  vsr_quality: number;
  enable_frame_gen: boolean;
  target_fps: string;
  video_codec: string;
  video_quality: string;
  bitrate_cq?: number;
  audio_codec?: string;
  film_grain?: number;
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
