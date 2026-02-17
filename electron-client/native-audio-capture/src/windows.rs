use crate::AudioApplication;
use tokio::sync::mpsc;

#[cfg(windows)]
use windows::{
    core::*,
    Win32::{
        Foundation::*,
        Media::Audio::*,
        System::Com::*,
    },
};

#[cfg(windows)]
pub struct WindowsAudioCapture {
    #[allow(dead_code)]
    pid: u32,
    is_capturing: bool,
}

#[cfg(windows)]
impl WindowsAudioCapture {
    pub fn new(pid: u32) -> napi::Result<Self> {
        Ok(Self {
            pid,
            is_capturing: false,
        })
    }

    pub async fn start(&mut self, _sender: mpsc::UnboundedSender<Vec<f32>>) -> napi::Result<()> {
        unsafe {
            // Инициализация COM
            CoInitializeEx(None, COINIT_MULTITHREADED)?;

            // Получить IAudioSessionManager2 для работы с аудио сессиями
            let device_enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

            let default_device = device_enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)?;

            let session_manager: IAudioSessionManager2 = default_device
                .Activate(CLSCTX_ALL, None)?;

            // Получить список сессий
            let session_enum = session_manager.GetSessionEnumerator()?;
            let count = session_enum.GetCount()?;

            for i in 0..count {
                let session_control = session_enum.GetSession(i)?;
                
                // Проверить PID процесса
                if let Ok(session_control2) = session_control.cast::<IAudioSessionControl2>() {
                    if let Ok(session_pid) = session_control2.GetProcessId() {
                        if session_pid == self.pid {
                            // Нашли нужную сессию - начинаем захват
                            // TODO: Реализовать захват через IAudioCaptureClient
                            self.is_capturing = true;
                            return Ok(());
                        }
                    }
                }
            }

            Err(napi::Error::from_reason("Audio session not found for PID"))
        }
    }

    pub async fn stop(&mut self) -> napi::Result<()> {
        self.is_capturing = false;
        Ok(())
    }
}

#[cfg(windows)]
pub async fn get_audio_applications() -> Result<Vec<AudioApplication>> {
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED)?;

        let device_enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;

        let default_device = device_enumerator.GetDefaultAudioEndpoint(eRender, eConsole)?;
        let session_manager: IAudioSessionManager2 = default_device.Activate(CLSCTX_ALL, None)?;
        let session_enum = session_manager.GetSessionEnumerator()?;
        let count = session_enum.GetCount()?;

        let mut applications = Vec::new();

        for i in 0..count {
            if let Ok(session_control) = session_enum.GetSession(i) {
                if let Ok(session_control2) = session_control.cast::<IAudioSessionControl2>() {
                    if let Ok(pid) = session_control2.GetProcessId() {
                        if let Ok(display_name) = session_control.GetDisplayName() {
                            let name = display_name.to_string().unwrap_or_else(|| format!("Process {}", pid));
                            applications.push(AudioApplication {
                                pid,
                                name,
                                icon: None,
                            });
                        }
                    }
                }
            }
        }

        Ok(applications)
    }
}

