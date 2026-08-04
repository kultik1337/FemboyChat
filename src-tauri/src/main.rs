// Без этой строки Windows открывает чёрное окно консоли рядом с приложением.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, Runtime, WindowEvent,
};

/// Поднять главное окно из любого состояния: свёрнутого, скрытого в трей
/// или просто потерявшего фокус. Все три вызова нужны именно в таком порядке:
/// show() не разворачивает свёрнутое окно, а без set_focus() оно останется позади.
fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        // Один экземпляр на всю систему. Повторный клик по ярлыку поднимает
        // уже открытое окно вместо второй копии с той же перепиской.
        // Плагин обязан идти первым — так требует его документация.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        // Размер, положение и развёрнутость окна сохраняются сами.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Системные уведомления Windows. Веб-версия пользуется браузерным
        // Notification API, но в WebView2 его нет вообще — внутри приложения
        // уведомления может показывать только сама оболочка.
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Меню трея держится нарочно коротким: открыть и выйти.
            // «Выйти» здесь обязательно: крестик теперь сворачивает в трей, и без
            // этого пункта закрыть приложение было бы нечем.
            let open = MenuItem::with_id(app, "open", "Открыть FemboyChat", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("FemboyChat")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                });

            // Иконка берётся та же, что у окна, чтобы не держать второй файл.
            // Если её внезапно нет, значок всё равно создаётся — падать из-за
            // картинки приложение не должно.
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }

            tray.build(app)?;
            Ok(())
        })
        // Крестик прячет окно, а не завершает процесс. Иначе мессенджер
        // перестаёт получать сообщения ровно в тот момент, когда его убрали с глаз
        // до прихода ответа — именно то, чего от мессенджера никто не ждёт.
        // Выйти по-настоящему можно через меню трея.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("не удалось запустить FemboyChat")
}
