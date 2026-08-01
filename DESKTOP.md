# FemboyChat для компьютера

Приложение для Windows собирается через [Tauri 2](https://tauri.app). Внутри — тот же самый
интерфейс, что и на сайте, но без браузерной рамки: системная шапка выключена,
вместо неё своя плашка в цветах выбранной темы.

Почему Tauri, а не Electron: окно рисует системный WebView2, который в Windows
уже есть. Установщик выходит порядка 5–10 МБ вместо ста с лишним, и не нужно
тащить с собой целый Chromium.

## Собрать у себя на компьютере

Нужны один раз:

1. [Node.js 20+](https://nodejs.org)
2. [Rust](https://rustup.rs) — установщик `rustup-init.exe`, всё по умолчанию
3. **Visual Studio Build Tools** с компонентом «Desktop development with C++»
4. **WebView2 Runtime** — в Windows 11 уже встроен, в Windows 10 ставится отдельно

Дальше в папке проекта:

```bash
npm install
npm run desktop:icons   # один раз: делает все иконки из icon.png
npm run desktop:build   # собирает установщик
```

Готовые файлы лежат тут:

- `src-tauri/target/release/bundle/nsis/FemboyChat_1.0.1_x64-setup.exe` — установщик
- `src-tauri/target/release/FemboyChat.exe` — само приложение

Первая сборка идёт долго (Rust компилирует все зависимости), следующие — минуту-две.

Живая разработка с горячей перезагрузкой: `npm run desktop:dev`.

## Собрать на GitHub, без своего компьютера

В корне лежит готовый `desktop-release.yml`. Перенеси его в `.github/workflows/`
(через сайт GitHub: Add file → Create new file), потом Actions → «Build Windows EXE» →
Run workflow. Через несколько минут установщик будет в артефактах запуска.

Файл лежит в корне, а не сразу в `.github/workflows/`, по той же причине, что и
`github-pages-deploy.yml`: токен, которым ведừтся разработка, не имеет права писать
в папку workflow.

## Подпись

Установщик не подписан цифровым сертификатом, поэтому SmartScreen при первом
запуске покажет «Неизвестный издатель» → «Подробнее» → «Выполнить в любом случае».
Чтобы этого не было, нужен платный code signing сертификат (от ~$100 в год).
