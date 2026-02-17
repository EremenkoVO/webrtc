use crate::AudioApplication;
use tokio::sync::mpsc;
use tokio::sync::watch;
use tokio::time::{interval, Duration};
use std::sync::Arc;
use std::sync::Mutex;
use std::os::raw::c_void;

#[cfg(target_os = "macos")]
use screencapturekit::prelude::*;

#[cfg(target_os = "macos")]
use objc2_core_audio::{AudioHardwareCreateProcessTap, AudioHardwareDestroyProcessTap, CATapDescription, AudioObjectID};
#[cfg(target_os = "macos")]
use objc2_foundation::{NSArray, NSNumber, NSString};
#[cfg(target_os = "macos")]
use objc2::{ClassType, AnyThread};

// Core Media FFI для извлечения аудио данных
#[cfg(target_os = "macos")]
#[link(name = "CoreMedia", kind = "framework")]
extern "C" {
    fn CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
        sample_buffer: *const c_void,
        buffer_list_size_needed_out: *mut usize,
        buffer_list_out: *mut c_void,
        buffer_list_size: usize,
        block_buffer_allocator: *const c_void,
        block_buffer_allocator_out: *mut *mut c_void,
        flags: u32,
        block_buffer_out: *mut *mut c_void,
    ) -> i32;
    
    fn CMSampleBufferGetFormatDescription(sample_buffer: *const c_void) -> *const c_void;
    
    // Возвращает указатель на AudioStreamBasicDescription из CMFormatDescription
    fn CMAudioFormatDescriptionGetStreamBasicDescription(
        format_description: *const c_void,
    ) -> *const AudioStreamBasicDescription;
}

// CoreAudio Process Tap API теперь используется через objc2-core-audio библиотеку

// Константы для Core Audio
#[cfg(target_os = "macos")]
const K_AUDIO_FORMAT_FLAG_IS_FLOAT: u32 = 0x1;
#[cfg(target_os = "macos")]
#[allow(dead_code)]
const K_AUDIO_FORMAT_FLAG_IS_PACKED: u32 = 0x8;
#[cfg(target_os = "macos")]
const K_AUDIO_FORMAT_FLAG_IS_NON_INTERLEAVED: u32 = 0x20;
#[cfg(target_os = "macos")]
const K_AUDIO_FORMAT_LINEAR_PCM: u32 = 0x6C70636D; // 'lpcm'

// Структура AudioStreamBasicDescription
#[cfg(target_os = "macos")]
#[repr(C)]
struct AudioStreamBasicDescription {
    m_sample_rate: f64,
    m_format_id: u32,
    m_format_flags: u32,
    m_bytes_per_packet: u32,
    m_frames_per_packet: u32,
    m_bytes_per_frame: u32,
    m_channels_per_frame: u32,
    m_bits_per_channel: u32,
    m_reserved: u32,
}

// Структура AudioBufferList
#[cfg(target_os = "macos")]
#[repr(C)]
struct AudioBufferList {
    m_number_buffers: u32,
    m_buffers: [AudioBuffer; 1],
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct AudioBuffer {
    m_number_channels: u32,
    m_data_byte_size: u32,
    m_data: *mut c_void,
}

pub struct MacOSAudioCapture {
    pid: u32,
    is_capturing: bool,
    stop_tx: Option<watch::Sender<bool>>,
    stream: Option<Arc<Mutex<Option<SCStream>>>>,
    // Для CoreAudio Process Tap (macOS 14.2+)
    // Временно не храним здесь, так как это требует Send/Sync
    // Будет реализовано позже через отдельную структуру
    tap_id: Option<u32>, // AudioDeviceID tap (u32 является Send+Sync)
}

impl MacOSAudioCapture {
    pub fn new(pid: u32) -> napi::Result<Self> {
        Ok(Self {
            pid,
            is_capturing: false,
            stop_tx: None,
            stream: None,
            tap_id: None,
        })
    }

