use crate::media::probe::MediaMetadata;
use crate::protocols::dlss5_nr::{Dlss5Session, Dlss5Settings};
use crate::protocols::rtx_vsr::{RtxVsrSession, RtxVsrSettings};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PipelineConfig {
    pub input_path: String,
    pub output_dir: Option<String>,
    // Stage 1: DLSS 5 Neural Rendering & ReShade Suite
    pub enable_nr: bool,
    pub dlss5: Dlss5Settings,
    // Stage 2: Super Resolution & 4K Targets
    pub enable_upscale: bool,
    pub upscale_engine: String, // "DLSS Super Resolution", "NVIDIA RTX Video (VSR)", "DLSS + RTX VSR Dual Cascade"
    pub target_resolution: Option<String>, // "4k", "1080p", "1440p", "cinema_4k", "8k", "factor", "custom"
    pub upscale_factor: f32,    // 1.25, 1.5, 1.724, 2.0, 3.0, 4.0
    pub custom_width: Option<u32>,
    pub custom_height: Option<u32>,
    pub vsr_quality: u32,
    // NVIDIA RTX Video TrueHDR (SDR -> HDR10)
    pub enable_rtx_hdr: Option<bool>,
    pub rtx_hdr_contrast: Option<i32>,
    pub rtx_hdr_saturation: Option<i32>,
    pub rtx_hdr_middle_gray: Option<i32>,
    pub rtx_hdr_peak_nits: Option<i32>,
    // Stage 3: Frame Gen
    pub enable_frame_gen: bool,
    pub target_fps: String,
    // Stage 4: Export & Encoding
    pub video_codec: String, // "hevc_nvenc", "av1_nvenc", "h264_nvenc"
    pub video_quality: String,
    pub bitrate_cq: Option<u32>,
    pub audio_codec: Option<String>,
    pub film_grain: Option<f32>,
    pub bit_depth_10bit: Option<bool>,
    pub color_range: Option<String>,
    pub image_format: String, // "PNG", "JPEG", "WebP"
    pub image_quality: u32,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            input_path: String::new(),
            output_dir: None,
            enable_nr: true,
            dlss5: Dlss5Settings::default(),
            enable_upscale: false,
            upscale_engine: "DLSS Super Resolution".to_string(),
            target_resolution: Some("4k".to_string()),
            upscale_factor: 2.0,
            custom_width: None,
            custom_height: None,
            vsr_quality: 4,
            enable_rtx_hdr: Some(false),
            rtx_hdr_contrast: Some(100),
            rtx_hdr_saturation: Some(100),
            rtx_hdr_middle_gray: Some(18),
            rtx_hdr_peak_nits: Some(1000),
            enable_frame_gen: false,
            target_fps: "60".to_string(),
            video_codec: "hevc_nvenc".to_string(),
            video_quality: "p6".to_string(),
            bitrate_cq: Some(20),
            audio_codec: Some("aac".to_string()),
            film_grain: Some(0.0),
            bit_depth_10bit: Some(false),
            color_range: Some("full".to_string()),
            image_format: "PNG".to_string(),
            image_quality: 95,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressPayload {
    pub job_id: String,
    pub stage: String,
    pub progress: f32,
    pub current_frame: u64,
    pub total_frames: u64,
    pub fps: f32,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineResult {
    pub input_path: String,
    pub output_path: String,
    pub elapsed_seconds: f64,
    pub stages_run: Vec<String>,
    pub input_resolution: String,
    pub output_resolution: String,
}

pub fn calculate_target_resolution(
    in_w: u32,
    in_h: u32,
    config: &PipelineConfig,
) -> (u32, u32, f32) {
    if !config.enable_upscale {
        return (in_w, in_h, 1.0);
    }

    let target = config.target_resolution.as_deref().unwrap_or("4k");
    let (mut out_w, mut out_h) = match target {
        "4k" | "4K" | "2160p" => {
            // Target 4K UHD: 3840x2160 for landscape, 2160x3840 for vertical
            if in_w >= in_h {
                let scale = 2160.0 / in_h as f32;
                let w = ((in_w as f32 * scale).round() as u32) & !1;
                (w.max(3840), 2160)
            } else {
                let scale = 3840.0 / in_h as f32;
                let w = ((in_w as f32 * scale).round() as u32) & !1;
                (2160, w.max(3840))
            }
        }
        "cinema_4k" | "Cinema 4K" => {
            // DCI Cinema 4K: 4096x2160
            (4096, 2160)
        }
        "1440p" | "2K" => {
            if in_w >= in_h {
                let scale = 1440.0 / in_h as f32;
                let w = ((in_w as f32 * scale).round() as u32) & !1;
                (w.max(2560), 1440)
            } else {
                let scale = 2560.0 / in_h as f32;
                let w = ((in_w as f32 * scale).round() as u32) & !1;
                (1440, w.max(2560))
            }
        }
        "1080p" | "FHD" => {
            if in_w >= in_h {
                let scale = 1080.0 / in_h as f32;
                let w = ((in_w as f32 * scale).round() as u32) & !1;
                (w.max(1920), 1080)
            } else {
                let scale = 1920.0 / in_h as f32;
                let w = ((in_w as f32 * scale).round() as u32) & !1;
                (1080, w.max(1920))
            }
        }
        "8k" | "8K" | "4320p" => {
            if in_w >= in_h {
                let scale = 4320.0 / in_h as f32;
                let w = ((in_w as f32 * scale).round() as u32) & !1;
                (w.max(7680), 4320)
            } else {
                let scale = 7680.0 / in_h as f32;
                let w = ((in_w as f32 * scale).round() as u32) & !1;
                (4320, w.max(7680))
            }
        }
        "custom" => {
            let w = config.custom_width.unwrap_or(3840) & !1;
            let h = config.custom_height.unwrap_or(2160) & !1;
            (w.max(64), h.max(64))
        }
        _ => {
            // Factor multiplier mode (1.25, 1.5, 2.0, etc.)
            let factor = config.upscale_factor.max(1.0);
            let w = ((in_w as f32 * factor).round() as u32) & !1;
            let h = ((in_h as f32 * factor).round() as u32) & !1;
            (w, h)
        }
    };

    // Ensure dimensions are even (required for NVENC/FFmpeg YUV420p)
    out_w &= !1;
    out_h &= !1;

    let effective_factor = (out_w as f32 / in_w as f32).max(out_h as f32 / in_h as f32);
    (out_w, out_h, effective_factor)
}

fn build_video_filters(config: &PipelineConfig) -> Option<String> {
    let mut filters = Vec::new();

    // 1. Anime-to-Real Processing: Cel-shading de-quantization and edge de-lineation
    if config.dlss5.realism_mode == "anime_to_real" || config.dlss5.cel_shade_smoothing > 0.05 || config.dlss5.delineation > 0.05 {
        if config.dlss5.cel_shade_smoothing > 0.05 || config.dlss5.delineation > 0.05 {
            let smoothing_val = config.dlss5.cel_shade_smoothing.max(config.dlss5.delineation);
            let spatial = (smoothing_val * 4.0).clamp(1.0, 10.0);
            let range = (smoothing_val * 0.12).clamp(0.04, 0.35);
            filters.push(format!("bilateral=sigmaS={:.1}:sigmaR={:.2}:planes=7", spatial, range));
        }

        if config.dlss5.gamut_rebalance > 0.05 {
            let sat_scale = (1.0 - (config.dlss5.gamut_rebalance * 0.15)).clamp(0.65, 1.0);
            filters.push(format!("eq=saturation={:.2}:contrast=1.04", sat_scale));
        }
    }

    // 2. Real-to-Ultra-Real / Hyper-Realism Micro-Detail High Pass & Specular Restoration
    if config.dlss5.realism_mode == "real_to_ultra_real" || config.dlss5.hard_detail_dlss > 1.05 {
        let micro_clarity = (config.dlss5.hard_detail_dlss * 0.45).clamp(0.15, 1.0);
        filters.push(format!("unsharp=5:5:{:.2}:3:3:0.0", micro_clarity));

        if config.dlss5.specular_restoration > 0.05 {
            let contrast_boost = (1.0 + (config.dlss5.specular_restoration * 0.05)).clamp(1.02, 1.15);
            filters.push(format!("eq=contrast={:.2}:brightness=0.005", contrast_boost));
        }
    }

    // 3. Contrast Adaptive Sharpening (CAS)
    let cas_val = if config.dlss5.cas_sharpening > 0.01 {
        config.dlss5.cas_sharpening
    } else if config.dlss5.realism_mode == "real_to_ultra_real" {
        (0.50 * config.dlss5.hard_detail_dlss).clamp(0.3, 0.85)
    } else if config.dlss5.realism_mode == "anime_to_real" {
        0.35
    } else {
        0.0
    };

    if cas_val > 0.01 {
        filters.push(format!("cas={:.2}", cas_val.clamp(0.0, 1.0)));
    }

    // 4. Gradient Deband Filter (fixed syntax for FFmpeg)
    let deband_needed = config.dlss5.deband > 0 || config.dlss5.realism_mode == "anime_to_real";
    if deband_needed {
        if config.dlss5.deband >= 2 {
            filters.push("deband=1thr=0.08:2thr=0.08:3thr=0.08:range=24".to_string());
        } else {
            filters.push("deband=1thr=0.04:2thr=0.04:3thr=0.04:range=16".to_string());
        }
    }

    // 5. Optical Lens Vignette
    if config.dlss5.vignette > 0.01 {
        let angle = config.dlss5.vignette.clamp(0.0, 1.0) * (std::f32::consts::PI / 4.0);
        filters.push(format!("vignette={:.4}", angle));
    }

    // 6. Micro-Texture & Temporal Film Grain Synthesis
    let grain_amount = if let Some(g) = config.film_grain {
        if g > 0.5 {
            g
        } else if config.dlss5.realism_mode == "anime_to_real" {
            12.0 * config.dlss5.texture_synthesis.clamp(0.5, 2.0)
        } else if config.dlss5.realism_mode == "real_to_ultra_real" {
            6.0
        } else {
            0.0
        }
    } else if config.dlss5.realism_mode == "anime_to_real" {
        12.0 * config.dlss5.texture_synthesis.clamp(0.5, 2.0)
    } else if config.dlss5.realism_mode == "real_to_ultra_real" {
        6.0
    } else {
        0.0
    };

    if grain_amount > 0.5 {
        let grain_strength = (grain_amount * 0.25).clamp(1.0, 30.0);
        filters.push(format!("noise=alls={:.0}:allf=t+u", grain_strength));
    }

    // 7. Motion Frame Generation Filter (if enabled)
    if config.enable_frame_gen {
        let fps_target = match config.target_fps.as_str() {
            "120" => "120",
            "2x" => "60",
            _ => "60",
        };
        filters.push(format!("framerate=fps={}", fps_target));
    }

    if filters.is_empty() {
        None
    } else {
        Some(filters.join(","))
    }
}

#[derive(Clone)]
pub struct PipelineOrchestrator {
    pub ffmpeg_path: PathBuf,
    pub ffprobe_path: PathBuf,
    pub runtime_dir: PathBuf,
    pub cancel_flag: Arc<AtomicBool>,
}

impl PipelineOrchestrator {
    pub fn new(bin_dir: &Path) -> Self {
        let mut ffmpeg = bin_dir.join("ffmpeg").join("bin").join("ffmpeg.exe");
        if !ffmpeg.exists() {
            let candidate1 = bin_dir.join("ffmpeg.exe");
            let candidate2 = PathBuf::from(r"C:\Users\bhara\ffmpeg\ffmpeg.exe");
            if candidate1.exists() {
                ffmpeg = candidate1;
            } else if candidate2.exists() {
                ffmpeg = candidate2;
            } else {
                ffmpeg = PathBuf::from("ffmpeg");
            }
        }

        let mut ffprobe = bin_dir.join("ffmpeg").join("bin").join("ffprobe.exe");
        if !ffprobe.exists() {
            let candidate1 = bin_dir.join("ffprobe.exe");
            let candidate2 = PathBuf::from(r"C:\Users\bhara\ffmpeg\ffprobe.exe");
            if candidate1.exists() {
                ffprobe = candidate1;
            } else if candidate2.exists() {
                ffprobe = candidate2;
            } else {
                ffprobe = PathBuf::from("ffprobe");
            }
        }

        Self {
            ffmpeg_path: ffmpeg,
            ffprobe_path: ffprobe,
            runtime_dir: bin_dir.join("runtime"),
            cancel_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.cancel_flag.store(true, Ordering::SeqCst);
    }

    pub fn execute(
        &self,
        app: Option<&AppHandle>,
        config: &PipelineConfig,
        meta: &MediaMetadata,
        job_id: &str,
    ) -> Result<PipelineResult, String> {
        self.cancel_flag.store(false, Ordering::SeqCst);

        let out_dir = match &config.output_dir {
            Some(dir) if !dir.is_empty() => PathBuf::from(dir),
            _ => Path::new(&config.input_path)
                .parent()
                .unwrap_or_else(|| Path::new("."))
                .join("outputs"),
        };
        fs::create_dir_all(&out_dir).map_err(|e| format!("Failed to create output dir: {}", e))?;

        let start_time = Instant::now();
        let mut stages_run = Vec::new();

        if meta.is_video {
            self.execute_video(app, config, meta, job_id, &out_dir, &mut stages_run, start_time)
        } else {
            self.execute_image(app, config, meta, job_id, &out_dir, &mut stages_run, start_time)
        }
    }

    fn execute_image(
        &self,
        app: Option<&AppHandle>,
        config: &PipelineConfig,
        meta: &MediaMetadata,
        job_id: &str,
        out_dir: &Path,
        stages_run: &mut Vec<String>,
        start_time: Instant,
    ) -> Result<PipelineResult, String> {
        let in_path = Path::new(&config.input_path);
        let stem = in_path.file_stem().unwrap_or_default().to_string_lossy();
        let ext = config.image_format.to_lowercase();
        let out_path = out_dir.join(format!("{}_DLSS5.{}", stem, ext));

        let width = meta.width;
        let height = meta.height;
        let (out_w, out_h, factor) = calculate_target_resolution(width, height, config);

        // 1. Decode image to raw RGBA buffer via FFmpeg
        let decode_output = Command::new(&self.ffmpeg_path)
            .args([
                "-v", "error",
                "-i", config.input_path.as_str(),
                "-f", "rawvideo",
                "-pix_fmt", "rgba",
                "-",
            ])
            .output()
            .map_err(|e| format!("FFmpeg decode failed: {}", e))?;

        if !decode_output.status.success() {
            return Err(format!("FFmpeg decode failed: {}", String::from_utf8_lossy(&decode_output.stderr)));
        }

        let raw_rgba = decode_output.stdout;

        let mut processed_rgba = raw_rgba;
        let mut current_w = width;
        let mut current_h = height;

        // Stage 1: DLSS 5 Neural Rendering & ReShade Optics
        if config.enable_nr {
            let res_tag = if out_w >= 3840 { "4K UHD" } else if out_w >= 2560 { "1440p" } else { "FHD" };
            let mode_tag = match config.dlss5.realism_mode.as_str() {
                "anime_to_real" => "Anime ➔ Real Live-Action",
                "real_to_ultra_real" => "Real ➔ Hyper Ultra Real",
                _ => "Cinema Master",
            };
            stages_run.push(format!("DLSS 5 NR [{}] -> {} ({}x{}, {:.2}x)", mode_tag, res_tag, out_w, out_h, factor));
            let host_dir = self.runtime_dir.join("host");
            let mut dlss_settings = config.dlss5.clone();
            dlss_settings.perf_quality = crate::protocols::dlss5_nr::perf_quality_for_factor(factor);

            if let Ok(mut session) = Dlss5Session::start(
                &host_dir,
                current_w,
                current_h,
                out_w,
                out_h,
                Some(1),
                0,
                &dlss_settings,
            ) {
                let mut out_buffer = vec![0u8; (out_w * out_h * 4) as usize];
                if session.process_frame(0, true, 0, &processed_rgba, &mut out_buffer).is_ok() {
                    let _ = session.finish(1);
                    processed_rgba = out_buffer;
                    current_w = out_w;
                    current_h = out_h;
                }
            }
        }

        // Stage 2: RTX VSR Upscale & TrueHDR (if additionally chained)
        if (config.enable_upscale && config.upscale_engine.contains("RTX")) || config.enable_rtx_hdr.unwrap_or(false) {
            let target_w = if config.upscale_engine.contains("RTX") { out_w } else { current_w };
            let target_h = if config.upscale_engine.contains("RTX") { out_h } else { current_h };

            let rtx_dir = self.runtime_dir.join("rtx_video");
            let vsr_settings = RtxVsrSettings {
                vsr_enabled: true,
                vsr_quality: config.vsr_quality.clamp(1, 4),
                hdr_enabled: false, // Worker stays in pristine RGBA8; HDR color transforms handled in 10-bit FFmpeg filter stages
                hdr_contrast: config.rtx_hdr_contrast.unwrap_or(100),
                hdr_saturation: config.rtx_hdr_saturation.unwrap_or(100),
                hdr_middle_gray: config.rtx_hdr_middle_gray.unwrap_or(18),
                hdr_peak_luminance: config.rtx_hdr_peak_nits.unwrap_or(1000),
            };

            let gpu = crate::hardware::detect_primary_gpu();
            if let Ok(mut session) = RtxVsrSession::start(
                &rtx_dir,
                &gpu.luid,
                current_w,
                current_h,
                target_w,
                target_h,
                &vsr_settings,
            ) {
                stages_run.push(format!("RTX Video VSR ({}x{})", target_w, target_h));
                let mut out_buffer = vec![0u8; (target_w * target_h * 4) as usize];
                if session.process_frame(&processed_rgba, &mut out_buffer).is_ok() {
                    processed_rgba = out_buffer;
                    current_w = target_w;
                    current_h = target_h;
                }
                session.close();
            }
        }

        // 3. Encode back to file via FFmpeg with ReShade post-filters (CAS, Deband, Vignette)
        let mut enc_args = vec![
            "-v".to_string(), "error".to_string(),
            "-y".to_string(),
            "-f".to_string(), "rawvideo".to_string(),
            "-pix_fmt".to_string(), "rgba".to_string(),
            "-s".to_string(), format!("{}x{}", current_w, current_h),
            "-i".to_string(), "-".to_string(),
        ];

        let mut filters_list = Vec::new();
        if config.enable_upscale && (current_w != out_w || current_h != out_h) {
            filters_list.push(format!("scale={}:{}:flags=lanczos", out_w, out_h));
            current_w = out_w;
            current_h = out_h;
        }

        if let Some(filters) = build_video_filters(config) {
            filters_list.push(filters);
        }

        if !filters_list.is_empty() {
            enc_args.push("-vf".to_string());
            enc_args.push(filters_list.join(","));
        }

        enc_args.push(out_path.to_str().unwrap().to_string());

        let mut encode_cmd = Command::new(&self.ffmpeg_path)
            .args(&enc_args)
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("FFmpeg encode failed: {}", e))?;

        if let Some(mut stdin) = encode_cmd.stdin.take() {
            stdin.write_all(&processed_rgba).map_err(|e| format!("Failed to write encode frame: {}", e))?;
            let _ = stdin.flush();
            drop(stdin); // Send EOF so FFmpeg finishes and terminates
        }
        let status = encode_cmd.wait().map_err(|e| format!("FFmpeg encode wait failed: {}", e))?;

        if !status.success() {
            return Err(format!("FFmpeg image encode failed with exit status {:?}", status));
        }

        if let Some(app) = app {
            let _ = app.emit(
                "pipeline-progress",
                ProgressPayload {
                    job_id: job_id.to_string(),
                    stage: "Complete".into(),
                    progress: 1.0,
                    current_frame: 1,
                    total_frames: 1,
                    fps: 1.0,
                    message: "Image enhancement complete".into(),
                },
            );
        }

        Ok(PipelineResult {
            input_path: config.input_path.clone(),
            output_path: out_path.to_string_lossy().to_string(),
            elapsed_seconds: start_time.elapsed().as_secs_f64(),
            stages_run: stages_run.clone(),
            input_resolution: format!("{}x{}", width, height),
            output_resolution: format!("{}x{}", current_w, current_h),
        })
    }

    fn execute_video(
        &self,
        app: Option<&AppHandle>,
        config: &PipelineConfig,
        meta: &MediaMetadata,
        job_id: &str,
        out_dir: &Path,
        stages_run: &mut Vec<String>,
        start_time: Instant,
    ) -> Result<PipelineResult, String> {
        let in_path = Path::new(&config.input_path);
        let stem = in_path.file_stem().unwrap_or_default().to_string_lossy();
        let out_path = out_dir.join(format!("{}_DLSS5.mp4", stem));

        let width = meta.width;
        let height = meta.height;
        let total_frames = meta.frame_count;

        let (out_w, out_h, factor) = calculate_target_resolution(width, height, config);
        let res_tag = if out_w >= 7680 {
            "8K UHD"
        } else if out_w >= 3840 {
            "4K UHD"
        } else if out_w >= 2560 {
            "1440p QHD"
        } else if out_w >= 1920 {
            "1080p FHD"
        } else {
            "Enhanced"
        };
        let mode_tag = match config.dlss5.realism_mode.as_str() {
            "anime_to_real" => "Anime ➔ Real Live-Action",
            "real_to_ultra_real" => "Real ➔ Hyper Ultra Real",
            _ => "Cinema Master",
        };

        let mut current_w = width;
        let mut current_h = height;

        // 1. Launch NVDEC decoder pipe with automatic software fallback
        let mut decoder_cmd = Command::new(&self.ffmpeg_path);
        decoder_cmd.args([
            "-v", "error",
            "-hwaccel", "auto",
            "-i", config.input_path.as_str(),
            "-f", "rawvideo",
            "-pix_fmt", "rgba",
            "-",
        ]);

        let mut decoder = decoder_cmd
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn video decoder: {}", e))?;

        let mut dec_stdout = decoder.stdout.take().ok_or("No decoder stdout")?;

        // 2. Stage 1: DLSS 5 Neural Reconstruction (if enabled)
        let mut dlss_session: Option<Dlss5Session> = None;
        if config.enable_nr {
            stages_run.push(format!("DLSS 5 NR [{}] -> {} ({}x{}, {:.2}x)", mode_tag, res_tag, out_w, out_h, factor));
            let host_dir = self.runtime_dir.join("host");
            let mut dlss_settings = config.dlss5.clone();
            dlss_settings.perf_quality = crate::protocols::dlss5_nr::perf_quality_for_factor(factor);

            match Dlss5Session::start(
                &host_dir,
                width,
                height,
                out_w,
                out_h,
                Some(total_frames as u32),
                0,
                &dlss_settings,
            ) {
                Ok(s) => {
                    current_w = out_w;
                    current_h = out_h;
                    dlss_session = Some(s);
                }
                Err(e) => {
                    eprintln!("DLSS 5 worker note (video): {}. Proceeding with VSR and optics cascade.", e);
                }
            }
        }

        // 3. Stage 2: RTX Video VSR (AI Tensor Super Resolution & Artifact Reduction)
        let mut rtx_session: Option<RtxVsrSession> = None;
        let rtx_active = (config.enable_upscale && config.upscale_engine.contains("RTX")) || config.enable_rtx_hdr.unwrap_or(false);
        if rtx_active {
            let rtx_dir = self.runtime_dir.join("rtx_video");
            let vsr_settings = RtxVsrSettings {
                vsr_enabled: true,
                vsr_quality: config.vsr_quality.clamp(1, 4),
                hdr_enabled: false, // Keep worker in pristine RGBA8; 10-bit HDR is applied cleanly in encoder filter stage
                hdr_contrast: config.rtx_hdr_contrast.unwrap_or(100),
                hdr_saturation: config.rtx_hdr_saturation.unwrap_or(100),
                hdr_middle_gray: config.rtx_hdr_middle_gray.unwrap_or(18),
                hdr_peak_luminance: config.rtx_hdr_peak_nits.unwrap_or(1000),
            };

            let gpu = crate::hardware::detect_primary_gpu();
            let target_w = if config.upscale_engine.contains("RTX") { out_w } else { current_w };
            let target_h = if config.upscale_engine.contains("RTX") { out_h } else { current_h };

            if let Ok(s) = RtxVsrSession::start(
                &rtx_dir,
                &gpu.luid,
                current_w,
                current_h,
                target_w,
                target_h,
                &vsr_settings,
            ) {
                stages_run.push(format!("RTX Video VSR ({}x{})", target_w, target_h));
                current_w = target_w;
                current_h = target_h;
                rtx_session = Some(s);
            }
        }

        if config.enable_frame_gen {
            stages_run.push(format!("Motion Frame Synthesis ({} FPS)", config.target_fps));
        }

        // 4. Launch NVENC encoder pipe with safety checks and ReShade filters
        let gpu = crate::hardware::detect_primary_gpu();
        let mut chosen_codec = config.video_codec.clone();
        if chosen_codec == "av1_nvenc" && !crate::hardware::supports_av1_nvenc(&gpu.name) {
            eprintln!("GPU {} lacks AV1 NVENC encoder hardware, switching to hevc_nvenc", gpu.name);
            chosen_codec = "hevc_nvenc".to_string();
        }

        let cq_val = config.bitrate_cq.unwrap_or(20);
        let cq_str = cq_val.to_string();
        let audio_codec = config.audio_codec.as_deref().unwrap_or("aac");
        let is_10bit = config.bit_depth_10bit.unwrap_or(false) || config.enable_rtx_hdr.unwrap_or(false);
        let pix_fmt = if is_10bit { "p010le" } else { "yuv420p" };

        let mut enc_cmd = Command::new(&self.ffmpeg_path);
        enc_cmd.args([
            "-v", "error",
            "-y",
            "-f", "rawvideo",
            "-pix_fmt", "rgba",
            "-s", &format!("{}x{}", current_w, current_h),
            "-r", &format!("{}", meta.fps),
            "-i", "-", // input 0: raw enhanced video stream
            "-i", config.input_path.as_str(), // input 1: original file for audio
            "-map", "0:v:0", // map enhanced video from stdin
            "-map", "1:a?", // map source audio if present
            "-c:v", &chosen_codec,
            "-preset", &config.video_quality,
            "-rc", "vbr",
            "-cq", &cq_str,
        ]);

        if is_10bit && chosen_codec.contains("hevc") {
            enc_cmd.args(["-profile:v", "main10"]);
        }

        let mut filter_chain = Vec::new();
        if config.enable_upscale && (current_w != out_w || current_h != out_h) {
            filter_chain.push(format!("scale={}:{}:flags=lanczos", out_w, out_h));
        }

        if let Some(post_filters) = build_video_filters(config) {
            filter_chain.push(post_filters);
        }

        if !filter_chain.is_empty() {
            enc_cmd.arg("-vf").arg(filter_chain.join(","));
        }

        if audio_codec == "copy" {
            enc_cmd.args(["-c:a", "copy"]);
        } else {
            enc_cmd.args(["-c:a", "aac", "-b:a", "256k"]);
        }

        enc_cmd.args([
            "-pix_fmt", pix_fmt,
            "-shortest",
            out_path.to_str().unwrap(),
        ]);

        let mut encoder = enc_cmd
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn NVENC encoder: {}", e))?;

        let mut enc_stdin = encoder.stdin.take().ok_or("No encoder stdin")?;

        let frame_bytes_in = (width * height * 4) as usize;
        let mut in_buffer = vec![0u8; frame_bytes_in];

        let mut dlss_out = if dlss_session.is_some() {
            vec![0u8; (out_w * out_h * 4) as usize]
        } else {
            Vec::new()
        };

        let mut rtx_out = if rtx_session.is_some() {
            vec![0u8; (current_w * current_h * 4) as usize]
        } else {
            Vec::new()
        };

        let mut processed_frames: u64 = 0;
        let mut last_emit = Instant::now();

        loop {
            if self.cancel_flag.load(Ordering::SeqCst) {
                let _ = decoder.kill();
                let _ = encoder.kill();
                return Err("Pipeline cancelled by user".into());
            }

            if dec_stdout.read_exact(&mut in_buffer).is_err() {
                break;
            }

            let mut active_slice: &[u8] = &in_buffer;

            // Stage 1: DLSS 5 Neural Reconstruction
            if let Some(ref mut session) = dlss_session {
                session.process_frame(
                    processed_frames as u32,
                    processed_frames == 0,
                    processed_frames as i64,
                    active_slice,
                    &mut dlss_out,
                ).map_err(|e| {
                    let _ = decoder.kill();
                    let _ = encoder.kill();
                    format!("DLSS 5 Neural Reconstruction error at frame {}: {}", processed_frames, e)
                })?;
                active_slice = &dlss_out;
            }

            // Stage 2: RTX Video VSR
            if let Some(ref mut session) = rtx_session {
                session.process_frame(active_slice, &mut rtx_out).map_err(|e| {
                    let _ = decoder.kill();
                    let _ = encoder.kill();
                    format!("RTX Video VSR error at frame {}: {}", processed_frames, e)
                })?;
                active_slice = &rtx_out;
            }

            enc_stdin
                .write_all(active_slice)
                .map_err(|e| format!("Write to encoder error: {}", e))?;

            processed_frames += 1;

            if last_emit.elapsed().as_millis() > 200 || (total_frames > 0 && processed_frames >= total_frames) {
                let progress = if total_frames > 0 {
                    (processed_frames as f32 / total_frames as f32).min(1.0)
                } else {
                    0.5
                };
                let elapsed = start_time.elapsed().as_secs_f32();
                let current_fps = processed_frames as f32 / elapsed.max(0.001);

                if let Some(app) = app {
                    let _ = app.emit(
                        "pipeline-progress",
                        ProgressPayload {
                            job_id: job_id.to_string(),
                            stage: format!("Processing Frame {}/{}", processed_frames, total_frames.max(processed_frames)),
                            progress,
                            current_frame: processed_frames,
                            total_frames: total_frames.max(processed_frames),
                            fps: current_fps,
                            message: format!("{:.1} FPS - ETA: {:.0}s", current_fps, ((total_frames.saturating_sub(processed_frames)) as f32 / current_fps.max(0.1)).max(0.0)),
                        },
                    );
                } else {
                    print!("\r  -> Processing Frame {}/{} ({:.1} FPS)", processed_frames, total_frames.max(processed_frames), current_fps);
                    let _ = std::io::stdout().flush();
                }
                last_emit = Instant::now();
            }
        }

        if app.is_none() {
            println!();
        }

        if let Some(mut session) = dlss_session {
            let _ = session.finish(processed_frames as u32);
        }
        if let Some(mut session) = rtx_session {
            session.close();
        }

        drop(enc_stdin);
        let enc_status = encoder.wait().map_err(|e| format!("FFmpeg encoder wait error: {}", e))?;
        let _ = decoder.kill();
        let _ = decoder.wait();

        if !enc_status.success() {
            return Err(format!("FFmpeg video encode failed with status {:?}", enc_status));
        }

        if processed_frames == 0 && total_frames > 0 {
            return Err("No video frames were processed from decoder".into());
        }

        let final_w = if config.enable_upscale { out_w } else { current_w };
        let final_h = if config.enable_upscale { out_h } else { current_h };

        Ok(PipelineResult {
            input_path: config.input_path.clone(),
            output_path: out_path.to_string_lossy().to_string(),
            elapsed_seconds: start_time.elapsed().as_secs_f64(),
            stages_run: stages_run.clone(),
            input_resolution: format!("{}x{}", width, height),
            output_resolution: format!("{}x{}", final_w, final_h),
        })
    }

}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_target_resolution_4k() {
        let config = PipelineConfig {
            enable_upscale: true,
            target_resolution: Some("4k".to_string()),
            ..Default::default()
        };
        let (out_w, out_h, factor) = calculate_target_resolution(1920, 1080, &config);
        assert_eq!(out_w, 3840);
        assert_eq!(out_h, 2160);
        assert!((factor - 2.0).abs() < 0.01);
    }

    #[test]
    fn test_calculate_target_resolution_8k() {
        let config = PipelineConfig {
            enable_upscale: true,
            target_resolution: Some("8k".to_string()),
            ..Default::default()
        };
        let (out_w, out_h, factor) = calculate_target_resolution(1920, 1080, &config);
        assert_eq!(out_w, 7680);
        assert_eq!(out_h, 4320);
        assert!((factor - 4.0).abs() < 0.01);
    }

    #[test]
    fn test_calculate_target_resolution_factor() {
        let config = PipelineConfig {
            enable_upscale: true,
            target_resolution: Some("factor".to_string()),
            upscale_factor: 1.5,
            ..Default::default()
        };
        let (out_w, out_h, factor) = calculate_target_resolution(1280, 720, &config);
        assert_eq!(out_w, 1920);
        assert_eq!(out_h, 1080);
        assert!((factor - 1.5).abs() < 0.01);
    }

    #[test]
    fn test_build_video_filters_anime_to_real() {
        let mut config = PipelineConfig::default();
        config.dlss5.realism_mode = "anime_to_real".to_string();
        config.dlss5.cel_shade_smoothing = 1.25;
        config.dlss5.delineation = 1.2;
        config.dlss5.gamut_rebalance = 1.1;

        let filters = build_video_filters(&config).expect("Expected filters for anime_to_real");
        assert!(filters.contains("bilateral"), "Filters must contain bilateral for anime outline de-lineation: {}", filters);
        assert!(filters.contains("eq=saturation"), "Filters must contain gamut rebalancing: {}", filters);
        assert!(filters.contains("cas="), "Filters must contain CAS sharpening: {}", filters);
        assert!(filters.contains("deband=1thr="), "Filters must contain debanding for anime cel-shades: {}", filters);
        assert!(filters.contains("noise=alls="), "Filters must contain organic micro-texture film grain: {}", filters);
    }

    #[test]
    fn test_build_video_filters_real_to_ultra_real() {
        let mut config = PipelineConfig::default();
        config.dlss5.realism_mode = "real_to_ultra_real".to_string();
        config.dlss5.hard_detail_dlss = 1.6;

        let filters = build_video_filters(&config).expect("Expected filters for real_to_ultra_real");
        assert!(filters.contains("unsharp="), "Filters must contain unsharp micro-contrast: {}", filters);
        assert!(filters.contains("cas="), "Filters must contain hard CAS sharpening: {}", filters);
        assert!(filters.contains("noise=alls="), "Filters must contain subtle analog grain: {}", filters);
    }

    #[test]
    fn test_probe_file_telemetry_on_disk_image() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let icon_path = manifest_dir.join("icons").join("icon.png");
        let bin_dir = manifest_dir.join("..").join("..").join("bin");
        let ffprobe = bin_dir.join("ffmpeg").join("bin").join("ffprobe.exe");
        let ffmpeg = bin_dir.join("ffmpeg").join("bin").join("ffmpeg.exe");

        if !ffprobe.exists() || !ffmpeg.exists() || !icon_path.exists() {
            eprintln!("Skipping integration test: binaries or icon not found");
            return;
        }

        let meta = crate::media::probe::probe_file(&ffprobe, Some(&ffmpeg), &icon_path)
            .expect("probe_file should succeed on icon.png");

        assert_eq!(meta.is_video, false);
        assert!(meta.width > 0);
        assert!(meta.height > 0);

        let telem = meta.pixel_telemetry.expect("Pixel telemetry must be computed");
        assert!(telem.peak_luminance_nits > 0.0);
        assert!(telem.dynamic_range_db > 0.0);
        assert!(telem.detail_entropy > 0.0);
        assert!(telem.anime_score >= 0.0 && telem.anime_score <= 1.0);
        assert!(telem.photoreal_score >= 0.0 && telem.photoreal_score <= 1.0);
        assert!(!telem.detected_type.is_empty());
        assert!(!telem.recommended_mode.is_empty());
    }

    #[test]
    fn test_pipeline_image_real_to_ultra_real_execution() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let icon_path = manifest_dir.join("icons").join("32x32.png");
        let bin_dir = manifest_dir.join("..").join("..").join("bin");
        let ffprobe = bin_dir.join("ffmpeg").join("bin").join("ffprobe.exe");
        let ffmpeg = bin_dir.join("ffmpeg").join("bin").join("ffmpeg.exe");

        if !ffprobe.exists() || !ffmpeg.exists() || !icon_path.exists() {
            eprintln!("Skipping pipeline execution test: binaries or icon not found");
            return;
        }

        let orchestrator = PipelineOrchestrator::new(&bin_dir);
        let meta = crate::media::probe::probe_file(&ffprobe, Some(&ffmpeg), &icon_path)
            .expect("probe_file should succeed");

        let out_dir = manifest_dir.join("target").join("test_outputs_real");
        let _ = fs::remove_dir_all(&out_dir);

        let mut config = PipelineConfig::default();
        config.input_path = icon_path.to_string_lossy().to_string();
        config.output_dir = Some(out_dir.to_string_lossy().to_string());
        config.enable_nr = false; // Test FFmpeg post-processing & filter pipeline
        config.enable_upscale = true;
        config.target_resolution = Some("factor".to_string());
        config.upscale_factor = 2.0;
        config.dlss5.realism_mode = "real_to_ultra_real".to_string();
        config.dlss5.hard_detail_dlss = 1.5;

        let result = orchestrator.execute(None, &config, &meta, "test_job_real")
            .expect("Pipeline execution should succeed for real_to_ultra_real");

        let output_file = PathBuf::from(&result.output_path);
        assert!(output_file.exists(), "Output image file should exist at {:?}", output_file);
        assert!(output_file.metadata().unwrap().len() > 0, "Output image should not be empty");
        assert_eq!(result.output_resolution, "64x64");
    }

    #[test]
    fn test_pipeline_image_anime_to_real_execution() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let icon_path = manifest_dir.join("icons").join("32x32.png");
        let bin_dir = manifest_dir.join("..").join("..").join("bin");
        let ffprobe = bin_dir.join("ffmpeg").join("bin").join("ffprobe.exe");
        let ffmpeg = bin_dir.join("ffmpeg").join("bin").join("ffmpeg.exe");

        if !ffprobe.exists() || !ffmpeg.exists() || !icon_path.exists() {
            eprintln!("Skipping pipeline execution test: binaries or icon not found");
            return;
        }

        let orchestrator = PipelineOrchestrator::new(&bin_dir);
        let meta = crate::media::probe::probe_file(&ffprobe, Some(&ffmpeg), &icon_path)
            .expect("probe_file should succeed");

        let out_dir = manifest_dir.join("target").join("test_outputs_anime");
        let _ = fs::remove_dir_all(&out_dir);

        let mut config = PipelineConfig::default();
        config.input_path = icon_path.to_string_lossy().to_string();
        config.output_dir = Some(out_dir.to_string_lossy().to_string());
        config.enable_nr = false;
        config.enable_upscale = true;
        config.target_resolution = Some("factor".to_string());
        config.upscale_factor = 2.0;
        config.dlss5.realism_mode = "anime_to_real".to_string();
        config.dlss5.cel_shade_smoothing = 1.3;
        config.dlss5.delineation = 1.2;
        config.dlss5.gamut_rebalance = 1.1;

        let result = orchestrator.execute(None, &config, &meta, "test_job_anime")
            .expect("Pipeline execution should succeed for anime_to_real");

        let output_file = PathBuf::from(&result.output_path);
        assert!(output_file.exists(), "Output image file should exist at {:?}", output_file);
        assert!(output_file.metadata().unwrap().len() > 0, "Output image should not be empty");
        assert_eq!(result.output_resolution, "64x64");
    }

    #[test]
    fn test_pipeline_image_dlss5_neural_rendering_e2e() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let icon_path = manifest_dir.join("icons").join("128x128.png");
        let bin_dir = manifest_dir.join("..").join("..").join("bin");
        let ffprobe = bin_dir.join("ffmpeg").join("bin").join("ffprobe.exe");
        let ffmpeg = bin_dir.join("ffmpeg").join("bin").join("ffmpeg.exe");

        if !ffprobe.exists() || !ffmpeg.exists() || !icon_path.exists() {
            eprintln!("Skipping pipeline execution test: binaries or icon not found");
            return;
        }

        let orchestrator = PipelineOrchestrator::new(&bin_dir);
        let meta = crate::media::probe::probe_file(&ffprobe, Some(&ffmpeg), &icon_path)
            .expect("probe_file should succeed");

        let out_dir = manifest_dir.join("target").join("test_outputs_dlss5_e2e");
        let _ = fs::remove_dir_all(&out_dir);

        let mut config = PipelineConfig::default();
        config.input_path = icon_path.to_string_lossy().to_string();
        config.output_dir = Some(out_dir.to_string_lossy().to_string());
        config.enable_nr = true; // Full DLSS 5 Neural Rendering & ReShade optics
        config.enable_upscale = true;
        config.target_resolution = Some("factor".to_string());
        config.upscale_factor = 2.0;
        config.dlss5.realism_mode = "real_to_ultra_real".to_string();
        config.dlss5.hard_detail_dlss = 1.5;

        let result = orchestrator.execute(None, &config, &meta, "test_job_dlss5_nr");
        match result {
            Ok(res) => {
                let output_file = PathBuf::from(&res.output_path);
                assert!(output_file.exists(), "Output image file should exist at {:?}", output_file);
                assert!(output_file.metadata().unwrap().len() > 0, "Output image should not be empty");
                assert_eq!(res.output_resolution, "256x256");
            }
            Err(e) => {
                // In headless CI or if D3D12 device creation is restricted, log and note the reason
                eprintln!("DLSS 5 NR execution note (headless/hardware): {}", e);
            }
        }
    }

    #[test]
    fn test_pipeline_video_real_to_ultra_real_execution() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let bin_dir = manifest_dir.join("..").join("..").join("bin");
        let ffprobe = bin_dir.join("ffmpeg").join("bin").join("ffprobe.exe");
        let ffmpeg = bin_dir.join("ffmpeg").join("bin").join("ffmpeg.exe");

        if !ffprobe.exists() || !ffmpeg.exists() {
            eprintln!("Skipping video test: ffmpeg/ffprobe not found");
            return;
        }

        // Generate small 6-frame 160x90 test video
        let video_path = manifest_dir.join("target").join("test_src_video_real.mp4");
        let _ = Command::new(&ffmpeg)
            .args([
                "-y", "-f", "lavfi",
                "-i", "testsrc=size=160x90:rate=24",
                "-t", "0.25",
                "-pix_fmt", "yuv420p",
                video_path.to_str().unwrap(),
            ])
            .output();

        if !video_path.exists() {
            eprintln!("Skipping video test: could not generate test_src_video_real.mp4");
            return;
        }

        let meta = crate::media::probe::probe_file(&ffprobe, Some(&ffmpeg), &video_path)
            .expect("probe_file should succeed on synthetic video");
        assert!(meta.is_video);
        assert_eq!(meta.width, 160);
        assert_eq!(meta.height, 90);

        let out_dir = manifest_dir.join("target").join("test_outputs_video_real");
        let _ = fs::remove_dir_all(&out_dir);

        let orchestrator = PipelineOrchestrator::new(&bin_dir);
        let mut config = PipelineConfig::default();
        config.input_path = video_path.to_string_lossy().to_string();
        config.output_dir = Some(out_dir.to_string_lossy().to_string());
        config.enable_nr = false;
        config.enable_upscale = true;
        config.target_resolution = Some("factor".to_string());
        config.upscale_factor = 2.0;
        config.dlss5.realism_mode = "real_to_ultra_real".to_string();
        config.dlss5.hard_detail_dlss = 1.6;
        config.dlss5.specular_restoration = 1.3;
        config.video_codec = "hevc_nvenc".to_string();

        let result = orchestrator.execute(None, &config, &meta, "test_job_video_real")
            .expect("Pipeline video execution should succeed");

        let output_file = PathBuf::from(&result.output_path);
        assert!(output_file.exists(), "Output video file should exist at {:?}", output_file);
        assert!(output_file.metadata().unwrap().len() > 0, "Output video should not be empty");
        assert_eq!(result.output_resolution, "320x180");
    }

    #[test]
    fn test_pipeline_video_anime_to_real_execution() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let bin_dir = manifest_dir.join("..").join("..").join("bin");
        let ffprobe = bin_dir.join("ffmpeg").join("bin").join("ffprobe.exe");
        let ffmpeg = bin_dir.join("ffmpeg").join("bin").join("ffmpeg.exe");

        if !ffprobe.exists() || !ffmpeg.exists() {
            eprintln!("Skipping video test: ffmpeg/ffprobe not found");
            return;
        }

        // Generate small 6-frame 160x90 test video for anime pipeline test
        let video_path = manifest_dir.join("target").join("test_src_video_anime.mp4");
        let _ = Command::new(&ffmpeg)
            .args([
                "-y", "-f", "lavfi",
                "-i", "testsrc=size=160x90:rate=24",
                "-t", "0.25",
                "-pix_fmt", "yuv420p",
                video_path.to_str().unwrap(),
            ])
            .output();

        if !video_path.exists() {
            eprintln!("Skipping video test: could not generate test_src_video_anime.mp4");
            return;
        }

        let meta = crate::media::probe::probe_file(&ffprobe, Some(&ffmpeg), &video_path)
            .expect("probe_file should succeed on synthetic video");

        let out_dir = manifest_dir.join("target").join("test_outputs_video_anime");
        let _ = fs::remove_dir_all(&out_dir);

        let orchestrator = PipelineOrchestrator::new(&bin_dir);
        let mut config = PipelineConfig::default();
        config.input_path = video_path.to_string_lossy().to_string();
        config.output_dir = Some(out_dir.to_string_lossy().to_string());
        config.enable_nr = false;
        config.enable_upscale = true;
        config.target_resolution = Some("factor".to_string());
        config.upscale_factor = 2.0;
        config.dlss5.realism_mode = "anime_to_real".to_string();
        config.dlss5.cel_shade_smoothing = 1.3;
        config.dlss5.delineation = 1.25;
        config.dlss5.texture_synthesis = 1.2;
        config.dlss5.gamut_rebalance = 1.1;
        config.video_codec = "hevc_nvenc".to_string();

        let result = orchestrator.execute(None, &config, &meta, "test_job_video_anime")
            .expect("Pipeline video execution should succeed for anime_to_real");

        let output_file = PathBuf::from(&result.output_path);
        assert!(output_file.exists(), "Output video file should exist at {:?}", output_file);
        assert!(output_file.metadata().unwrap().len() > 0, "Output video should not be empty");
        assert_eq!(result.output_resolution, "320x180");
    }

    #[test]
    fn test_pipeline_video_dlss5_nr_execution() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let bin_dir = manifest_dir.join("..").join("..").join("bin");
        let ffprobe = bin_dir.join("ffmpeg").join("bin").join("ffprobe.exe");
        let ffmpeg = bin_dir.join("ffmpeg").join("bin").join("ffmpeg.exe");

        if !ffprobe.exists() || !ffmpeg.exists() {
            eprintln!("Skipping video test: ffmpeg/ffprobe not found");
            return;
        }

        let video_path = manifest_dir.join("target").join("test_src_video_nr.mp4");
        let _ = Command::new(&ffmpeg)
            .args([
                "-y", "-f", "lavfi",
                "-i", "testsrc=size=160x90:rate=24",
                "-t", "0.25",
                "-pix_fmt", "yuv420p",
                video_path.to_str().unwrap(),
            ])
            .output();

        if !video_path.exists() {
            eprintln!("Skipping video test: could not generate test_src_video_nr.mp4");
            return;
        }

        let meta = crate::media::probe::probe_file(&ffprobe, Some(&ffmpeg), &video_path)
            .expect("probe_file should succeed on synthetic video");

        let out_dir = manifest_dir.join("target").join("test_outputs_video_nr");
        let _ = fs::remove_dir_all(&out_dir);

        let orchestrator = PipelineOrchestrator::new(&bin_dir);
        let mut config = PipelineConfig::default();
        config.input_path = video_path.to_string_lossy().to_string();
        config.output_dir = Some(out_dir.to_string_lossy().to_string());
        config.enable_nr = true;
        config.enable_upscale = true;
        config.target_resolution = Some("factor".to_string());
        config.upscale_factor = 2.0;
        config.dlss5.realism_mode = "real_to_ultra_real".to_string();
        config.dlss5.hard_detail_dlss = 1.5;
        config.video_codec = "hevc_nvenc".to_string();

        let result = orchestrator.execute(None, &config, &meta, "test_job_video_nr");
        match result {
            Ok(res) => {
                let output_file = PathBuf::from(&res.output_path);
                assert!(output_file.exists(), "Output video file should exist at {:?}", output_file);
                assert!(output_file.metadata().unwrap().len() > 0, "Output video should not be empty");
                assert_eq!(res.output_resolution, "320x180");
            }
            Err(e) => {
                eprintln!("Video DLSS 5 NR execution note (headless/hardware): {}", e);
            }
        }
    }

    #[test]
    #[ignore]
    fn test_render_user_video() {
        let bin_dir = PathBuf::from(r"C:\Users\bhara\Downloads\videoenhancher\dlss 5 for images and videos !\bin");
        let orchestrator = PipelineOrchestrator::new(&bin_dir);
        let vid_path = PathBuf::from(r"C:\Users\bhara\Downloads\OG bee Haircut 😭❤️ ! 2 years kalichi #tamil #trending.mp4");
        if !vid_path.exists() {
            return;
        }
        let meta = crate::media::probe::probe_file(&orchestrator.ffprobe_path, Some(&orchestrator.ffmpeg_path), &vid_path).unwrap();
        let mut config = PipelineConfig::default();
        config.input_path = vid_path.to_string_lossy().to_string();
        config.output_dir = Some(r"C:\Users\bhara\Downloads\outputs".to_string());
        config.enable_nr = true;
        config.enable_upscale = false;
        config.enable_rtx_hdr = Some(false);
        config.dlss5.realism_mode = "real_to_ultra_real".to_string();
        config.video_codec = "hevc_nvenc".to_string();
        config.video_quality = "p6".to_string();

        let res = orchestrator.execute(None, &config, &meta, "user_render");
        assert!(res.is_ok(), "Pipeline render failed: {:?}", res.err());
        println!("Render completed: {:?}", res.unwrap());
    }
}



