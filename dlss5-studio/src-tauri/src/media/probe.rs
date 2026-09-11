use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PixelTelemetry {
    pub mean_luminance: f32,       // 0-255 scale
    pub peak_luminance_nits: f32,  // Estimated peak luminance (nits)
    pub dynamic_range_db: f32,     // Dynamic range in dB
    pub shadow_floor: f32,         // Lowest luma floor (0-255)
    pub highlight_ceiling: f32,    // Highest luma (0-255)
    pub average_saturation: f32,   // 0.0 to 1.0
    pub max_saturation: f32,       // 0.0 to 1.0
    pub high_freq_energy: f32,     // High-frequency edge energy
    pub detail_entropy: f32,       // Shannon entropy (bits/pixel)
    pub flat_region_ratio: f32,    // Percentage of flat/cel-shaded pixels
    pub outline_density: f32,      // Density of high-contrast anime outlines
    pub micro_contrast_index: f32, // Sub-pixel micro-contrast (0.0 to 1.0)
    pub skin_tone_ratio: f32,      // Ratio of pixels matching human dermal chromaticity
    pub color_banding_index: f32,  // Quantization step banding artifact severity (0.0 to 1.0)
    pub specular_highlight_ratio: f32, // Density of specular reflections & highlights
    pub color_temperature_kelvin: u32, // Correlated Color Temperature in Kelvin (CCT)
    pub snr_db: f32,               // Signal-to-Noise Ratio (dB)
    pub anime_score: f32,          // 0.0 to 1.0 (Anime / 2D animation likelihood)
    pub photoreal_score: f32,      // 0.0 to 1.0 (Photorealistic live-action likelihood)
    pub hyper_real_score: f32,     // 0.0 to 1.0 (Real-to-Ultra-Real capacity rating)
    pub detected_type: String,     // "Anime / 2D Animation", "Photorealistic Live-Action", "CGI / Mixed Hybrid"
    pub recommended_mode: String,  // "anime_to_real", "real_to_ultra_real", "cinema_master"
    pub color_gamut: String,       // "BT.709 (SDR Standard)", "DCI-P3 (Cinema Gamut)", "BT.2020 (HDR)"
    pub recommended_hard_detail: f32,
    pub recommended_delineation: f32,
    pub recommended_texture_synthesis: f32,
    pub recommended_deband: u32,
    pub recommended_cas: f32,
}

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
    pub pixel_telemetry: Option<PixelTelemetry>,
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

pub fn compute_pixel_telemetry(
    ffmpeg_path: &Path,
    file_path: &Path,
    is_hdr: bool,
    is_video: bool,
    duration_seconds: f64,
) -> Option<PixelTelemetry> {
    let mut raw_bytes = None;

    // For video streams, probe a representative non-intro content frame (e.g. 1.0s or 10% into duration)
    // to avoid black fade-ins or empty intro frames that skew histograms
    if is_video && duration_seconds > 0.5 {
        let seek_time = (duration_seconds * 0.1).clamp(0.5, 3.0);
        let seek_str = format!("{:.2}", seek_time);
        if let Ok(output) = Command::new(ffmpeg_path)
            .args([
                "-v", "error",
                "-ss", &seek_str,
                "-i", file_path.to_str()?,
                "-vframes", "1",
                "-s", "320x180",
                "-f", "rawvideo",
                "-pix_fmt", "rgba",
                "-",
            ])
            .output()
        {
            if output.status.success() && output.stdout.len() >= 320 * 180 * 4 {
                // Verify this frame is not a near-black screen (sample first 200 pixels)
                let sample_luma: u32 = output.stdout.chunks_exact(4).take(200)
                    .map(|c| (c[0] as u32 + c[1] as u32 + c[2] as u32) / 3)
                    .sum();
                if sample_luma > 200 * 5 {
                    raw_bytes = Some(output.stdout);
                }
            }
        }
    }

    if raw_bytes.is_none() {
        let output = Command::new(ffmpeg_path)
            .args([
                "-v", "error",
                "-i", file_path.to_str()?,
                "-vframes", "1",
                "-s", "320x180",
                "-f", "rawvideo",
                "-pix_fmt", "rgba",
                "-",
            ])
            .output()
            .ok()?;

        if !output.status.success() || output.stdout.len() < 320 * 180 * 4 {
            return None;
        }
        raw_bytes = Some(output.stdout);
    }

    let raw = raw_bytes?;
    analyze_rgba_buffer(&raw, 320, 180, is_hdr)
}