    pub async fn start(&mut self, sender: mpsc::UnboundedSender<Vec<f32>>) -> napi::Result<()> {
        if self.is_capturing {
            return Err(napi::Error::from_reason("Capture already started"));
        }

        self.is_capturing = true;
        let (stop_tx, stop_rx) = watch::channel(false);
        self.stop_tx = Some(stop_tx);

        let pid = self.pid;
        let sample_rate = 48000u32;
        let channels = 2u32;
        let samples_per_chunk = 960u32; // 20ms при 48kHz
        
        // Проверяем доступность CoreAudio Process Tap (macOS 14.2+) для изоляции по приложению
        let use_process_tap = check_coreaudio_process_tap_available();
        
        if use_process_tap {
            eprintln!("[MacOSAudioCapture] Using CoreAudio Process Tap for per-app audio isolation (macOS 14.2+)");
            match self.start_coreaudio_process_tap(pid, sender.clone(), stop_rx.clone(), sample_rate, channels).await {
                Ok(()) => {
                    eprintln!("[MacOSAudioCapture] ✓ CoreAudio Process Tap started successfully");
                    return Ok(());
                }
                Err(e) => {
                    eprintln!("[MacOSAudioCapture] CoreAudio Process Tap failed: {}, falling back to ScreenCaptureKit", e);
                }
            }
        }
        
        // Попытка использовать ScreenCaptureKit для macOS 13+ (захватывает весь системный звук)
        let use_real_capture = check_screencapturekit_available();
        
        if use_real_capture {
            eprintln!("[MacOSAudioCapture] Using ScreenCaptureKit (captures system-wide audio, not isolated per-app)");
            match self.start_screencapturekit_capture(pid, sender.clone(), stop_rx.clone(), sample_rate, channels, samples_per_chunk).await {
                Ok(()) => Ok(()),
                Err(e) => {
                    eprintln!("[MacOSAudioCapture] Failed to start ScreenCaptureKit capture: {}, falling back to test signal", e);
                    self.start_test_signal(sender, stop_rx, sample_rate, channels, samples_per_chunk).await
                }
            }
        } else {
            // Используем тестовый сигнал для проверки интеграции
            eprintln!("[MacOSAudioCapture] Using test signal (no real audio capture available)");
            self.start_test_signal(sender, stop_rx, sample_rate, channels, samples_per_chunk).await
        }
    }
    
