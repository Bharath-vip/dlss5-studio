use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Cursor, Read, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};

pub const VIDEO_MAGIC: u32 = 0x34563544; // 'D5V4'
pub const SETUP_MAGIC: u32 = 0x34505553; // 'SUP4'
pub const FRAME_MAGIC: u32 = 0x314D5246; // 'FRM1'
pub const OUT_MAGIC: u32 = 0x3154554F;   // 'OUT1'
pub const END_MAGIC: u32 = 0x31444E45;   // 'END1'

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Dlss5Settings {
    pub preset: u32,
    pub style: u32,
    pub intensity: f32,
    pub local_tone: f32,
    pub local_structure: f32,
    pub skin_structure: f32,
    pub auto_mask: u32,
    pub ui_correction: u32,
    pub dlss_model_preset: u32,
    pub perf_quality: u32,
    // RenoDX ReShade parameters
    pub global_tone: f32,
    pub color_strength: f32,
    pub transfer_strength: f32,
    pub diffuse_white_nits: f32,
    pub paper_white_scale: f32,
    pub depth_mode: u32,
    pub mvec_scale_x: f32,
    pub mvec_scale_y: f32,
    // ReShade Shader Suite
    pub cas_sharpening: f32,
    pub clarity: f32,
    pub bloom_threshold: f32,
    pub chroma_aberration: f32,
    pub vignette: f32,
    pub deband: u32,
    pub tonemapper: u32,
    pub ray_reconstruction: bool,
    // Realism & Deep Pixel Parameters
    pub realism_mode: String,
    pub delineation: f32,
    pub texture_synthesis: f32,
    pub cel_shade_smoothing: f32,
    pub hard_detail_dlss: f32,
    pub specular_restoration: f32,
    pub gamut_rebalance: f32,
}

impl Default for Dlss5Settings {
    fn default() -> Self {
        Self {
            preset: 0,
            style: 2, // Cinematic default
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
            realism_mode: "real_to_ultra_real".to_string(),
            delineation: 0.0,
            texture_synthesis: 1.0,
            cel_shade_smoothing: 0.0,
            hard_detail_dlss: 1.5,
            specular_restoration: 1.2,
            gamut_rebalance: 1.0,
        }
    }
}

pub fn perf_quality_for_factor(factor: f32) -> u32 {
    if (factor - 1.0).abs() < 0.05 {
        5 // DLAA
    } else if factor <= 1.55 {
        2 // Quality (1.5x)
    } else if factor <= 1.85 {
        1 // Balanced (1.724x)
    } else if factor <= 2.2 {
        0 // Performance (2.0x -> standard 1080p to 4K)
    } else {
        3 // Ultra Performance (3.0x+ -> 720p to 4K or 1080p to 8K)
    }
}

pub fn sync_reshade_ini(host_dir: &Path, settings: &Dlss5Settings, is_upscaling: bool) -> io::Result<()> {
    let ini_path = host_dir.join("ReShade.ini");
    let content = format!(
        "[ADDON]\nAddonPath=..\\dlssnr\n\n[RenoDX.DLSS5]\nEnableHooks=2\nNREnableUpscaling={}\nNRPreset={}\nNRStyle={}\nNRAutoMask={}\nNRUICorrection={}\nNRIntensity={:.4}\nNRLocalTone={:.4}\nNRLocalStructure={:.4}\nNRSkinStructure={:.4}\nNRGlobalTone={:.4}\nNRColorStrength={:.4}\nNRTransferStrength={:.4}\nNRDiffuseWhiteNits={:.4}\nNRPaperWhiteScale={:.4}\nNRDepthMode={}\nNRMVecScaleX={:.4}\nNRMVecScaleY={:.4}\nNRRealismMode={}\nNRDelineation={:.4}\nNRTextureSynthesis={:.4}\nNRCelShadeSmoothing={:.4}\nNRHardDetail={:.4}\nNRSpecularRestoration={:.4}\nNRGamutRebalance={:.4}\n\n[ReShade.DLSS5.Shaders]\nCASSharpening={:.4}\nClarity={:.4}\nBloomThreshold={:.4}\nChromaAberration={:.4}\nVignette={:.4}\nDeband={}\nTonemapper={}\nRayReconstruction={}\n",
        if is_upscaling { 1 } else { 0 },
        settings.preset,
        settings.style,
        settings.auto_mask,
        settings.ui_correction,
        settings.intensity,
        settings.local_tone,
        settings.local_structure,
        settings.skin_structure,
        settings.global_tone,
        settings.color_strength,
        settings.transfer_strength,
        settings.diffuse_white_nits,
        settings.paper_white_scale,
        settings.depth_mode,
        settings.mvec_scale_x,
        settings.mvec_scale_y,
        settings.realism_mode,
        settings.delineation,
        settings.texture_synthesis,
        settings.cel_shade_smoothing,
        settings.hard_detail_dlss,
        settings.specular_restoration,
        settings.gamut_rebalance,
        settings.cas_sharpening,
        settings.clarity,
        settings.bloom_threshold,
        settings.chroma_aberration,
        settings.vignette,
        settings.deband,
        settings.tonemapper,
        if settings.ray_reconstruction { 1 } else { 0 },
    );
    fs::write(ini_path, content)
}

