/*
  Собственный сценарий установщика (NSIS), макет "Aurora".

  ГЛАВНОЕ РЕШЕНИЕ: весь экран — одна картинка.
  Родные контролы Windows не умеют ни скруглений, ни градиентов, ни теней,
  поэтому scripts/installer-art.mjs рисует весь экран сразу, а здесь сверху
  лежат всего два живых элемента: подпись с путём и картинка галочки.

  ПОЧЕМУ НЕТ НЕВИДИМЫХ ОБЛАСТЕЙ НАЖАТИЯ.
  Раньше над каждой кнопкой лежала пустая прозрачная подпись. Режим
  transparent берёт цвет родительского диалога, а не соседней картинки, и поверх
  градиента такие подписи рискуют проявиться плоскими прямоугольниками.
  Теперь клики принимает сама фоновая картинка, а куда именно попали —
  определяется по положению курсора в fcOnBg. Лишних окон нет совсем.

  ПОЧЕМУ НЕСКОЛЬКО МАСШТАБОВ.
  NSIS показывает bmp как есть и никогда его не масштабирует. Без
  ManifestDPIAware при масштабе экрана 125% Windows растягивала всё окно
  средствами системы, и картинка становилась мылом. Теперь установщик
  честно говорит, что сам разбирается с DPI, смотрит текущий масштаб и
  распаковывает подходящий набор картинок из четырёх.

  КООРДИНАТЫ. Все числа ниже — логические пиксели при 100% и обязаны
  совпадать с LAYOUT в scripts/installer-art.mjs. Макрос FcPlace сам умножает их
  на масштаб целочисленно (x * масштаб / 100), поэтому все числа в LAYOUT
  кратны 4 — иначе на 125% области нажатия уехали бы от рисунка.

  ПОРЯДОК СЛОЁВ. Созданный раньше контрол лежит ВЫШЕ созданного позже,
  поэтому фон создаётся самым последним И дополнительно явно убирается
  в самый низ через HWND_BOTTOM — на порядок создания лучше не полагаться.

  СВОЯ РАМКА. Системная шапка снимается совсем, вместо неё свой крестик.
  Расплата честная: окно нельзя таскать мышкой. Оно открывается по центру
  экрана и живёт меньше минуты. Escape работает: родная кнопка отмены не
  удалена, а только скрыта.

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

/** Тот же список, что и в scripts/installer-art.mjs. */
const SCALES = [100, 125, 150, 200]

const paths = {
  icon: resolve(root, 'src-tauri', 'icons', 'icon.ico'),
  exe: resolve(root, 'src-tauri', 'target', 'release', 'femboychat.exe'),
}

// Распаковка картинок нужного масштаба. В установщик вшиваются все четыре
// набора, но на диск попадает только один.
const tokens = {}
const unpack = []
SCALES.forEach((scale, i) => {
  const kw = i === 0 ? '${If}' : '${ElseIf}'
  unpack.push('  ' + kw + ' $Scale == ' + scale)
  unpack.push('    File "/oname=$PLUGINSDIR^bg.bmp" "@BG' + scale + '@"')
  unpack.push('    File "/oname=$PLUGINSDIR^chk-on.bmp" "@ON' + scale + '@"')
  unpack.push('    File "/oname=$PLUGINSDIR^chk-off.bmp" "@OFF' + scale + '@"')
  tokens['@BG' + scale + '@'] = resolve(outDir, 'bg-' + scale + '.bmp')
  tokens['@ON' + scale + '@'] = resolve(outDir, 'chk-on-' + scale + '.bmp')
  tokens['@OFF' + scale + '@'] = resolve(outDir, 'chk-off-' + scale + '.bmp')
})
unpack.push('  ${EndIf}')

