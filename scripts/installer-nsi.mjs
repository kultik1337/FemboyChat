/*
  Собственный сценарий установщика (NSIS), макет "Aurora".

  ГЛАВНОЕ РЕШЕНИЕ: весь экран — одна картинка.
  Предыдущие версии собирались из родных контролов Windows, и потолок там
  низкий: нет ни скруглений, ни градиентов, ни теней, а любая подпись поверх
  картинки закрашивает свой прямоугольник фоном (режим transparent берёт цвет
  родительского диалога, а не соседней картинки). Поэтому теперь
  scripts/installer-art.mjs рисует весь экран сразу — фон, свечения, логотип,
  поле, кнопки со скруглениями и весь статичный текст, — а здесь сверху
  лежат только пустые прозрачные подписи-области нажатия. Они ничего не
  рисуют, поэтому картинка под ними остаётся видна.

  Живых элемента всего два:
    1. Путь установки — обычная подпись. Её фон ровно C_FIELD, а внутренность
  поля на картинке залита тем же плоским цветом, поэтому стыка не видно.
  Подпись нарочно уже самого поля, чтобы не затереть его скруглённую границу.
    2. Галочка — картинка 20x20, которая меняется между chk-on.bmp и
  chk-off.bmp. Оба кусочка вырезаны из того же фона, так что края совпадают точно.

  ПОРЯДОК СОЗДАНИЯ. Созданный раньше контрол лежит ВЫШЕ созданного позже.
  Поэтому фоновая картинка создаётся САМОЙ ПОСЛЕДНЕЙ, иначе она закроет собой
  всё остальное. Это уже ломало сборку раньше — не менять порядок.

  КООРДИНАТЫ В ПИКСЕЛЯХ. nsDialogs расставляет контролы в единицах диалога,
  которые зависят от шрифта и масштаба системы, а картинка задана в пикселях.
  Чтобы области нажатия не уехали от рисунка, каждый контрол создаётся
  где угодно, а потом ставится на место через ${FcPlace} в настоящих пикселях.
  Все числа ниже обязаны совпадать с LAYOUT в scripts/installer-art.mjs.

  СВОЯ РАМКА. Системная шапка снимается совсем: именно она тянет вид назад
  в прошлое. Вместо неё свой крестик. Расплата честная: окно нельзя таскать
  мышкой — подпись узнаёт о нажатии только после того, как кнопку отпустили.
  Окно открывается по центру экрана и живёт меньше минуты. Escape работает:
  родная кнопка отмены не удалена, а только скрыта.

  ПРО OutFile. Бандлер Tauri запускает makensis из своей временной папки и сразу
  после этого переносит оттуда файл с жёстко заданным именем nsis-output.exe.
  Если писать установщик по своему абсолютному пути, переносить будет нечего
  и сборка падает: `не удается найти указанный файл (os error 2)`.

  ПРО ОБРАТНЫЙ СЛЭШ. В тексте сценария вместо слэша стоит знак ^, и он
  заменяется на настоящий слэш ровно один раз, уже при записи файла. Раньше
  уровни экранирования разъехались и путь показывался с двойным слэшем.
  Ставить в этом файле ^ где-то ещё нельзя.

  Сценарий собран из массива обычных строк, а не шаблонной строки: в нём море
  конструкций вида ${If}, и JS попытался бы подставить туда свои переменные.
*/

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const version = pkg.version

const outDir = resolve(root, 'src-tauri', 'installer')

const paths = {
  icon: resolve(root, 'src-tauri', 'icons', 'icon.ico'),
  bg: resolve(outDir, 'bg.bmp'),
  chkOn: resolve(outDir, 'chk-on.bmp'),
  chkOff: resolve(outDir, 'chk-off.bmp'),
  exe: resolve(root, 'src-tauri', 'target', 'release', 'femboychat.exe'),
}