pub struct Dlss5Session {
    pub child: Child,
    pub input_width: u32,
    pub input_height: u32,
    pub output_width: u32,
    pub output_height: u32,
    pub render_width: u32,
    pub render_height: u32,
}

impl Dlss5Session {
    pub fn start(
        runtime_host_dir: &Path,
        input_width: u32,
        input_height: u32,
        output_width: u32,
        output_height: u32,
        frame_count: Option<u32>,
        warmup_frames: u32,
        settings: &Dlss5Settings,
    ) -> Result<Self, String> {
        let is_upscaling = output_width > input_width || output_height > input_height;
        sync_reshade_ini(runtime_host_dir, settings, is_upscaling)
            .map_err(|e| format!("Failed to sync ReShade.ini: {}", e))?;

        let worker_bin = runtime_host_dir.join("dlss5-worker.exe");
        let worker_bin = if worker_bin.exists() {
            worker_bin
        } else {
            let alt = runtime_host_dir.join("dlss5-feed-host.exe");
            if alt.exists() {
                alt
            } else {
                return Err("DLSS 5 host worker binary not found; using GPU shader and VSR cascade".into());
            }
        };

        let mut cmd = Command::new(&worker_bin);
        cmd.arg("--video");
        let gpu = crate::hardware::detect_primary_gpu();
        if !gpu.luid.is_empty() && gpu.luid.len() == 16 {
            cmd.args(["--adapter-luid", &gpu.luid]);
        }

        let mut child = cmd
            .current_dir(runtime_host_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn DLSS 5 worker: {}", e))?;


        let stdin = child.stdin.as_mut().ok_or("Failed to open stdin for worker")?;

        // Construct 14x u32 + 4x f32 header (<14I4f = 72 bytes)
        let mut header = Vec::with_capacity(72);
        header.write_u32::<LittleEndian>(VIDEO_MAGIC).unwrap();
        header.write_u32::<LittleEndian>(input_width).unwrap();
        header.write_u32::<LittleEndian>(input_height).unwrap();
        header.write_u32::<LittleEndian>(output_width).unwrap();
        header.write_u32::<LittleEndian>(output_height).unwrap();
        header.write_u32::<LittleEndian>(warmup_frames).unwrap();
        header.write_u32::<LittleEndian>(frame_count.unwrap_or(0)).unwrap();
        header.write_u32::<LittleEndian>(settings.perf_quality).unwrap();
        header.write_u32::<LittleEndian>(settings.dlss_model_preset).unwrap();
        header.write_u32::<LittleEndian>(0).unwrap(); // profile
        header.write_u32::<LittleEndian>(settings.preset).unwrap();
        header.write_u32::<LittleEndian>(settings.style).unwrap();
        header.write_u32::<LittleEndian>(settings.auto_mask).unwrap();
        header.write_u32::<LittleEndian>(settings.ui_correction).unwrap();
        header.write_f32::<LittleEndian>(settings.intensity).unwrap();
        header.write_f32::<LittleEndian>(settings.local_tone).unwrap();
        header.write_f32::<LittleEndian>(settings.local_structure).unwrap();
        header.write_f32::<LittleEndian>(settings.skin_structure).unwrap();

        stdin.write_all(&header).map_err(|e| format!("Failed to write header: {}", e))?;
        stdin.flush().map_err(|e| format!("Failed to flush header: {}", e))?;

        // Read 12x u32 setup response (<12I = 48 bytes)
        let stdout = child.stdout.as_mut().ok_or("Failed to open stdout for worker")?;
        let mut setup_buf = [0u8; 48];
        stdout.read_exact(&mut setup_buf).map_err(|e| format!("Failed to read setup response: {}", e))?;

        let mut rdr = Cursor::new(&setup_buf);
        let setup_magic = rdr.read_u32::<LittleEndian>().unwrap();
        let setup_ok = rdr.read_u32::<LittleEndian>().unwrap();
        let _result_code = rdr.read_u32::<LittleEndian>().unwrap();
        let render_w = rdr.read_u32::<LittleEndian>().unwrap();
        let render_h = rdr.read_u32::<LittleEndian>().unwrap();

        if setup_magic != SETUP_MAGIC || setup_ok == 0 {
            return Err(format!("Worker setup failed: magic=0x{:X}, ok={}", setup_magic, setup_ok));
        }

        Ok(Self {
            child,
            input_width,
            input_height,
            output_width,
            output_height,
            render_width: render_w,
            render_height: render_h,
        })
    }

    pub fn process_frame(
        &mut self,
        index: u32,
        reset: bool,
        pts: i64,
        rgba_input: &[u8],
        rgba_output: &mut [u8],
    ) -> Result<(), String> {
        let stdin = self.child.stdin.as_mut().ok_or("Worker stdin closed")?;

        // Write frame header (<4Iq = 24 bytes)
        let mut f_hdr = [0u8; 24];
        let mut cur = Cursor::new(&mut f_hdr[..]);
        cur.write_u32::<LittleEndian>(FRAME_MAGIC).unwrap();
        cur.write_u32::<LittleEndian>(index).unwrap();
        cur.write_u32::<LittleEndian>(if reset { 1 } else { 0 }).unwrap();
        cur.write_u32::<LittleEndian>(0).unwrap();
        cur.write_i64::<LittleEndian>(pts).unwrap();

        stdin.write_all(&f_hdr).map_err(|e| format!("Write frame header error: {}", e))?;
        stdin.write_all(rgba_input).map_err(|e| format!("Write frame body error: {}", e))?;

        // Worker requires motion vectors (float16 [render_h, render_w, 2] = render_w * render_h * 4 bytes)
        let motion_bytes = (self.render_width * self.render_height * 4) as usize;
        let zero_motion = vec![0u8; motion_bytes];
        stdin.write_all(&zero_motion).map_err(|e| format!("Write motion vectors error: {}", e))?;
        stdin.flush().map_err(|e| format!("Flush frame error: {}", e))?;

        // Read response header (<5Iq = 28 bytes: magic, out_index, ok, byte_count, ngx_result, out_pts)
        let stdout = self.child.stdout.as_mut().ok_or("Worker stdout closed")?;
        let mut out_hdr = [0u8; 28];
        stdout.read_exact(&mut out_hdr).map_err(|e| format!("Read out header error: {}", e))?;

        let mut rdr = Cursor::new(&out_hdr);
        let magic = rdr.read_u32::<LittleEndian>().unwrap();
        let out_idx = rdr.read_u32::<LittleEndian>().unwrap();
        let ok = rdr.read_u32::<LittleEndian>().unwrap();
        let byte_count = rdr.read_u32::<LittleEndian>().unwrap() as usize;
        let ngx_result = rdr.read_u32::<LittleEndian>().unwrap();
        let _out_pts = rdr.read_i64::<LittleEndian>().unwrap();

        if magic != OUT_MAGIC || ok == 0 || out_idx != index {
            return Err(format!("Worker frame error: magic=0x{:X}, ok={}, index={}/{}", magic, ok, out_idx, index));
        }

        if ngx_result != 1 {
            return Err(format!("Feature 18 direct evaluation failed: 0x{:08X}", ngx_result));
        }

        if byte_count != rgba_output.len() {
            return Err(format!("Byte count mismatch: expected {}, got {}", rgba_output.len(), byte_count));
        }

        // Read enhanced frame buffer
        stdout.read_exact(rgba_output).map_err(|e| format!("Read enhanced frame buffer error: {}", e))?;
        Ok(())
    }

    pub fn finish(&mut self, total_frames: u32) -> Result<(), String> {
        if let Some(mut stdin) = self.child.stdin.take() {
            let mut end_hdr = [0u8; 24];
            let mut cur = Cursor::new(&mut end_hdr[..]);
            cur.write_u32::<LittleEndian>(END_MAGIC).unwrap();
            cur.write_u32::<LittleEndian>(total_frames).unwrap();
            cur.write_u32::<LittleEndian>(0).unwrap();
            cur.write_u32::<LittleEndian>(0).unwrap();
            cur.write_i64::<LittleEndian>(0).unwrap();
            let _ = stdin.write_all(&end_hdr);
            let _ = stdin.flush();
            drop(stdin);
        }
        if let Some(stdout) = self.child.stdout.as_mut() {
            let mut ack = [0u8; 28];
            let _ = stdout.read_exact(&mut ack);
        }
        let _ = self.child.wait();
        Ok(())
    }
}
