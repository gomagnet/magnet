'use strict';
// Translate presentation text only. Resource names, editor contents and returned
// data are excluded; control values and API payloads always remain unchanged.
(()=>{
 const ru=Object.fromEntries(`
Databases|Базы данных
Find local databases|Поиск локальных баз данных
Connect to database|Подключение к базе данных
Search again|Повторить поиск
Available databases|Доступные базы данных
Find database|Найти базу данных
Find a database…|Найти базу данных…
Local endpoint|Локальный адрес
Engine|СУБД
Close connection|Закрыть подключение
Connecting to database…|Подключение к базе данных…
Searching for databases…|Поиск баз данных…
No matching databases found.|Подходящие базы данных не найдены.
Connect a node to manage databases.|Подключите сервер для управления базами данных.
Discover local MySQL, MariaDB, PostgreSQL and SQLite databases.|Найдите локальные базы данных MySQL, MariaDB, PostgreSQL и SQLite.
Local socket authentication uses the Link account. PostgreSQL requires psql; SQLite requires sqlite3. SQLite files are searched in common data directories.|Для подключения через локальный сокет используется аккаунт Link. Для PostgreSQL нужен psql, для SQLite — sqlite3. Файлы SQLite ищутся в стандартных каталогах данных.
Search limit reached. Some SQLite files may not be listed.|Достигнут предел поиска. Некоторые файлы SQLite могут отсутствовать в списке.
Grid editing requires an InnoDB table with a non-binary primary key. Use SQL for changes in other engines.|Для редактирования в таблице нужна InnoDB с небинарным первичным ключом. В других СУБД используйте SQL.
Use arrow keys to inspect recorded samples.|Используйте стрелки для просмотра записанных значений.
Network history requires ready uplink samples from MagnetLink 0.4.9 or newer.|Для истории сети требуются измерения интернет-интерфейсов от MagnetLink 0.4.9 или новее.
Find an icon|Найти иконку
Find an icon…|Найти иконку…
No matching icons.|Подходящих иконок нет.
Account Tree|Структура
Api|API
Archive|Архив
Backup|Резервная копия
Bolt|Молния
Bug Report|Отладка
Build|Инструменты
Cable|Кабель
Calendar Month|Календарь
Chat|Чат
Cloud Done|Облако готово
Cloud Sync|Синхронизация облака
Construction|Обслуживание
Dashboard|Панель
Data Object|Объект данных
Devices|Устройства
Extension|Расширение
Favorite|Избранное
Folder Shared|Общая папка
Forum|Форум
Gamepad|Геймпад
Hard Drive|Диск
Key|Ключ
Layers|Слои
Lightbulb|Лампочка
Mail|Почта
Network Check|Проверка сети
Notifications|Уведомления
Package 2|Пакет
Rocket Launch|Ракета
Science|Наука
Sensors|Датчики
Smart Toy|Бот
Speed|Скорость
Sports Esports|Игровой сервер
Tune|Регулировка
Update|Обновление
Verified|Проверено
Videocam|Камера
Vpn Key|Ключ VPN
Web|Веб
Webhook|Вебхук
Wifi|Wi-Fi
Performance|Производительность
Processes|Процессы
PID|PID
Swap|Подкачка
Threads|Потоки
Disk read / s|Чтение диска / с
Disk write / s|Запись диска / с
Search processes|Поиск процессов
CPU is a percentage of total server capacity. Memory is resident RAM. Disk rates measure storage I/O; per-process network usage is unavailable.|CPU — доля общей мощности сервера. Память — резидентная RAM. Скорости диска отражают операции с хранилищем; сетевой трафик отдельных процессов недоступен.
Processes visible to the Link account are sampled automatically. New processes need two samples for rates.|Процессы, доступные учётной записи Link, опрашиваются автоматически. Для расчёта скоростей новых процессов нужны два замера.
Loading processes…|Загрузка процессов…
Update MagnetLink to 0.4.10 for process statistics.|Для статистики процессов обновите MagnetLink до 0.4.10.
Process information unavailable|Информация о процессах недоступна
Last sample|Последний замер
Visible processes|Видимые процессы
Some processes exited or could not be read.|Некоторые процессы завершились или недоступны для чтения.
Process list limited to 4096 entries.|Список процессов ограничен 4096 записями.
No visible processes.|Нет доступных процессов.
Process statistics unavailable.|Статистика процессов недоступна.
Inbound|Входящий трафик
Outbound|Исходящий трафик
Internet uplink · Inbound / outbound|Интернет-интерфейс · Входящий / исходящий
Internet-uplink interface rates; LAN traffic sharing an uplink is included.|Скорость интернет-интерфейсов; локальный трафик через тот же интерфейс также учитывается.
Update MagnetLink to 0.4.9 for uplink traffic statistics.|Для статистики интернет-интерфейсов обновите MagnetLink до 0.4.9.
Uplink measurements unavailable or sampling.|Измерения интернет-интерфейсов недоступны или собираются.
Server offline|Сервер не в сети
Permission template|Шаблон разрешений
Custom — selected resources|Настраиваемый — выбранные ресурсы
Viewer — read all resources|Наблюдатель — чтение всех ресурсов
Admin — full access|Администратор — полный доступ
Viewer|Наблюдатель
Viewer (group)|Наблюдатель (группа)
Viewer grants read access to every current and future server and status page. Admin grants full workspace access. Custom uses selected resource grants.|Наблюдатель получает доступ на чтение ко всем текущим и будущим серверам и страницам статуса. Администратор получает полный доступ. Настраиваемый шаблон использует разрешения на выбранные ресурсы.
Permissions combine with user groups and direct grants. A group or Manage grant can add write access to a Viewer template.|Разрешения суммируются с группами и прямыми правами. Группа или разрешение на управление может добавить доступ на запись к шаблону наблюдателя.
Additional grants or groups allow changes. Remove Manage grants and administrator groups for read-only access.|Дополнительные права или группы разрешают изменения. Для доступа только на чтение удалите разрешения на управление и группы администраторов.

Create service|Создать службу
Create systemd service|Создать службу systemd
Choose a template|Выберите шаблон
Startup task|Задача при загрузке
Run once at each boot, without automatic restarts.|Выполняется один раз при каждой загрузке, без автоматического перезапуска.
Always running|Постоянная работа
Start at boot and restart after every exit. Keep the command in the foreground.|Запускается при загрузке и перезапускается после любого завершения. Команда должна работать в переднем плане.
Restart on failure|Перезапуск при ошибке
Start at boot and restart only after an unsuccessful exit.|Запускается при загрузке и перезапускается только после ошибки.
Manual task|Ручной запуск
Run once when started manually; boot startup is off by default.|Выполняется один раз по запросу; автозапуск по умолчанию выключен.
What does this task do?|Что делает эта задача?
Command or script|Команда или скрипт
Runs through /bin/sh. Use absolute program paths. Output goes to the system journal.|Выполняется через /bin/sh. Используйте абсолютные пути к программам. Вывод записывается в системный журнал.
Run as Linux user|Пользователь Linux
Working directory|Рабочий каталог
Restart delay (seconds)|Задержка перезапуска (секунды)
Wait for network at startup|Дождаться сети при запуске
Enable at boot|Включить при загрузке
Start immediately after creation|Запустить сразу после создания
A startup task runs once per boot, not once forever. Existing services are never overwritten. Creation requires MagnetLink 0.4.8 or newer and a Link account allowed to manage system services.|Задача выполняется один раз при каждой загрузке. Существующие службы не перезаписываются. Требуется MagnetLink 0.4.8 или новее и учётная запись Link с правами управления системными службами.
Generated service file|Создаваемый файл службы
Use Preview unit to see the exact configuration.|Нажмите «Просмотр unit-файла», чтобы увидеть точную конфигурацию.
Preview unit|Просмотр unit-файла
Configuration changed. Preview again to refresh.|Конфигурация изменилась. Откройте просмотр снова.
At server startup|При загрузке сервера
Once a year|Раз в год
Monthly|Ежемесячно
Weekly|Еженедельно
Daily|Ежедневно
Hourly|Ежечасно
Every minute|Каждую минуту
Every N minutes|Каждые N минут
Minute|Минута
Day|День
Sunday|Воскресенье
Monday|Понедельник
Tuesday|Вторник
Wednesday|Среда
Thursday|Четверг
Friday|Пятница
Saturday|Суббота
Weekdays|По будням
Load scheduled tasks to manage them. Guided cron management requires MagnetLink 0.4.8 or newer.|Загрузите задачи для управления ими. Для редактора cron требуется MagnetLink 0.4.8 или новее.
Server timezone|Часовой пояс сервера
Schedules use the server timezone. Existing environment settings and comments are preserved. Cron must be installed and running.|Расписание использует часовой пояс сервера. Переменные окружения и комментарии сохраняются. Cron должен быть установлен и запущен.
Some entries use unsupported syntax. They are preserved unchanged and remain available in the advanced editor.|Некоторые записи используют неподдерживаемый синтаксис. Они сохраняются без изменений и доступны в расширенном редакторе.
Task|Задача
Schedule|Расписание
Resume|Возобновить
Pause|Приостановить
No scheduled tasks yet. Create a task using a schedule preset.|Задач пока нет. Создайте задачу с готовым расписанием.
Create cron task|Создать задачу cron
Advanced crontab editor|Расширенный редактор crontab
Saving replaces the Link user’s crontab and keeps a backup. Save or discard advanced changes before using task actions.|Сохранение заменяет crontab пользователя Link с резервным копированием. Сохраните или отмените ручные изменения перед управлением задачами.
Load scheduled tasks first|Сначала загрузите задачи
Save advanced crontab changes or reload before using task actions|Сохраните ручные изменения crontab или загрузите его заново перед управлением задачами
Discard unsaved crontab changes?|Отменить несохранённые изменения crontab?
Reload the crontab from the server.|Загрузить crontab с сервера заново.
Task changed; reload the task list|Задача изменилась; обновите список
Edit cron task|Изменить задачу cron
Task name (optional)|Название задачи (необязательно)
Nightly backup|Ночное резервное копирование
Runs as the Link user. Use absolute paths. Escape literal percent signs as \\% (cron otherwise treats them as input separators).|Выполняется от пользователя Link. Используйте абсолютные пути. Экранируйте знак процента как \\%, иначе cron воспримет его как разделитель входных данных.
Every few minutes|Каждые несколько минут
Custom cron expression|Своё выражение cron
Minute of the hour|Минута часа
Day of week|День недели
Day of month|День месяца
Cron expression|Выражение cron
Minute · Hour · Day of month · Month · Day of week, or an @alias|Минута · Час · День месяца · Месяц · День недели, либо @псевдоним
Days 29–31 do not run in months that lack that day.|Задачи на 29–31 число не выполняются в месяцах без этого дня.
When both day of month and day of week are restricted, cron runs when either matches. Clock changes can skip or repeat local times.|Если заданы день месяца и день недели, задача выполняется при совпадении любого из них. При переводе часов возможен пропуск или повтор времени.
Save task|Сохранить задачу
Enter a valid schedule|Укажите допустимое расписание
Scheduled tasks saved|Задачи сохранены
Delete scheduled task?|Удалить задачу?
Resume scheduled task?|Возобновить задачу?
Pause scheduled task?|Приостановить задачу?
Task list changed; reopen this editor|Список задач изменился; откройте редактор заново
Command must be a single nonempty line|Команда должна быть одной непустой строкой
Task name must be a single line|Название задачи должно быть одной строкой
Cron task line exceeds 998 bytes|Строка задачи cron превышает 998 байт
Preview systemd service|Просмотр службы systemd
Read scheduled tasks|Чтение запланированных задач
Update scheduled tasks|Изменение запланированных задач
High resource usage|Высокая нагрузка на ресурсы
Critical resource usage|Критическая нагрузка на ресурсы
CPU usage per core|Загрузка каждого ядра ЦП
Live utilization of each logical CPU|Текущая загрузка каждого логического процессора
Server offline · Live core usage unavailable|Сервер не в сети · Текущая загрузка ядер недоступна
Sampling…|Сбор показаний…
Per-core telemetry requires MagnetLink 0.4.7 or newer.|Для показателей каждого ядра требуется MagnetLink 0.4.7 или новее.
Reconnect the server to see current utilization.|Подключите сервер, чтобы увидеть текущую загрузку.
Self server status|Статус самого сервера
Publish online/offline availability for each linked server, using its Link heartbeat. Server names will be public. This does not measure external reachability or historical uptime.|Публиковать доступность каждого связанного сервера по сигналам Link. Имена серверов станут общедоступными. Эта функция не проверяет доступность извне и не ведёт историю времени работы.
Google Material Symbols|Google Material Symbols
Choose a preset, upload an image, or remove the icon to use the inherited default.|Выберите готовую иконку, загрузите изображение или удалите иконку, чтобы использовать унаследованную.
Unable to load icon presets|Не удалось загрузить готовые иконки
Live server availability · Link heartbeat|Текущая доступность сервера · Сигнал Link
Last heartbeat|Последний сигнал
Awaiting first heartbeat|Ожидание первого сигнала
Status data is outdated|Данные о статусе устарели
Current availability; uptime history is not collected|Текущая доступность; история времени работы не собирается
Cloud|Облако
Computer|Компьютер
Developer Board|Плата разработчика
Dns|DNS
Hub|Хаб
Lan|Локальная сеть
Public|Глобус
Router|Маршрутизатор
Shield|Щит
Storage|Хранилище
Public IPv4|Публичный IPv4
Not detected|Не определён
Selected servers|Выбрано серверов
Batch actions|Действия с выбранными
Clear selection|Снять выделение
Editor sections|Разделы редактора
No unsaved changes|Нет несохранённых изменений
Direct grants|Прямые разрешения
Direct access|Прямой доступ
Resource|Ресурс
Resource category|Категория ресурсов
All resources|Все ресурсы
Assigned only|Только назначенные
Find resources…|Найти ресурсы…
Find resources|Поиск ресурсов
No matching resources.|Подходящие ресурсы не найдены.
Find user groups…|Найти группы пользователей…
Find user groups|Поиск групп пользователей
Find members…|Найти участников…
Find members|Поиск участников
Account details|Данные аккаунта
Account enabled|Аккаунт включён
Invitation settings|Настройки приглашения
Enable account after registration|Включить аккаунт после регистрации
User group memberships|Группы пользователя
User group details|Данные группы пользователей
Group members|Участники группы
Server group details|Данные группы серверов
Member servers|Серверы группы
User group grants|Разрешения групп пользователей
Sign-in and recovery|Вход и восстановление
Authenticator sign-in|Вход через аутентификатор
Security|Безопасность
Reset authenticator enrollment|Сбросить настройку аутентификатора
Manual membership|Ручное назначение
Provider-assigned|Назначено провайдером
Also assigned by provider|Также назначено провайдером
Adds this group’s resource permissions|Добавляет разрешения этой группы
Administrators can manage every server, status page, user and workspace setting.|Администраторы могут управлять всеми серверами, статус-страницами, пользователями и настройками рабочего пространства.
User groups add resource permissions. Provider-assigned memberships cannot be removed here.|Группы пользователей добавляют разрешения на ресурсы. Назначения провайдера нельзя удалить здесь.
Unchecking a manual membership does not remove provider-assigned access.|Снятие ручного назначения не отменяет доступ, назначенный провайдером.
Manage includes View. Direct and inherited permissions combine; removing a direct grant does not remove access inherited from a user group.|«Управление» включает просмотр. Прямые и унаследованные разрешения складываются; удаление прямого разрешения не отменяет доступ через группу пользователей.
Administrator access already covers every resource. These grants are retained if administrator access is removed.|У администратора уже есть доступ ко всем ресурсам. Эти разрешения сохранятся при снятии прав администратора.
Server-group grants include current and future member servers.|Разрешения на группу серверов распространяются на текущие и будущие серверы группы.
The invitation works once and expires after three hours. The recipient chooses their account details and must set up an authenticator.|Приглашение действует один раз в течение трёх часов. Получатель выбирает данные аккаунта и обязательно настраивает аутентификатор.
Disabling this account prevents sign-in and revokes its sessions.|Отключение аккаунта запрещает вход и отзывает его сессии.
This account uses an authenticator or recovery code. Its only authenticator cannot be disabled or reset.|Этот аккаунт использует аутентификатор или код восстановления. Его единственный аутентификатор нельзя отключить или сбросить.
Leave the password empty to keep it unchanged. Sensitive tools require an enrolled authenticator.|Оставьте пароль пустым, чтобы сохранить текущий. Для важных инструментов нужен настроенный аутентификатор.
The user must enroll again before accessing sensitive tools. Their other sessions will be revoked.|Пользователю потребуется заново настроить аутентификатор для доступа к важным инструментам. Остальные сессии будут отозваны.
Manage manual membership from each user’s User groups tab. Provider memberships are managed in OpenID settings.|Ручные назначения меняются на вкладке «Группы пользователей» в редакторе пользователя. Назначения провайдера управляются в настройках OpenID.
No members yet. Assign this group when editing a user or creating an invitation.|Участников пока нет. Назначьте группу при редактировании пользователя или создании приглашения.
Members inherit this group’s resource permissions. Manage includes View.|Участники наследуют разрешения группы на ресурсы. «Управление» включает просмотр.
TOTP is enabled. Sign-in and sensitive actions require verification. Verification stays active for 30 minutes of inactivity. Sensitive actions renew it within the current session.|TOTP включён. Вход и важные действия требуют подтверждения. Оно сохраняется на 30 минут неактивности и продлевается важными действиями в пределах текущей сессии.
Enter a fresh authenticator code or an unused recovery code. Verification stays active for 30 minutes of inactivity, until your session expires.|Введите свежий код аутентификатора или неиспользованный код восстановления. Подтверждение сохраняется на 30 минут неактивности, но не дольше текущей сессии.
Server groups|Группы серверов
Server group|Группа серверов
New server group|Новая группа серверов
Edit server group|Изменить группу серверов
Save server group|Сохранить группу серверов
Server group saved|Группа серверов сохранена
Delete server group?|Удалить группу серверов?
Edit group|Изменить группу
Group color|Цвет группы
Ungrouped servers|Серверы без группы
No server groups yet.|Групп серверов пока нет.
Find servers|Поиск серверов
Find servers…|Найти серверы…
User group access|Доступ групп пользователей
No group grant|Нет группового разрешения
Create user groups in Users & access.|Создайте группы пользователей в разделе «Пользователи и доступ».
Group icons are inherited by servers without their own icon. User group grants apply to every server in the group.|Серверы без собственного значка используют значок группы. Разрешения групп пользователей распространяются на все серверы группы.
A server belongs to one group. Selecting it here moves it from its current group and changes inherited access.|Сервер входит в одну группу. Выбор перемещает его из текущей группы и меняет унаследованный доступ.
Grant View or Manage to user groups. Access includes current and future servers in this group. Direct user grants are preserved.|Предоставьте группам пользователей просмотр или управление. Доступ распространяется на текущие и будущие серверы группы. Прямые разрешения пользователей сохраняются.
Servers will be kept and become ungrouped. Access inherited from this server group will be removed.|Серверы сохранятся и останутся без группы. Доступ, унаследованный от этой группы серверов, будет удалён.
Authenticator setup required|Необходима настройка аутентификатора
Set up an authenticator in Settings before accessing sensitive tools|Настройте аутентификатор в настройках перед доступом к важным инструментам
Set up an authenticator in Settings before accessing sensitive tools.|Настройте аутентификатор в настройках перед доступом к важным инструментам.
Set up an authenticator to unlock sensitive tools and server management.|Настройте аутентификатор для доступа к важным инструментам и управлению серверами.
Open Settings|Открыть настройки
username is required|Необходимо имя пользователя
use username admin and the initialization password during setup|Для первоначальной настройки используйте имя admin и пароль инициализации
username is reserved; restart invitation enrollment|Это имя пользователя зарезервировано; начните регистрацию по приглашению заново
server group changed; reopen its editor|Группа серверов изменилась; откройте редактор заново
server group changed or was removed; refresh before deleting|Группа серверов изменилась или удалена; обновите список перед удалением
server group revision required|Необходима версия группы серверов
server group not found|Группа серверов не найдена
Server group no longer exists|Группа серверов больше не существует
cannot create group; name may already exist|Не удалось создать группу; возможно, имя уже занято
valid group name, color, servers and access rules required|Укажите допустимое имя, цвет, серверы и правила доступа
selected server no longer exists|Выбранный сервер больше не существует
selected user group no longer exists|Выбранная группа пользователей больше не существует
select distinct user groups and View or Manage access|Выберите разные группы пользователей и доступ «Просмотр» или «Управление»
another cleanup operation is in progress|Другая операция очистки уже выполняется
cleanup scan expired or was consumed; scan again|Сканирование очистки истекло или уже использовано; повторите его
invalid, duplicate or protected cleanup selection|Недопустимый, повторяющийся или защищённый объект в списке очистки
acknowledge the warning for potentially important data|Подтвердите предупреждение о потенциально важных данных
select either a folder or its children, not both|Выберите папку или её содержимое, но не одновременно
parent folder changed or contains a symbolic link; preserved|Родительская папка изменилась или содержит символическую ссылку; объект сохранён
item changed since scan; preserved, scan again|Объект изменился после сканирования; он сохранён, повторите сканирование
image is now referenced by a container; preserved|Образ теперь используется контейнером; он сохранён
volume is now attached to a container; preserved|Том теперь подключён к контейнеру; он сохранён
container is active; preserved|Контейнер активен; он сохранён
APT is using its cache; item preserved|APT использует свой кэш; объект сохранён
Cleanup|Очистка
Disk cleanup|Очистка диска
Scan disk usage|Проверить использование диска
Clean selected items|Очистить выбранные объекты
Folder to scan|Папка для сканирования
Requires MagnetLink 0.4.4|Требуется MagnetLink 0.4.4
Disk usage by folder|Использование диска по папкам
Disk usage|Место на диске
Scan folder|Сканировать папку
Cleanup candidates|Объекты для очистки
Package cache|Кэш пакетов
Thumbnail cache|Кэш миниатюр
Unused Docker image|Неиспользуемый образ Docker
Stopped container|Остановленный контейнер
Unused Docker volume|Неиспользуемый том Docker
Large file|Большой файл
Large folder|Большая папка
Regenerable|Можно восстановить
Unused|Не используется
Protected|Защищено
Find cleanup items…|Найти объекты для очистки…
Find cleanup items|Поиск объектов для очистки
Cleanup category|Категория очистки
All categories|Все категории
Select visible low-risk items|Выбрать показанные объекты с низким риском
Estimated size|Приблизительный размер
Category|Категория
Review|Проверка
Item|Объект
folders|папок
selected|выбрано
unknown sizes|размер части объектов неизвестен
Review selected items|Проверить выбранные объекты
Delete selected items?|Удалить выбранные объекты?
Delete selected items|Удалить выбранные объекты
Cleanup results|Результаты очистки
Removed|Удалено
Partially removed|Частично удалено
Not completed|Не завершено
Details|Подробности
Result|Результат
No cleanup candidates match this view.|В этом списке нет подходящих объектов для очистки.
Cleanup operation in progress. Large scans can take several minutes.|Идёт операция очистки. Сканирование больших дисков может занять несколько минут.
Scans the selected filesystem. Other mounts and virtual filesystems are excluded. Docker suggestions cover the whole server. Nothing is selected automatically.|Сканируется выбранная файловая система. Другие точки монтирования и виртуальные файловые системы пропускаются. Объекты Docker относятся ко всему серверу. Ничего не выбирается автоматически.
Allocated disk usage; parent folders include their children. Protected system folders are shown for information only.|Занятое место на диске; размеры родительских папок включают их содержимое. Защищённые системные папки показаны только для информации.
Large files, folders, stopped containers and unused volumes may contain important data. Review them before selecting. Only selected items are deleted.|Большие файлы, папки, остановленные контейнеры и неиспользуемые тома могут содержать важные данные. Проверьте их перед выбором. Удаляются только выбранные объекты.
Suggestions include the largest files from 512 MiB, folders from 1 GiB, regenerable caches, and up to 20 unused resources per Docker category. Unreadable or overly large folders are excluded from deletion.|Предлагаются крупнейшие файлы от 512 МиБ, папки от 1 ГиБ, восстанавливаемый кэш и до 20 неиспользуемых ресурсов каждой категории Docker. Недоступные или слишком большие для проверки папки не предлагаются для удаления.
Shared image layers and nested folders can overlap. Actual reclaimed space may be smaller.|Общие слои образов и вложенные папки могут пересекаться. Реально освобождённое место может быть меньше.
Select either a folder or its children, not both.|Выберите папку или её содержимое, но не одновременно.
This scan expired. Scan again before cleanup.|Срок действия сканирования истёк. Повторите сканирование перед очисткой.
Only the items listed below will be deleted. Deletion is permanent. Changed files and Docker resources that are now in use will be preserved.|Будут удалены только перечисленные ниже объекты. Удаление необратимо. Изменённые файлы и ресурсы Docker, которые уже используются, будут сохранены.
I understand that these items may contain important data and have reviewed my selection.|Я понимаю, что эти объекты могут содержать важные данные, и проверил свой выбор.
This scan has been consumed. Scan again to refresh usage and find remaining items.|Это сканирование уже использовано. Повторите его, чтобы обновить размеры и найти оставшиеся объекты.
Regenerable cached file|Восстанавливаемый файл кэша
Large file: may contain important data|Большой файл: может содержать важные данные
Protected system data: usage only|Защищённые системные данные: показан только размер
Large folder: deleting it removes its scanned contents; they may be important|Большая папка: удаление затронет проверенное содержимое, которое может быть важным
Stopped container: its writable layer may contain important data; volumes are preserved|Остановленный контейнер: его записываемый слой может содержать важные данные; тома сохраняются
Image not referenced by any running or stopped container; keep local-only images needed for future deployments|Образ не используется запущенными или остановленными контейнерами; сохраните локальные образы, нужные для будущих развёртываний
Unused volume: may contain databases or other important data, even without attached containers|Неиспользуемый том: даже без подключённых контейнеров может содержать базы данных или другие важные данные
Selected item removed|Выбранный объект удалён
Showing the 100 largest folders|Показаны 100 крупнейших папок
Other mounted filesystems were skipped; scan their mount folder separately|Другие файловые системы пропущены; просканируйте их точки монтирования отдельно
Mount information unavailable; filesystem deletion is disabled|Информация о точках монтирования недоступна; удаление файлов отключено
Console|Консоль
Files|Файлы
Read-only|Только чтение
Container command|Команда контейнера
Close container tools|Закрыть инструменты контейнера
Container console|Консоль контейнера
Browse container files|Просмотр файлов контейнера
Read container file|Чтение файла контейнера
Commands run inside this container in separate shells. Interactive programs are not supported.|Команды выполняются внутри контейнера в отдельных оболочках. Интерактивные программы не поддерживаются.
Container files are read-only|Файлы контейнера доступны только для чтения
APT repositories|Репозитории APT
Add repository file|Добавить файл репозитория
Edit repository file|Изменить файл репозитория
Remove repository file?|Удалить файл репозитория?
Save repository file|Сохранить файл репозитория
Filename|Имя файла
Repository configuration|Конфигурация репозитория
No repository files.|Нет файлов репозиториев.
Edit .list and deb822 .sources files. Existing repository signing keys are preserved.|Редактируйте файлы .list и deb822 .sources. Существующие ключи подписи репозиториев сохраняются.
Use Signed-By with a keyring installed on the server. Saving does not upgrade packages.|Укажите Signed-By с файлом ключей на сервере. Сохранение не обновляет пакеты.
Server DNS|DNS сервера
DNS changes persist across restarts. Network managers are detected on the server.|Настройки DNS сохраняются после перезагрузки. Сетевой менеджер определяется на сервере.
Current resolver configuration|Текущая конфигурация DNS
DNS server IP addresses|IP-адреса DNS-серверов
Enter up to six IPv4 or IPv6 addresses, separated by spaces.|Введите до шести адресов IPv4 или IPv6 через пробел.
Save DNS|Сохранить DNS
This resolver manager requires manual configuration.|Этот менеджер DNS требует ручной настройки.
Loading configuration…|Загрузка конфигурации…
Configuration saved|Конфигурация сохранена
Avatar|Аватар
Save avatar|Сохранить аватар
Avatar saved|Аватар сохранён
PNG or SVG image|Изображение PNG или SVG
Remove image|Удалить изображение
Maximum 256 KiB. PNG dimensions up to 4096 × 4096.|Максимум 256 КиБ. Размер PNG — до 4096 × 4096.
OpenID accounts receive their provider avatar after every completed login.|Аккаунты OpenID получают аватар от провайдера после каждого завершённого входа.
Choose a PNG or SVG image up to 256 KiB|Выберите изображение PNG или SVG до 256 КиБ
Unable to read image|Не удалось прочитать изображение
Server settings saved|Настройки сервера сохранены
Save settings|Сохранить настройки
View overview →|Открыть обзор →
List APT repositories|Список репозиториев APT
Save APT repository file|Сохранение файла репозитория APT
Remove APT repository file|Удаление файла репозитория APT
Read DNS configuration|Чтение конфигурации DNS
Save DNS configuration|Сохранение конфигурации DNS
Overview|Обзор
Hours|Часы
Days|Дни
Now|Сейчас
History view|Вид истории
90 hours ago|90 часов назад
Uptime over the past 90 hours|Доступность за последние 90 часов
90-hour check history; hover over each hour for details|История проверок за 90 часов; наведите курсор на час для подробностей
90-day check history; hover over each day for details|История проверок за 90 дней; наведите курсор на день для подробностей
The installed MagnetStatus renderer shows hourly history by default, with a daily view and incident timelines.|Установленный MagnetStatus по умолчанию показывает почасовую историю. Также доступны история по дням и хронология инцидентов.
Retry|Повторить
Loading configuration…|Загрузка конфигурации…
Console|Консоль
Files|Файлы
Read-only|Только чтение
Container command|Команда контейнера
Close container tools|Закрыть инструменты контейнера
Container console|Консоль контейнера
Browse container files|Просмотр файлов контейнера
Read container file|Чтение файла контейнера
Commands run inside this container in separate shells. Interactive programs are not supported.|Команды выполняются внутри контейнера в отдельных оболочках. Интерактивные программы не поддерживаются.
Container files are read-only|Файлы контейнера доступны только для чтения
APT repositories|Репозитории APT
Add repository file|Добавить файл репозитория
Edit repository file|Изменить файл репозитория
Edit .list and deb822 .sources files. Existing repository signing keys are preserved.|Редактируйте файлы .list и deb822 .sources. Существующие ключи подписи репозиториев сохраняются.
No repository files.|Нет файлов репозиториев.
Server DNS|DNS сервера
DNS changes persist across restarts. Network managers are detected on the server.|Настройки DNS сохраняются после перезапуска. Сетевой менеджер определяется на сервере.
Current resolver configuration|Текущая конфигурация DNS
DNS server IP addresses|IP-адреса DNS-серверов
Enter up to six IPv4 or IPv6 addresses, separated by spaces.|Введите до шести адресов IPv4 или IPv6 через пробел.
Save DNS|Сохранить DNS
This resolver manager requires manual configuration.|Этот DNS-менеджер требует ручной настройки.
Filename|Имя файла
Repository configuration|Конфигурация репозитория
Use Signed-By with a keyring installed on the server. Saving does not upgrade packages.|Используйте Signed-By с ключом, установленным на сервере. Сохранение не обновляет пакеты.
Save repository file|Сохранить файл репозитория
Remove repository file?|Удалить файл репозитория?
Server context changed|Выбранный сервер изменился
Configuration saved|Конфигурация сохранена
Avatar|Аватар
Avatar saved|Аватар сохранён
Save avatar|Сохранить аватар
Remove image|Удалить изображение
PNG or SVG image|Изображение PNG или SVG
Maximum 256 KiB. PNG dimensions up to 4096 × 4096.|Максимум 256 КиБ. Размер PNG — до 4096 × 4096.
OpenID accounts receive their provider avatar after every completed login.|Аватар аккаунта OpenID обновляется из провайдера после каждого завершённого входа.
invalid username or password|неверное имя пользователя или пароль
invalid login|неверные данные для входа
account security unavailable|настройки безопасности аккаунта недоступны
cannot save user; username may already exist|не удалось сохранить пользователя; возможно, это имя уже занято
duplicate group|группа указана повторно
group no longer exists|группа больше не существует
cannot delete your current account|нельзя удалить свой текущий аккаунт
group name required|укажите название группы
group not found|группа не найдена
cannot save group; name may already exist|не удалось сохранить группу; возможно, это название уже занято
new password must be 12–72 bytes|новый пароль должен содержать от 12 до 72 байт
current local password is incorrect|текущий локальный пароль неверен
password changed concurrently|пароль был изменён параллельно
invalid verification code|неверный код подтверждения
invalid authenticator code|неверный код аутентификатора
unsupported command|команда не поддерживается; обновите MagnetLink
Compose projects and their configuration files appear below.|Ниже показаны проекты Compose и их файлы конфигурации.
Monitoring recovery|Наблюдаем за восстановлением
Working|Выполняется
CONNECTION|ПОДКЛЮЧЕНИЕ
Find table|Найти таблицу
Find a table…|Поиск таблицы…
＋ Create user|＋ Создать пользователя
status page not found|страница статуса не найдена
invalid status page|неверные параметры страницы статуса
invalid status page settings|неверные настройки страницы статуса
select distinct services from the selected servers or this status page|выберите разные сервисы выбранных серверов или этой страницы статуса
affected services must be selected on this status page|затронутые сервисы должны быть выбраны на этой странице статуса
access denied|доступ запрещён
workspace administrator access required|требуется доступ администратора рабочей области
unsupported job kind|неподдерживаемый тип задачи
Compose file exceeds 256 KiB editor limit|размер файла Compose превышает ограничение редактора 256 КиБ
invalid Compose file list|неверный список файлов Compose
selected file is not in this Compose project|выбранный файл не входит в этот проект Compose
invalid Compose project name|неверное имя проекта Compose
Compose services required|требуется раздел services в конфигурации Compose
mariadb-server is installed.|mariadb-server установлен.
mariadb-server is not installed.|mariadb-server не установлен.
Account|Аккаунт
Terminal & files|Терминал и файлы
Applications|Приложения
Content|Содержимое
Logs|Журналы
Yes|Да
Temporary|Временный
Dirty|Изменено
Use default / omit|Использовать значение по умолчанию
Browse files|Просмотр файлов
Retry connection|Повторить подключение
Connecting as the Link user…|Подключение от имени пользователя Link…
Connecting to MariaDB…|Подключение к MariaDB…
Commands run as the Link user in separate shells. Use an explicit cd in each command when needed.|Команды выполняются от имени пользователя Link в отдельных оболочках. При необходимости указывайте cd в каждой команде.
Connecting to MariaDB and preparing your workspace…|Подключение к MariaDB и подготовка рабочей области…
Permissions are assigned by workspace administrators through user and group access rules.|Администраторы назначают права через настройки доступа пользователей и групп.
Confirm your current local password, or leave it empty after a recent OpenID login.|Подтвердите текущий локальный пароль или оставьте поле пустым, если недавно вошли через OpenID.
Group assignment applies on successful provider login. Manual group memberships remain independent.|Группа назначается при успешном входе через провайдера. Группы, назначенные вручную, не меняются.
Register this callback URL with your provider:|Зарегистрируйте этот адрес обратного вызова у провайдера:
Callback URL|Адрес обратного вызова
Its grants and memberships will be removed. Provider assignments to this group will be cleared.|Права и членство группы будут удалены. Автоматическое назначение этой группы провайдерами будет сброшено.
This removes provider login identities and its automatic group memberships. Local passwords and manually assigned groups remain.|Связи аккаунтов с провайдером и назначенное им членство в группах будут удалены. Локальные пароли и ручные назначения групп сохранятся.
This removes their login identities, memberships and grants. The recovery administrator key remains available.|Данные входа, членство в группах и права пользователя будут удалены. Аварийный ключ администратора останется доступен.
Add a time-based code in your authenticator app using this secret (SHA-1, 6 digits, 30 seconds).|Добавьте временной код в аутентификатор с этим секретом (SHA-1, 6 цифр, 30 секунд).
Add an authenticator app to protect sign-in, terminal/file access, database access and node operations.|Подключите аутентификатор для защиты входа, терминала, файлов, баз данных и операций сервера.
Authenticator protection is now enabled. Other browser sessions have been signed out.|Защита аутентификатором включена. Другие браузерные сессии завершены.
Enter a fresh authenticator code or an unused recovery code. A code already used in this 30-second window cannot be reused.|Введите новый код аутентификатора или неиспользованный код восстановления. Код, уже применённый в этом 30-секундном интервале, нельзя использовать повторно.
Open authenticator app ↗|Открыть аутентификатор ↗
Access key copied.|Ключ доступа скопирован.
Access key selected. Press Ctrl+C to copy.|Ключ доступа выделен. Нажмите Ctrl+C для копирования.
Command selected. Press Ctrl+C to copy.|Команда выделена. Нажмите Ctrl+C для копирования.
Setup command copied|Команда установки скопирована
Select and copy the access key above.|Выделите и скопируйте ключ доступа выше.
An empty name uses the system hostname. This changes the name in Magnet.|Пустое поле использует системное имя хоста. Это меняет название только в Magnet.
An item with that name already exists|Элемент с таким именем уже существует
Enter a single file/folder name|Введите имя одного файла или папки
Select at least one server first|Сначала выберите хотя бы один сервер
Select servers to update first|Сначала выберите серверы для обновления
Selected server|Выбранный сервер
Enter package names|Введите имена пакетов
Enter a package URL|Введите URL пакета
Bring a Debian or Ubuntu server into your workspace. A one-time setup key is generated for this connection.|Добавьте сервер Debian или Ubuntu в рабочую область. Для подключения будет создан одноразовый ключ установки.
Place the MagnetLink Linux binary on your server.|Скопируйте исполняемый файл MagnetLink для Linux на сервер.
Generate a command and run it in that directory.|Создайте команду и выполните её в этом каталоге.
Generate setup command →|Создать команду установки →
Your server appears automatically.|Ваш сервер появится автоматически.
Setup scripts are off by default. The command installs MagnetLink as a systemd service.|Сценарии настройки по умолчанию выключены. Команда установит MagnetLink как службу systemd.
Run the optional server-configured setup script|Запустить дополнительный сценарий настройки, заданный на сервере
The setup command expired. Generate a new command to connect your server.|Срок действия команды истёк. Создайте новую команду подключения сервера.
Every Link has an independent 256-bit key. Setup keys expire after 15 minutes and can be used once. Link payloads use AES-GCM authenticated encryption over HTTP or HTTPS.|У каждого Link свой 256-битный ключ. Одноразовые ключи установки действуют 15 минут. Данные Link защищены шифрованием AES-GCM поверх HTTP или HTTPS.
This server is no longer available.|Этот сервер больше недоступен.
Removed server|Удалённый сервер
Inspect the server before submitting this operation again.|Проверьте сервер перед повторным запуском операции.
The operation finished on the previous node. Its output is in Activity & jobs.|Операция завершилась на предыдущем сервере. Результат доступен в разделе «Действия и задачи».
The operation is still pending. Check Activity & jobs before retrying.|Операция ещё не завершена. Перед повторной попыткой проверьте раздел «Действия и задачи».
Updates automatically while this dialog is open.|Обновляется автоматически, пока окно открыто.
No tables to display.|Нет таблиц для отображения.
Edit access|Изменить доступ
Delete MariaDB account?|Удалить аккаунт MariaDB?
Edit database row|Изменить строку базы данных
Insert database row|Добавить строку базы данных
Delete database row|Удалить строку базы данных
Adding access preserves other grants. Revoke removes all grants. Account changes commit individually.|Добавление прав сохраняет остальные разрешения. Отзыв удаляет все права. Изменения каждого аккаунта применяются отдельно.
Some values are shortened. Rows with shortened text are read-only.|Некоторые значения сокращены. Строки с сокращённым текстом доступны только для чтения.
Editing/deleting existing rows requires an InnoDB table with a non-binary primary key. Other tables can be queried in SQL.|Для изменения и удаления строк требуется таблица InnoDB с недвоичным первичным ключом. С остальными таблицами можно работать через SQL.
This permanently removes the selected row. A concurrent change will cancel deletion.|Выбранная строка будет удалена безвозвратно. Одновременное изменение строки отменит удаление.
The database selection changed. Reopen the row.|Выбранная база данных изменилась. Откройте строку заново.
Result limited to 200 rows and bounded cell/output sizes.|Результат ограничен 200 строками и предельным размером ячеек и вывода.
Update MagnetLink to enable table structure and row editing.|Обновите MagnetLink для просмотра структуры таблиц и изменения строк.
Connect a node to manage MariaDB.|Подключите сервер для управления MariaDB.
Connect a node to manage its Linux users.|Подключите сервер для управления пользователями Linux.
Connect a node to open its Link shell and files.|Подключите сервер для доступа к его терминалу и файлам через Link.
This replaces supplementary group membership. Existing home files are not moved.|Список дополнительных групп будет заменён. Существующие файлы домашнего каталога не перемещаются.
Crontab update dispatched|Обновление crontab отправлено
Link uninstall dispatched. Follow its result in Activity & jobs.|Команда удаления Link отправлена. Следите за результатом в разделе «Действия и задачи».
Link transfers are limited to 128 KiB|Передачи через Link ограничены 128 КиБ
Run a shell command through the encrypted Link. Output is available in Activity & jobs.|Выполните команду через зашифрованное соединение Link. Результат доступен в разделе «Действия и задачи».
Run on this server →|Выполнить на этом сервере →
Continue →|Продолжить →
List Compose projects|Список проектов Compose
List containers|Список контейнеров
List Linux users|Список пользователей Linux
List database users|Список пользователей базы данных
List databases|Список баз данных
List services|Список служб
List tables|Список таблиц
Open Compose file|Открыть файл Compose
Open crontab|Открыть crontab
Open file|Открыть файл
Save Compose file|Сохранить файл Compose
Deploy Compose project|Развернуть проект Compose
Manage container|Управлять контейнером
Manage service|Управлять службой
Remove Linux user|Удалить пользователя Linux
Delete file or folder|Удалить файл или папку
Rename file or folder|Переименовать файл или папку
Save database user|Сохранить пользователя базы данных
Delete database user|Удалить пользователя базы данных
View table structure|Просмотреть структуру таблицы
Run command as Link user|Выполнить команду от имени Link
Install a Debian package|Установить пакет Debian
Invalid Compose project list|Неверный список проектов Compose
Node operation failed|Ошибка операции сервера
Create a status page first.|Сначала создайте страницу статуса.
This removes this status page’s custom check and its uptime history.|Собственная проверка этой страницы статуса и история доступности будут удалены.
This removes the server check and its uptime history from every status page that uses it.|Проверка сервера и история доступности будут удалены со всех страниц статуса, использующих её.
Save this command now. The API key is only shown here. It can read this status page’s public data. Any previous renderer key has been revoked.|Сохраните команду сейчас. API-ключ показывается только здесь и позволяет читать публичные данные этой страницы статуса. Предыдущий ключ отозван.
The installed MagnetStatus renderer adds 90-day uptime bars and incident timelines.|Установленный MagnetStatus показывает историю доступности за 90 дней и историю инцидентов.
Targets, request bodies, headers and validation values are encrypted at rest and never published on the status page. Only enter trusted destinations.|Адреса, тела запросов, заголовки и значения проверки хранятся зашифрованными и не публикуются на странице статуса. Указывайте только доверенные адреса.
No services have been published yet.|Пока нет опубликованных сервисов.
Powered by MagnetStatus|Работает на MagnetStatus
The administrator key is stored in data/admin.key. Sessions expire after 12 hours or a server restart. Replace the key and restart MagnetServer to rotate it.|Ключ администратора хранится в data/admin.key. Сессии истекают через 12 часов или после перезапуска сервера. Для смены ключа замените его и перезапустите MagnetServer.
The database password is stored in the server configuration and is never sent to your browser.|Пароль базы данных хранится в конфигурации сервера и никогда не передаётся в браузер.
Connection settings are configured in the database section of magnet.yaml. Restart MagnetServer after editing.|Параметры подключения задаются в разделе database файла magnet.yaml. После изменения перезапустите MagnetServer.
Configure listen, public_url, optional TLS, and the opt-in node setup script in magnet.yaml. Restart the server to apply changes.|Параметры listen, public_url, TLS и дополнительный сценарий настройки узлов задаются в magnet.yaml. Для применения изменений перезапустите сервер.
Settings are saved to the server’s YAML configuration. Database passwords stay on the server. Your administrator key will be generated after setup.|Настройки сохраняются в YAML-конфигурацию сервера. Пароли базы данных остаются на сервере. Ключ администратора будет создан после настройки.
The workspace is still starting. Check the server logs, then try again. Your access key is saved on this page.|Рабочая область ещё запускается. Проверьте журналы сервера и повторите попытку. Ключ доступа сохранён на этой странице.
The server returned an invalid workspace URL.|Сервер вернул неверный адрес рабочей области.
Waiting for your workspace to finish starting…|Ожидание запуска рабочей области…
Waiting for your workspace|Ожидание рабочей области
Waiting for your first signal|Ожидание первого сигнала
Unsupported status version|Неподдерживаемая версия данных статуса
Checks run from MagnetServer, with a 10-second timeout. Redirects are disabled. Minecraft Java uses the default port and _minecraft._tcp SRV record when available; append :port for a custom port.|Проверки выполняются с MagnetServer с тайм-аутом 10 секунд, без перенаправлений. Minecraft Java использует порт по умолчанию и запись _minecraft._tcp SRV, если она доступна. Для другого порта укажите :порт.
Leave empty to validate raw text. Use /data/items/0/status for JSON. Escape / as ~1 and ~ as ~0 in property names. Strings match as text; other values match their JSON form.|Оставьте пустым для проверки обычного текста. Для JSON используйте /data/items/0/status. В именах свойств заменяйте / на ~1 и ~ на ~0. Строки проверяются как текст, остальные значения — в формате JSON.
Browser sessions require HTTPS or a trusted local connection. The default listener is localhost; use an SSH tunnel for remote UI access without a certificate.|Браузерные сессии требуют HTTPS или доверенного локального соединения. По умолчанию сервер слушает localhost. Для удалённого доступа без сертификата используйте SSH-туннель.
Updates are delayed. Retrying automatically. Historical results and notices below were last received at|Обновления задерживаются. Повторяем автоматически. История и сообщения ниже были получены
Welcome to Magnet|Добро пожаловать в Magnet
Servers|Серверы
Server|Сервер
Status pages|Страницы статуса
Status page|Страница статуса
Monitoring|Мониторинг
Users & access|Пользователи и доступ
Batch operations|Массовые операции
Activity & jobs|Действия и задачи
Workspace alerts|Оповещения
Settings|Настройки
Services|Сервисы
Service|Сервис
Containers|Контейнеры
Apps & packages|Приложения и пакеты
Startup & cron|Автозапуск и cron
SSH & files|SSH и файлы
Linux users|Пользователи Linux
Workspace|Рабочая область
WORKSPACE|РАБОЧАЯ ОБЛАСТЬ
SERVER|СЕРВЕР
QUICK ACCESS|БЫСТРЫЙ ДОСТУП
MAGNET WORKSPACE|РАБОЧАЯ ОБЛАСТЬ MAGNET
Infrastructure workspace|Управление инфраструктурой
Personal workspace|Личная рабочая область
Administrator|Администратор
Workspace administrator|Администратор рабочей области
Workspace member|Участник рабочей области
Sign out|Выйти
Language|Язык
Choose your interface language.|Выберите язык интерфейса.
Automatic (system language)|Автоматически (язык системы)
English|Английский
Russian|Русский
Automatic|Автоматически
Light|Светлая
Dark|Тёмная
Theme|Тема
General|Основное
Appearance|Оформление
Installation|Установка
Access|Доступ
View|Просмотр
View only|Только просмотр
Can manage|Управление
Manage|Управление
Actions|Действия
Action|Действие
Name|Название
Title|Заголовок
Type|Тип
Status|Статус
Description|Описание
Address|Адрес
User|Пользователь
Users|Пользователи
Username|Имя пользователя
Password|Пароль
Email (informational)|Электронная почта (для справки)
Display name|Отображаемое имя
Host|Хост
Host or IP|Хост или IP
Port|Порт
Ports|Порты
Enabled|Включено
Disabled|Отключено
Online|В сети
Offline|Не в сети
Operational|Работает
Outage|Недоступен
Major outage|Серьёзный сбой
Degraded|Работает со сбоями
Degraded performance|Снижение производительности
Under maintenance|Технические работы
Awaiting data|Ожидание данных
Awaiting checks|Ожидание проверок
Unknown|Неизвестно
Needs review|Требует проверки
Running|Выполняется
Pending|Ожидание
Failed|Ошибка
Completed|Завершено
Paused|Приостановлено
Scheduled|Запланировано
In progress|В процессе
Verifying|Проверка
Investigating|Изучаем проблему
Identified|Причина найдена
Resolved|Решено
Maintenance|Технические работы
Incident|Инцидент
Incidents & maintenance|Инциденты и техработы
Scheduled maintenance in progress|Плановые технические работы
All systems operational|Все системы работают
Some systems are experiencing an outage|Некоторые системы недоступны
Some systems are experiencing issues|Некоторые системы работают со сбоями
Status information is incomplete|Данные о состоянии неполные
Save|Сохранить
Save changes|Сохранить изменения
Save service|Сохранить сервис
Save file|Сохранить файл
Saved|Сохранено
Saving…|Сохранение…
Unsaved changes|Несохранённые изменения
All changes saved|Все изменения сохранены
Create|Создать
Edit|Изменить
Delete|Удалить
Remove|Удалить
Open|Открыть
Cancel|Отмена
Confirm|Подтвердить
Preview|Предпросмотр
History|История
Start|Запустить
Restart|Перезапустить
Stop|Остановить
Close dialog|Закрыть окно
Close file editor|Закрыть редактор файла
Close Compose editor|Закрыть редактор Compose
Toggle navigation|Открыть меню
Close navigation|Закрыть меню
Skip to content|Перейти к содержимому
Change color theme|Изменить тему
Loading…|Загрузка…
Loading status pages…|Загрузка страниц статуса…
Loading services…|Загрузка сервисов…
Loading containers…|Загрузка контейнеров…
Loading Compose projects…|Загрузка проектов Compose…
Loading the current inventory…|Загрузка текущего списка…
Loading workspace access…|Загрузка настроек доступа…
Loading node accounts…|Загрузка пользователей сервера…
Opening server…|Открытие сервера…
Opening folder…|Открытие папки…
Opening table…|Открытие таблицы…
Retrying automatically.|Повторяем автоматически.
Data loads automatically when this screen opens.|Данные загружаются автоматически при открытии страницы.
The inventory loads automatically.|Список загружается автоматически.
New status page|Новая страница статуса
Create status page|Создать страницу статуса
Delete status page|Удалить страницу статуса
Delete status page?|Удалить страницу статуса?
Status page settings|Настройки страницы статуса
Search status pages|Поиск страниц статуса
Search status pages…|Поиск страниц статуса…
All status pages →|Все страницы статуса →
← All status pages|← Все страницы статуса
Open status page|Открыть страницу статуса
Status pages update automatically.|Страницы статуса обновляются автоматически.
Open a page to manage its services, appearance and updates.|Откройте страницу для управления сервисами, оформлением и сообщениями.
No matching status pages.|Страницы статуса не найдены.
No status pages yet|Пока нет страниц статуса
This status page is no longer available.|Эта страница статуса больше недоступна.
Create a page, choose its services and install MagnetStatus.|Создайте страницу, выберите сервисы и установите MagnetStatus.
You can choose servers, add custom services and customize the page after creating it.|После создания вы сможете выбрать серверы, добавить свои сервисы и настроить оформление.
You have view access. A page manager can change these settings.|У вас доступ для просмотра. Менять настройки может управляющий страницей.
Page details|Сведения о странице
Choose how this page is identified in your workspace and on the public website.|Укажите название в рабочей области и заголовок публичной страницы.
Internal name|Внутреннее название
Public title|Публичный заголовок
Brand & appearance|Бренд и оформление
Match the public page to your website.|Настройте публичную страницу в стиле вашего сайта.
Accent color|Акцентный цвет
Default theme|Тема по умолчанию
Website (HTTPS)|Сайт (HTTPS)
Logo URL (HTTPS)|Ссылка на логотип (HTTPS)
Footer|Подвал страницы
Linked servers|Связанные серверы
Linked server (restricted)|Связанный сервер (доступ ограничен)
Choose servers whose services this status page can publish.|Выберите серверы, сервисы которых будут доступны на этой странице статуса.
Manage server services|Управлять сервисами сервера
No servers available. You can create custom services below.|Нет доступных серверов. Ниже можно создать собственные сервисы.
Published services|Опубликованные сервисы
Published services & order|Опубликованные сервисы и их порядок
Check services to publish. Drag rows or use the arrows to change their order.|Отметьте сервисы для публикации. Перетаскивайте строки или используйте стрелки для изменения порядка.
Move service up|Переместить сервис вверх
Move service down|Переместить сервис вниз
Create a service to get started.|Для начала создайте сервис.
New service|Новый сервис
New custom service|Новый собственный сервис
Custom services|Собственные сервисы
Custom service|Собственный сервис
Create custom service|Создать собственный сервис
Create server service|Создать сервис сервера
Edit service|Изменить сервис
Delete service?|Удалить сервис?
Owned by this server; reusable in workspace status pages|Принадлежат серверу; доступны для страниц статуса рабочей области
Owned by this status page; no server required|Принадлежат этой странице статуса; сервер не требуется
No services yet. Add an HTTP, Minecraft Java, or custom HTTP check.|Пока нет сервисов. Добавьте проверку HTTP, Minecraft Java или собственный HTTP-запрос.
No published services.|Нет опубликованных сервисов.
No services have been published yet.|Пока нет опубликованных сервисов.
Check type|Тип проверки
Public description|Публичное описание
Target|Адрес проверки
Interval|Интервал
Interval (seconds)|Интервал (секунды)
Last check|Последняя проверка
Not checked yet|Пока не проверялся
Enable check|Включить проверку
Website HTTP(S)|Веб-сайт HTTP(S)
Minecraft Java|Minecraft Java
Custom HTTP request|Собственный HTTP-запрос
Expected HTTP status|Ожидаемый HTTP-статус
0 accepts any 2xx response.|0 — принимать любой ответ 2xx.
Method|Метод
Response validation|Проверка ответа
Status code only|Только код состояния
Equals|Равно
Does not equal|Не равно
Contains|Содержит
Does not contain|Не содержит
Starts with|Начинается с
Ends with|Заканчивается на
Request headers (JSON object)|Заголовки запроса (объект JSON)
Request body|Тело запроса
JSON pointer (optional)|Указатель JSON (необязательно)
Expected value|Ожидаемое значение
Headers must be a JSON object with string values.|Заголовки должны быть объектом JSON со строковыми значениями.
Report incident|Сообщить об инциденте
Schedule maintenance|Запланировать техработы
No incidents or maintenance reported.|Инциденты и техработы не зарегистрированы.
Last update|Последнее обновление
Post update|Добавить сообщение
Post lifecycle update|Обновить состояние
Lifecycle|Жизненный цикл
Impact|Влияние
Starts (your local time)|Начало (ваше местное время)
Ends (your local time)|Окончание (ваше местное время)
Scheduled maintenance starts and completes automatically at these times. You can post updates or finish it early.|Техработы начнутся и завершатся автоматически в указанное время. Вы можете публиковать сообщения или завершить работы раньше.
Affected services|Затронутые сервисы
Public update|Публичное сообщение
Publish update|Опубликовать сообщение
Updates append to the public timeline. Lifecycle stages only move forwards.|Сообщения добавляются в публичную историю. Этапы жизненного цикла можно менять только вперёд.
Select published services before creating an incident.|Перед созданием инцидента выберите опубликованные сервисы.
Delete this record?|Удалить эту запись?
This permanently removes this incident or maintenance and its public timeline.|Инцидент или техработы и их публичная история будут удалены безвозвратно.
Host your status page|Разместить страницу статуса
Install MagnetStatus|Установить MagnetStatus
Install MagnetStatus on a host with access to MagnetServer. It displays this page using a read-only API key.|Установите MagnetStatus на хост с доступом к MagnetServer. Он показывает эту страницу с помощью API-ключа только для чтения.
Copy the MagnetStatus executable to your host.|Скопируйте исполняемый файл MagnetStatus на ваш хост.
Generate an install command and run it on that host.|Создайте команду установки и выполните её на этом хосте.
Point your public domain to the renderer with HTTPS.|Направьте публичный домен на хост страницы и настройте HTTPS.
Generate install command|Создать команду установки
Generate command|Создать команду
Generate a renderer install command?|Создать команду установки страницы?
Generating a new command revokes the previous renderer key.|Новая команда отзовёт предыдущий ключ хоста страницы.
This creates a new read-only API key and immediately revokes any previous renderer key for this status page.|Будет создан API-ключ только для чтения. Предыдущий ключ для этой страницы статуса будет немедленно отозван.
Copy command|Копировать команду
Command copied|Команда скопирована
This removes the page, its custom services, incidents and history. Server services remain.|Страница, её собственные сервисы, инциденты и история будут удалены. Сервисы серверов сохранятся.
Its API key, custom services, their history, incidents and maintenance will be removed. Server-owned service checks remain.|API-ключ, собственные сервисы, их история, инциденты и техработы будут удалены. Проверки сервисов серверов сохранятся.
Project|Проект
Configuration files|Файлы конфигурации
Choose a project file to view or edit.|Выберите файл проекта для просмотра или редактирования.
No configuration file reported|Файл конфигурации не указан
No Compose projects found. Projects started outside Docker Compose are shown only in the container list.|Проекты Compose не найдены. Проекты, запущенные без Docker Compose, показаны только в списке контейнеров.
Save & validate|Сохранить и проверить
Deploy project|Развернуть проект
Deploy this Compose project?|Развернуть этот проект Compose?
Compose file saved|Файл Compose сохранён
Compose project deployed|Проект Compose развёрнут
Save your changes before deploying.|Сохраните изменения перед развёртыванием.
Container|Контейнер
Image|Образ
No containers yet|Пока нет контейнеров
Create containers with Docker Compose below.|Создавайте контейнеры с помощью Docker Compose.
Edit container restart policy|Изменить политику перезапуска
Restart policy|Политика перезапуска
Save policy|Сохранить политику
Delete container?|Удалить контейнер?
Container operation dispatched|Команда отправлена контейнеру
Find a server|Найти сервер
All servers|Все серверы
← All servers|← Все серверы
Your servers|Ваши серверы
Search servers|Поиск серверов
⌕ Search servers...|⌕ Поиск серверов...
Filter server status|Фильтр состояния серверов
All statuses|Все состояния
Select all visible servers|Выбрать все видимые серверы
Open a server to manage it. Use the checkboxes for batch actions.|Откройте сервер для управления. Используйте флажки для массовых операций.
No matching servers|Серверы не найдены
Try another name, address, or status.|Попробуйте другое название, адрес или состояние.
Connect a server|Подключить сервер
Connect a server to get started|Подключите сервер для начала работы
Connect your first Debian or Ubuntu server. MagnetLink takes care of the rest.|Подключите первый сервер Debian или Ubuntu. Об остальном позаботится MagnetLink.
A home for every server|Место для каждого сервера
Connected servers|Подключённые серверы
Reporting normally|Данные поступают
Link uninstalled|Link удалён
Not reported|Нет данных
Server details|Сведения о сервере
Edit node|Изменить сервер
Node name saved|Имя сервера сохранено
Operating system|Операционная система
Architecture|Архитектура
Link version|Версия Link
Link user|Пользователь Link
Uptime|Время работы
Root disk (/)|Корневой диск (/)
CPU usage|Загрузка ЦП
Average CPU|Средняя загрузка ЦП
Memory|Память
Memory usage|Использование памяти
Memory utilization|Использование памяти
CPU utilization|Использование ЦП
Network traffic|Сетевой трафик
Network ↓ / ↑|Сеть ↓ / ↑
System load|Нагрузка системы
System load (1m)|Нагрузка системы (1 мин)
Current server utilization|Текущая загрузка сервера
Across online servers|По серверам в сети
RAM currently in use|Используемая оперативная память
Root filesystem space used|Использование корневой файловой системы
Download + upload per second|Получение и отправка в секунду
per second|в секунду
Resource overview|Обзор ресурсов
Live node telemetry|Метрики сервера в реальном времени
Collecting resource history…|Сбор истории метрик…
Connect a server to see live resource history|Подключите сервер для просмотра истории метрик
Recent server activity|Последние действия сервера
Recent workspace activity|Последние действия рабочей области
Workspace activity|Действия рабочей области
Recent jobs|Последние задачи
View all ↗|Показать все ↗
View all servers →|Все серверы →
View all operations →|Все операции →
View output ↗|Показать результат ↗
View monitoring →|Открыть мониторинг →
Last 100 operations|Последние 100 операций
Operation|Операция
Started|Запущено
Job output|Результат задачи
Operation started|Операция запущена
Operation failed|Ошибка операции
Operation completed without output.|Операция завершена без вывода.
Output will appear here automatically.|Результат появится здесь автоматически.
Waiting for node output…|Ожидание результата сервера…
Operations appear here as soon as you run them.|Операции появятся здесь после запуска.
No recent server activity|Нет недавних действий сервера
Connections and operations will appear here.|Здесь появятся подключения и операции.
Just now|Только что
Session expired|Сессия истекла
Verification cancelled|Проверка отменена
Too many attempts. Please try later.|Слишком много попыток. Попробуйте позже.
Too many attempts. Please try again later.|Слишком много попыток. Попробуйте позже.
Unavailable|Недоступно
Workspace administrator access required.|Требуется доступ администратора рабочей области.
Manage access is required for this server tool.|Для этого инструмента требуется право управления сервером.
No servers have been shared with your account. Your status pages are available in the workspace sidebar.|Для вашего аккаунта нет доступных серверов. Страницы статуса доступны в меню рабочей области.
Your account|Ваш аккаунт
User groups|Группы пользователей
Groups|Группы
Group|Группа
New user|Новый пользователь
New group|Новая группа
Create local user|Создать локального пользователя
Create user group|Создать группу пользователей
Edit user access|Изменить доступ пользователя
Edit user group|Изменить группу пользователей
New OpenID provider|Новый провайдер OpenID
OpenID Connect providers|Провайдеры OpenID Connect
Add OpenID provider|Добавить провайдера OpenID
Edit OpenID provider|Изменить провайдера OpenID
No OpenID providers configured.|Провайдеры OpenID не настроены.
No groups|Нет групп
No resources yet.|Пока нет ресурсов.
Create groups to assign membership.|Создайте группы для добавления пользователей.
Create local accounts or allow registration through an OpenID provider. New users have no resource access until assigned grants or a group.|Создайте локальные аккаунты или разрешите регистрацию через OpenID. Новые пользователи получают доступ после назначения прав или группы.
Groups combine resource permissions for their members.|Группы объединяют права доступа своих участников.
Resource access|Доступ к ресурсам
Workspace access|Доступ к рабочей области
No direct grant|Нет прямых прав
Invite user|Пригласить пользователя
Invite a new user|Пригласить нового пользователя
Create invitation|Создать приглашение
Choose this user's access before generating their three-hour invitation link. The user chooses their username, display name and email, then sets up an authenticator.|Настройте доступ пользователя перед созданием ссылки на приглашение сроком на три часа. Пользователь сам выберет имя пользователя, отображаемое имя и электронную почту, затем настроит аутентификатор.
Your administrator has configured your account access. If your account is disabled, contact them before signing in.|Администратор настроил доступ вашей учётной записи. Если она отключена, свяжитесь с ним перед входом.
Manual group memberships|Группы, назначенные вручную
Workspace administrator group|Группа администраторов
Group and user grants combine. Manage includes View. Workspace administrators have access to every resource and account settings.|Права пользователя и групп суммируются. Управление включает просмотр. Администраторы имеют доступ ко всем ресурсам и настройкам аккаунтов.
Issuer URL (HTTPS)|URL издателя (HTTPS)
Client ID|Идентификатор клиента
Token endpoint authentication|Аутентификация на конечной точке токенов
Client secret — HTTP Basic|Секрет клиента — HTTP Basic
Client secret — request body|Секрет клиента — в теле запроса
Public client — PKCE only|Публичный клиент — только PKCE
Automatically assign group|Автоматически назначать группу
No automatic group|Без автоматической группы
Enable provider|Включить провайдера
Allow automatic creation of new user accounts|Разрешить автоматическое создание аккаунтов
Save provider|Сохранить провайдера
Save group|Сохранить группу
Save user|Сохранить пользователя
Save password|Сохранить пароль
Change local password|Изменить локальный пароль
Current password|Текущий пароль
Current local password|Текущий локальный пароль
New password|Новый пароль
New password (leave empty to preserve)|Новый пароль (пустое поле — оставить текущий)
New password (blank keeps current)|Новый пароль (пустое поле — оставить текущий)
OpenID-only accounts use their provider to manage passwords.|Пароли аккаунтов OpenID настраиваются у провайдера.
Reset this user’s authenticator enrollment|Сбросить настройку аутентификатора пользователя
Delete this user?|Удалить этого пользователя?
Delete this group?|Удалить эту группу?
Delete this provider?|Удалить этого провайдера?
The recovery administrator key remains available|Аварийный ключ администратора остаётся доступен
Authenticator protection|Защита аутентификатором
Set up TOTP →|Настроить TOTP →
Disable TOTP|Отключить TOTP
Set up an authenticator|Настроить аутентификатор
Add Magnet to your authenticator|Добавьте Magnet в аутентификатор
Current 6-digit code|Текущий 6-значный код
Enable protection →|Включить защиту →
Disable authenticator protection|Отключить защиту аутентификатором
Save your recovery codes|Сохраните коды восстановления
AUTHENTICATOR VERIFICATION|ПРОВЕРКА АУТЕНТИФИКАТОРА
Confirm this sensitive action|Подтвердите действие
Code|Код
Verify →|Подтвердить →
TOTP disabled|TOTP отключён
Database|База данных
Database name|Имя базы данных
Database accounts|Аккаунты базы данных
Database workspace|Работа с базами данных
Connection security|Безопасность подключения
Public server origin|Публичный адрес сервера
Configuration|Конфигурация
MariaDB connection|Подключение к MariaDB
Connect MariaDB|Подключить MariaDB
Connect to MariaDB|Подключиться к MariaDB
Check MariaDB installation|Проверка установки MariaDB
Checking whether mariadb-server is installed…|Проверяем установку mariadb-server…
Install MariaDB|Установить MariaDB
Install MariaDB Server?|Установить сервер MariaDB?
Install mariadb-server|Установить mariadb-server
Install from APT|Установка из APT
Install packages|Установить пакеты
Install packages →|Установить пакеты →
Install on selected servers →|Установить на выбранных серверах →
Install a .deb package|Установить пакет .deb
Package URL|URL пакета
Package names|Имена пакетов
Package updates|Обновление пакетов
Update packages|Обновить пакеты
Update packages →|Обновить пакеты →
Update selected servers →|Обновить выбранные серверы →
Update selected servers?|Обновить выбранные серверы?
Update server packages?|Обновить пакеты сервера?
Download & install →|Загрузить и установить →
Install packages from your configured repositories.|Устанавливайте пакеты из настроенных репозиториев.
Download a package directly to each selected node.|Загрузите пакет напрямую на выбранные серверы.
Choose servers →|Выбрать серверы →
Change selection →|Изменить выбор →
Select servers in the server list to run a batch operation.|Выберите серверы в списке для массовой операции.
Connect a Debian or Ubuntu server to manage packages.|Подключите сервер Debian или Ubuntu для управления пакетами.
Connect a Docker host to manage its containers.|Подключите хост Docker для управления контейнерами.
Connect a server to manage its startup services and cron.|Подключите сервер для управления службами и cron.
Services & auto-start|Службы и автозапуск
Service name|Имя службы
Control systemd services and whether they start at boot.|Управляйте службами systemd и их запуском при загрузке.
Enable auto-start|Включить автозапуск
Disable auto-start|Отключить автозапуск
Apply action|Выполнить
Scheduled tasks|Запланированные задачи
Crontab|Crontab
Save crontab|Сохранить crontab
Loads automatically. Saving replaces the Link user’s crontab and keeps a backup.|Загружается автоматически. Сохранение заменяет crontab пользователя Link с созданием резервной копии.
Replace the current crontab?|Заменить текущий crontab?
The current crontab will be backed up on the node before replacement.|Перед заменой на сервере будет создана резервная копия crontab.
Create Linux user|Создать пользователя Linux
Edit Linux user|Изменить пользователя Linux
Debian / Ubuntu users|Пользователи Debian / Ubuntu
Account name|Имя аккаунта
Login shell|Оболочка входа
Home directory|Домашний каталог
Supplementary groups (comma-separated)|Дополнительные группы (через запятую)
Account password lock|Блокировка входа по паролю
Leave unchanged|Не менять
Lock|Заблокировать
Unlock|Разблокировать
Home / shell|Каталог / оболочка
Save user →|Сохранить пользователя →
System accounts are included. Deletion preserves home directories.|Системные аккаунты включены. При удалении домашние каталоги сохраняются.
User-management commands require the Link account to be root.|Для управления пользователями Link должен работать от root.
Remove Linux account?|Удалить аккаунт Linux?
Password (blank creates a locked-password account)|Пароль (пустое поле — запретить вход по паролю)
Authentication|Аутентификация
Connection changed|Подключение изменилось
Connected|Подключено
Disconnect|Отключиться
New profile|Новый профиль
Edit profile|Изменить профиль
Delete profile|Удалить профиль
Profile name|Название профиля
New connection (not saved)|Новое подключение (не сохранять)
Save profile →|Сохранить профиль →
Save a connection profile|Сохранить профиль подключения
Edit connection profile|Изменить профиль подключения
Delete connection profile?|Удалить профиль подключения?
Stored credentials for this profile will be removed.|Сохранённые учётные данные профиля будут удалены.
SSH / SFTP profile|Профиль SSH / SFTP
Database connection profile|Профиль подключения к базе данных
New database profile|Новый профиль базы данных
Use the Link account|Использовать аккаунт Link
Run as|Запускать от имени
SSH credentials|Учётные данные SSH
Private key|Закрытый ключ
Or a private key (unencrypted)|Или закрытый ключ (без шифрования)
Optional unencrypted private key|Необязательный незашифрованный закрытый ключ
Verified host fingerprint|Проверенный отпечаток ключа хоста
Fetch host fingerprint|Получить отпечаток ключа хоста
Verify & connect →|Проверить и подключиться →
Connect as Link user →|Подключиться от имени Link →
Clear saved password and private key|Удалить сохранённый пароль и закрытый ключ
Saved · blank keeps current|Сохранено · пустое поле оставляет текущее значение
Saved key · blank keeps current|Ключ сохранён · пустое поле оставляет текущий
Optional|Необязательно
TCP credentials|Учётные данные TCP
TCP · database credentials|TCP · учётные данные базы данных
Unix socket path|Путь Unix-сокета
Socket path|Путь сокета
Default database|База данных по умолчанию
Default database (optional)|База данных по умолчанию (необязательно)
Verified TLS for TCP|Проверять TLS для TCP
Require verified TLS for TCP|Требовать проверенный TLS для TCP
Connect to database →|Подключиться к базе данных →
Choose a database|Выберите базу данных
Choose a database and a table from the explorer.|Выберите базу данных и таблицу в проводнике.
Open a table|Откройте таблицу
Open table|Открыть таблицу
Choose a table or execute a statement to view results.|Выберите таблицу или выполните запрос для просмотра результатов.
Choose a table to view its structure.|Выберите таблицу для просмотра структуры.
Data|Данные
Structure|Структура
SQL statement|SQL-запрос
Return rows|Вернуть строки
Execute change|Выполнить изменение
▶ Execute|▶ Выполнить
Insert row|Добавить строку
＋ Insert row|＋ Добавить строку
Edit row|Изменить строку
Save row|Сохранить строку
Row saved|Строка сохранена
Delete this row?|Удалить эту строку?
Double-click a cell to edit its row|Дважды нажмите на ячейку для изменения строки
← Previous|← Назад
Next →|Далее →
Column|Столбец
Value|Значение
Default|По умолчанию
Extra|Дополнительно
Generated value|Вычисляемое значение
Create MariaDB account|Создать аккаунт MariaDB
Edit MariaDB account|Изменить аккаунт MariaDB
Save database account →|Сохранить аккаунт базы данных →
Account lock|Блокировка аккаунта
Rename to (optional)|Переименовать в (необязательно)
New host (optional)|Новый хост (необязательно)
Privileges|Привилегии
Privilege scope (database name or *)|Область привилегий (имя базы данных или *)
Preserve current privileges|Сохранить текущие привилегии
Add read-only access|Добавить доступ для чтения
Add read/write access|Добавить доступ для чтения и записи
Add all privileges on scope|Добавить все привилегии в области
Revoke all privileges and grant option|Отозвать все привилегии и право их выдачи
Changes commit immediately.|Изменения применяются немедленно.
Download|Скачать
Upload|Загрузить
Folder|Папка
Home|Домашний каталог
Size|Размер
Modified|Изменено
Permissions|Права доступа
Rename|Переименовать
New folder|Новая папка
New file|Новый файл
Create folder|Создать папку
Rename item|Переименовать
File editor|Редактор файла
File saved|Файл сохранён
Remote file saved|Удалённый файл сохранён
File uploaded|Файл загружен
This folder is empty|Папка пуста
No matching files or folders.|Файлы и папки не найдены.
Double-click to open|Дважды нажмите для открытия
Enter a remote file path|Введите путь к файлу на сервере
Select a file or folder first|Сначала выберите файл или папку
Select a file to download|Выберите файл для скачивания
Open a file first|Сначала откройте файл
Save remote file?|Сохранить удалённый файл?
Upload remote file?|Загрузить файл на сервер?
Only an empty folder can be removed.|Можно удалить только пустую папку.
This permanently deletes the selected file.|Выбранный файл будет удалён безвозвратно.
This is a binary file. Use Download instead of the text editor.|Это двоичный файл. Используйте скачивание вместо текстового редактора.
Terminal|Терминал
Command|Команда
Run command|Выполнить команду
Run a command|Выполнить команду
Run ↵|Выполнить ↵
Send ↵|Отправить ↵
Interrupt|Прервать
Clear|Очистить
SSH connected|SSH подключён
Operations run through the encrypted Link.|Операции выполняются через зашифрованное соединение Link.
Waiting for the Link to finish this operation…|Ожидание завершения операции Link…
Alert rules|Правила оповещений
Rule name|Название правила
Metric|Метрика
Greater than|Больше чем
Cooldown (seconds)|Интервал между оповещениями (секунды)
Request method|Метод запроса
Create an alert rule|Создать правило оповещения
Create an alert rule →|Создать правило оповещения →
Edit alert rule|Изменить правило оповещения
Save alert rule →|Сохранить правило →
Delete this alert rule?|Удалить это правило оповещения?
Alert rule saved|Правило оповещения сохранено
This callback will no longer be sent.|Этот запрос больше не будет отправляться.
No check history|Нет истории проверок
No checks|Нет проверок
90 days ago|90 дней назад
Today|Сегодня
Uptime over the past 90 days|Доступность за последние 90 дней
Past incidents & maintenance|Прошлые инциденты и техработы
Upcoming maintenance|Предстоящие техработы
Latest updates|Последние обновления
Visit website ↗|Открыть сайт ↗
No past incidents or maintenance reported.|Прошлые инциденты и техработы не зарегистрированы.
Status temporarily unavailable|Данные о состоянии временно недоступны
We cannot retrieve service status right now. This page will retry automatically.|Сейчас не удаётся получить данные о состоянии сервисов. Страница повторит попытку автоматически.
Loading service status…|Загрузка состояния сервисов…
WELCOME TO MAGNET|ДОБРО ПОЖАЛОВАТЬ В MAGNET
Your infrastructure,|Ваша инфраструктура,
all together.|всё под контролем.
Sign in|Войти
Back to sign in|Вернуться ко входу
Or continue with|Или войдите через
Password / access key|Пароль / ключ доступа
Paste your access key|Вставьте ключ доступа
Authenticator or recovery code (if enabled)|Код аутентификатора или восстановления (если включён)
Authenticator or recovery code|Код аутентификатора или восстановления
6-digit code or recovery code|6-значный код или код восстановления
Verify and sign in →|Подтвердить и войти →
Your provider sign-in succeeded. Complete your account’s authenticator verification.|Вход через провайдера выполнен. Подтвердите вход с помощью аутентификатора аккаунта.
Private workspace · Secure Link connections|Закрытая рабочая область · Защищённые подключения Link
Unable to sign in. Check your access key and authenticator code.|Не удалось войти. Проверьте ключ доступа и код аутентификатора.
Unable to verify sign-in.|Не удалось подтвердить вход.
OpenID sign-in could not be completed. Check that your account and provider are enabled. A workspace administrator can find the failed step in the MagnetServer logs.|Не удалось войти через OpenID. Убедитесь, что аккаунт и провайдер включены. Администратор может найти причину в журналах MagnetServer.
FIRST-TIME SETUP|ПЕРВОНАЧАЛЬНАЯ НАСТРОЙКА
A HOME FOR YOUR INFRASTRUCTURE|ДОМ ДЛЯ ВАШЕЙ ИНФРАСТРУКТУРЫ
Let’s get your workspace ready.|Подготовим вашу рабочую область.
A few connection details, and you’re ready to bring your servers together.|Укажите параметры подключения — и можно объединять серверы.
Your MagnetServer|Ваш MagnetServer
Listen address|Адрес прослушивания
Server URL for nodes|Адрес сервера для узлов
Choose where the server listens and the address your nodes will connect to.|Укажите адрес прослушивания сервера и адрес для подключения узлов.
An IP address and HTTP are supported. No domain or SSL certificate is required.|Поддерживаются IP-адрес и HTTP. Домен и сертификат SSL не обязательны.
Optional HTTPS settings|Дополнительные настройки HTTPS
Certificate path on the server|Путь к сертификату на сервере
Private key path on the server|Путь к закрытому ключу на сервере
Both files must already exist and be readable by MagnetServer.|Оба файла должны существовать и быть доступны для чтения MagnetServer.
Use your existing MariaDB server and account. Magnet will create its tables.|Используйте существующий сервер и аккаунт MariaDB. Magnet создаст необходимые таблицы.
Require verified TLS for the database connection|Требовать проверенный TLS для подключения к базе данных
Create the database if missing (requires CREATE permission)|Создать базу данных, если она отсутствует (нужно право CREATE)
Initialize workspace|Инициализировать рабочую область
Your workspace is ready.|Ваша рабочая область готова.
Copy access key|Копировать ключ доступа
Open workspace →|Открыть рабочую область →
Local key directory:|Локальный каталог ключей:
A copy is saved in|Копия сохранена в
inside the local key directory.|в локальном каталоге ключей.
Setup failed. Check the server logs and try again.|Не удалось выполнить настройку. Проверьте журналы сервера и повторите попытку.
Unable to load setup settings. Reload this page.|Не удалось загрузить настройки. Перезагрузите страницу.
Connect a server to start collecting resource metrics.|Подключите сервер для сбора метрик ресурсов.
Connection security|Безопасность подключения
Administrator access key|Ключ доступа администратора
Copy access key|Копировать ключ доступа
Uninstall Link|Удалить Link
Revoke & remove node|Отозвать доступ и удалить сервер
Revoke this Link?|Отозвать доступ этого Link?
Uninstall MagnetLink?|Удалить MagnetLink?
Save name|Сохранить название
Confirm your administrator access key.|Подтвердите ключ доступа администратора.
Choose a theme, or let Magnet follow your device.|Выберите тему или используйте системную.
Authentication|Аутентификация
Default database|База данных по умолчанию
Your workspace is ready|Ваша рабочая область готова
Connect to a database first|Сначала подключитесь к базе данных
Select a node first|Сначала выберите сервер
No direct grant|Нет прямых прав
None|Нет
System|Система
Connection security|Безопасность подключения
Sign-in|Вход
Members|Участники
Resource grants|Права на ресурсы
New accounts|Новые аккаунты
Automatic group|Автоматическая группа
No matches.|Совпадений нет.
No users yet. Invite a user to get started.|Пользователей пока нет. Пригласите первого пользователя.
No groups yet. Create a group to share resource permissions.|Групп пока нет. Создайте группу для назначения общих прав.
Administrator (group)|Администратор (через группу)
Authenticator|Аутентификатор
Local password|Локальный пароль
Allowed|Разрешены
Blocked|Запрещены
DNS servers|DNS-серверы
Configurable|Доступно изменение
Enter one address per field. Changes persist across restarts.|Введите по одному адресу в каждое поле. Настройки сохраняются после перезапуска.
＋ Add DNS server|＋ Добавить DNS-сервер
IPv4 and IPv6 supported|Поддерживаются IPv4 и IPv6
Reset changes|Сбросить изменения
DNS settings saved|Настройки DNS сохранены
Up to six IPv4 or IPv6 addresses|До шести адресов IPv4 или IPv6
Resolver status|Состояние DNS
Manager|Менеджер
Active resolver addresses|Активные адреса DNS
No resolver addresses reported.|DNS-адреса не получены.
The local resolver stub forwards requests to upstream DNS servers.|Локальная служба DNS перенаправляет запросы внешним DNS-серверам.
DNS server addresses must be unique|DNS-адреса не должны повторяться
This resolver manager requires manual configuration on the server.|Для этого менеджера DNS требуется ручная настройка на сервере.
`.trim().split('\n').map(line=>line.split('|')));
 const skip='script,style,title,textarea,pre,code,[contenteditable=true],[data-i18n-skip],.monaco-editor,.code-editor-source,.job-output,.terminal,.code-box,.explorer-file-name,[data-grid-row],[data-table],.server-link,.server-name small,.alert-detail strong,.status-timeline p,#file-editor-title,#context-server-name,#context-server-address,#login-providers a';
 const en=Object.fromEntries(Object.entries(ru).map(([source,translation])=>[translation,source]));
 const textCache=new WeakMap(),attrCache=new WeakMap();let queued=false,preference='auto';
 try{const saved=localStorage.getItem('magnet-language');if(['auto','en','ru'].includes(saved))preference=saved;}catch{}
 const effective=()=>preference==='auto'?((navigator.languages?.[0]||navigator.language||'en').toLowerCase().startsWith('ru')?'ru':'en'):preference;
 function phrase(source){
  if(effective()!=='ru')return en[source]||source;
  if(ru[source])return ru[source];
  const decorated=source.match(/^([←↗▶＋]?\s*)(.+?)(\s*[→↗↵]?)$/s);if(decorated&&ru[decorated[2]])return decorated[1]+ru[decorated[2]]+decorated[3];
  if(source.includes(' · '))return source.split(' · ').map(phrase).join(' · ');
  const patterns=[[/^(\d+) earlier updates$/,'$1 предыдущих сообщений'],[/^Last checked (.+)$/,'Последняя проверка: $1'],[/^Last seen (.+)$/,'Последний раз в сети: $1'],[/^Last synced (.+)$/,'Последняя синхронизация: $1'],[/^(\d+)m ago$/,'$1 мин назад'],[/^(\d+)h ago$/,'$1 ч назад'],[/^(\d+)d ago$/,'$1 дн назад'],[/^(\d+) container\(s\)$/,'Контейнеров: $1'],[/^(\d+) servers$/,'Серверов: $1'],[/^(\d+) published services$/,'Опубликовано сервисов: $1'],[/^(\d+) checks$/,'Проверок: $1'],[/^([\d.]+)% uptime$/,'$1% доступности'],[/^(.+) ms average$/,'$1 мс в среднем'],[/^(\d+) of (\d+) servers$/,'$1 из $2 серверов'],[/^Updated every (\d+)s$/,'Обновление каждые $1 с'],[/^Theme: (.+)$/,'Тема: $1'],[/^Updates are delayed\. Retrying automatically\. Historical results and notices below were last received at (.+)$/,'Обновления задерживаются. Повторяем автоматически. История и сообщения ниже были получены $1'],[/^Last hour/,'Последний час'],[/^10 second intervals$/,'Интервал 10 секунд'],[/^Select (.+)$/,'Выбрать $1'],[/^Connect to (.+)$/,'Подключиться к $1'],[/^Run docker compose up -d for (.+)\. Containers may be recreated\.$/,'Выполнить docker compose up -d для $1. Контейнеры могут быть пересозданы.']];
  for(const [pattern,replacement] of patterns)if(pattern.test(source))return source.replace(pattern,replacement);
  return source;
 }
 function translateText(node){
  if(!node.parentElement||node.parentElement.closest(skip))return;
  let saved=textCache.get(node);if(!saved||node.data!==saved.last)saved={source:node.data,last:node.data};
  const match=saved.source.match(/^(\s*)(.*?)(\s*)$/s),value=match[1]+phrase(match[2])+match[3];saved.last=value;textCache.set(node,saved);if(node.data!==value)node.data=value;
 }
 function translateDOM(){
  queued=false;if(!document.body)return;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:node=>node.nodeType===1?(node.matches(skip)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_SKIP):NodeFilter.FILTER_ACCEPT});for(let node=walker.nextNode();node;node=walker.nextNode())translateText(node);
  for(const element of document.querySelectorAll('[placeholder],[title],[aria-label]')){
   if(element.closest(skip)&&!element.matches('textarea:not(.code-editor-source)'))continue;let saved=attrCache.get(element);if(!saved){saved={};attrCache.set(element,saved);}
   for(const name of ['placeholder','title','aria-label']){if(!element.hasAttribute(name))continue;const value=element.getAttribute(name);let item=saved[name];if(!item||value!==item.last)item={source:value,last:value};item.last=phrase(item.source);saved[name]=item;if(value!==item.last)element.setAttribute(name,item.last);}
  }
  for(const select of document.querySelectorAll('#language-select'))if(select.value!==preference)select.value=preference;
 }
 const schedule=()=>{if(!queued){queued=true;requestAnimationFrame(translateDOM);}};
 function select(value){preference=['auto','en','ru'].includes(value)?value:'auto';try{localStorage.setItem('magnet-language',preference);}catch{}document.documentElement.lang=effective();translateDOM();document.dispatchEvent(new Event('magnetlanguagechange'));}
 window.magnetI18n={text:phrase,get preference(){return preference;},get locale(){return effective();},select,refresh:schedule};
 document.documentElement.lang=effective();
 document.addEventListener('change',event=>{if(event.target.id==='language-select')select(event.target.value);});
 window.addEventListener('languagechange',()=>{if(preference==='auto')select('auto');});
 window.addEventListener('storage',event=>{if(event.key==='magnet-language'){preference=['auto','en','ru'].includes(event.newValue)?event.newValue:'auto';document.documentElement.lang=effective();translateDOM();document.dispatchEvent(new Event('magnetlanguagechange'));}});
 new MutationObserver(records=>{if(records.some(record=>{const element=record.target.nodeType===1?record.target:record.target.parentElement;return element&&!element.closest(skip);}))schedule();}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
 translateDOM();
})();
