// Игровые данные: сферы жизни, действия, вредные привычки, навыки и материалы.
// Здесь нет логики — только содержимое игры. Чтобы добавить новое действие
// или навык, достаточно дописать строку в нужный список.

export const SPHERES = [
  { id: 'health',   name: 'Здоровье',        icon: '💪', color: '#4FB06D' },
  { id: 'mind',     name: 'Разум',           icon: '🧠', color: '#5B8DEF' },
  { id: 'career',   name: 'Карьера',         icon: '💼', color: '#8C6BE8' },
  { id: 'finance',  name: 'Финансы',         icon: '💰', color: '#E0A526' },
  { id: 'social',   name: 'Отношения',       icon: '🤝', color: '#E86A8A' },
  { id: 'creative', name: 'Творчество',      icon: '🎨', color: '#F07B3F' },
  { id: 'soul',     name: 'Душевный покой',  icon: '🧘', color: '#3FB8B0' },
  { id: 'home',     name: 'Быт и порядок',   icon: '🏠', color: '#A3895F' },
];

export const SPHERE_BY_ID = Object.fromEntries(SPHERES.map(s => [s.id, s]));

// Хорошие действия. xp — сколько опыта даёт ветви одно выполнение.
export const ACTIONS = [
  // Здоровье
  { id: 'h_train',   sphere: 'health', name: 'Тренировка от 30 минут', xp: 25 },
  { id: 'h_walk',    sphere: 'health', name: 'Прогулка или 8 000 шагов', xp: 12 },
  { id: 'h_sleep',   sphere: 'health', name: 'Спал 7–9 часов', xp: 12 },
  { id: 'h_food',    sphere: 'health', name: 'Весь день ел полезную еду', xp: 12 },
  { id: 'h_stretch', sphere: 'health', name: 'Зарядка или растяжка', xp: 8 },
  { id: 'h_water',   sphere: 'health', name: 'Выпил достаточно воды', xp: 5 },
  // Разум
  { id: 'm_read',    sphere: 'mind', name: 'Читал книгу 30 минут', xp: 15 },
  { id: 'm_study',   sphere: 'mind', name: 'Учился час (курс, пары, конспект)', xp: 25 },
  { id: 'm_lang',    sphere: 'mind', name: 'Занимался иностранным языком', xp: 12 },
  { id: 'm_tasks',   sphere: 'mind', name: 'Решал задачи или практиковался', xp: 15 },
  { id: 'm_lecture', sphere: 'mind', name: 'Посмотрел познавательную лекцию', xp: 10 },
  // Карьера
  { id: 'c_deep',    sphere: 'career', name: '2 часа работы без отвлечений', xp: 25 },
  { id: 'c_task',    sphere: 'career', name: 'Закрыл важную задачу', xp: 20 },
  { id: 'c_skill',   sphere: 'career', name: 'Прокачал профессиональный навык', xp: 15 },
  { id: 'c_net',     sphere: 'career', name: 'Завёл полезный профессиональный контакт', xp: 12 },
  { id: 'c_cv',      sphere: 'career', name: 'Обновил резюме или портфолио', xp: 15 },
  // Финансы
  { id: 'f_track',   sphere: 'finance', name: 'Записал расходы за день', xp: 6 },
  { id: 'f_save',    sphere: 'finance', name: 'Отложил деньги', xp: 15 },
  { id: 'f_noimp',   sphere: 'finance', name: 'День без импульсивных покупок', xp: 8 },
  { id: 'f_learn',   sphere: 'finance', name: 'Разобрался в финансовой теме', xp: 12 },
  { id: 'f_plan',    sphere: 'finance', name: 'Составил бюджет на месяц', xp: 20 },
  // Отношения
  { id: 's_family',  sphere: 'social', name: 'Позвонил родным', xp: 10 },
  { id: 's_friends', sphere: 'social', name: 'Провёл время с друзьями', xp: 15 },
  { id: 's_help',    sphere: 'social', name: 'Помог кому-то', xp: 15 },
  { id: 's_new',     sphere: 'social', name: 'Познакомился с новым человеком', xp: 12 },
  { id: 's_thanks',  sphere: 'social', name: 'Поблагодарил или поддержал', xp: 6 },
  // Творчество
  { id: 'a_practice',sphere: 'creative', name: 'Творческая практика 30 минут', xp: 15 },
  { id: 'a_finish',  sphere: 'creative', name: 'Закончил творческую работу', xp: 30 },
  { id: 'a_write',   sphere: 'creative', name: 'Написал текст или заметку', xp: 10 },
  { id: 'a_new',     sphere: 'creative', name: 'Попробовал новое хобби', xp: 15 },
  // Душевный покой
  { id: 'p_meditate',sphere: 'soul', name: 'Медитация 10 минут', xp: 10 },
  { id: 'p_journal', sphere: 'soul', name: 'Записал мысли в дневник', xp: 10 },
  { id: 'p_noscreen',sphere: 'soul', name: 'Час без экранов', xp: 10 },
  { id: 'p_nature',  sphere: 'soul', name: 'Побыл на природе', xp: 12 },
  { id: 'p_grat',    sphere: 'soul', name: 'Записал 3 вещи, за которые благодарен', xp: 6 },
  // Быт
  { id: 'd_clean',   sphere: 'home', name: 'Уборка 15 минут', xp: 8 },
  { id: 'd_cook',    sphere: 'home', name: 'Приготовил еду сам', xp: 10 },
  { id: 'd_plan',    sphere: 'home', name: 'Спланировал день', xp: 8 },
  { id: 'd_declut',  sphere: 'home', name: 'Разобрал завал', xp: 15 },
  { id: 'd_todo',    sphere: 'home', name: 'Сделал давно отложенное дело', xp: 12 },
];

