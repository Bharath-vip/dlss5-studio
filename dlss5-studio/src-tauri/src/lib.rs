pub mod commands;
pub mod hardware;
pub mod media;
pub mod protocols;

use commands::{cancel_pipeline, export_file_as, get_file_info, get_gpu_info, load_media_data_url, open_output_dir, probe_media, start_pipeline, AppState};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut found_bin = None;

    if let Ok(exe_path) = std::env::current_exe() {
        let mut cur = exe_path.parent();
        for _ in 0..6 {
            if let Some(dir) = cur {
                let candidate = dir.join("bin");
                if candidate.exists() && candidate.join("ffmpeg").exists() {
                    found_bin = Some(candidate);
                    break;
                }
                cur = dir.parent();
            }
        }
    }

    if found_bin.is_none() {
        if let Ok(cwd) = std::env::current_dir() {
            let mut cur = Some(cwd.as_path());
            for _ in 0..6 {
                if let Some(dir) = cur {
                    let candidate = dir.join("bin");
                    if candidate.exists() && candidate.join("ffmpeg").exists() {
                        found_bin = Some(candidate);
                        break;
                    }
                    cur = dir.parent();
                }
            }
        }
    }

    let bin_dir = found_bin.unwrap_or_else(|| PathBuf::from("bin"));
    let canonical_bin = bin_dir.canonicalize().unwrap_or(bin_dir);
    println!("📂 Initialized DLSS 5 Studio with binaries directory: {:?}", canonical_bin);
    let app_state = AppState::new(canonical_bin);

    println!("⚡ Building Tauri App...");

    let res = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            println!("🚀 Tauri setup hook started...");
            let windows = app.webview_windows();
            println!("🪟 Windows configured: {}", windows.len());
            if let Some(main_win) = app.get_webview_window("main") {
                println!("✅ Found main window. Showing and focusing...");
                let _ = main_win.show();
                let _ = main_win.set_focus();
            } else {
                println!("⚠️ No main window found from config, creating programmatically...");
                let win = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                    .title("DLSS 5 Studio")
                    .inner_size(1400.0, 900.0)
                    .min_inner_size(1100.0, 700.0)
                    .decorations(true)
                    .build()?;
                let _ = win.show();
                let _ = win.set_focus();
                println!("✅ Programmatic window created successfully!");
            }
            Ok(())
        })
        .manage(Mutex::new(app_state))
        .invoke_handler(tauri::generate_handler![
            get_gpu_info,
            probe_media,
            start_pipeline,
            cancel_pipeline,
            open_output_dir,
            get_file_info,
            load_media_data_url,
            export_file_as
        ])
        .run(tauri::generate_context!());

    match res {
        Ok(()) => println!("Tauri run exited cleanly."),
        Err(e) => eprintln!("💥 Tauri run returned error: {:?}", e),
    }
}