const NSI = [
  '; Файл собран scripts/installer-nsi.mjs — правь генератор, а не этот файл.',
  'Unicode true',
  'Name "FemboyChat"',
  'Caption "FemboyChat"',
  '; Имя обязано быть таким: бандлер Tauri ищет рядом с собой nsis-output.exe.',
  'OutFile "nsis-output.exe"',
  'InstallDir "$LOCALAPPDATA^FemboyChat"',
  'InstallDirRegKey HKCU "Software^FemboyChat" "InstallDir"',
  'RequestExecutionLevel user',
  'SetCompressor /SOLID lzma',
  'XPStyle on',
  'BrandingText " "',
  'Icon "@ICON@"',
  'UninstallIcon "@ICON@"',
  'ShowInstDetails nevershow',
  'ShowUninstDetails nevershow',
  '',
  '!include "nsDialogs.nsh"',
  '!include "LogicLib.nsh"',
  '!include "WinMessages.nsh"',
  '',
  '!define APP_EXE "femboychat.exe"',
  '!define APP_VER "@VERSION@"',
  '!define UNINST_KEY "Software^Microsoft^Windows^CurrentVersion^Uninstall^FemboyChat"',
  '',
  '; Размер окна ровно равен размеру картинки bg.bmp.',
  '!define WIN_W 680',
  '!define WIN_H 460',
  '',
  '; SetCtlColors ждёт RRGGBB без 0x.',
  '; C_FIELD обязан совпадать с FIELD_FILL в scripts/installer-art.mjs.',
  '!define C_FIELD 161A26',
  '!define C_PATH DFE4F2',
  '!define C_MUTED 8E97B3',
  '; Цвет страницы установки: нижний тон фона с картинки.',
  '!define C_DARK 0A0B12',
  '',
  '; SS_NOTIFY — без него подпись не сообщает о нажатии.',
  '!define HOT_STYLE 0x00000100',
  '; Текст по середине по высоте + обрезать длинный путь многоточием.',
  '!define PATH_STYLE 0x00004200',
  '',
  '; Поставить контрол в настоящих пикселях (0x14 = не менять порядок окон).',
  '!macro FCPLACE ctl x y w h',
  '  System::Call "user32::SetWindowPos(i ${ctl}, i 0, i ${x}, i ${y}, i ${w}, i ${h}, i 0x14)"',
  '!macroend',
  '!define FcPlace "!insertmacro FCPLACE"',
  '',
  'Var Dialog',
  'Var BgCtl',
  'Var BgImg',
  'Var ChkCtl',
  'Var ChkImg',
  'Var LblDir',
  'Var HsClose',
  'Var HsBrowse',
  'Var HsCheck',
  'Var HsGo',
  'Var HsCancel',
  'Var FontText',
  'Var MakeDesktop',
  '',
  'Page custom fcWelcome',
  'Page instfiles "" fcInstShow',
  'UninstPage uninstConfirm',
  'UninstPage instfiles',
  '',
  '; Растянуть окно $1 на всю клиентскую область установщика.',
  'Function fcFillClient',
  '  System::Alloc 16',
  '  Pop $0',
  '  System::Call "user32::GetClientRect(i $HWNDPARENT, i r0)"',
  '  System::Call "*$0(i, i, i .r2, i .r3)"',
  '  System::Free $0',
  '  System::Call "user32::SetWindowPos(i r1, i 0, i 0, i 0, i r2, i r3, i 0x14)"',
  'FunctionEnd',
  '',
  '; Скрыть стандартную обвязку: шапку, линейки, подпись и кнопки.',
  'Function fcHideChrome',
  '  GetDlgItem $0 $HWNDPARENT 1034',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 1035',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 1036',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 1037',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 1038',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 1039',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 1045',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 1256',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 1028',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 1',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 2',
  '  ShowWindow $0 ${SW_HIDE}',
  '  GetDlgItem $0 $HWNDPARENT 3',
  '  ShowWindow $0 ${SW_HIDE}',
  'FunctionEnd',
  '',
  'Function .onInit',
  '  InitPluginsDir',
  '  File "/oname=$PLUGINSDIR^bg.bmp" "@BG@"',
  '  File "/oname=$PLUGINSDIR^chk-on.bmp" "@CHKON@"',
  '  File "/oname=$PLUGINSDIR^chk-off.bmp" "@CHKOFF@"',
  '  StrCpy $MakeDesktop 1',
  '',
  '  ; Без WebView2 окно приложения будет пустым, лучше сказать сразу.',
  '  ReadRegStr $0 HKLM "SOFTWARE^WOW6432Node^Microsoft^EdgeUpdate^Clients^{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"',
  '  ${If} $0 == ""',
  '    ReadRegStr $0 HKCU "SOFTWARE^Microsoft^EdgeUpdate^Clients^{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"',
  '  ${EndIf}',
  '  ${If} $0 == ""',
  '    MessageBox MB_YESNO|MB_ICONQUESTION "Для FemboyChat нужен компонент Microsoft Edge WebView2. Открыть страницу загрузки?" IDNO fcSkipWv',
  '    ExecShell "open" "https://developer.microsoft.com/microsoft-edge/webview2/"',
  '    fcSkipWv:',
  '  ${EndIf}',
  'FunctionEnd',
  '',
  '; Окно: без системной шапки, своего размера, по центру экрана.',
  'Function .onGUIInit',
  '  ; Снимаем WS_CAPTION, WS_SYSMENU и WS_THICKFRAME — это 0x00CC0000.',
  '  System::Call "user32::GetWindowLongW(p $HWNDPARENT, i -16) i .r4"',
  '  IntOp $5 0x00CC0000 ~',
  '  IntOp $4 $4 & $5',
  '  System::Call "user32::SetWindowLongW(p $HWNDPARENT, i -16, i r4)"',
  '',
  '  System::Call "user32::GetSystemMetrics(i 0) i .r0"',
  '  System::Call "user32::GetSystemMetrics(i 1) i .r1"',
  '  IntOp $2 $0 - ${WIN_W}',
  '  IntOp $2 $2 / 2',
  '  IntOp $3 $1 - ${WIN_H}',
  '  IntOp $3 $3 / 2',
  '  ; 0x24 = не менять порядок окон + применить новую рамку.',
  '  System::Call "user32::SetWindowPos(i $HWNDPARENT, i 0, i r2, i r3, i ${WIN_W}, i ${WIN_H}, i 0x24)"',
  '',
  '  ; Скруглённые углы и тонкая рамка (Windows 11; на 10 просто ничего).',
  '  System::Call "dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 33, *i 2, i 4)"',
  '  System::Call "dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 34, *i 0x00231A12, i 4)"',
  '  System::Call "dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)"',
  'FunctionEnd',
  '',
  'Function fcWelcome',
  '  nsDialogs::Create 1018',
  '  Pop $Dialog',
  '  ${If} $Dialog == error',
  '    Abort',
  '  ${EndIf}',
  '',
  '  Call fcHideChrome',
  '  StrCpy $1 $Dialog',
  '  Call fcFillClient',
  '  SetCtlColors $Dialog ${C_PATH} ${C_DARK}',
  '',
  '  CreateFont $FontText "Segoe UI" 10 400',
  '',
  '  ; ── сначала всё, что лежит ПОВЕРХ картинки ──',
  '',
  '  ; Путь установки. Стоит внутри поля с отступом, чтобы не затереть рамку.',
  '  ${NSD_CreateLabel} 0 0 10 10 "$INSTDIR"',
  '  Pop $LblDir',
  '  SetCtlColors $LblDir ${C_PATH} ${C_FIELD}',
  '  SendMessage $LblDir ${WM_SETFONT} $FontText 1',
  '  ${NSD_AddStyle} $LblDir ${PATH_STYLE}',
  '  ${FcPlace} $LblDir 310 260 220 42',
  '',
  '  ; Области нажатия: пустые и прозрачные, всё видное — на картинке.',
  '  ${NSD_CreateLabel} 0 0 10 10 ""',
  '  Pop $HsClose',
  '  SetCtlColors $HsClose 000000 transparent',
  '  ${NSD_AddStyle} $HsClose ${HOT_STYLE}',
  '  ${NSD_OnClick} $HsClose fcOnCancel',
  '  ${FcPlace} $HsClose 632 16 32 32',
  '',
  '  ${NSD_CreateLabel} 0 0 10 10 ""',
  '  Pop $HsBrowse',
  '  SetCtlColors $HsBrowse 000000 transparent',
  '  ${NSD_AddStyle} $HsBrowse ${HOT_STYLE}',
  '  ${NSD_OnClick} $HsBrowse fcOnBrowse',
  '  ${FcPlace} $HsBrowse 540 264 92 34',
  '',
  '  ${NSD_CreateLabel} 0 0 10 10 ""',
  '  Pop $HsCheck',
  '  SetCtlColors $HsCheck 000000 transparent',
  '  ${NSD_AddStyle} $HsCheck ${HOT_STYLE}',
  '  ${NSD_OnClick} $HsCheck fcOnCheck',
  '  ${FcPlace} $HsCheck 296 334 250 24',
  '',
  '  ${NSD_CreateLabel} 0 0 10 10 ""',
  '  Pop $HsGo',
  '  SetCtlColors $HsGo 000000 transparent',
  '  ${NSD_AddStyle} $HsGo ${HOT_STYLE}',
  '  ${NSD_OnClick} $HsGo fcOnInstall',
  '  ${FcPlace} $HsGo 296 388 212 52',
  '',
  '  ${NSD_CreateLabel} 0 0 10 10 ""',
  '  Pop $HsCancel',
  '  SetCtlColors $HsCancel 000000 transparent',
  '  ${NSD_AddStyle} $HsCancel ${HOT_STYLE}',
  '  ${NSD_OnClick} $HsCancel fcOnCancel',
  '  ${FcPlace} $HsCancel 520 388 120 52',
  '',
  '  ; Галочка — картинка под областью нажатия, но над фоном.',
  '  ${NSD_CreateBitmap} 0 0 10 10 ""',
  '  Pop $ChkCtl',
  '  ${FcPlace} $ChkCtl 296 336 20 20',
  '  ${NSD_SetImage} $ChkCtl "$PLUGINSDIR^chk-on.bmp" $ChkImg',
  '',
  '  ; ── фон — САМЫМ ПОСЛЕДНИМ, иначе закроет всё остальное ──',
  '  ${NSD_CreateBitmap} 0 0 10 10 ""',
  '  Pop $BgCtl',
  '  ${FcPlace} $BgCtl 0 0 ${WIN_W} ${WIN_H}',
  '  ${NSD_SetImage} $BgCtl "$PLUGINSDIR^bg.bmp" $BgImg',
  '',
  '  nsDialogs::Show',
  '  ${NSD_FreeImage} $BgImg',
  '  ${NSD_FreeImage} $ChkImg',
  'FunctionEnd',
  '',
  'Function fcOnBrowse',
  '  Pop $0',
  '  nsDialogs::SelectFolderDialog "Куда установить FemboyChat" "$INSTDIR"',
  '  Pop $0',
  '  ${If} $0 != error',
  '    StrCpy $INSTDIR $0',
  '    ${NSD_SetText} $LblDir "$INSTDIR"',
  '  ${EndIf}',
  'FunctionEnd',
  '',
  '; Галочка переключается подменой картинки.',
  'Function fcOnCheck',
  '  Pop $0',
  '  ${NSD_FreeImage} $ChkImg',
  '  ${If} $MakeDesktop == 1',
  '    StrCpy $MakeDesktop 0',
  '    ${NSD_SetImage} $ChkCtl "$PLUGINSDIR^chk-off.bmp" $ChkImg',
  '  ${Else}',
  '    StrCpy $MakeDesktop 1',
  '    ${NSD_SetImage} $ChkCtl "$PLUGINSDIR^chk-on.bmp" $ChkImg',
  '  ${EndIf}',
  'FunctionEnd',
  '',
  'Function fcOnInstall',
  '  Pop $0',
  '  SendMessage $HWNDPARENT ${WM_COMMAND} 1 0',
  'FunctionEnd',
  '',
  'Function fcOnCancel',
  '  Pop $0',
  '  SendMessage $HWNDPARENT ${WM_CLOSE} 0 0',
  'FunctionEnd',
  '',
  '; Страница установки живёт меньше секунды: тот же тёмный фон, без списка файлов.',
  'Function fcInstShow',
  '  Call fcHideChrome',
  '  FindWindow $1 "#32770" "" $HWNDPARENT',
  '  Call fcFillClient',
  '  SetCtlColors $1 ${C_MUTED} ${C_DARK}',
  '',
  '  GetDlgItem $0 $1 1016',
  '  ShowWindow $0 ${SW_HIDE}',
  '',
  '  GetDlgItem $0 $1 1006',
  '  SetCtlColors $0 ${C_MUTED} ${C_DARK}',
  '  ${FcPlace} $0 190 296 300 20',
  '',
  '  GetDlgItem $0 $1 1004',
  '  ${FcPlace} $0 190 326 300 8',
  'FunctionEnd',
  '',
  'Section "FemboyChat"',
  '  SetOutPath "$INSTDIR"',
  '',
  '  ; Если приложение запущено, файл будет занят.',
  '  nsExec::Exec "taskkill /F /IM ${APP_EXE}"',
  '  Pop $0',
  '  Sleep 300',
  '',
  '  File "@EXE@"',
  '  WriteUninstaller "$INSTDIR^uninstall.exe"',
  '',
  '  WriteRegStr HKCU "Software^FemboyChat" "InstallDir" "$INSTDIR"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "FemboyChat"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VER}"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "kultik1337"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR^${APP_EXE}"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$INSTDIR^uninstall.exe"',
  '  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"',
  '  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1',
  '  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1',
  '',
  '  CreateShortcut "$SMPROGRAMS^FemboyChat.lnk" "$INSTDIR^${APP_EXE}"',
  '  ${If} $MakeDesktop == 1',
  '    CreateShortcut "$DESKTOP^FemboyChat.lnk" "$INSTDIR^${APP_EXE}"',
  '  ${EndIf}',
  '',
  '  SetAutoClose true',
  'SectionEnd',
  '',
  '; После установки сразу открываем мессенджер — без финальной страницы.',
  'Function .onInstSuccess',
  '  Exec "$INSTDIR^${APP_EXE}"',
  'FunctionEnd',
  '',
  'Section "Uninstall"',
  '  nsExec::Exec "taskkill /F /IM ${APP_EXE}"',
  '  Pop $0',
  '  Sleep 300',
  '',
  '  Delete "$INSTDIR^${APP_EXE}"',
  '  Delete "$INSTDIR^uninstall.exe"',
  '  RMDir "$INSTDIR"',
  '',
  '  Delete "$SMPROGRAMS^FemboyChat.lnk"',
  '  Delete "$DESKTOP^FemboyChat.lnk"',
  '',
  '  DeleteRegKey HKCU "${UNINST_KEY}"',
  '  DeleteRegKey HKCU "Software^FemboyChat"',
  'SectionEnd',
  '',
].join('\n')

mkdirSync(outDir, { recursive: true })

// Знак ^ во всём тексте выше означает обратный слэш — см. комментарий в шапке.
const BACKSLASH = String.fromCharCode(92)

const nsi = NSI.split('^')
  .join(BACKSLASH)
  .replace('@ICON@', paths.icon)
  .replace('@ICON@', paths.icon)
  .replace('@BG@', paths.bg)
  .replace('@CHKON@', paths.chkOn)
  .replace('@CHKOFF@', paths.chkOff)
  .replace('@EXE@', paths.exe)
  .replaceAll('@VERSION@', version)

writeFileSync(resolve(outDir, 'installer.nsi'), nsi, 'utf8')

console.log(`\u2713 сценарий установщика: src-tauri/installer/installer.nsi (версия ${version})`)
