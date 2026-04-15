# QA Form Autofill for EnquiryTracker

## Что это
Chrome-расширение для автозаполнения форм EnquiryTracker (`webforms`, `application`, `request-application`).

Инструмент заточен под QA и демо-сценарии: быстро заполняет поля, проходит шаги, работает с Angular Material компонентами и запоминает ваши ручные правки.

## Польза
- Экономит время на ручное заполнение длинных форм.
- Повышает стабильность QA-прогонов (меньше человеческих ошибок).
- Подходит для smoke/regression и повторяемых demo flow.
- Поддерживает ET-специфику:
  - `mat-select` / overlay списки
  - radio/checkbox/toggle
  - intl phone
  - Google Places address
  - datepicker (календарь)
  - upload документов
  - signature canvas

## Ключевые возможности
- Профили заполнения: `Random` и `Default`.
- Автоопределение типа формы по URL/контенту.
- Пер-форм рецепты (general/event/application/prospectus).
- Self-healing поиск полей (formcontrolname/name/id/aria/label/nearby text).
- Learning engine:
  - хранит значения по форме
  - учитывает контекст (форма/шаг/секция/кандидаты поля)
- Автопроход степперов.
- Автопопап на поддерживаемых доменах ET.
- Опции в popup:
  - dropdown strategy
  - auto submit
  - dry run
  - debug
  - toggle denylist
  - export/import config

## Поддерживаемые URL
- `https://dev.enquirytracker.net/webforms/...`
- `https://staging.enquirytracker.net/webforms/...`
- `https://app.enquirytracker.net/webforms/...`
- `https://app-us.enquirytracker.net/webforms/...`
- `.../application/...`
- `.../request-application/...`

## Как пользоваться
1. Установите зависимости:
   - `npm install`
2. Соберите расширение:
   - `npm run build`
3. Откройте `chrome://extensions/`
4. Включите `Developer mode`
5. Нажмите `Load unpacked` и выберите папку проекта
6. После изменений в коде:
   - снова `npm run build`
   - в `chrome://extensions/` нажмите `Reload`

## Быстрый сценарий
1. Откройте форму EnquiryTracker.
2. Нажмите иконку расширения.
3. Выберите режим (если нужно) и нажмите `Fill Form`.
4. При необходимости включите `Debug` для отчета последнего прогона.

## Примечания
- Проверочные коды (например verification code/captcha) обычно нужно вводить вручную.
- Расширение сохраняет обученные значения в `chrome.storage.local`.
- Для очистки памяти используйте `Reset Learned` в popup.
