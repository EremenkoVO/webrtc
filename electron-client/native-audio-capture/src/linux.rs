use crate::AudioApplication;
use tokio::sync::mpsc;

pub struct LinuxAudioCapture {
    #[allow(dead_code)]
    pid: u32,
    is_capturing: bool,
}

impl LinuxAudioCapture {
    pub fn new(pid: u32) -> napi::Result<Self> {
        Ok(Self {
            pid,
            is_capturing: false,
        })
    }

    pub async fn start(&mut self, _sender: mpsc::UnboundedSender<Vec<f32>>) -> napi::Result<()> {
        // Linux использует PulseAudio или PipeWire для захвата аудио
        // Нужно найти sink-input по PID и начать мониторинг
        
        // TODO: Реализовать через PulseAudio API
        // Использовать pa_context_get_sink_input_info_list для поиска по PID
        // Затем создать monitor source для захвата
        
        self.is_capturing = true;
        Ok(())
    }

    pub async fn stop(&mut self) -> napi::Result<()> {
        self.is_capturing = false;
        Ok(())
    }
}

pub async fn get_audio_applications() -> napi::Result<Vec<AudioApplication>> {
    // Получить список sink-input через PulseAudio API
    // Каждый sink-input соответствует приложению с активным аудио
    
    // TODO: Реализовать через PulseAudio
    // pa_context_get_sink_input_info_list -> получить PID и имя приложения
    Ok(vec![])
}
