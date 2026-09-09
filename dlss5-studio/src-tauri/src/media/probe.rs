use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaMetadata {
    pub path: String,
    pub filename: String,
    pub is_video: bool,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration_seconds: f64,
    pub frame_count: u64,
    pub codec: String,
    pub format: String,
    pub is_hdr: bool,
    pub size_bytes: u64,
}

#[derive(Deserialize)]
struct FfprobeOutput {
    streams: Option<Vec<FfprobeStream>>,
    format: Option<FfprobeFormat>,
}

#[derive(Deserialize)]
struct FfprobeStream {
    codec_name: Option<String>,
    codec_type: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    r_frame_rate: Option<String>,
    avg_frame_rate: Option<String>,
    duration: Option<String>,
    nb_frames: Option<String>,
    color_transfer: Option<String>,
}

#[derive(Deserialize)]
struct FfprobeFormat {
    format_name: Option<String>,
    duration: Option<String>,
    size: Option<String>,
}

fn parse_fraction(val: &str) -> f64 {
    let parts: Vec<&str> = val.split('/').collect();
    if parts.len() == 2 {
        let num = parts[0].parse::<f64>().unwrap_or(0.0);
        let den = parts[1].parse::<f64>().unwrap_or(1.0);
        if den > 0.0 {
            return num / den;
        }
    }
    val.parse::<f64>().unwrap_or(30.0)
}

pub fn probe_file(ffprobe_path: &Path, file_path: &Path) -> Result<MediaMetadata, String> {
    if !file_path.exists() {
        return Err(format!("File does not exist: {:?}", file_path));
    }

    let output = Command::new(ffprobe_path)
        .args([
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,duration,nb_frames,color_transfer",
            "-show_entries",
            "format=format_name,duration,size",
            "-of",
            "json",
            file_path.to_string_lossy().as_ref(),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err("ffprobe failed to read file metadata".into());
    }

    let parsed: FfprobeOutput = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe json: {}", e))?;

    let streams = parsed.streams.unwrap_or_default();
    let video_stream = streams
        .into_iter()
        .find(|s| s.codec_type.as_deref() == Some("video"));

    let filename = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let ext = file_path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let is_video = matches!(
        ext.as_str(),
        "mp4" | "mkv" | "mov" | "avi" | "webm" | "m4v" | "flv" | "wmv"
    );

    let format_info = parsed.format.unwrap_or(FfprobeFormat {
        format_name: None,
        duration: None,
        size: None,
    });

    let size_bytes = format_info
        .size
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or_else(|| file_path.metadata().map(|m| m.len()).unwrap_or(0));

    if let Some(stream) = video_stream {
        let width = stream.width.unwrap_or(1920);
        let height = stream.height.unwrap_or(1080);
        let fps = parse_fraction(
            stream
                .avg_frame_rate
                .as_deref()
                .unwrap_or_else(|| stream.r_frame_rate.as_deref().unwrap_or("30/1")),
        );

        let duration_seconds = stream
            .duration
            .and_then(|d| d.parse::<f64>().ok())
            .or_else(|| format_info.duration.and_then(|d| d.parse::<f64>().ok()))
            .unwrap_or(0.0);

        let frame_count = stream
            .nb_frames
            .and_then(|f| f.parse::<u64>().ok())
            .unwrap_or_else(|| (duration_seconds * fps) as u64);

        let color_transfer = stream.color_transfer.unwrap_or_default();
        let is_hdr = matches!(color_transfer.as_str(), "smpte2084" | "arib-std-b67");

        Ok(MediaMetadata {
            path: file_path.to_string_lossy().to_string(),
            filename,
            is_video,
            width,
            height,
            fps,
            duration_seconds,
            frame_count: if is_video { frame_count.max(1) } else { 1 },
            codec: stream.codec_name.unwrap_or_else(|| ext.clone()),
            format: format_info.format_name.unwrap_or_else(|| ext.clone()),
            is_hdr,
            size_bytes,
        })
    } else {
        // Fallback for raw/custom formats
        Ok(MediaMetadata {
            path: file_path.to_string_lossy().to_string(),
            filename,
            is_video: false,
            width: 1920,
            height: 1080,
            fps: 0.0,
            duration_seconds: 0.0,
            frame_count: 1,
            codec: ext.clone(),
            format: ext,
            is_hdr: false,
            size_bytes,
        })
    }
}