    async fn start_screencapturekit_capture(
        &mut self,
        pid: u32,
        sender: mpsc::UnboundedSender<Vec<f32>>,
        mut stop_rx: watch::Receiver<bool>,
        sample_rate: u32,
        channels: u32,
        _samples_per_chunk: u32,
    ) -> napi::Result<()> {
        // Получаем список доступного контента
        let content = SCShareableContent::get()
            .map_err(|e| napi::Error::from_reason(format!("Failed to get shareable content: {}", e)))?;
        
        // Находим приложение по PID (пока не используется, но оставляем для будущего использования)
        let _app = content.applications()
            .iter()
            .find(|a| a.process_id() == pid as i32)
            .ok_or_else(|| napi::Error::from_reason(format!("Application with PID {} not found", pid)))?;
        
        // ВАЖНО: ScreenCaptureKit на macOS не поддерживает фильтрацию аудио по приложению
        // Он захватывает весь системный звук (включая звук всех приложений и микрофон, если включен)
        // Для изоляции аудио конкретного приложения нужен macOS 14.2+ с CoreAudio Process Tap API
        // 
        // Создаем фильтр для захвата системного аудио
        // На macOS 13-14.1 это единственный способ захватить аудио через ScreenCaptureKit
        eprintln!("[AudioCapture] WARNING: ScreenCaptureKit captures system-wide audio, not isolated per-app audio");
        eprintln!("[AudioCapture] For per-app isolation, macOS 14.2+ with CoreAudio Process Tap is required");
        eprintln!("[AudioCapture] Current implementation will capture all system audio (including microphone if enabled)");
        
        let displays = content.displays();
        let display = displays
            .first()
            .ok_or_else(|| napi::Error::from_reason("No displays available".to_string()))?;
        
        let filter = SCContentFilter::create()
            .with_display(display)
            .with_excluding_windows(&[])
            .build();
        
        // Настраиваем конфигурацию потока с аудио
        let config = SCStreamConfiguration::new()
            .with_captures_audio(true)
            .with_sample_rate(sample_rate as i32)
            .with_channel_count(channels as i32);
        
        // Создаем поток
        let mut stream = SCStream::new(&filter, &config);
        
        // Создаем обработчик аудио
        struct AudioHandler {
            sender: mpsc::UnboundedSender<Vec<f32>>,
            sample_rate: u32,
            channels: u32,
        }
        
        impl SCStreamOutputTrait for AudioHandler {
            fn did_output_sample_buffer(&self, sample: CMSampleBuffer, output_type: SCStreamOutputType) {
                if output_type == SCStreamOutputType::Audio {
                    match extract_audio_from_sample_buffer(&sample, self.sample_rate, self.channels) {
                        Ok(audio_data) => {
                            if !audio_data.is_empty() {
                                if self.sender.send(audio_data).is_err() {
                                    // Канал закрыт
                                }
                            }
                        }
                        Err(e) => {
                            // Логируем ошибку только изредка, чтобы не забивать консоль
                            use std::sync::atomic::{AtomicU64, Ordering};
                            static ERROR_COUNT: AtomicU64 = AtomicU64::new(0);
                            let count = ERROR_COUNT.fetch_add(1, Ordering::Relaxed);
                            if count < 5 || count % 100 == 0 {
                                eprintln!("[AudioHandler] Failed to extract audio (count={}): {}", count, e);
                            }
                        }
                    }
                }
            }
        }
        
        let handler = AudioHandler {
            sender,
            sample_rate,
            channels,
        };
        
        // Добавляем обработчик аудио
        stream.add_output_handler(handler, SCStreamOutputType::Audio);
        
        // Запускаем захват
        stream.start_capture()
            .map_err(|e| napi::Error::from_reason(format!("Failed to start capture: {}", e)))?;
        
        // Сохраняем поток для остановки
        self.stream = Some(Arc::new(Mutex::new(Some(stream))));
        
        // Запускаем задачу для отслеживания остановки
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() {
                            break;
                        }
                    }
                }
            }
        });
        
        Ok(())
    }
    
    async fn start_coreaudio_process_tap(
        &mut self,
        pid: u32,
        sender: mpsc::UnboundedSender<Vec<f32>>,
        mut stop_rx: watch::Receiver<bool>,
        sample_rate: u32,
        channels: u32,
    ) -> napi::Result<()> {
        eprintln!("[CoreAudioProcessTap] Starting process tap for PID: {}", pid);
        
        // ПРОБЛЕМА: Методы init для CATapDescription определены в документации objc2-core-audio,
        // но компилятор их не находит. Попытки использовать objc2::msg_send! также не работают
        // из-за сложностей с типами и синтаксисом.
        //
        // РЕШЕНИЕ: Для полной реализации Process Tap нужно:
        // 1. Изучить исходный код objc2-core-audio для понимания правильного синтаксиса
        // 2. Использовать более низкоуровневый подход через CFDictionary и CoreFoundation
        // 3. Или использовать Objective-C bridge для создания CATapDescription
        // 4. Или обновить библиотеку до версии, где эти методы доступны напрямую
        //
        // Пока что возвращаем ошибку для fallback на ScreenCaptureKit
        
        eprintln!("[CoreAudioProcessTap] Process Tap API integration requires CATapDescription init methods");
        eprintln!("[CoreAudioProcessTap] Methods are defined in docs but not accessible via direct calls or msg_send!");
        eprintln!("[CoreAudioProcessTap] Falling back to ScreenCaptureKit (captures system-wide audio)");
        
        // Получаем bundle ID для логирования
        let bundle_id = Self::get_bundle_id_from_pid(pid);
        if let Some(bundle_id_str) = &bundle_id {
            eprintln!("[CoreAudioProcessTap] Target process bundle ID: {} (would be used for isolation)", bundle_id_str);
        }
        
        return Err(napi::Error::from_reason(
            "CoreAudio Process Tap API requires CATapDescription init methods which are not accessible - using ScreenCaptureKit fallback"
        ));
    }
    
    // Вспомогательная функция для получения bundle ID из PID
    fn get_bundle_id_from_pid(pid: u32) -> Option<String> {
        // Используем ScreenCaptureKit для получения bundle ID процесса
        if let Ok(content) = SCShareableContent::get() {
            if let Some(app) = content.applications()
                .iter()
                .find(|a| a.process_id() == pid as i32)
            {
                let bundle_id = app.bundle_identifier();
                if !bundle_id.is_empty() {
                    eprintln!("[CoreAudioProcessTap] Found bundle ID for PID {}: {}", pid, bundle_id);
                    return Some(bundle_id);
                }
            }
        }
        
        // Fallback: используем osascript для получения bundle ID
        use std::process::Command;
        if let Ok(output) = Command::new("osascript")
            .arg("-e")
            .arg(format!("tell application \"System Events\" to get bundle identifier of process whose unix id is {}", pid))
            .output()
        {
            if let Ok(bundle_id) = String::from_utf8(output.stdout) {
                let bundle_id = bundle_id.trim().to_string();
                if !bundle_id.is_empty() && !bundle_id.contains("error") {
                    eprintln!("[CoreAudioProcessTap] Got bundle ID via osascript for PID {}: {}", pid, bundle_id);
                    return Some(bundle_id);
                }
            }
        }
        
        eprintln!("[CoreAudioProcessTap] Could not get bundle ID for PID {}", pid);
        None
    }
    
    async fn start_test_signal(
        &mut self,
        sender: mpsc::UnboundedSender<Vec<f32>>,
        mut stop_rx: watch::Receiver<bool>,
        sample_rate: u32,
        channels: u32,
        samples_per_chunk: u32,
    ) -> napi::Result<()> {
        tokio::spawn(async move {
            let mut interval = interval(Duration::from_millis(20)); // ~50 FPS для аудио
            let mut phase = 0.0f32;
            
            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        let mut audio_data = Vec::with_capacity((samples_per_chunk * channels) as usize);
                        
                        for _ in 0..samples_per_chunk {
                            // Генерируем тестовый сигнал (440Hz синусоида)
                            let sample = (phase * 2.0 * std::f32::consts::PI * 440.0 / sample_rate as f32).sin() * 0.3;
                            audio_data.push(sample); // Left channel
                            audio_data.push(sample); // Right channel
                            phase += 1.0;
                            if phase >= sample_rate as f32 {
                                phase = 0.0;
                            }
                        }
                        
                        if sender.send(audio_data).is_err() {
                            break;
                        }
                    }
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() {
                            break;
                        }
                    }
                }
            }
        });

        Ok(())
    }

    pub async fn stop(&mut self) -> napi::Result<()> {
        if !self.is_capturing {
            return Ok(());
        }

        self.is_capturing = false;
        
        // Останавливаем ScreenCaptureKit поток, если он запущен
        if let Some(stream_arc) = self.stream.take() {
            if let Ok(mut stream_guard) = stream_arc.lock() {
                if let Some(stream) = stream_guard.take() {
                    let _ = stream.stop_capture();
                }
            }
        }
        
        if let Some(stop_tx) = self.stop_tx.take() {
            let _ = stop_tx.send(true);
        }

        Ok(())
    }
}

