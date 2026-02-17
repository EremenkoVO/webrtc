use napi_derive::napi;
use tokio::sync::mpsc;

#[cfg(windows)]
mod windows;
#[cfg(windows)]
use windows::WindowsAudioCapture;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos::MacOSAudioCapture;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux::LinuxAudioCapture;

#[napi]
#[derive(Clone)]
pub struct AudioApplication {
    pub pid: u32,
    pub name: String,
    pub icon: Option<String>,
}

#[napi]
pub struct AudioCapture {
    #[cfg(windows)]
    capture: Option<WindowsAudioCapture>,
    #[cfg(target_os = "macos")]
    capture: Option<MacOSAudioCapture>,
    #[cfg(target_os = "linux")]
    capture: Option<LinuxAudioCapture>,
    receiver: Option<mpsc::UnboundedReceiver<Vec<f32>>>,
}

#[napi]
impl AudioCapture {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            #[cfg(windows)]
            capture: None,
            #[cfg(target_os = "macos")]
            capture: None,
            #[cfg(target_os = "linux")]
            capture: None,
            receiver: None,
        }
    }

    /// Получить список приложений с активным аудио
    #[napi]
    pub async fn get_audio_applications(&self) -> napi::Result<Vec<AudioApplication>> {
        #[cfg(windows)]
        return windows::get_audio_applications().await;
        
        #[cfg(target_os = "macos")]
        return macos::get_audio_applications().await;
        
        #[cfg(target_os = "linux")]
        return linux::get_audio_applications().await;
        
        #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
        return Ok(vec![]);
    }

    /// Начать захват аудио из приложения по PID
    #[napi]
    pub async unsafe fn start_capture(&mut self, pid: u32) -> napi::Result<()> {
        let (tx, rx) = mpsc::unbounded_channel::<Vec<f32>>();
        self.receiver = Some(rx);

        #[cfg(windows)]
        {
            let mut capture = WindowsAudioCapture::new(pid)?;
            capture.start(tx).await?;
            self.capture = Some(capture);
        }
        #[cfg(target_os = "macos")]
        {
            let mut capture = MacOSAudioCapture::new(pid)?;
            capture.start(tx).await?;
            self.capture = Some(capture);
        }
        #[cfg(target_os = "linux")]
        {
            let mut capture = LinuxAudioCapture::new(pid)?;
            capture.start(tx).await?;
            self.capture = Some(capture);
        }

        Ok(())
    }

    /// Остановить захват
    #[napi]
    pub async unsafe fn stop_capture(&mut self) -> napi::Result<()> {
        #[cfg(windows)]
        if let Some(mut capture) = self.capture.take() {
            capture.stop().await?;
        }
        #[cfg(target_os = "macos")]
        if let Some(mut capture) = self.capture.take() {
            capture.stop().await?;
        }
        #[cfg(target_os = "linux")]
        if let Some(mut capture) = self.capture.take() {
            capture.stop().await?;
        }

        self.receiver = None;
        Ok(())
    }

    /// Получить последние аудио данные (PCM Float32, 48kHz, stereo)
    /// Блокирующий вызов - получает следующий чанк данных из канала
    #[napi]
    pub async unsafe fn get_audio_data(&mut self) -> napi::Result<Vec<f32>> {
        if let Some(ref mut receiver) = self.receiver {
            match receiver.recv().await {
                Some(data) => Ok(data),
                None => Ok(vec![]), // Канал закрыт
            }
        } else {
            Ok(vec![]) // Захват не запущен
        }
    }

    /// Получить все доступные аудио данные без блокировки
    /// Собирает все данные из канала и объединяет их в один массив
    #[napi]
    pub async unsafe fn get_all_audio_data(&mut self) -> napi::Result<Vec<f32>> {
        if let Some(ref mut receiver) = self.receiver {
            let mut all_data = Vec::new();
            // Собираем все доступные данные из канала
            loop {
                match receiver.try_recv() {
                    Ok(data) => {
                        all_data.extend_from_slice(&data);
                    }
                    Err(mpsc::error::TryRecvError::Empty) => {
                        // Больше данных нет
                        break;
                    }
                    Err(mpsc::error::TryRecvError::Disconnected) => {
                        // Канал закрыт
                        break;
                    }
                }
            }
            Ok(all_data)
        } else {
            Ok(vec![]) // Захват не запущен
        }
    }
}