// Вредные привычки. damage — сколько жизненной силы теряет каждая ветвь.
export const BAD_HABITS = [
  { id: 'b_scroll',  name: 'Залип в ленте больше 2 часов',     damage: { soul: 8, mind: 6, career: 4 } },
  { id: 'b_late',    name: 'Лёг спать после двух ночи',        damage: { health: 10, mind: 5 } },
  { id: 'b_junk',    name: 'Фастфуд или переедание',           damage: { health: 8, finance: 3 } },
  { id: 'b_smoke',   name: 'Курил или парил',                  damage: { health: 12, finance: 4 } },
  { id: 'b_alcohol', name: 'Выпил лишнего',                    damage: { health: 10, mind: 5, finance: 4 } },
  { id: 'b_procr',   name: 'Откладывал важное дело весь день', damage: { career: 10, soul: 4 } },
  { id: 'b_impulse', name: 'Импульсивная покупка',             damage: { finance: 12 } },
  { id: 'b_rude',    name: 'Сорвался на близких',              damage: { social: 10, soul: 5 } },
  { id: 'b_sitting', name: 'Весь день без движения',           damage: { health: 6 } },
];

// Навыки — ветки дерева. minLevel — с какого уровня ветви можно освоить,
// parent — какой навык нужно освоить раньше. Освоение даёт бонус опыта.
export const SKILLS = {
  health: [
    { id: 'hs1', name: 'Неделя ежедневных прогулок', minLevel: 1, parent: null },
    { id: 'hs2', name: 'Зарядка 7 дней подряд', minLevel: 2, parent: 'hs1' },
    { id: 'hs3', name: 'Пробежать 3 км без остановки', minLevel: 3, parent: 'hs1' },
    { id: 'hs4', name: 'Две недели ровного режима сна', minLevel: 4, parent: 'hs2' },
    { id: 'hs5', name: 'Пробежать 5 км', minLevel: 6, parent: 'hs3' },
    { id: 'hs6', name: 'Месяц сбалансированного питания', minLevel: 7, parent: 'hs4' },
    { id: 'hs7', name: 'Пробежать 10 км или первый забег', minLevel: 10, parent: 'hs5' },
    { id: 'hs8', name: '90 дней без вредной привычки', minLevel: 12, parent: 'hs6' },
  ],
  mind: [
    { id: 'ms1', name: 'Прочитать первую книгу за месяц', minLevel: 1, parent: null },
    { id: 'ms2', name: 'Пройти онлайн-курс до конца', minLevel: 3, parent: 'ms1' },
    { id: 'ms3', name: '30 дней языка без пропусков', minLevel: 3, parent: 'ms1' },
    { id: 'ms4', name: 'Прочитать 5 книг', minLevel: 5, parent: 'ms2' },
    { id: 'ms5', name: 'Понять фильм на другом языке', minLevel: 7, parent: 'ms3' },
    { id: 'ms6', name: 'Объяснить сложную тему другу', minLevel: 8, parent: 'ms4' },
    { id: 'ms7', name: 'Сдать сессию без долгов', minLevel: 10, parent: 'ms6' },
    { id: 'ms8', name: 'Свободно поговорить с носителем', minLevel: 12, parent: 'ms5' },
  ],
  career: [
    { id: 'cs1', name: 'Определить, кем хочу работать', minLevel: 1, parent: null },
    { id: 'cs2', name: 'Составить первое резюме', minLevel: 2, parent: 'cs1' },
    { id: 'cs3', name: 'Сделать первый проект в портфолио', minLevel: 4, parent: 'cs1' },
    { id: 'cs4', name: 'Пройти первое собеседование', minLevel: 5, parent: 'cs2' },
    { id: 'cs5', name: 'Три проекта в портфолио', minLevel: 7, parent: 'cs3' },
    { id: 'cs6', name: 'Получить стажировку или работу', minLevel: 9, parent: 'cs4' },
    { id: 'cs7', name: 'Выступить с докладом', minLevel: 11, parent: 'cs5' },
    { id: 'cs8', name: 'Получить повышение или первый крупный заказ', minLevel: 14, parent: 'cs6' },
  ],
  finance: [
    { id: 'fs1', name: 'Месяц записывать все расходы', minLevel: 1, parent: null },
    { id: 'fs2', name: 'Составить личный бюджет', minLevel: 2, parent: 'fs1' },
    { id: 'fs3', name: 'Отказаться от лишней подписки', minLevel: 3, parent: 'fs1' },
    { id: 'fs4', name: 'Подушка безопасности на месяц', minLevel: 5, parent: 'fs2' },
    { id: 'fs5', name: 'Разобраться, как работают вклады и инфляция', minLevel: 6, parent: 'fs3' },
    { id: 'fs6', name: 'Подушка безопасности на 3 месяца', minLevel: 9, parent: 'fs4' },
    { id: 'fs7', name: 'Первый дополнительный доход', minLevel: 11, parent: 'fs5' },
    { id: 'fs8', name: 'Накопить на большую цель', minLevel: 14, parent: 'fs6' },
  ],
  social: [
    { id: 'ss1', name: 'Неделя звонков близким', minLevel: 1, parent: null },
    { id: 'ss2', name: 'Организовать встречу друзей', minLevel: 3, parent: 'ss1' },
    { id: 'ss3', name: 'Спокойно решить конфликт', minLevel: 3, parent: 'ss1' },
    { id: 'ss4', name: 'Найти новое сообщество по интересам', minLevel: 5, parent: 'ss2' },
    { id: 'ss5', name: 'Сказать близкому, как он важен', minLevel: 6, parent: 'ss3' },
    { id: 'ss6', name: 'Стать волонтёром на мероприятии', minLevel: 8, parent: 'ss4' },
    { id: 'ss7', name: 'Выступить перед аудиторией', minLevel: 10, parent: 'ss6' },
    { id: 'ss8', name: 'Стать наставником для кого-то', minLevel: 13, parent: 'ss5' },
  ],
  creative: [
    { id: 'as1', name: 'Выбрать творческое занятие', minLevel: 1, parent: null },
    { id: 'as2', name: 'Две недели практики подряд', minLevel: 3, parent: 'as1' },
    { id: 'as3', name: 'Закончить первую работу', minLevel: 3, parent: 'as1' },
    { id: 'as4', name: 'Показать работу другим', minLevel: 5, parent: 'as3' },
    { id: 'as5', name: 'Освоить новую технику', minLevel: 6, parent: 'as2' },
    { id: 'as6', name: 'Довести до конца большой проект', minLevel: 9, parent: 'as4' },
    { id: 'as7', name: 'Участвовать в конкурсе или выставке', minLevel: 11, parent: 'as6' },
    { id: 'as8', name: 'Создать серию из 10 работ', minLevel: 13, parent: 'as5' },
  ],
  soul: [
    { id: 'ps1', name: 'Неделя медитаций', minLevel: 1, parent: null },
    { id: 'ps2', name: 'Месяц ведения дневника', minLevel: 3, parent: 'ps1' },
    { id: 'ps3', name: 'Цифровой детокс на выходные', minLevel: 4, parent: 'ps1' },
    { id: 'ps4', name: 'Сформулировать свои ценности', minLevel: 5, parent: 'ps2' },
    { id: 'ps5', name: 'Научиться говорить «нет»', minLevel: 6, parent: 'ps3' },
    { id: 'ps6', name: 'Месяц медитаций без пропусков', minLevel: 8, parent: 'ps4' },
    { id: 'ps7', name: 'Сходить в поход или ретрит', minLevel: 10, parent: 'ps5' },
    { id: 'ps8', name: 'Спокойно пройти через трудный период', minLevel: 13, parent: 'ps6' },
  ],
  home: [
    { id: 'ds1', name: 'Неделя заправленной кровати', minLevel: 1, parent: null },
    { id: 'ds2', name: 'Разобрать шкаф', minLevel: 2, parent: 'ds1' },
    { id: 'ds3', name: 'Научиться готовить 3 блюда', minLevel: 3, parent: 'ds1' },
    { id: 'ds4', name: 'Месяц планирования дня', minLevel: 5, parent: 'ds2' },
    { id: 'ds5', name: 'Готовить себе всю неделю', minLevel: 6, parent: 'ds3' },
    { id: 'ds6', name: 'Навести порядок в документах', minLevel: 8, parent: 'ds4' },
    { id: 'ds7', name: 'Научиться 10 блюдам', minLevel: 10, parent: 'ds5' },
    { id: 'ds8', name: 'Сделать дом местом, где хорошо', minLevel: 13, parent: 'ds6' },
  ],
};