/// Извлекает PCM Float32 аудио данные из CMSampleBuffer
#[cfg(target_os = "macos")]
fn extract_audio_from_sample_buffer(
    sample_buffer: &CMSampleBuffer,
    _expected_sample_rate: u32,
    _expected_channels: u32,
) -> Result<Vec<f32>, String> {
    use std::ptr;
    
    // Получаем указатель на внутренний CMSampleBuffer через objc runtime
    // screencapturekit-rs использует objc::runtime::Object под капотом
    // CMSampleBuffer в screencapturekit-rs это обертка над objc::runtime::Object
    // Используем transmute для получения указателя на объект
    let sample_ptr = unsafe {
        // Преобразуем ссылку на CMSampleBuffer в указатель на objc::runtime::Object
        // Предполагаем, что CMSampleBuffer содержит указатель на objc::runtime::Object
        // как первый элемент структуры (стандартная практика для objc оберток)
        let buffer_ref: *const CMSampleBuffer = sample_buffer;
        // Читаем указатель на objc::runtime::Object из первого поля структуры
        let obj_ptr = std::ptr::read(buffer_ref as *const *const objc::runtime::Object);
        obj_ptr as *const c_void
    };
    
    // Получаем формат описания
    let format_desc = unsafe { CMSampleBufferGetFormatDescription(sample_ptr) };
    if format_desc.is_null() {
        return Err("Failed to get format description".to_string());
    }
    
    // Получаем AudioStreamBasicDescription напрямую из CMFormatDescription
    let asbd_ptr = unsafe {
        CMAudioFormatDescriptionGetStreamBasicDescription(format_desc)
    };
    if asbd_ptr.is_null() {
        return Err("Failed to get AudioStreamBasicDescription from format description".to_string());
    }
    let asbd = unsafe { &*asbd_ptr };
    
    eprintln!("[AudioHandler] ASBD: sample_rate={}, format_id=0x{:x}, flags=0x{:x}, bpp={}, fpp={}, bpf={}, channels={}, bits={}",
        asbd.m_sample_rate, asbd.m_format_id, asbd.m_format_flags,
        asbd.m_bytes_per_packet, asbd.m_frames_per_packet, asbd.m_bytes_per_frame,
        asbd.m_channels_per_frame, asbd.m_bits_per_channel);
    
    // Проверяем формат - должен быть Linear PCM
    if asbd.m_format_id != K_AUDIO_FORMAT_LINEAR_PCM {
        return Err(format!("Unsupported format: 0x{:x}", asbd.m_format_id));
    }
    
    // Определяем размер буфера для AudioBufferList
    let buffer_list_size = std::mem::size_of::<AudioBufferList>()
        + (asbd.m_channels_per_frame as usize - 1) * std::mem::size_of::<AudioBuffer>();
    
    let mut buffer_list_bytes = vec![0u8; buffer_list_size];
    let mut block_buffer_out: *mut c_void = ptr::null_mut();
    let mut buffer_list_size_needed: usize = 0;
    
    // Извлекаем AudioBufferList из CMSampleBuffer
    let result = unsafe {
        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sample_ptr,
            &mut buffer_list_size_needed,
            buffer_list_bytes.as_mut_ptr() as *mut c_void,
            buffer_list_size,
            ptr::null(),
            ptr::null_mut(),
            0,
            &mut block_buffer_out,
        )
    };
    
    if result != 0 {
        return Err(format!("Failed to get audio buffer list: {}", result));
    }
    
    extern "C" {
        fn CFRelease(cf: *const c_void);
    }
    
    // Парсим AudioBufferList (m_data указатели ссылаются на block_buffer,
    // поэтому CFRelease вызываем только после копирования данных)
    //
    // AudioBufferList использует C flexible array member: mBuffers[1]
    // реально содержит N буферов подряд в памяти. Нельзя использовать Rust
    // индексацию m_buffers[i] — она проверяет границы массива длиной 1.
    // Используем pointer arithmetic для доступа к буферам.
    let buffer_list_ptr = buffer_list_bytes.as_ptr() as *const AudioBufferList;
    let num_buffers = unsafe { (*buffer_list_ptr).m_number_buffers };
    
    // Указатель на первый AudioBuffer в массиве
    let buffers_base = unsafe {
        &(*buffer_list_ptr).m_buffers[0] as *const AudioBuffer
    };
    
    let is_float = (asbd.m_format_flags & K_AUDIO_FORMAT_FLAG_IS_FLOAT) != 0;
    let is_non_interleaved = (asbd.m_format_flags & K_AUDIO_FORMAT_FLAG_IS_NON_INTERLEAVED) != 0;
    
    if !is_float {
        return Err(format!("Audio format is not Float32, flags=0x{:x}", asbd.m_format_flags));
    }
    
    if is_non_interleaved {
        // Non-interleaved: каждый AudioBuffer = один канал
        // Собираем данные каналов отдельно, затем interleave
        let mut channel_data: Vec<Vec<f32>> = Vec::new();
        
        for i in 0..num_buffers {
            let buffer = unsafe { &*buffers_base.add(i as usize) };
            let data_ptr = buffer.m_data as *const f32;
            let sample_count = buffer.m_data_byte_size as usize / std::mem::size_of::<f32>();
            
            if data_ptr.is_null() || sample_count == 0 {
                continue;
            }
            
            let samples = unsafe { std::slice::from_raw_parts(data_ptr, sample_count) };
            channel_data.push(samples.to_vec());
        }
        
        // Interleave: [L0, R0, L1, R1, ...]
        let num_channels = channel_data.len();
        if num_channels == 0 {
            return Err("No audio channels found".to_string());
        }
        let samples_per_channel = channel_data[0].len();
        let mut audio_data = Vec::with_capacity(samples_per_channel * num_channels);
        
        for s in 0..samples_per_channel {
            for ch in &channel_data {
                if s < ch.len() {
                    audio_data.push(ch[s]);
                } else {
                    audio_data.push(0.0);
                }
            }
        }
        
        // Освобождаем block buffer после копирования
        if !block_buffer_out.is_null() {
            unsafe { CFRelease(block_buffer_out); }
        }
        
        eprintln!("[AudioHandler] Extracted {} samples (non-interleaved, {} channels, {} per channel)",
            audio_data.len(), num_channels, samples_per_channel);
        
        Ok(audio_data)
    } else {
        // Interleaved: все данные уже в правильном порядке
        let mut audio_data = Vec::new();
        
        for i in 0..num_buffers {
            let buffer = unsafe { &*buffers_base.add(i as usize) };
            let data_ptr = buffer.m_data as *const f32;
            let sample_count = buffer.m_data_byte_size as usize / std::mem::size_of::<f32>();
            
            if data_ptr.is_null() || sample_count == 0 {
                continue;
            }
            
            unsafe {
                let samples = std::slice::from_raw_parts(data_ptr, sample_count);
                audio_data.extend_from_slice(samples);
            }
        }
        
        // Освобождаем block buffer после копирования
        if !block_buffer_out.is_null() {
            unsafe { CFRelease(block_buffer_out); }
        }
        
        eprintln!("[AudioHandler] Extracted {} samples (interleaved)", audio_data.len());
        
        Ok(audio_data)
    }
}

