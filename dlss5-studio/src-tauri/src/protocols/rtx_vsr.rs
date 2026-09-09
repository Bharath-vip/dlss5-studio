use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};

pub const RTX_MAGIC: u32 = 0x31585452; // 'RTX1'
pub const FRAME_MAGIC: u32 = 0x314D5246; // 'FRM1'
pub const VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RtxVsrSettings {
    pub vsr_enabled: bool,
    pub vsr_quality: u32, // 1 to 4
    pub hdr_enabled: bool,
    pub hdr_contrast: i32,
    pub hdr_saturation: i32,
    pub hdr_middle_gray: i32,
    pub hdr_peak_luminance: i32,
}

impl Default for RtxVsrSettings {
    fn default() -> Self {
        Self {
            vsr_enabled: true,
            vsr_quality: 4,
            hdr_enabled: false,
            hdr_contrast: 100,
            hdr_saturation: 100,
            hdr_middle_gray: 18,
            hdr_peak_luminance: 1000,
        }
    }
}

pub struct RtxVsrSession {
    pub child: Child,
    pub input_bytes: usize,
    pub output_bytes: usize,
    pub frame_counter: u32,
}

impl RtxVsrSession {
    pub fn start(
        runtime_dir: &Path,
        gpu_luid: &str,
        width: u32,
        height: u32,
        output_width: u32,
        output_height: u32,
        settings: &RtxVsrSettings,
    ) -> Result<Self, String> {
        let worker_bin = runtime_dir.join("rtx-video-worker.exe");
        if !worker_bin.exists() {
            return Err(format!("RTX Video worker not found at: {:?}", worker_bin));
        }

        let input_bytes = (width * height * 4) as usize;
        let output_bytes = (output_width * output_height * 4) as usize;

        let mut child = Command::new(&worker_bin)
            .args(["--serve", "--gpu-luid", gpu_luid])
            .current_dir(runtime_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn RTX Video worker: {}", e))?;

        let stdin = child.stdin.as_mut().ok_or("Failed to open stdin for RTX Video worker")?;

        // Construct 15x u32 header (<15I = 60 bytes)
        let mut header = Vec::with_capacity(60);
        header.write_u32::<LittleEndian>(RTX_MAGIC).unwrap();
        header.write_u32::<LittleEndian>(VERSION).unwrap();
        header.write_u32::<LittleEndian>(width).unwrap();
        header.write_u32::<LittleEndian>(height).unwrap();
        header.write_u32::<LittleEndian>(output_width).unwrap();
        header.write_u32::<LittleEndian>(output_height).unwrap();
        header.write_u32::<LittleEndian>(2).unwrap(); // input_format (RGBA)
        header.write_u32::<LittleEndian>(2).unwrap(); // output_format (RGBA)
        header.write_u32::<LittleEndian>(if settings.vsr_enabled { 1 } else { 0 }).unwrap();
        header.write_u32::<LittleEndian>(settings.vsr_quality).unwrap();
        header.write_u32::<LittleEndian>(if settings.hdr_enabled { 1 } else { 0 }).unwrap();
        header.write_i32::<LittleEndian>(settings.hdr_contrast).unwrap();
        header.write_i32::<LittleEndian>(settings.hdr_saturation).unwrap();
        header.write_i32::<LittleEndian>(settings.hdr_middle_gray).unwrap();
        header.write_i32::<LittleEndian>(settings.hdr_peak_luminance).unwrap();

        stdin.write_all(&header).map_err(|e| format!("Failed to write RTX header: {}", e))?;
        stdin.flush().map_err(|e| format!("Failed to flush RTX header: {}", e))?;

        // Read 5x u32 response (<5I = 20 bytes)
        let stdout = child.stdout.as_mut().ok_or("Failed to open stdout for RTX Video worker")?;
        let mut resp_buf = [0u8; 20];
        stdout.read_exact(&mut resp_buf).map_err(|e| format!("Failed to read RTX setup response: {}", e))?;

        let mut rdr = Cursor::new(&resp_buf);
        let magic = rdr.read_u32::<LittleEndian>().unwrap();
        let status = rdr.read_u32::<LittleEndian>().unwrap();
        let version = rdr.read_u32::<LittleEndian>().unwrap();
        let ibytes = rdr.read_u32::<LittleEndian>().unwrap() as usize;
        let obytes = rdr.read_u32::<LittleEndian>().unwrap() as usize;

        if magic != RTX_MAGIC || status != 0 || version != VERSION || ibytes != input_bytes || obytes != output_bytes {
            return Err(format!("Invalid RTX setup response: magic=0x{:X}, status={}", magic, status));
        }

        Ok(Self {
            child,
            input_bytes,
            output_bytes,
            frame_counter: 0,
        })
    }

    pub fn process_frame(&mut self, input_pixels: &[u8], output_pixels: &mut [u8]) -> Result<(), String> {
        let stdin = self.child.stdin.as_mut().ok_or("RTX stdin closed")?;

        // Write frame header (<3I = 12 bytes)
        let mut f_hdr = [0u8; 12];
        let mut cur = Cursor::new(&mut f_hdr[..]);
        cur.write_u32::<LittleEndian>(FRAME_MAGIC).unwrap();
        cur.write_u32::<LittleEndian>(self.frame_counter).unwrap();
        cur.write_u32::<LittleEndian>(self.input_bytes as u32).unwrap();

        stdin.write_all(&f_hdr).map_err(|e| format!("Write RTX frame header error: {}", e))?;
        stdin.write_all(input_pixels).map_err(|e| format!("Write RTX frame body error: {}", e))?;
        stdin.flush().map_err(|e| format!("Flush RTX frame error: {}", e))?;

        // Read response header (<6I = 24 bytes)
        let stdout = self.child.stdout.as_mut().ok_or("RTX stdout closed")?;
        let mut out_hdr = [0u8; 24];
        stdout.read_exact(&mut out_hdr).map_err(|e| format!("Read RTX out header error: {}", e))?;

        let mut rdr = Cursor::new(&out_hdr);
        let magic = rdr.read_u32::<LittleEndian>().unwrap();
        let index = rdr.read_u32::<LittleEndian>().unwrap();
        let status = rdr.read_u32::<LittleEndian>().unwrap();
        let size = rdr.read_u32::<LittleEndian>().unwrap() as usize;

        if magic != FRAME_MAGIC || index != self.frame_counter || status != 0 || size != self.output_bytes {
            return Err(format!("RTX frame error: status=0x{:X}, size={}/{}", status, size, self.output_bytes));
        }

        stdout.read_exact(output_pixels).map_err(|e| format!("Read RTX enhanced buffer error: {}", e))?;
        self.frame_counter += 1;
        Ok(())
    }

    pub fn close(&mut self) {
        if let Some(stdin) = self.child.stdin.as_mut() {
            let _ = stdin.flush();
        }
        let _ = self.child.kill();
    }
}
