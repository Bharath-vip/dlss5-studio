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
    // Stage 1: DLSS 5 Neural Rendering
    pub enable_nr: bool,
    pub dlss5: Dlss5Settings,
    // Stage 2: Upscale
    pub enable_upscale: bool,
    pub upscale_engine: String, // "DLSS Super Resolution" or "NVIDIA RTX Video (VSR)"
    pub upscale_factor: f32,    // 1.5, 2.0, 3.0, etc.
    pub vsr_quality: u32,
    // Stage 3: Frame Gen
    pub enable_frame_gen: bool,
    pub target_fps: String,
    // Stage 4: Export & Encoding
    pub video_codec: String, // "hevc_nvenc", "av1_nvenc", "h264_nvenc"
    pub video_quality: String,
    pub bitrate_cq: Option<u32>,
    pub audio_codec: Option<String>,
    pub film_grain: Option<f32>,
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
            upscale_factor: 1.5,
            vsr_quality: 4,
            enable_frame_gen: false,
            target_fps: "60".to_string(),
            video_codec: "hevc_nvenc".to_string(),
            video_quality: "p6".to_string(),
            bitrate_cq: Some(20),
            audio_codec: Some("aac".to_string()),
            film_grain: Some(0.0),
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
        let dlss_upscale = config.enable_upscale && !config.upscale_engine.contains("RTX");
        let factor = if dlss_upscale {
            config.upscale_factor
        } else {
            1.0
        };
        let out_w = ((width as f32 * factor).round() as u32) & !1;
        let out_h = ((height as f32 * factor).round() as u32) & !1;

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

        // Stage 1: DLSS 5 Neural Rendering
        if config.enable_nr {
            stages_run.push(format!("DLSS 5 NR ({:.1}x)", factor));
            let host_dir = self.runtime_dir.join("host");
            let mut dlss_settings = config.dlss5.clone();
            dlss_settings.perf_quality = crate::protocols::dlss5_nr::perf_quality_for_factor(factor);

            let mut session = Dlss5Session::start(
                &host_dir,
                current_w,
                current_h,
                out_w,
                out_h,
                Some(1),
                0,
                &dlss_settings,
            )?;

            let mut out_buffer = vec![0u8; (out_w * out_h * 4) as usize];
            session.process_frame(0, true, 0, &processed_rgba, &mut out_buffer)?;
            session.finish(1)?;

            processed_rgba = out_buffer;
            current_w = out_w;
            current_h = out_h;
        }

        // Stage 2: RTX VSR Upscale (if additionally chained)
        if config.enable_upscale && config.upscale_engine.contains("RTX") {
            stages_run.push(format!("RTX VSR ({}x)", config.upscale_factor));
            let target_w = ((current_w as f32 * config.upscale_factor).round() as u32) & !1;
            let target_h = ((current_h as f32 * config.upscale_factor).round() as u32) & !1;

            let rtx_dir = self.runtime_dir.join("rtx_video");
            let mut vsr_settings = RtxVsrSettings::default();
            vsr_settings.vsr_quality = config.vsr_quality;

            let gpu = crate::hardware::detect_primary_gpu();
            let mut session = RtxVsrSession::start(
                &rtx_dir,
                &gpu.luid,
                current_w,
                current_h,
                target_w,
                target_h,
                &vsr_settings,
            )?;

            let mut out_buffer = vec![0u8; (target_w * target_h * 4) as usize];
            session.process_frame(&processed_rgba, &mut out_buffer)?;
            session.close();

            processed_rgba = out_buffer;
            current_w = target_w;
            current_h = target_h;
        }

        // 3. Encode back to file via FFmpeg
        let mut encode_cmd = Command::new(&self.ffmpeg_path)
            .args([
                "-v", "error",
                "-y",
                "-f", "rawvideo",
                "-pix_fmt", "rgba",
                "-s", &format!("{}x{}", current_w, current_h),
                "-i", "-",
                out_path.to_str().unwrap(),
            ])
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
        let dlss_upscale = config.enable_upscale && !config.upscale_engine.contains("RTX");
        let factor = if dlss_upscale {
            config.upscale_factor
        } else {
            1.0
        };
        let out_w = ((width as f32 * factor).round() as u32) & !1;
        let out_h = ((height as f32 * factor).round() as u32) & !1;

        stages_run.push(format!("DLSS 5 NR ({:.1}x)", factor));

        // 1. Launch NVDEC decoder pipe
        let mut decoder = Command::new(&self.ffmpeg_path)
            .args([
                "-v", "error",
                "-hwaccel", "cuda",
                "-i", config.input_path.as_str(),
                "-f", "rawvideo",
                "-pix_fmt", "rgba",
                "-",
            ])
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn NVDEC decoder: {}", e))?;

        let mut dec_stdout = decoder.stdout.take().ok_or("No decoder stdout")?;

        // 2. Launch DLSS 5 session
        let host_dir = self.runtime_dir.join("host");
        let mut dlss_settings = config.dlss5.clone();
        dlss_settings.perf_quality = crate::protocols::dlss5_nr::perf_quality_for_factor(factor);

        let mut session = Dlss5Session::start(
            &host_dir,
            width,
            height,
            out_w,
            out_h,
            None,
            0,
            &dlss_settings,
        )?;

        // 3. Launch NVENC encoder pipe with audio preservation & CQP bitrate control
        let cq_val = config.bitrate_cq.unwrap_or(20);
        let cq_str = cq_val.to_string();
        let audio_codec = config.audio_codec.as_deref().unwrap_or("aac");

        let mut enc_cmd = Command::new(&self.ffmpeg_path);
        enc_cmd.args([
            "-v", "error",
            "-y",
            "-f", "rawvideo",
            "-pix_fmt", "rgba",
            "-s", &format!("{}x{}", out_w, out_h),
            "-r", &format!("{}", meta.fps),
            "-i", "-", // input 0: raw enhanced video stream
            "-i", config.input_path.as_str(), // input 1: original file for audio
            "-map", "0:v:0", // map enhanced video from stdin
            "-map", "1:a?", // map source audio if present
            "-c:v", &config.video_codec,
            "-preset", &config.video_quality,
            "-rc", "vbr",
            "-cq", &cq_str,
        ]);

        if audio_codec == "copy" {
            enc_cmd.args(["-c:a", "copy"]);
        } else {
            enc_cmd.args(["-c:a", "aac", "-b:a", "256k"]);
        }

        enc_cmd.args([
            "-pix_fmt", "yuv420p",
            "-shortest",
            out_path.to_str().unwrap(),
        ]);

        let mut encoder = enc_cmd
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn NVENC encoder: {}", e))?;

        let mut enc_stdin = encoder.stdin.take().ok_or("No encoder stdin")?;

        let frame_bytes_in = (width * height * 4) as usize;
        let frame_bytes_out = (out_w * out_h * 4) as usize;

        let mut in_buffer = vec![0u8; frame_bytes_in];
        let mut out_buffer = vec![0u8; frame_bytes_out];

        let mut processed_frames: u64 = 0;
        let mut last_emit = Instant::now();

        for frame_idx in 0..total_frames {
            if self.cancel_flag.load(Ordering::SeqCst) {
                let _ = decoder.kill();
                let _ = encoder.kill();
                return Err("Pipeline cancelled by user".into());
            }

            if dec_stdout.read_exact(&mut in_buffer).is_err() {
                break;
            }

            session.process_frame(
                frame_idx as u32,
                frame_idx == 0,
                frame_idx as i64,
                &in_buffer,
                &mut out_buffer,
            )?;

            enc_stdin
                .write_all(&out_buffer)
                .map_err(|e| format!("Write to encoder error: {}", e))?;

            processed_frames += 1;

            if last_emit.elapsed().as_millis() > 200 || frame_idx == total_frames - 1 {
                let progress = processed_frames as f32 / total_frames.max(1) as f32;
                let elapsed = start_time.elapsed().as_secs_f32();
                let current_fps = processed_frames as f32 / elapsed.max(0.001);

                if let Some(app) = app {
                    let _ = app.emit(
                        "pipeline-progress",
                        ProgressPayload {
                            job_id: job_id.to_string(),
                            stage: format!("Processing Frame {}/{}", processed_frames, total_frames),
                            progress,
                            current_frame: processed_frames,
                            total_frames,
                            fps: current_fps,
                            message: format!("{:.1} FPS - ETA: {:.0}s", current_fps, (total_frames - processed_frames) as f32 / current_fps.max(0.1)),
                        },
                    );
                } else {
                    print!("\r  -> Processing Frame {}/{} ({:.1} FPS)", processed_frames, total_frames, current_fps);
                    let _ = std::io::stdout().flush();
                }
                last_emit = Instant::now();
            }
        }

        if app.is_none() {
            println!();
        }

        let _ = session.finish(processed_frames as u32);
        drop(enc_stdin);
        let _ = encoder.wait();
        let _ = decoder.kill();
        let _ = decoder.wait();

        Ok(PipelineResult {
            input_path: config.input_path.clone(),
            output_path: out_path.to_string_lossy().to_string(),
            elapsed_seconds: start_time.elapsed().as_secs_f64(),
            stages_run: stages_run.clone(),
            input_resolution: format!("{}x{}", width, height),
            output_resolution: format!("{}x{}", out_w, out_h),
        })
    }
}
