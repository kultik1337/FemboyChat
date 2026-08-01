// Без этой строки Windows открывает чёрное окно консоли рядом с приложением.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        // Один экземпляр на всю систему. Повторный клик по ярлыку поднимает
        // уже открытое окно вместо второй копии с той же перепиской.
        // Плагин обязан идти первым — так требует его документация.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        // Размер, положение и развёрнутость окна сохраняются сами.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("не удалось запустить FemboyChat")
}