pub fn analyze_rgba_buffer(
    raw: &[u8],
    w: usize,
    h: usize,
    is_hdr: bool,
) -> Option<PixelTelemetry> {
    if raw.len() < w * h * 4 {
        return None;
    }

    let total_pixels = w * h;

    let mut luma = Vec::with_capacity(total_pixels);
    let mut hist = [0u32; 256];
    let mut sum_luma = 0.0f32;
    let mut min_luma = 255.0f32;
    let mut max_luma = 0.0f32;
    let mut sum_sat = 0.0f32;
    let mut max_sat = 0.0f32;
    let mut sum_r = 0.0f32;
    let mut sum_g = 0.0f32;
    let mut sum_b = 0.0f32;
    let mut skin_pixel_count = 0u32;

    for i in 0..total_pixels {
        let offset = i * 4;
        let r = raw[offset] as f32;
        let g = raw[offset + 1] as f32;
        let b = raw[offset + 2] as f32;

        sum_r += r;
        sum_g += g;
        sum_b += b;

        let y = (0.2126 * r + 0.7152 * g + 0.0722 * b).clamp(0.0, 255.0);
        luma.push(y);

        let y_idx = (y.round() as usize).min(255);
        hist[y_idx] += 1;

        sum_luma += y;
        if y < min_luma { min_luma = y; }
        if y > max_luma { max_luma = y; }

        let c_max = r.max(g).max(b);
        let c_min = r.min(g).min(b);
        let sat = if c_max > 0.0 { (c_max - c_min) / c_max } else { 0.0 };
        sum_sat += sat;
        if sat > max_sat { max_sat = sat; }

        // Human dermal skin chromaticity model in YCbCr:
        // Cb in [77..127], Cr in [133..173], Y >= 28
        let cb = 128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        let cr = 128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        if y >= 28.0 && cb >= 77.0 && cb <= 127.0 && cr >= 133.0 && cr <= 173.0 {
            skin_pixel_count += 1;
        }
    }

    let mean_luma = sum_luma / (total_pixels as f32);
    let avg_sat = sum_sat / (total_pixels as f32);
    let skin_tone_ratio = (skin_pixel_count as f32 / total_pixels as f32).clamp(0.0, 1.0);

    // Detail Entropy (Shannon entropy over 256 luma bins)
    let mut entropy = 0.0f32;
    let n_f = total_pixels as f32;
    for &count in &hist {
        if count > 0 {
            let p = count as f32 / n_f;
            entropy -= p * p.log2();
        }
    }

    // Dynamic range in dB
    let dynamic_range_db = 20.0 * ((max_luma - min_luma + 1.0).max(1.0)).log10();

    // Estimated peak nits
    let peak_nits = if is_hdr {
        600.0 + (max_luma / 255.0) * 1400.0
    } else {
        80.0 + (max_luma / 255.0) * 170.0
    };

    // Edge, Cel-Shading, Banding, and Sub-pixel Spatial Analysis
    let mut flat_count = 0u32;
    let mut outline_count = 0u32;
    let mut sum_laplacian_sq = 0.0f32;
    let mut sum_fine_grad = 0.0f32;
    let mut banding_step_count = 0u32;
    let mut specular_count = 0u32;
    let mut flat_variance_sum = 0.0f32;
    let mut interior_count = 0u32;

    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            interior_count += 1;
            let idx = y * w + x;
            let yc = luma[idx];
            let y_left = luma[idx - 1];
            let y_right = luma[idx + 1];
            let y_up = luma[idx - w];
            let y_down = luma[idx + w];

            let dx = (y_right - y_left).abs() * 0.5;
            let dy = (y_down - y_up).abs() * 0.5;
            let grad = (dx * dx + dy * dy).sqrt();

            let fine_g = ((yc - y_left).abs() + (yc - y_right).abs() + (yc - y_up).abs() + (yc - y_down).abs()) * 0.25;
            sum_fine_grad += fine_g;

            let lap = (4.0 * yc - y_left - y_right - y_up - y_down).abs();
            sum_laplacian_sq += lap * lap;

            if grad < 4.0 {
                flat_count += 1;
                // Quantization false-contour check in smooth regions: discrete 1..2.5 unit steps
                let step_x = (y_right - yc).abs();
                let step_y = (y_down - yc).abs();
                if (step_x >= 0.8 && step_x <= 2.2) || (step_y >= 0.8 && step_y <= 2.2) {
                    banding_step_count += 1;
                }
                let diff = yc - mean_luma;
                flat_variance_sum += diff * diff;
            } else if grad > 22.0 {
                let left_grad = (yc - y_left).abs();
                let right_grad = (y_right - yc).abs();
                if (left_grad < 5.0 && right_grad > 18.0) || (right_grad < 5.0 && left_grad > 18.0) {
                    outline_count += 1;
                }
            }

            if yc > 225.0 && grad > 12.0 {
                specular_count += 1;
            }
        }
    }

    let int_f = interior_count.max(1) as f32;
    let flat_ratio = flat_count as f32 / int_f;
    let outline_density = outline_count as f32 / int_f;
    let high_freq_energy = (sum_laplacian_sq / int_f).sqrt();
    let micro_contrast_index = (sum_fine_grad / (int_f * mean_luma.max(15.0))).clamp(0.01, 1.0);
    let color_banding_index = (banding_step_count as f32 / flat_count.max(1) as f32).clamp(0.0, 1.0);
    let specular_highlight_ratio = (specular_count as f32 / int_f).clamp(0.0, 1.0);

    // Correlated Color Temperature (CCT Kelvin via CIE 1931 chromaticity & McCamy's approximation)
    let total_rgb = (sum_r + sum_g + sum_b).max(1.0);
    let r_norm = sum_r / total_rgb;
    let g_norm = sum_g / total_rgb;
    let b_norm = sum_b / total_rgb;

    let x_cie = 0.4124 * r_norm + 0.3576 * g_norm + 0.1805 * b_norm;
    let y_cie = 0.2126 * r_norm + 0.7152 * g_norm + 0.0722 * b_norm;
    let z_cie = 0.0193 * r_norm + 0.1192 * g_norm + 0.9505 * b_norm;
    let sum_xyz = (x_cie + y_cie + z_cie).max(0.0001);
    let x_chroma = x_cie / sum_xyz;
    let y_chroma = y_cie / sum_xyz;

    let n_denom = y_chroma - 0.1858;
    let color_temperature_kelvin = if n_denom.abs() > 0.001 {
        let n_c = (x_chroma - 0.3320) / n_denom;
        let cct = 449.0 * n_c.powi(3) + 3525.0 * n_c.powi(2) + 6823.3 * n_c + 5520.33;
        cct.clamp(2000.0, 15000.0) as u32
    } else {
        6500 // D65 daylight standard
    };


    // Signal-to-Noise Ratio (dB) estimated from flat region luma variance
    let flat_noise_sigma = ((flat_variance_sum / flat_count.max(1) as f32).sqrt()).max(0.05);
    let snr_db = (20.0 * (mean_luma.max(1.0) / flat_noise_sigma).log10()).clamp(16.0, 60.0);

    // AI Anime vs Photorealism Classifier
    let anime_signal = (flat_ratio * 2.4) + (outline_density * 4.5) + (avg_sat * 0.7) - ((entropy - 5.2).max(0.0) * 0.35);
    let anime_score = (1.0 / (1.0 + (-3.2 * (anime_signal - 0.75)).exp())).clamp(0.02, 0.98);
    let photoreal_score = 1.0 - anime_score;
    let hyper_real_score = ((dynamic_range_db / 48.0) * 0.45 + (entropy / 7.5) * 0.35 + photoreal_score * 0.20).clamp(0.05, 0.99);

    let (detected_type, recommended_mode) = if anime_score >= 0.55 {
        ("Anime / 2D Animation".to_string(), "anime_to_real".to_string())
    } else if photoreal_score >= 0.55 {
        ("Photorealistic Live-Action".to_string(), "real_to_ultra_real".to_string())
    } else {
        ("CGI / Mixed Hybrid".to_string(), "cinema_master".to_string())
    };

    let color_gamut = if is_hdr {
        "BT.2020 (HDR Wide Gamut)".to_string()
    } else if max_sat > 0.88 {
        "DCI-P3 (Cinema Gamut)".to_string()
    } else {
        "BT.709 (SDR Standard)".to_string()
    };

    // Telemetry-calibrated optimal DLSS 5 parameter recommendations
    let recommended_hard_detail = if anime_score >= 0.55 {
        1.45
    } else {
        (1.40 + 0.45 * (1.0 - micro_contrast_index) + 0.15 * hyper_real_score).clamp(1.2, 2.0)
    };

    let recommended_delineation = if anime_score >= 0.55 {
        (outline_density * 9.0 + flat_ratio * 0.7).clamp(0.6, 2.0)
    } else {
        0.0
    };

    let recommended_texture_synthesis = (1.10 + skin_tone_ratio * 1.5 + if anime_score >= 0.55 { 0.25 } else { 0.1 }).clamp(0.8, 2.0);

    let recommended_deband = if color_banding_index > 0.12 || anime_score >= 0.55 {
        2
    } else if color_banding_index > 0.03 {
        1
    } else {
        0
    };

    let recommended_cas = if anime_score >= 0.55 {
        0.35
    } else {
        (0.42 + 0.28 * (1.0 - micro_contrast_index)).clamp(0.25, 0.85)
    };

    Some(PixelTelemetry {
        mean_luminance: mean_luma,
        peak_luminance_nits: peak_nits,
        dynamic_range_db,
        shadow_floor: min_luma,
        highlight_ceiling: max_luma,
        average_saturation: avg_sat,
        max_saturation: max_sat,
        high_freq_energy,
        detail_entropy: entropy,
        flat_region_ratio: flat_ratio,
        outline_density,
        micro_contrast_index,
        skin_tone_ratio,
        color_banding_index,
        specular_highlight_ratio,
        color_temperature_kelvin,
        snr_db,
        anime_score,
        photoreal_score,
        hyper_real_score,
        detected_type,
        recommended_mode,
        color_gamut,
        recommended_hard_detail,
        recommended_delineation,
        recommended_texture_synthesis,
        recommended_deband,
        recommended_cas,
    })
}

