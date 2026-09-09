use byteorder::{LittleEndian, ReadBytesExt, WriteBytesExt};
use std::io::{Cursor, Read, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};

pub const SETUP_MAGIC: u32 = 0x31534746;     // 'FGS1'
pub const SETUP_OUT_MAGIC: u32 = 0x31524746; // 'FGR1'
pub const FRAME_MAGIC: u32 = 0x31464746;     // 'FGF1'
pub const FRAME_OUT_MAGIC: u32 = 0x314F4746; // 'FGO1'

pub struct DlssGSession {
    pub child: Child,
    pub width: u32,
    pub height: u32,
    pub generated_count: u32,
    pub next_index: u32,
    color_bytes: usize,
    #[allow(dead_code)]
    motion_bytes: usize,
}

impl DlssGSession {
    pub fn start(
        runtime_dir: &Path,
        width: u32,
        height: u32,
        total_frames: u32,
        multiplier: u32, // e.g. 2 for 2x fps
    ) -> Result<Self, String> {
        let worker_bin = runtime_dir.join("dlssg-worker.exe");
        if !worker_bin.exists() {
            return Err(format!("DLSS-G worker not found at: {:?}", worker_bin));
        }

        let mut child = Command::new(&worker_bin)
            .arg("--serve")
            .current_dir(runtime_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn DLSS-G worker: {}", e))?;

        let stdin = child.stdin.as_mut().ok_or("DLSS-G stdin closed")?;
        let generated_count = multiplier.saturating_sub(1);

        // Header: <5I (20 bytes)
        let mut header = Vec::with_capacity(20);
        header.write_u32::<LittleEndian>(SETUP_MAGIC).unwrap();
        header.write_u32::<LittleEndian>(width).unwrap();
        header.write_u32::<LittleEndian>(height).unwrap();
        header.write_u32::<LittleEndian>(total_frames.max(1)).unwrap();
        header.write_u32::<LittleEndian>(generated_count).unwrap();

        stdin.write_all(&header).map_err(|e| format!("Write DLSS-G header error: {}", e))?;
        stdin.flush().map_err(|e| format!("Flush DLSS-G header error: {}", e))?;

        // Response: <4I (16 bytes)
        let stdout = child.stdout.as_mut().ok_or("DLSS-G stdout closed")?;
        let mut resp_buf = [0u8; 16];
        stdout.read_exact(&mut resp_buf).map_err(|e| format!("Read DLSS-G setup response error: {}", e))?;

        let mut rdr = Cursor::new(&resp_buf);
        let magic = rdr.read_u32::<LittleEndian>().unwrap();
        let status = rdr.read_u32::<LittleEndian>().unwrap();

        if magic != SETUP_OUT_MAGIC || status != 0 {
            return Err(format!("DLSS-G setup failed: status={}", status));
        }

        let color_bytes = (width * height * 4) as usize;
        let motion_bytes = (width * height * 2 * 2) as usize; // float16 (2 channels, 2 bytes each)

        Ok(Self {
            child,
            width,
            height,
            generated_count,
            next_index: 0,
            color_bytes,
            motion_bytes,
        })
    }

    pub fn process_frame(
        &mut self,
        rgba: &[u8],
        motion: &[u8],
        reset: bool,
        pts_num: i64,
        pts_den: i64,
    ) -> Result<Vec<Vec<u8>>, String> {
        let stdin = self.child.stdin.as_mut().ok_or("DLSS-G stdin closed")?;

        // Request: <4I2q (32 bytes)
        let mut req_hdr = [0u8; 32];
        let mut cur = Cursor::new(&mut req_hdr[..]);
        cur.write_u32::<LittleEndian>(FRAME_MAGIC).unwrap();
        cur.write_u32::<LittleEndian>(self.next_index).unwrap();
        cur.write_u32::<LittleEndian>(if reset { 1 } else { 0 }).unwrap();
        cur.write_u32::<LittleEndian>(0).unwrap();
        cur.write_i64::<LittleEndian>(pts_num).unwrap();
        cur.write_i64::<LittleEndian>(pts_den).unwrap();

        stdin.write_all(&req_hdr).map_err(|e| format!("Write DLSS-G frame header error: {}", e))?;
        stdin.write_all(rgba).map_err(|e| format!("Write DLSS-G color error: {}", e))?;
        stdin.write_all(motion).map_err(|e| format!("Write DLSS-G motion error: {}", e))?;
        stdin.flush().map_err(|e| format!("Flush DLSS-G frame error: {}", e))?;

        self.next_index += 1;

        // Response: <4I (16 bytes)
        let stdout = self.child.stdout.as_mut().ok_or("DLSS-G stdout closed")?;
        let mut resp_hdr = [0u8; 16];
        stdout.read_exact(&mut resp_hdr).map_err(|e| format!("Read DLSS-G frame resp error: {}", e))?;

        let mut rdr = Cursor::new(&resp_hdr);
        let magic = rdr.read_u32::<LittleEndian>().unwrap();
        let status = rdr.read_u32::<LittleEndian>().unwrap();
        let generated = rdr.read_u32::<LittleEndian>().unwrap();
        let disabled = rdr.read_u32::<LittleEndian>().unwrap();

        if magic != FRAME_OUT_MAGIC || status != 0 {
            return Err(format!("DLSS-G evaluation error: status={}", status));
        }

        if disabled != 0 {
            return Ok(Vec::new());
        }

        let mut out_frames = Vec::with_capacity(generated as usize);
        for _ in 0..generated {
            let mut buf = vec![0u8; self.color_bytes];
            stdout.read_exact(&mut buf).map_err(|e| format!("Read generated frame error: {}", e))?;
            out_frames.push(buf);
        }

        Ok(out_frames)
    }

    pub fn close(&mut self) {
        let _ = self.child.kill();
    }
}
