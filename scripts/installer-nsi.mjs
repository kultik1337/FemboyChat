/*
  Собственный сценарий установщика (NSIS).

  Стандартный шаблон Tauri — это MUI2: серая шапка, рамка, четыре
  страницы и кнопки внизу. Как его ни крась картинками, это остаётся
  мастер из девяностых. Здесь шаблон собирается целиком свой: вся
  стандартная обвязка прячется, диалог растягивается на всё окно, кнопки
  нарисованы сами: один экран, одна кнопка, прогресс, автозапуск.

  Важно про OutFile. Бандлер Tauri запускает makensis из своей временной
  папки (target/release/nsis/x64) и сразу после этого переносит оттуда
  файл с жёстко заданным именем nsis-output.exe в bundle/nsis. Если писать
  установщик по своему абсолютному пути, переносить будет нечего и сборка
  падает на ровном месте: `не удается найти указанный файл (os error 2)`.
  Поэтому имя тут именно такое и без пути — итоговое имя с версией
  подставит сам бандлер.

  Про обратный слэш. В первой версии пути писались прямо в строках, и
  уровни экранирования разъехались: в готовом .nsi оказалось по два слэша
  подряд, отчего установщик показывал "AppData\\Local\\FemboyChat", а ветки
  реестра создавались не там, где нужно. Теперь в тексте сценария вместо
  слэша стоит знак ^, и он заменяется на настоящий слэш ровно один раз,
  уже при записи файла. Ставить в этом файле ^ где-то ещё нельзя.

  Урок первой попытки: большой фон-картинки больше нет. NSIS показывает
  BMP без масштабирования, а в Windows созданный раньше контрол лежит выше
  остальных — картинка одновременно обрезалась и закрывала собой весь
  текст. Теперь фон — ровная заливка самого диалога, а все подписи идут
  с таким же тёмным фоном: прозрачность у подписей берёт цвет родителя, а не
  соседней картинки, и на неё полагаться нельзя.

  Кнопки — это подписи со стилем SS_CENTER|SS_CENTERIMAGE|SS_NOTIFY, то
  есть текст стоит по центру и по горизонтали, и по вертикали. Родные
  кнопки Windows не умеют ни своего цвета, ни своего шрифта без полной
  отрисовки владельцем, поэтому в таком экране их нет вовсе.

  Верхнюю системную плашку красим через DWM: она часть окна, а не
  диалога, и без этого белая полоса торчит над тёмным экраном. На
  старых сборках Windows эти вызовы просто ничего не делают.

  Почему генератор, а не готовый .nsi в репозитории: часть путей внутри
  абсолютные, а версия берётся из package.json.

  В тексте сценария море конструкций вида ${If}, поэтому он собран из
  массива обычных строк, а не шаблонной строки: иначе JS попытается
  подставить туда свои переменные.
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
  logo: resolve(outDir, 'logo.bmp'),
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
  '; Палитра та же, что у мессенджера. SetCtlColors ждёт RRGGBB без 0x.',
  '!define C_TEXT FFFFFF',
  '!define C_MUTED 9AA3BD',
  '!define C_ACCENT 7C9CFF',
  '!define C_DARK 0F1017',
  '!define C_FIELD 171A24',
  '!define C_LINE 232637',
  '',
  '; Размер окна установщика в пикселях.',
  '!define WIN_W 600',
  '!define WIN_H 430',
  '',
  '; Стиль подписи, работающей как кнопка: текст по центру по обеим осям.',
  '!define BTN_STYLE 0x00000301',
  '',
  'Var Dialog',
  'Var LogoCtl',
  'Var LogoImg',
  'Var LblTitle',
  'Var LblSub',
  'Var LblLine',
  'Var LblDirCap',
  'Var LblDirBox',
  'Var LblDir',
  'Var LnkDir',
  'Var ChkDesktop',
  'Var LblHint',
  'Var BtnGo',
  'Var BtnCancel',
  'Var FontH1',
  'Var FontText',
  'Var FontSmall',
  'Var FontBtn',
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
  '  File "/oname=$PLUGINSDIR^logo.bmp" "@LOGO@"',
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
  '; Окно: свой размер по центру экрана и тёмная системная плашка.',
  'Function .onGUIInit',
  '  System::Call "user32::GetSystemMetrics(i 0) i .r0"',
  '  System::Call "user32::GetSystemMetrics(i 1) i .r1"',
  '  IntOp $2 $0 - ${WIN_W}',
  '  IntOp $2 $2 / 2',
  '  IntOp $3 $1 - ${WIN_H}',
  '  IntOp $3 $3 / 2',
  '  System::Call "user32::SetWindowPos(i $HWNDPARENT, i 0, i r2, i r3, i ${WIN_W}, i ${WIN_H}, i 0x4)"',
  '',
  '  ; DWMWA_USE_IMMERSIVE_DARK_MODE = 20, дальше цвета плашки (Windows 11).',
  '  System::Call "dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)"',
  '  System::Call "dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 35, *i 0x0017100F, i 4)"',
  '  System::Call "dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 36, *i 0x00BDA39A, i 4)"',
  '  System::Call "dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 34, *i 0x0037263B, i 4)"',
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
  '  SetCtlColors $Dialog ${C_TEXT} ${C_DARK}',
  '',
  '  CreateFont $FontH1 "Segoe UI Semibold" 21 600',
  '  CreateFont $FontText "Segoe UI" 10 400',
  '  CreateFont $FontSmall "Segoe UI" 9 400',
  '  CreateFont $FontBtn "Segoe UI Semibold" 11 600',
  '',
  '  ${NSD_CreateBitmap} 44 40 64 64 ""',
  '  Pop $LogoCtl',
  '  ${NSD_SetImage} $LogoCtl "$PLUGINSDIR^logo.bmp" $LogoImg',
  '',
  '  ${NSD_CreateLabel} 124 44 380 32 "FemboyChat"',
  '  Pop $LblTitle',
  '  SetCtlColors $LblTitle ${C_TEXT} ${C_DARK}',
  '  SendMessage $LblTitle ${WM_SETFONT} $FontH1 1',
  '',
  '  ${NSD_CreateLabel} 126 80 380 18 "Тёплый мессенджер для ПК · версия ${APP_VER}"',
  '  Pop $LblSub',
  '  SetCtlColors $LblSub ${C_MUTED} ${C_DARK}',
  '  SendMessage $LblSub ${WM_SETFONT} $FontSmall 1',
  '',
  '  ; Тонкая линия — это пустая подпись высотой в один пиксель.',
  '  ${NSD_CreateLabel} 44 130 512 1 ""',
  '  Pop $LblLine',
  '  SetCtlColors $LblLine ${C_LINE} ${C_LINE}',
  '',
  '  ${NSD_CreateLabel} 44 156 300 16 "КУДА УСТАНОВИТЬ"',
  '  Pop $LblDirCap',
  '  SetCtlColors $LblDirCap ${C_MUTED} ${C_DARK}',
  '  SendMessage $LblDirCap ${WM_SETFONT} $FontSmall 1',
  '',
  '  ; Подложка поля: подпись во всю ширину со своим фоном.',
  '  ${NSD_CreateLabel} 44 178 512 38 ""',
  '  Pop $LblDirBox',
  '  SetCtlColors $LblDirBox ${C_FIELD} ${C_FIELD}',
  '',
  '  ${NSD_CreateLabel} 58 178 400 38 "$INSTDIR"',
  '  Pop $LblDir',
  '  SetCtlColors $LblDir ${C_TEXT} ${C_FIELD}',
  '  SendMessage $LblDir ${WM_SETFONT} $FontText 1',
  '  ${NSD_AddStyle} $LblDir 0x00000200',
  '',
  '  ${NSD_CreateLabel} 462 178 84 38 "Изменить"',
  '  Pop $LnkDir',
  '  SetCtlColors $LnkDir ${C_ACCENT} ${C_FIELD}',
  '  SendMessage $LnkDir ${WM_SETFONT} $FontSmall 1',
  '  ${NSD_AddStyle} $LnkDir ${BTN_STYLE}',
  '  ${NSD_OnClick} $LnkDir fcOnBrowse',
  '',
  '  ${NSD_CreateCheckbox} 44 236 320 22 "Ярлык на рабочем столе"',
  '  Pop $ChkDesktop',
  '  SetCtlColors $ChkDesktop ${C_MUTED} ${C_DARK}',
  '  SendMessage $ChkDesktop ${WM_SETFONT} $FontSmall 1',
  '  ${NSD_Check} $ChkDesktop',
  '',
  '  ${NSD_CreateLabel} 44 266 460 16 "Установка займёт пару секунд и не требует прав администратора."',
  '  Pop $LblHint',
  '  SetCtlColors $LblHint ${C_MUTED} ${C_DARK}',
  '  SendMessage $LblHint ${WM_SETFONT} $FontSmall 1',
  '',
  '  ${NSD_CreateLabel} 44 308 232 48 "Установить"',
  '  Pop $BtnGo',
  '  SetCtlColors $BtnGo ${C_DARK} ${C_ACCENT}',
  '  SendMessage $BtnGo ${WM_SETFONT} $FontBtn 1',
  '  ${NSD_AddStyle} $BtnGo ${BTN_STYLE}',
  '  ${NSD_OnClick} $BtnGo fcOnInstall',
  '',
  '  ${NSD_CreateLabel} 292 308 148 48 "Отмена"',
  '  Pop $BtnCancel',
  '  SetCtlColors $BtnCancel ${C_MUTED} ${C_FIELD}',
  '  SendMessage $BtnCancel ${WM_SETFONT} $FontText 1',
  '  ${NSD_AddStyle} $BtnCancel ${BTN_STYLE}',
  '  ${NSD_OnClick} $BtnCancel fcOnCancel',
  '',
  '  nsDialogs::Show',
  '  ${NSD_FreeImage} $LogoImg',
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
  'Function fcOnInstall',
  '  Pop $0',
  '  ${NSD_GetState} $ChkDesktop $MakeDesktop',
  '  SendMessage $HWNDPARENT ${WM_COMMAND} 1 0',
  'FunctionEnd',
  '',
  'Function fcOnCancel',
  '  Pop $0',
  '  SendMessage $HWNDPARENT ${WM_CLOSE} 0 0',
  'FunctionEnd',
  '',
  '; Страница установки: тот же тёмный фон, без списка файлов.',
  'Function fcInstShow',
  '  Call fcHideChrome',
  '  FindWindow $1 "#32770" "" $HWNDPARENT',
  '  Call fcFillClient',
  '  SetCtlColors $1 ${C_TEXT} ${C_DARK}',
  '',
  '  GetDlgItem $0 $1 1016',
  '  ShowWindow $0 ${SW_HIDE}',
  '',
  '  GetDlgItem $0 $1 1006',
  '  SetCtlColors $0 ${C_MUTED} ${C_DARK}',
  '  System::Call "user32::SetWindowPos(i r0, i 0, i 44, i 176, i 512, i 20, i 0x14)"',
  '',
  '  GetDlgItem $0 $1 1004',
  '  System::Call "user32::SetWindowPos(i r0, i 0, i 44, i 208, i 512, i 10, i 0x14)"',
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
  .replace('@LOGO@', paths.logo)
  .replace('@EXE@', paths.exe)
  .replaceAll('@VERSION@', version)

writeFileSync(resolve(outDir, 'installer.nsi'), nsi, 'utf8')

console.log(`\u2713 сценарий установщика: src-tauri/installer/installer.nsi (версия ${version})`)