const NSI = [
  '; Файл собран scripts/installer-nsi.mjs — правь генератор, а не этот файл.',
  'Unicode true',
  '; Без этой строки Windows сама растягивает окно на масштабах выше 100%',
  '; и вся графика становится замыленной.',
  'ManifestDPIAware true',
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
  '; Логический размер экрана при 100%.',
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
  '; SS_NOTIFY — без него контрол не сообщает о нажатии.',
  '!define HOT_STYLE 0x00000100',
  '; Текст по середине по высоте + обрезать длинный путь многоточием.',
  '!define PATH_STYLE 0x00004200',
  '',
  '; Поставить контрол в логических пикселях (0x14 = не менять порядок окон).',
  '; $6-$9 — черновики макроса, занимать их чем-то ещё нельзя.',
  '!macro FCPLACE ctl x y w h',
  '  IntOp $6 ${x} * $Scale',
  '  IntOp $6 $6 / 100',
  '  IntOp $7 ${y} * $Scale',
  '  IntOp $7 $7 / 100',
  '  IntOp $8 ${w} * $Scale',
  '  IntOp $8 $8 / 100',
  '  IntOp $9 ${h} * $Scale',
  '  IntOp $9 $9 / 100',
  '  System::Call "user32::SetWindowPos(i ${ctl}, i 0, i $6, i $7, i $8, i $9, i 0x14)"',
  '!macroend',
  '!define FcPlace "!insertmacro FCPLACE"',
  '',
  'Var Scale',
  'Var Dialog',
  'Var BgCtl',
  'Var BgImg',
  'Var ChkCtl',
  'Var ChkImg',
  'Var LblDir',
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
  '  StrCpy $MakeDesktop 1',
  '',
  '  ; Текущий масштаб экрана. 88 = LOGPIXELSX, 96 точек на дюйм = 100%.',
  '  System::Call "user32::GetDC(p 0) p .r0"',
  '  System::Call "gdi32::GetDeviceCaps(p r0, i 88) i .r1"',
  '  System::Call "user32::ReleaseDC(p 0, p r0)"',
  '  ${If} $1 < 108',
  '    StrCpy $Scale 100',
  '  ${ElseIf} $1 < 132',
  '    StrCpy $Scale 125',
  '  ${ElseIf} $1 < 168',
  '    StrCpy $Scale 150',
  '  ${Else}',
  '    StrCpy $Scale 200',
  '  ${EndIf}',
  '',
  ...unpack,
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
  '  IntOp $6 ${WIN_W} * $Scale',
  '  IntOp $6 $6 / 100',
  '  IntOp $7 ${WIN_H} * $Scale',
  '  IntOp $7 $7 / 100',
  '  System::Call "user32::GetSystemMetrics(i 0) i .r0"',
  '  System::Call "user32::GetSystemMetrics(i 1) i .r1"',
  '  IntOp $2 $0 - $6',
  '  IntOp $2 $2 / 2',
  '  IntOp $3 $1 - $7',
  '  IntOp $3 $3 / 2',
  '  ; 0x24 = не менять порядок окон + применить новую рамку.',
  '  System::Call "user32::SetWindowPos(i $HWNDPARENT, i 0, i r2, i r3, i r6, i r7, i 0x24)"',
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
  '  CreateFont $FontText "Segoe UI" 9 400',
  '',
  '  ; ── сначала всё, что лежит ПОВЕРХ картинки ──',
  '',
  '  ; Путь установки — единственная живая надпись. Фон ровно C_FIELD, такой',
  '  ; же, как внутренность поля на картинке, поэтому стыка не видно.',
  '  ; По нажатию на путь тоже открывается выбор папки.',
  '  ${NSD_CreateLabel} 0 0 10 10 "$INSTDIR"',
  '  Pop $LblDir',
  '  SetCtlColors $LblDir ${C_PATH} ${C_FIELD}',
  '  SendMessage $LblDir ${WM_SETFONT} $FontText 1',
  '  ${NSD_AddStyle} $LblDir ${PATH_STYLE}',
  '  ${NSD_AddStyle} $LblDir ${HOT_STYLE}',
  '  ${NSD_OnClick} $LblDir fcOnBrowse',
  '  ${FcPlace} $LblDir 312 252 228 40',
  '',
  '  ; Галочка — кусочек того же фона, поэтому края совпадают точно.',
  '  ${NSD_CreateBitmap} 0 0 10 10 ""',
  '  Pop $ChkCtl',
  '  ${NSD_AddStyle} $ChkCtl ${HOT_STYLE}',
  '  ${NSD_OnClick} $ChkCtl fcOnCheck',
  '  ${FcPlace} $ChkCtl 296 324 20 20',
  '  ${NSD_SetImage} $ChkCtl "$PLUGINSDIR^chk-on.bmp" $ChkImg',
  '',
  '  ; ── фон — САМЫМ ПОСЛЕДНИМ, иначе закроет всё остальное ──',
  '  ${NSD_CreateBitmap} 0 0 10 10 ""',
  '  Pop $BgCtl',
  '  ${NSD_AddStyle} $BgCtl ${HOT_STYLE}',
  '  ${NSD_OnClick} $BgCtl fcOnBg',
  '  ${FcPlace} $BgCtl 0 0 ${WIN_W} ${WIN_H}',
  '  ${NSD_SetImage} $BgCtl "$PLUGINSDIR^bg.bmp" $BgImg',
  '  ; Явно в самый низ: 1 = HWND_BOTTOM, 0x13 = не трогать размер и положение.',
  '  System::Call "user32::SetWindowPos(i $BgCtl, i 1, i 0, i 0, i 0, i 0, i 0x13)"',
  '',
  '  nsDialogs::Show',
  '  ${NSD_FreeImage} $BgImg',
  '  ${NSD_FreeImage} $ChkImg',
  'FunctionEnd',
  '',
  '; Куда нажали по фону. Координаты курсора переводятся в логические,',
  '; чтобы сравнивать с теми же числами, что и в макете.',
  'Function fcOnBg',
  '  Pop $0',
  '  System::Alloc 8',
  '  Pop $0',
  '  System::Call "user32::GetCursorPos(i r0)"',
  '  System::Call "user32::ScreenToClient(i $HWNDPARENT, i r0)"',
  '  System::Call "*$0(i .r1, i .r2)"',
  '  System::Free $0',
  '  IntOp $1 $1 * 100',
  '  IntOp $1 $1 / $Scale',
  '  IntOp $2 $2 * 100',
  '  IntOp $2 $2 / $Scale',
  '',
  '  ; крестик',
  '  ${If} $1 >= 632',
  '  ${AndIf} $2 < 48',
  '    Call fcCancel',
  '    Return',
  '  ${EndIf}',
  '',
  '  ; кнопка Изменить',
  '  ${If} $1 >= 548',
  '  ${AndIf} $1 < 632',
  '  ${AndIf} $2 >= 256',
  '  ${AndIf} $2 < 288',
  '    Call fcBrowse',
  '    Return',
  '  ${EndIf}',
  '',
  '  ; галочка вместе с подписью',
  '  ${If} $1 >= 296',
  '  ${AndIf} $1 < 548',
  '  ${AndIf} $2 >= 320',
  '  ${AndIf} $2 < 348',
  '    Call fcToggle',
  '    Return',
  '  ${EndIf}',
  '',
  '  ; Установить',
  '  ${If} $1 >= 296',
  '  ${AndIf} $1 < 508',
  '  ${AndIf} $2 >= 376',
  '  ${AndIf} $2 < 428',
  '    SendMessage $HWNDPARENT ${WM_COMMAND} 1 0',
  '    Return',
  '  ${EndIf}',
  '',
  '  ; Отмена',
  '  ${If} $1 >= 520',
  '  ${AndIf} $1 < 640',
  '  ${AndIf} $2 >= 376',
  '  ${AndIf} $2 < 428',
  '    Call fcCancel',
  '  ${EndIf}',
  'FunctionEnd',
  '',
  'Function fcBrowse',
  '  nsDialogs::SelectFolderDialog "Куда установить FemboyChat" "$INSTDIR"',
  '  Pop $0',
  '  ${If} $0 != error',
  '    StrCpy $INSTDIR $0',
  '    ${NSD_SetText} $LblDir "$INSTDIR"',
  '  ${EndIf}',
  'FunctionEnd',
  '',
  '; Галочка переключается подменой картинки.',
  'Function fcToggle',
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
  'Function fcCancel',
  '  SendMessage $HWNDPARENT ${WM_CLOSE} 0 0',
  'FunctionEnd',
  '',
  '; Обработчики нажатий получают лишнее значение в стеке — его надо снять.',
  'Function fcOnBrowse',
  '  Pop $0',
  '  Call fcBrowse',
  'FunctionEnd',
  '',
  'Function fcOnCheck',
  '  Pop $0',
  '  Call fcToggle',
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
  '  ${FcPlace} $0 190 300 300 20',
  '',
  '  GetDlgItem $0 $1 1004',
  '  ${FcPlace} $0 190 332 300 8',
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

let nsi = NSI.split('^').join(BACKSLASH)
nsi = nsi.split('@ICON@').join(paths.icon)
nsi = nsi.split('@EXE@').join(paths.exe)
nsi = nsi.split('@VERSION@').join(version)
for (const [token, value] of Object.entries(tokens)) {
  nsi = nsi.split(token).join(value)
}

if (nsi.includes('@')) {
  console.error('\u2716 В сценарии осталась незаменённая метка @...@')
  process.exit(1)
}

writeFileSync(resolve(outDir, 'installer.nsi'), nsi, 'utf8')

console.log(`\u2713 сценарий установщика: src-tauri/installer/installer.nsi (версия ${version})`)
