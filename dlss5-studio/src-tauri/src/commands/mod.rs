use crate::hardware::gpu::{detect_primary_gpu, GpuInfo};
use crate::media::pipeline::{PipelineConfig, PipelineOrchestrator, PipelineResult};
use crate::media::probe::{probe_file, MediaMetadata};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, State};

pub struct AppState {
    pub orchestrator: PipelineOrchestrator,
}

impl AppState {
    pub fn new(bin_dir: PathBuf) -> Self {
        Self {
            orchestrator: PipelineOrchestrator::new(&bin_dir),
        }
    }
}

#[tauri::command]
pub fn get_gpu_info() -> GpuInfo {
    detect_primary_gpu()
}

#[tauri::command]
pub fn probe_media(
    state: State<'_, Mutex<AppState>>,
    paths: Vec<String>,
) -> Result<Vec<MediaMetadata>, String> {
    let state = state.lock().map_err(|_| "Failed to lock state")?;
    let ffprobe_path = &state.orchestrator.ffprobe_path;

    let mut results = Vec::new();
    for p in paths {
        let path = Path::new(&p);
        match probe_file(ffprobe_path, path) {
            Ok(meta) => results.push(meta),
            Err(e) => eprintln!("Error probing {:?}: {}", path, e),
        }
    }
    Ok(results)
}

#[tauri::command]
pub async fn start_pipeline(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    config: PipelineConfig,
) -> Result<PipelineResult, String> {
    let (orchestrator_clone, ffprobe_path) = {
        let state = state.lock().map_err(|_| "Failed to lock state")?;
        (
            state.orchestrator.clone(),
            state.orchestrator.ffprobe_path.clone(),
        )
    };

    let in_path = Path::new(&config.input_path);
    let meta = probe_file(&ffprobe_path, in_path)
        .map_err(|e| format!("Failed to probe media: {}", e))?;

    let job_id = uuid::Uuid::new_v4().to_string();

    tokio::task::spawn_blocking(move || {
        orchestrator_clone.execute(Some(&app), &config, &meta, &job_id)
    })
    .await
    .map_err(|e| format!("Task execution error: {}", e))?
}

#[tauri::command]
pub fn cancel_pipeline(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
    let state = state.lock().map_err(|_| "Failed to lock state")?;
    state.orchestrator.cancel();
    Ok(())
}

#[tauri::command]
pub fn open_output_dir(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    let target = if p.is_dir() {
        p
    } else {
        p.parent().unwrap_or(p)
    };

    Command::new("explorer")
        .arg(target)
        .spawn()
        .map_err(|e| format!("Failed to open explorer: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn load_media_data_url(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    let bytes = std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("png").to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        _ => "application/octet-stream",
    };
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub fn read_media_bytes(path: String) -> Result<Vec<u8>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn export_file_as(source_path: String, destination_path: String) -> Result<(), String> {
    let src = Path::new(&source_path);
    let dst = Path::new(&destination_path);
    if !src.exists() {
        return Err(format!("Source file does not exist: {}", source_path));
    }
    if let Some(parent) = dst.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::copy(src, dst).map_err(|e| format!("Failed to export file: {}", e))?;
    Ok(())
}