fn check_screencapturekit_available() -> bool {
    // Проверяем версию macOS (ScreenCaptureKit доступен с macOS 13.0)
    use std::process::Command;
    
    if let Ok(output) = Command::new("sw_vers").arg("-productVersion").output() {
        if let Ok(version_str) = String::from_utf8(output.stdout) {
            // Парсим версию (например, "14.2.0" -> 14.2)
            let parts: Vec<&str> = version_str.trim().split('.').collect();
            if parts.len() >= 2 {
                if let (Ok(major), Ok(minor)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                    // macOS 14.2+ поддерживает CoreAudio Process Tap для изоляции по приложению
                    // Для более старых версий используем ScreenCaptureKit (захватывает весь системный звук)
                    return major >= 13;
                }
            }
        }
    }
    
    false
}

#[allow(dead_code)]
fn check_coreaudio_process_tap_available() -> bool {
    // CoreAudio Process Tap доступен с macOS 14.2
    // Используется для изоляции аудио конкретного приложения
    use std::process::Command;
    
    if let Ok(output) = Command::new("sw_vers").arg("-productVersion").output() {
        if let Ok(version_str) = String::from_utf8(output.stdout) {
            let parts: Vec<&str> = version_str.trim().split('.').collect();
            if parts.len() >= 2 {
                if let (Ok(major), Ok(minor)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                    return major > 14 || (major == 14 && minor >= 2);
                }
            }
        }
    }
    
    false
}

