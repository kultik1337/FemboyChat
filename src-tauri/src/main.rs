// Без этой строки Windows открывает чёрное окно консоли рядом с приложением.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("не удалось запустить FemboyChat")
}