export const SKILL_BY_ID = {};
for (const [sphere, list] of Object.entries(SKILLS)) {
  list.forEach((s, i) => { SKILL_BY_ID[s.id] = { ...s, sphere, index: i }; });
}

// Полезные материалы. Отметка «Изучил» один раз даёт опыт ветви.
export const MATERIALS = [
  // Здоровье
  { id: 'mt_who', sphere: 'health', kind: 'Статья', title: 'ВОЗ: физическая активность',
    note: 'Сколько движения нужно взрослому на самом деле — коротко и по делу.',
    url: 'https://www.who.int/ru/news-room/fact-sheets/detail/physical-activity' },
  { id: 'mt_sleep', sphere: 'health', kind: 'Книга', title: 'Мэтью Уолкер — «Зачем мы спим»',
    note: 'Почему сон влияет на память, настроение и здоровье сильнее, чем кажется.' },
  { id: 'mt_c25k', sphere: 'health', kind: 'Программа', title: 'NHS Couch to 5K',
    note: 'Девятинедельная программа: от нуля до пробежки 5 км.',
    url: 'https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/' },
  // Разум
  { id: 'mt_stepik', sphere: 'mind', kind: 'Курсы', title: 'Stepik',
    note: 'Бесплатные онлайн-курсы на русском: программирование, математика, языки.',
    url: 'https://stepik.org' },
  { id: 'mt_postnauka', sphere: 'mind', kind: 'Лекции', title: 'ПостНаука',
    note: 'Учёные понятно рассказывают о своих областях.',
    url: 'https://postnauka.org' },
  { id: 'mt_arzamas', sphere: 'mind', kind: 'Курсы', title: 'Арзамас',
    note: 'Курсы о культуре, истории и искусстве.',
    url: 'https://arzamas.academy' },
  { id: 'mt_learn', sphere: 'mind', kind: 'Книга', title: 'Барбара Оакли — «Думай как математик»',
    note: 'Как учиться эффективнее: интервальные повторения, фокус и рассеянное мышление.' },
  // Карьера
  { id: 'mt_deepwork', sphere: 'career', kind: 'Книга', title: 'Кэл Ньюпорт — «В работу с головой»',
    note: 'Почему глубокая сосредоточенная работа ценнее многозадачности.' },
  { id: 'mt_hexlet', sphere: 'career', kind: 'Курсы', title: 'Хекслет',
    note: 'Бесплатные вводные курсы по программированию и разработке.',
    url: 'https://ru.hexlet.io' },
  { id: 'mt_ghskills', sphere: 'career', kind: 'Практика', title: 'GitHub Skills',
    note: 'Интерактивные уроки по Git и GitHub — пригодятся для портфолио.',
    url: 'https://skills.github.com' },
  // Финансы
  { id: 'mt_fincult', sphere: 'finance', kind: 'Сайт', title: 'Финансовая культура (Банк России)',
    note: 'Бюджет, вклады, кредиты, защита от мошенников — простым языком.',
    url: 'https://fincult.info' },
  { id: 'mt_babylon', sphere: 'finance', kind: 'Книга', title: 'Джордж Клейсон — «Самый богатый человек в Вавилоне»',
    note: 'Базовые правила обращения с деньгами в форме притч.' },
  // Отношения
  { id: 'mt_nvc', sphere: 'social', kind: 'Книга', title: 'Маршалл Розенберг — «Язык жизни»',
    note: 'Ненасильственное общение: как говорить о чувствах и решать конфликты.' },
  { id: 'mt_carnegie', sphere: 'social', kind: 'Книга', title: 'Дейл Карнеги — «Как завоёвывать друзей»',
    note: 'Классика о внимании к людям и умении слушать.' },
  // Творчество
  { id: 'mt_kleon', sphere: 'creative', kind: 'Книга', title: 'Остин Клеон — «Кради как художник»',
    note: 'Короткая книга о том, как начать творить и не бояться подражать.' },
  { id: 'mt_drawabox', sphere: 'creative', kind: 'Курс', title: 'Drawabox',
    note: 'Бесплатный курс рисования с нуля (на английском).',
    url: 'https://drawabox.com' },
  // Душевный покой
  { id: 'mt_atomic', sphere: 'soul', kind: 'Книга', title: 'Джеймс Клир — «Атомные привычки»',
    note: 'Как маленькие ежедневные шаги складываются в большие перемены. Идеально к этой игре.' },
  { id: 'mt_flow', sphere: 'soul', kind: 'Книга', title: 'Михай Чиксентмихайи — «Поток»',
    note: 'Что такое состояние потока и почему в нём мы счастливее.' },
  { id: 'mt_insight', sphere: 'soul', kind: 'Приложение', title: 'Insight Timer',
    note: 'Тысячи бесплатных медитаций, в том числе на русском.',
    url: 'https://insighttimer.com' },
  // Быт
  { id: 'mt_kondo', sphere: 'home', kind: 'Книга', title: 'Мари Кондо — «Магическая уборка»',
    note: 'Метод расхламления: оставлять только то, что радует.' },
  { id: 'mt_gtd', sphere: 'home', kind: 'Книга', title: 'Дэвид Аллен — «Как привести дела в порядок»',
    note: 'Система GTD: выгрузить все дела из головы и перестать о них тревожиться.' },
];

// Стадии роста дерева по общему уровню игрока.
export const STAGES = [
  { level: 0,  name: 'Семечко' },
  { level: 2,  name: 'Росток' },
  { level: 5,  name: 'Саженец' },
  { level: 9,  name: 'Молодое деревце' },
  { level: 14, name: 'Крепкое дерево' },
  { level: 20, name: 'Раскидистое древо' },
  { level: 28, name: 'Вековое древо' },
  { level: 38, name: 'Древо мудрости' },
];

// Правила игры, собранные в одном месте.
export const RULES = {
  sphereXpBase: 30,        // опыт ветви: уровень n требует 30·n·(n+1)/2
  playerXpBase: 60,        // общий уровень: 60·n·(n+1)/2
  repeatFactors: [1, 0.5, 0.2], // повтор одного действия за день: 100%, 50%, 20%
  healOnAction: 4,         // хорошее дело лечит ветвь
  idleGraceDays: 3,        // через сколько дней без дел ветвь начинает сохнуть
  idleDecayPerDay: 3,      // сколько жизненной силы теряет в день после этого
  materialXp: 15,
  skillXp: (minLevel) => 20 + minLevel * 10,
};