pub async fn get_audio_applications() -> napi::Result<Vec<AudioApplication>> {
    // Попытка использовать ScreenCaptureKit для получения списка приложений
    if check_screencapturekit_available() {
        match SCShareableContent::get() {
            Ok(content) => {
                let mut applications = Vec::new();
                let apps = content.applications();
                eprintln!("[get_audio_applications] Found {} applications via ScreenCaptureKit", apps.len());
                
                for app in apps {
                    let pid = app.process_id();
                    let name_ref = app.application_name();
                    let bundle_id = app.bundle_identifier();
                    
                    eprintln!("[get_audio_applications] Raw app data: pid={}, name_ref={:?} (type: {:?}), bundle_id={:?}", 
                        pid, name_ref, std::any::type_name_of_val(&name_ref), bundle_id);
                    
                    // Преобразуем имя в String
                    let name = name_ref.to_string();
                    eprintln!("[get_audio_applications] Converted name: {:?}, length: {}", name, name.len());
                    
                    // Фильтруем системные процессы (PID <= 1 или пустое имя)
                    // Также фильтруем системные приложения по bundle_id
                    let is_system_bundle = bundle_id
                        .starts_with("com.apple.") || bundle_id.starts_with("com.apple.system");
                    
                    if pid > 1 && !name.is_empty() && !is_system_bundle {
                        eprintln!("[get_audio_applications] ✓ Adding app: pid={}, name={}", pid, name);
                        let audio_app = AudioApplication {
                            pid: pid as u32,
                            name: name.clone(),
                            icon: None,
                        };
                        eprintln!("[get_audio_applications] Created AudioApplication: pid={}, name={}", audio_app.pid, audio_app.name);
                        applications.push(audio_app);
                    } else {
                        eprintln!("[get_audio_applications] ✗ Skipping app: pid={} (valid: {}), name={:?} (empty: {}), bundle_id={:?} (system: {})", 
                            pid, pid > 1, name, name.is_empty(), bundle_id, is_system_bundle);
                    }
                }
                
                eprintln!("[get_audio_applications] Returning {} filtered applications", applications.len());
                return Ok(applications);
            }
            Err(e) => {
                eprintln!("[get_audio_applications] Failed to get shareable content: {}, falling back to ps", e);
            }
        }
    }
    
    // Fallback: используем ps для получения списка процессов
    use std::process::Command;
    
    eprintln!("[get_audio_applications] Using ps fallback");
    
    let output = Command::new("ps")
        .args(&["-eo", "pid,comm"])
        .output()
        .map_err(|e| napi::Error::from_reason(format!("Failed to get process list: {}", e)))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut applications = Vec::new();
    
    for line in stdout.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            if let Ok(pid) = parts[0].parse::<u32>() {
                let name = parts[1..].join(" ");
                // Фильтруем системные процессы и показываем только пользовательские приложения
                // Также исключаем PID 1 (kernel_task) и другие системные процессы
                if pid > 1
                    && !name.starts_with("/System/") 
                    && !name.starts_with("/usr/") 
                    && !name.starts_with("kernel_task")
                    && !name.starts_with("/Library/")
                    && !name.starts_with("/private/")
                    && !name.starts_with("/sbin/")
                    && !name.starts_with("/bin/")
                    && !name.is_empty() {
                    applications.push(AudioApplication {
                        pid,
                        name,
                        icon: None,
                    });
                }
            }
        }
    }
    
    eprintln!("[get_audio_applications] Returning {} applications from ps", applications.len());
    Ok(applications)
}
