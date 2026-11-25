# Операции Host

Операции реализуются один раз в Host и вызываются двумя путями:

- панель – `POST /api/dsh-loadout-manager/<op>` через `ctx.connection.fetch.register` (только owner), ответ `{ ok: true, value } | { ok: false, error: { code, message } }`;
- агент – инструмент `loadout` с `action: 'list' | 'set'`: список скиллов и правил с состояниями и переключение. Удаление в корзину остаётся только у пользователя.
