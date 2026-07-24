# FemboyChat — шаблоны писем (Supabase Auth)

Красиво стилизованные письма в фирменных цветах FemboyChat. Подставляются в
**Supabase → Authentication → Email Templates**. Каждый файл соответствует одному
типу письма:

| Файл | Раздел в Supabase | Переменная |
| --- | --- | --- |
| `confirm-signup.html` | Confirm signup | `{{ .ConfirmationURL }}` |
| `magic-link.html` | Magic Link | `{{ .ConfirmationURL }}` |
| `recovery.html` | Reset Password | `{{ .ConfirmationURL }}` |
| `email-change.html` | Change Email Address | `{{ .ConfirmationURL }}` |
| `invite.html` | Invite user | `{{ .ConfirmationURL }}` |

## Как подключить

1. Supabase → **Authentication → Providers → Email**: включи **Confirm email**.
2. Проверь, что **Authentication → URL Configuration → Site URL** = `https://femboychat.fun`
   (и при желании добавь `http://localhost:5173` в Redirect URLs для локальной разработки).
3. Убедись, что кастомный SMTP включён (**Authentication → Emails → SMTP Settings**),
   иначе письма не уйдут.
4. Открой **Authentication → Email Templates**, выбери каждый тип письма из таблицы
   выше и вставь содержимое соответствующего файла в поле «Message body (HTML)».
   Тему (Subject) можно оставить или задать свою, например:
   - Confirm signup — `Подтверди почту в FemboyChat 🎀`
   - Magic Link — `Твоя ссылка для входа ✨`
   - Reset Password — `Сброс пароля FemboyChat 🔑`
   - Change Email — `Подтверди новую почту ✉️`
   - Invite — `Тебя пригласили в FemboyChat 🎀`

Логотип в шапке письма грузится с `https://femboychat.fun/icon.png` — он уже
задеплоен, так что письма выглядят фирменно из коробки.
