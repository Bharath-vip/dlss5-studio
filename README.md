# DLSS 5 Studio

<div align="center">

![DLSS 5 Studio Banner](https://img.shields.io/badge/DLSS%205%20Studio-v1.0.0-76b900?style=for-the-badge&logo=nvidia&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![GPU](https://img.shields.io/badge/GPU-NVIDIA%20RTX%20Required-76b900?style=for-the-badge&logo=nvidia&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri%202-Rust%20Core-FFC131?style=for-the-badge&logo=tauri&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

**Production-Grade AI Video & Image Enhancement Workstation**  
*Powered by NVIDIA DLSS 5 Neural Rendering · DLSS-G Frame Generation · RTX VSR Upscaling*

</div>

---

## Overview

DLSS 5 Studio is a native desktop workstation application purpose-built for NVIDIA RTX GPU owners who demand broadcast and cinema-grade AI enhancement of their video and image assets. Built with Tauri 2 (Rust) and React 19, it delivers a frameless cyberpunk-styled interface without compromising on performance or precision.

Unlike cloud-based tools or browser wrappers, DLSS 5 Studio runs entirely on your local RTX hardware — no internet required after setup.

---

## Key Features

### AI Processing Pipeline
- **DLSS 5 Neural Reconstruction & ReShade Suite (Stage 1)** — Full-resolution AI image reconstruction using NVIDIA DLSS 5 SDK. Integrated RenoDX optics (Local Tone, Local Structure, Skin Texture Preservation, Diffuse White up to 1000 Nits, Auto Motion Masking, UI Protection) and ReShade post-processing shaders:
  - **Contrast Adaptive Sharpening (CAS)**: FidelityFX edge-aware micro-contrast
  - **Clarity / High-Pass Detail**: Sub-pixel micro-contrast enhancement
  - **Cinematic Highlight Bloom**: Organic highlight light bleed simulation
  - **Chromatic Aberration**: Optical lens edge color dispersion
  - **Vignette Shading**: Anamorphic corner lens light falloff
  - **Gradient Debanding / Dither**: Eliminates color banding on sky/dark gradients
  - **Tonemapping Curves**: RenoDRT Studio, ACES Filmic, AgX Cinematic, Neutral Linear
  - **DLSS Ray Reconstruction (DLSS-RR)**: AI neural denoiser for path-traced lighting
- **Super Resolution & 4K / 8K Targets (Stage 2)** — Hardware-accelerated upscaling targeting:
  - **4K Ultra HD (3840 × 2160 - 2160p UHD)** ⭐
  - **Cinema 4K DCI (4096 × 2160)**
  - **Quad HD 1440p (2560 × 1440)**
  - **Full HD 1080p (1920 × 1080)**
  - **8K Super UHD (7680 × 4320)**
  - **Custom Dimensions & Multipliers (1.25× – 4.0×)**
  - **NVIDIA RTX Video TrueHDR**: SDR to HDR10 neural inverse tonemapping with peak luminance up to 2000 nits
- **DLSS-G Optical Flow Frame Generation (Stage 3)** — Temporal motion-estimated frame synthesis targeting 60, 120, 2x or 4x source FPS.
- **NVIDIA NVENC 10-bit HDR Export (Stage 4)** — HEVC H.265 (Main 10), AV1, or H.264 hardware-encoded output with Constant Quality CQP rate control (CQ 16 Archival → CQ 28 Streaming), Full/Limited Color Range, AAC 256kbps audio or Direct Bitstream Passthrough, and Temporal Film Grain Synthesis.

### Interactive Workstation Viewport
| Feature | Description |
|---|---|
| **Split Comparison Slider** | Drag a real-time split divider between Original and DLSS-enhanced frames |
| **Side-by-Side Dual View** | Synchronized dual-panel original/enhanced comparison |
| **4x Pixel Loupe Magnifier** | Cursor-following circular magnifier with crosshair reticle for sub-pixel AI quality inspection |
| **Zoom & Pan Canvas** | 1x – 4x canvas zoom with mouse-drag pan navigation |
| **Frame-Accurate Scrubbing** | Video transport with sub-frame stepping (←/→), loop toggle, and 0.25x–2.0x playback speed |
| **Synchronized Audio Routing** | Echo-free audio playback routing between Original and Enhanced tracks with master volume control |

### Professional Workstation UI
- **Top Menu Bar** — `File`, `View`, `Processing`, and `Diagnostics` desktop menus with keyboard shortcuts
- **Source Stream Inspector** — Deep bitstream metadata (codec, dimensions, FPS, frame count, dynamic range)
- **Workstation Preferences** — Hardware decoder selection (CUDA NVDEC, D3D11VA, Auto), VRAM ceiling, default export directory
- **Batch Render Queue** — Multi-file batch processing with real-time progress and dual-tab Render History
- **GPU Telemetry HUD** — Live VRAM usage, GPU load, driver version, and RTX compute tier display
- **Persistent Render History** — Complete session log with timestamps, elapsed render time, and quick-export actions

---

## System Requirements

| Component | Minimum | Recommended |
|---|---|---|
| **OS** | Windows 10 64-bit (Build 19041+) | Windows 11 22H2+ |
| **GPU** | NVIDIA RTX 20xx (Turing) | NVIDIA RTX 40xx (Ada Lovelace) |
| **GPU Driver** | 531.68+ | 566.x+ (DLSS 5 driver) |
| **VRAM** | 6 GB | 12 GB+ |
| **RAM** | 16 GB | 32 GB |
| **Storage** | 2 GB (app) + output space | NVMe SSD |
| **CPU** | Intel Core i5-8xxx / Ryzen 5 3xxx | Intel Core i9 / Ryzen 9 |

---

## Installation

### Option A — Pre-built Installer (Recommended)
1. Download `DLSS.5.Studio_1.0.0_x64-setup.exe` from [Releases](../../releases).
2. Run the installer as Administrator.
3. Launch **DLSS 5 Studio** from the Start Menu or Desktop shortcut.

### Option B — Build from Source

**Prerequisites:**
- [Rust](https://rustup.rs/) (stable toolchain, `rustup update stable`)
- [Node.js](https://nodejs.org/) 20+ with [pnpm](https://pnpm.io/) (`npm i -g pnpm`)
- NVIDIA RTX GPU with 531.68+ drivers
- [FFmpeg](https://ffmpeg.org/) in `bin/ffmpeg/` (bundled in release builds)

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/dlss5-studio.git
cd dlss5-studio

# Install frontend dependencies
cd dlss5-studio
pnpm install

# Run in development mode (hot reload)
pnpm tauri dev

# Build production installer
pnpm tauri build
# Output: src-tauri/target/release/bundle/nsis/DLSS.5.Studio_1.0.0_x64-setup.exe
```

---

## Project Structure

```
dlss5-studio/
├── dlss5-studio/                  # Tauri application root
│   ├── src/                       # React frontend
│   │   ├── App.tsx                # Root application & state orchestration
│   │   ├── index.css              # Global Tailwind base & custom scrollbars
│   │   ├── main.tsx               # React DOM entry point
│   │   ├── types/
│   │   │   └── pipeline.ts        # TypeScript types (PipelineConfig, GpuInfo, etc.)
│   │   └── components/
│   │       ├── TitleBar.tsx       # Frameless titlebar + workstation menu bar
│   │       ├── HeaderHud.tsx      # GPU telemetry HUD
│   │       ├── MediaDropzone.tsx  # Compact drag-and-drop media input
│   │       ├── PipelineStages.tsx # 4-stage AI pipeline configuration panel
│   │       ├── SplitSlider.tsx    # Interactive viewport (split/side/loupe/audio)
│   │       ├── BatchQueue.tsx     # Batch queue + render history tabs
│   │       ├── MediaInspectorModal.tsx # Source bitstream metadata inspector
│   │       └── PreferencesModal.tsx    # Workstation hardware preferences
│   ├── src-tauri/                 # Rust backend
│   │   ├── src/
│   │   │   ├── lib.rs             # Tauri app setup & plugin registration
│   │   │   ├── main.rs            # Binary entry point
│   │   │   ├── commands/mod.rs    # Tauri IPC command handlers
│   │   │   ├── hardware/          # GPU info detection
│   │   │   ├── media/
│   │   │   │   ├── pipeline.rs    # Multi-stage AI pipeline orchestrator
│   │   │   │   └── probe.rs       # FFprobe media metadata extraction
│   │   │   └── protocols/
│   │   │       ├── dlss5_nr.rs    # DLSS 5 Neural Reconstruction protocol
│   │   │       ├── dlss_g.rs      # DLSS-G Frame Generation protocol
│   │   │       └── rtx_vsr.rs     # RTX Video Super Resolution protocol
│   │   └── tauri.conf.json        # Tauri build & window configuration
│   └── public/                    # Static web assets (favicon, icons)
├── bin/                           # Bundled runtime binaries (FFmpeg, MPV)
├── outputs/                       # Default render output directory
├── build.bat                      # Production build script
├── launch_dlss5_studio.bat        # Development server launcher
└── README.md
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+O` | Open Media File |
| `Ctrl+S` | Export Master File As… |
| `Ctrl+,` | Workstation Preferences |
| `I` | Toggle Source Bitstream Inspector |
| `L` | Toggle 4x Pixel Loupe |
| `1` | Split Comparison View |
| `2` | Side-by-Side Dual View |
| `3` | Enhanced Bitstream Only |
| `4` | Source Bitstream Only |
| `Space` | Play / Pause (video) |
| `←` / `→` | Step Frame (video) |
| `R` | Reset Viewport Zoom & Pan |

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | Tauri 2.x (Rust) |
| **Frontend** | React 19 + TypeScript |
| **Styling** | Tailwind CSS 4 |
| **Icons** | Lucide React |
| **Build** | Vite 8 + pnpm |
| **Video Encode** | FFmpeg + NVIDIA NVENC |
| **AI Protocols** | NVIDIA DLSS 5 SDK, RTX VSR SDK, DLSS-G SDK |
| **Installer** | NSIS (Windows) via Tauri bundler |

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
Built for RTX. Engineered for precision. Made for creators.
</div>