pub fn probe_file(
    ffprobe_path: &Path,
    ffmpeg_path: Option<&Path>,
    file_path: &Path,
) -> Result<MediaMetadata, String> {
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

        let pixel_telemetry = if let Some(ffmpeg) = ffmpeg_path {
            compute_pixel_telemetry(ffmpeg, file_path, is_hdr, is_video, duration_seconds)
        } else {
            None
        };

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
            pixel_telemetry,
        })
    } else {
        let pixel_telemetry = if let Some(ffmpeg) = ffmpeg_path {
            compute_pixel_telemetry(ffmpeg, file_path, false, false, 0.0)
        } else {
            None
        };

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
            pixel_telemetry,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_rgba_buffer_anime_synthetic() {
        let w = 40;
        let h = 40;
        let mut raw = vec![0u8; w * h * 4];

        // Fill with flat cartoon color blocks and dark ink outlines
        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                if x == 10 || x == 30 || y == 10 || y == 30 {
                    // Dark line art outline
                    raw[idx] = 10;
                    raw[idx + 1] = 10;
                    raw[idx + 2] = 10;
                    raw[idx + 3] = 255;
                } else if x < 20 {
                    // Flat cel shade block 1: bright vivid cyan
                    raw[idx] = 240;
                    raw[idx + 1] = 180;
                    raw[idx + 2] = 50;
                    raw[idx + 3] = 255;
                } else {
                    // Flat cel shade block 2: bright vivid pink
                    raw[idx] = 250;
                    raw[idx + 1] = 80;
                    raw[idx + 2] = 120;
                    raw[idx + 3] = 255;
                }
            }
        }

        let telemetry = analyze_rgba_buffer(&raw, w, h, false).expect("Telemetry analysis failed");
        assert!(telemetry.anime_score > 0.5, "Expected high anime score for cel-shaded art, got {}", telemetry.anime_score);
        assert_eq!(telemetry.detected_type, "Anime / 2D Animation");
        assert_eq!(telemetry.recommended_mode, "anime_to_real");
        assert!(telemetry.flat_region_ratio > 0.3, "Expected high flat ratio, got {}", telemetry.flat_region_ratio);
        assert!(telemetry.outline_density > 0.02, "Expected outlines, got {}", telemetry.outline_density);
        assert!(telemetry.recommended_delineation > 0.5);
    }

    #[test]
    fn test_analyze_rgba_buffer_photoreal_synthetic() {
        let w = 40;
        let h = 40;
        let mut raw = vec![0u8; w * h * 4];

        // Fill with continuous gradient + high-frequency texture noise (simulating camera capture)
        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                let noise = ((x * 17 + y * 31) % 45) as u8;
                let grad = ((x * 3 + y * 2) % 180) as u8;
                raw[idx] = 60 + grad / 2 + noise;
                raw[idx + 1] = 70 + grad / 2 + (noise / 2);
                raw[idx + 2] = 80 + grad / 2 + (noise / 3);
                raw[idx + 3] = 255;
            }
        }

        let telemetry = analyze_rgba_buffer(&raw, w, h, false).expect("Telemetry analysis failed");
        assert!(telemetry.photoreal_score > 0.5, "Expected high photoreal score for natural texture, got {}", telemetry.photoreal_score);
        assert_eq!(telemetry.detected_type, "Photorealistic Live-Action");
        assert_eq!(telemetry.recommended_mode, "real_to_ultra_real");
        assert!(telemetry.detail_entropy > 4.5, "Expected high detail entropy, got {}", telemetry.detail_entropy);
        assert!(telemetry.hyper_real_score > 0.3);
        assert!(telemetry.recommended_hard_detail >= 1.2);
    }

    #[test]
    fn test_analyze_rgba_buffer_hdr_scaling() {
        let w = 20;
        let h = 20;
        let mut raw = vec![250u8; w * h * 4];
        for i in 0..w * h {
            raw[i * 4 + 3] = 255;
        }

        let sdr_telemetry = analyze_rgba_buffer(&raw, w, h, false).unwrap();
        let hdr_telemetry = analyze_rgba_buffer(&raw, w, h, true).unwrap();

        assert!(sdr_telemetry.peak_luminance_nits <= 250.0);
        assert!(hdr_telemetry.peak_luminance_nits >= 1000.0);
        assert_eq!(hdr_telemetry.color_gamut, "BT.2020 (HDR Wide Gamut)");
    }

    #[test]
    fn test_analyze_rgba_buffer_skin_and_banding() {
        let w = 40;
        let h = 40;
        let mut raw = vec![0u8; w * h * 4];

        // Fill with human skin tone pixels (e.g. R=220, G=160, B=130) with stepped banding
        for y in 0..h {
            for x in 0..w {
                let idx = (y * w + x) * 4;
                // stepped gradient creates 1-2 unit banding
                let step = (x / 5) as u8 * 2;
                raw[idx] = 210 + step;
                raw[idx + 1] = 150 + step;
                raw[idx + 2] = 120 + step;
                raw[idx + 3] = 255;
            }
        }

        let telemetry = analyze_rgba_buffer(&raw, w, h, false).expect("Telemetry analysis failed");
        assert!(telemetry.skin_tone_ratio > 0.8, "Expected high skin tone ratio, got {}", telemetry.skin_tone_ratio);
        assert!(telemetry.color_temperature_kelvin >= 2500 && telemetry.color_temperature_kelvin <= 9000);
        assert!(telemetry.snr_db > 20.0);
        assert!(telemetry.recommended_texture_synthesis > 1.2);
    }
}


