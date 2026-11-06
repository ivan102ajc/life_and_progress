// Игровые данные: сферы жизни, действия, вредные привычки, навыки и материалы.
// Здесь нет логики — только содержимое игры. Чтобы добавить новое действие
// или навык, достаточно дописать строку в нужный список.

export const SPHERES = [
  { id: 'health',   name: 'Здоровье', en: 'Health',        icon: '💪', color: '#4FB06D' },
  { id: 'mind',     name: 'Разум', en: 'Mind',           icon: '🧠', color: '#5B8DEF' },
  { id: 'career',   name: 'Карьера', en: 'Career',         icon: '💼', color: '#8C6BE8' },
  { id: 'finance',  name: 'Финансы', en: 'Finance',         icon: '💰', color: '#E0A526' },
  { id: 'social',   name: 'Отношения', en: 'Relationships',       icon: '🤝', color: '#E86A8A' },
  { id: 'creative', name: 'Творчество', en: 'Creativity',      icon: '🎨', color: '#F07B3F' },
  { id: 'soul',     name: 'Душевный покой', en: 'Peace of mind',  icon: '🧘', color: '#3FB8B0' },
  { id: 'home',     name: 'Быт и порядок', en: 'Home & order',   icon: '🏠', color: '#A3895F' },
];

export const SPHERE_BY_ID = Object.fromEntries(SPHERES.map(s => [s.id, s]));

// Хорошие действия. xp — сколько опыта даёт ветви одно выполнение.
export const ACTIONS = [
  // Здоровье
  { id: 'h_train',   sphere: 'health', name: 'Тренировка от 30 минут', en: 'Workout of 30+ minutes', xp: 25 },
  { id: 'h_walk',    sphere: 'health', name: 'Прогулка или 8 000 шагов', en: 'Walk or 8,000 steps', xp: 12 },
  { id: 'h_sleep',   sphere: 'health', name: 'Спал 7–9 часов', en: 'Slept 7–9 hours', xp: 12 },
  { id: 'h_food',    sphere: 'health', name: 'Весь день ел полезную еду', en: 'Ate healthy all day', xp: 12 },
  { id: 'h_stretch', sphere: 'health', name: 'Зарядка или растяжка', en: 'Exercises or stretching', xp: 8 },
  { id: 'h_water',   sphere: 'health', name: 'Выпил достаточно воды', en: 'Drank enough water', xp: 5 },
  // Разум
  { id: 'm_read',    sphere: 'mind', name: 'Читал книгу 30 минут', en: 'Read a book for 30 minutes', xp: 15 },
  { id: 'm_study',   sphere: 'mind', name: 'Учился час (курс, пары, конспект)', en: 'Studied for an hour (course, classes, notes)', xp: 25 },
  { id: 'm_lang',    sphere: 'mind', name: 'Занимался иностранным языком', en: 'Practised a foreign language', xp: 12 },
  { id: 'm_tasks',   sphere: 'mind', name: 'Решал задачи или практиковался', en: 'Solved problems or practised', xp: 15 },
  { id: 'm_lecture', sphere: 'mind', name: 'Посмотрел познавательную лекцию', en: 'Watched an educational lecture', xp: 10 },
  // Карьера
  { id: 'c_deep',    sphere: 'career', name: '2 часа работы без отвлечений', en: '2 hours of distraction-free work', xp: 25 },
  { id: 'c_task',    sphere: 'career', name: 'Закрыл важную задачу', en: 'Finished an important task', xp: 20 },
  { id: 'c_skill',   sphere: 'career', name: 'Прокачал профессиональный навык', en: 'Improved a professional skill', xp: 15 },
  { id: 'c_net',     sphere: 'career', name: 'Завёл полезный профессиональный контакт', en: 'Made a useful professional contact', xp: 12 },
  { id: 'c_cv',      sphere: 'career', name: 'Обновил резюме или портфолио', en: 'Updated CV or portfolio', xp: 15 },
  // Финансы
  { id: 'f_track',   sphere: 'finance', name: 'Записал расходы за день', en: 'Logged the day’s expenses', xp: 6 },
  { id: 'f_save',    sphere: 'finance', name: 'Отложил деньги', en: 'Put money aside', xp: 15 },
  { id: 'f_noimp',   sphere: 'finance', name: 'День без импульсивных покупок', en: 'A day without impulse buys', xp: 8 },
  { id: 'f_learn',   sphere: 'finance', name: 'Разобрался в финансовой теме', en: 'Learned about a money topic', xp: 12 },
  { id: 'f_plan',    sphere: 'finance', name: 'Составил бюджет на месяц', en: 'Made a monthly budget', xp: 20 },
  // Отношения
  { id: 's_family',  sphere: 'social', name: 'Позвонил родным', en: 'Called family', xp: 10 },
  { id: 's_friends', sphere: 'social', name: 'Провёл время с друзьями', en: 'Spent time with friends', xp: 15 },
  { id: 's_help',    sphere: 'social', name: 'Помог кому-то', en: 'Helped someone', xp: 15 },
  { id: 's_new',     sphere: 'social', name: 'Познакомился с новым человеком', en: 'Met someone new', xp: 12 },
  { id: 's_thanks',  sphere: 'social', name: 'Поблагодарил или поддержал', en: 'Thanked or supported someone', xp: 6 },
  // Творчество
  { id: 'a_practice',sphere: 'creative', name: 'Творческая практика 30 минут', en: '30 minutes of creative practice', xp: 15 },
  { id: 'a_finish',  sphere: 'creative', name: 'Закончил творческую работу', en: 'Finished a creative piece', xp: 30 },
  { id: 'a_write',   sphere: 'creative', name: 'Написал текст или заметку', en: 'Wrote a text or a note', xp: 10 },
  { id: 'a_new',     sphere: 'creative', name: 'Попробовал новое хобби', en: 'Tried a new hobby', xp: 15 },
  // Душевный покой
  { id: 'p_meditate',sphere: 'soul', name: 'Медитация 10 минут', en: 'Meditated for 10 minutes', xp: 10 },
  { id: 'p_journal', sphere: 'soul', name: 'Записал мысли в дневник', en: 'Wrote in a journal', xp: 10 },
  { id: 'p_noscreen',sphere: 'soul', name: 'Час без экранов', en: 'An hour without screens', xp: 10 },
  { id: 'p_nature',  sphere: 'soul', name: 'Побыл на природе', en: 'Spent time in nature', xp: 12 },
  { id: 'p_grat',    sphere: 'soul', name: 'Записал 3 вещи, за которые благодарен', en: 'Wrote down 3 things I’m grateful for', xp: 6 },
  // Быт
  { id: 'd_clean',   sphere: 'home', name: 'Уборка 15 минут', en: '15 minutes of tidying', xp: 8 },
  { id: 'd_cook',    sphere: 'home', name: 'Приготовил еду сам', en: 'Cooked a meal myself', xp: 10 },
  { id: 'd_plan',    sphere: 'home', name: 'Спланировал день', en: 'Planned the day', xp: 8 },
  { id: 'd_declut',  sphere: 'home', name: 'Разобрал завал', en: 'Cleared a mess', xp: 15 },
  { id: 'd_todo',    sphere: 'home', name: 'Сделал давно отложенное дело', en: 'Did a long-postponed task', xp: 12 },
];

// Вредные привычки. damage — сколько жизненной силы теряет каждая ветвь.
export const BAD_HABITS = [
  { id: 'b_scroll',  name: 'Залип в ленте больше 2 часов', en: 'Scrolled feeds for 2+ hours',     damage: { soul: 8, mind: 6, career: 4 } },
  { id: 'b_late',    name: 'Лёг спать после двух ночи', en: 'Went to bed after 2 a.m.',        damage: { health: 10, mind: 5 } },
  { id: 'b_junk',    name: 'Фастфуд или переедание', en: 'Fast food or overeating',           damage: { health: 8, finance: 3 } },
  { id: 'b_smoke',   name: 'Курил или парил', en: 'Smoked or vaped',                  damage: { health: 12, finance: 4 } },
  { id: 'b_alcohol', name: 'Выпил лишнего', en: 'Drank too much',                    damage: { health: 10, mind: 5, finance: 4 } },
  { id: 'b_procr',   name: 'Откладывал важное дело весь день', en: 'Put off something important all day', damage: { career: 10, soul: 4 } },
  { id: 'b_impulse', name: 'Импульсивная покупка', en: 'Impulse purchase',             damage: { finance: 12 } },
  { id: 'b_rude',    name: 'Сорвался на близких', en: 'Snapped at loved ones',              damage: { social: 10, soul: 5 } },
  { id: 'b_sitting', name: 'Весь день без движения', en: 'No movement all day',           damage: { health: 6 } },
];

// Навыки — ветки дерева. minLevel — с какого уровня ветви можно освоить,
// parent — какой навык нужно освоить раньше. Освоение даёт бонус опыта.
export const SKILLS = {
  health: [
    { id: 'hs1', name: 'Неделя ежедневных прогулок', en: 'A week of daily walks', minLevel: 1, parent: null },
    { id: 'hs2', name: 'Зарядка 7 дней подряд', en: 'Exercises 7 days in a row', minLevel: 2, parent: 'hs1' },
    { id: 'hs3', name: 'Пробежать 3 км без остановки', en: 'Run 3 km without stopping', minLevel: 3, parent: 'hs1' },
    { id: 'hs4', name: 'Две недели ровного режима сна', en: 'Two weeks of a steady sleep schedule', minLevel: 4, parent: 'hs2' },
    { id: 'hs5', name: 'Пробежать 5 км', en: 'Run 5 km', minLevel: 6, parent: 'hs3' },
    { id: 'hs6', name: 'Месяц сбалансированного питания', en: 'A month of balanced eating', minLevel: 7, parent: 'hs4' },
    { id: 'hs7', name: 'Пробежать 10 км или первый забег', en: 'Run 10 km or a first race', minLevel: 10, parent: 'hs5' },
    { id: 'hs8', name: '90 дней без вредной привычки', en: '90 days without a bad habit', minLevel: 12, parent: 'hs6' },
  ],
  mind: [
    { id: 'ms1', name: 'Прочитать первую книгу за месяц', en: 'Read a first book within a month', minLevel: 1, parent: null },
    { id: 'ms2', name: 'Пройти онлайн-курс до конца', en: 'Finish an online course', minLevel: 3, parent: 'ms1' },
    { id: 'ms3', name: '30 дней языка без пропусков', en: '30 days of a language without gaps', minLevel: 3, parent: 'ms1' },
    { id: 'ms4', name: 'Прочитать 5 книг', en: 'Read 5 books', minLevel: 5, parent: 'ms2' },
    { id: 'ms5', name: 'Понять фильм на другом языке', en: 'Understand a film in another language', minLevel: 7, parent: 'ms3' },
    { id: 'ms6', name: 'Объяснить сложную тему другу', en: 'Explain a hard topic to a friend', minLevel: 8, parent: 'ms4' },
    { id: 'ms7', name: 'Сдать сессию без долгов', en: 'Pass exams with no retakes', minLevel: 10, parent: 'ms6' },
    { id: 'ms8', name: 'Свободно поговорить с носителем', en: 'Talk freely with a native speaker', minLevel: 12, parent: 'ms5' },
  ],
  career: [
    { id: 'cs1', name: 'Определить, кем хочу работать', en: 'Decide what I want to work as', minLevel: 1, parent: null },
    { id: 'cs2', name: 'Составить первое резюме', en: 'Write a first CV', minLevel: 2, parent: 'cs1' },
    { id: 'cs3', name: 'Сделать первый проект в портфолио', en: 'Make a first portfolio project', minLevel: 4, parent: 'cs1' },
    { id: 'cs4', name: 'Пройти первое собеседование', en: 'Go to a first job interview', minLevel: 5, parent: 'cs2' },
    { id: 'cs5', name: 'Три проекта в портфолио', en: 'Three projects in the portfolio', minLevel: 7, parent: 'cs3' },
    { id: 'cs6', name: 'Получить стажировку или работу', en: 'Get an internship or a job', minLevel: 9, parent: 'cs4' },
    { id: 'cs7', name: 'Выступить с докладом', en: 'Give a talk', minLevel: 11, parent: 'cs5' },
    { id: 'cs8', name: 'Получить повышение или первый крупный заказ', en: 'Get a promotion or a first big order', minLevel: 14, parent: 'cs6' },
  ],
  finance: [
    { id: 'fs1', name: 'Месяц записывать все расходы', en: 'Log all expenses for a month', minLevel: 1, parent: null },
    { id: 'fs2', name: 'Составить личный бюджет', en: 'Make a personal budget', minLevel: 2, parent: 'fs1' },
    { id: 'fs3', name: 'Отказаться от лишней подписки', en: 'Cancel an unneeded subscription', minLevel: 3, parent: 'fs1' },
    { id: 'fs4', name: 'Подушка безопасности на месяц', en: 'A one-month emergency fund', minLevel: 5, parent: 'fs2' },
    { id: 'fs5', name: 'Разобраться, как работают вклады и инфляция', en: 'Understand savings and inflation', minLevel: 6, parent: 'fs3' },
    { id: 'fs6', name: 'Подушка безопасности на 3 месяца', en: 'A three-month emergency fund', minLevel: 9, parent: 'fs4' },
    { id: 'fs7', name: 'Первый дополнительный доход', en: 'A first side income', minLevel: 11, parent: 'fs5' },
    { id: 'fs8', name: 'Накопить на большую цель', en: 'Save up for a big goal', minLevel: 14, parent: 'fs6' },
  ],
  social: [
    { id: 'ss1', name: 'Неделя звонков близким', en: 'A week of calling loved ones', minLevel: 1, parent: null },
    { id: 'ss2', name: 'Организовать встречу друзей', en: 'Organise a meetup with friends', minLevel: 3, parent: 'ss1' },
    { id: 'ss3', name: 'Спокойно решить конфликт', en: 'Calmly resolve a conflict', minLevel: 3, parent: 'ss1' },
    { id: 'ss4', name: 'Найти новое сообщество по интересам', en: 'Find a community around an interest', minLevel: 5, parent: 'ss2' },
    { id: 'ss5', name: 'Сказать близкому, как он важен', en: 'Tell someone close how much they matter', minLevel: 6, parent: 'ss3' },
    { id: 'ss6', name: 'Стать волонтёром на мероприятии', en: 'Volunteer at an event', minLevel: 8, parent: 'ss4' },
    { id: 'ss7', name: 'Выступить перед аудиторией', en: 'Speak in front of an audience', minLevel: 10, parent: 'ss6' },
    { id: 'ss8', name: 'Стать наставником для кого-то', en: 'Become a mentor for someone', minLevel: 13, parent: 'ss5' },
  ],
  creative: [
    { id: 'as1', name: 'Выбрать творческое занятие', en: 'Pick a creative activity', minLevel: 1, parent: null },
    { id: 'as2', name: 'Две недели практики подряд', en: 'Two weeks of practice in a row', minLevel: 3, parent: 'as1' },
    { id: 'as3', name: 'Закончить первую работу', en: 'Finish a first piece', minLevel: 3, parent: 'as1' },
    { id: 'as4', name: 'Показать работу другим', en: 'Show work to others', minLevel: 5, parent: 'as3' },
    { id: 'as5', name: 'Освоить новую технику', en: 'Learn a new technique', minLevel: 6, parent: 'as2' },
    { id: 'as6', name: 'Довести до конца большой проект', en: 'Complete a big project', minLevel: 9, parent: 'as4' },
    { id: 'as7', name: 'Участвовать в конкурсе или выставке', en: 'Enter a contest or exhibition', minLevel: 11, parent: 'as6' },
    { id: 'as8', name: 'Создать серию из 10 работ', en: 'Create a series of 10 works', minLevel: 13, parent: 'as5' },
  ],
  soul: [
    { id: 'ps1', name: 'Неделя медитаций', en: 'A week of meditation', minLevel: 1, parent: null },
    { id: 'ps2', name: 'Месяц ведения дневника', en: 'A month of journaling', minLevel: 3, parent: 'ps1' },
    { id: 'ps3', name: 'Цифровой детокс на выходные', en: 'A digital detox weekend', minLevel: 4, parent: 'ps1' },
    { id: 'ps4', name: 'Сформулировать свои ценности', en: 'Put my values into words', minLevel: 5, parent: 'ps2' },
    { id: 'ps5', name: 'Научиться говорить «нет»', en: 'Learn to say “no”', minLevel: 6, parent: 'ps3' },
    { id: 'ps6', name: 'Месяц медитаций без пропусков', en: 'A month of meditation without gaps', minLevel: 8, parent: 'ps4' },
    { id: 'ps7', name: 'Сходить в поход или ретрит', en: 'Go hiking or on a retreat', minLevel: 10, parent: 'ps5' },
    { id: 'ps8', name: 'Спокойно пройти через трудный период', en: 'Get through a hard time calmly', minLevel: 13, parent: 'ps6' },
  ],
  home: [
    { id: 'ds1', name: 'Неделя заправленной кровати', en: 'A week of making the bed', minLevel: 1, parent: null },
    { id: 'ds2', name: 'Разобрать шкаф', en: 'Sort out the wardrobe', minLevel: 2, parent: 'ds1' },
    { id: 'ds3', name: 'Научиться готовить 3 блюда', en: 'Learn to cook 3 dishes', minLevel: 3, parent: 'ds1' },
    { id: 'ds4', name: 'Месяц планирования дня', en: 'A month of planning each day', minLevel: 5, parent: 'ds2' },
    { id: 'ds5', name: 'Готовить себе всю неделю', en: 'Cook for myself all week', minLevel: 6, parent: 'ds3' },
    { id: 'ds6', name: 'Навести порядок в документах', en: 'Put documents in order', minLevel: 8, parent: 'ds4' },
    { id: 'ds7', name: 'Научиться 10 блюдам', en: 'Learn 10 dishes', minLevel: 10, parent: 'ds5' },
    { id: 'ds8', name: 'Сделать дом местом, где хорошо', en: 'Make home a place that feels good', minLevel: 13, parent: 'ds6' },
  ],
};

export const SKILL_BY_ID = {};
for (const [sphere, list] of Object.entries(SKILLS)) {
  list.forEach((s, i) => { SKILL_BY_ID[s.id] = { ...s, sphere, index: i }; });
}

// Полезные материалы. Отметка «Изучил» один раз даёт опыт ветви.
// only: 'ru' — русскоязычный ресурс (показывается только на русском),
// only: 'en' — англоязычный (только на английском). Остальное — для всех.
export const MATERIALS = [
  // Здоровье
  { id: 'mt_who', sphere: 'health', kind: 'Статья', kind_en: 'Article', title: 'ВОЗ: физическая активность', title_en: 'WHO: Physical activity',
    note: 'Сколько движения нужно взрослому на самом деле — коротко и по делу.',
    note_en: 'How much movement an adult really needs — short and to the point.',
    url: 'https://www.who.int/ru/news-room/fact-sheets/detail/physical-activity',
    url_en: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity' },
  { id: 'mt_sleep', sphere: 'health', kind: 'Книга', kind_en: 'Book', title: 'Мэтью Уолкер — «Зачем мы спим»', title_en: 'Matthew Walker — Why We Sleep',
    note: 'Почему сон влияет на память, настроение и здоровье сильнее, чем кажется.',
    note_en: 'Why sleep affects memory, mood and health more than you think.' },
  { id: 'mt_c25k', sphere: 'health', kind: 'Программа', kind_en: 'Programme', title: 'NHS Couch to 5K', title_en: 'NHS Couch to 5K',
    note: 'Девятинедельная программа: от нуля до пробежки 5 км.',
    note_en: 'A nine-week plan to go from the couch to running 5 km.',
    url: 'https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/' },
  // Разум
  { id: 'mt_stepik', sphere: 'mind', only: 'ru', kind: 'Курсы', title: 'Stepik',
    note: 'Бесплатные онлайн-курсы на русском: программирование, математика, языки.',
    url: 'https://stepik.org' },
  { id: 'mt_postnauka', sphere: 'mind', only: 'ru', kind: 'Лекции', title: 'ПостНаука',
    note: 'Учёные понятно рассказывают о своих областях.',
    url: 'https://postnauka.org' },
  { id: 'mt_arzamas', sphere: 'mind', only: 'ru', kind: 'Курсы', title: 'Арзамас',
    note: 'Курсы о культуре, истории и искусстве.',
    url: 'https://arzamas.academy' },
  { id: 'mt_khan', sphere: 'mind', only: 'en', kind_en: 'Courses', title_en: 'Khan Academy',
    note_en: 'Free lessons in maths, science, economics and more.',
    url: 'https://www.khanacademy.org' },
  { id: 'mt_crashcourse', sphere: 'mind', only: 'en', kind_en: 'Videos', title_en: 'Crash Course',
    note_en: 'Lively video courses on history, science, philosophy and literature.',
    url: 'https://thecrashcourse.com' },
  { id: 'mt_learn', sphere: 'mind', kind: 'Книга', kind_en: 'Book', title: 'Барбара Оакли — «Думай как математик»', title_en: 'Barbara Oakley — A Mind for Numbers',
    note: 'Как учиться эффективнее: интервальные повторения, фокус и рассеянное мышление.',
    note_en: 'How to learn better: spaced repetition, focused and diffuse thinking.' },
  // Карьера
  { id: 'mt_deepwork', sphere: 'career', kind: 'Книга', kind_en: 'Book', title: 'Кэл Ньюпорт — «В работу с головой»', title_en: 'Cal Newport — Deep Work',
    note: 'Почему глубокая сосредоточенная работа ценнее многозадачности.',
    note_en: 'Why deep, focused work beats multitasking.' },
  { id: 'mt_hexlet', sphere: 'career', only: 'ru', kind: 'Курсы', title: 'Хекслет',
    note: 'Бесплатные вводные курсы по программированию и разработке.',
    url: 'https://ru.hexlet.io' },
  { id: 'mt_fcc', sphere: 'career', only: 'en', kind_en: 'Courses', title_en: 'freeCodeCamp',
    note_en: 'Free, hands-on courses in programming and web development.',
    url: 'https://www.freecodecamp.org' },
  { id: 'mt_ghskills', sphere: 'career', kind: 'Практика', kind_en: 'Practice', title: 'GitHub Skills', title_en: 'GitHub Skills',
    note: 'Интерактивные уроки по Git и GitHub — пригодятся для портфолио.',
    note_en: 'Interactive lessons on Git and GitHub — great for a portfolio.',
    url: 'https://skills.github.com' },
  // Финансы
  { id: 'mt_fincult', sphere: 'finance', only: 'ru', kind: 'Сайт', title: 'Финансовая культура (Банк России)',
    note: 'Бюджет, вклады, кредиты, защита от мошенников — простым языком.',
    url: 'https://fincult.info' },
  { id: 'mt_moneyhelper', sphere: 'finance', only: 'en', kind_en: 'Website', title_en: 'MoneyHelper',
    note_en: 'Free, impartial guides on budgeting, saving, debt and pensions.',
    url: 'https://www.moneyhelper.org.uk' },
  { id: 'mt_babylon', sphere: 'finance', kind: 'Книга', kind_en: 'Book', title: 'Джордж Клейсон — «Самый богатый человек в Вавилоне»', title_en: 'George S. Clason — The Richest Man in Babylon',
    note: 'Базовые правила обращения с деньгами в форме притч.',
    note_en: 'The basic rules of handling money, told as parables.' },
  // Отношения
  { id: 'mt_nvc', sphere: 'social', kind: 'Книга', kind_en: 'Book', title: 'Маршалл Розенберг — «Язык жизни»', title_en: 'Marshall Rosenberg — Nonviolent Communication',
    note: 'Ненасильственное общение: как говорить о чувствах и решать конфликты.',
    note_en: 'How to talk about feelings and resolve conflicts without blame.' },
  { id: 'mt_carnegie', sphere: 'social', kind: 'Книга', kind_en: 'Book', title: 'Дейл Карнеги — «Как завоёвывать друзей»', title_en: 'Dale Carnegie — How to Win Friends and Influence People',
    note: 'Классика о внимании к людям и умении слушать.',
    note_en: 'The classic on paying attention to people and listening well.' },
  // Творчество
  { id: 'mt_kleon', sphere: 'creative', kind: 'Книга', kind_en: 'Book', title: 'Остин Клеон — «Кради как художник»', title_en: 'Austin Kleon — Steal Like an Artist',
    note: 'Короткая книга о том, как начать творить и не бояться подражать.',
    note_en: 'A short book on getting started and not being afraid to borrow.' },
  { id: 'mt_drawabox', sphere: 'creative', kind: 'Курс', kind_en: 'Course', title: 'Drawabox', title_en: 'Drawabox',
    note: 'Бесплатный курс рисования с нуля (на английском).',
    note_en: 'A free course for learning to draw from scratch.',
    url: 'https://drawabox.com' },
  // Душевный покой
  { id: 'mt_atomic', sphere: 'soul', kind: 'Книга', kind_en: 'Book', title: 'Джеймс Клир — «Атомные привычки»', title_en: 'James Clear — Atomic Habits',
    note: 'Как маленькие ежедневные шаги складываются в большие перемены. Идеально к этой игре.',
    note_en: 'How small daily steps add up to big changes. A perfect match for this game.' },
  { id: 'mt_flow', sphere: 'soul', kind: 'Книга', kind_en: 'Book', title: 'Михай Чиксентмихайи — «Поток»', title_en: 'Mihaly Csikszentmihalyi — Flow',
    note: 'Что такое состояние потока и почему в нём мы счастливее.',
    note_en: 'What the flow state is and why it makes us happier.' },
  { id: 'mt_insight', sphere: 'soul', kind: 'Приложение', kind_en: 'App', title: 'Insight Timer', title_en: 'Insight Timer',
    note: 'Тысячи бесплатных медитаций, в том числе на русском.',
    note_en: 'Thousands of free guided meditations.',
    url: 'https://insighttimer.com' },
  // Быт
  { id: 'mt_kondo', sphere: 'home', kind: 'Книга', kind_en: 'Book', title: 'Мари Кондо — «Магическая уборка»', title_en: 'Marie Kondo — The Life-Changing Magic of Tidying Up',
    note: 'Метод расхламления: оставлять только то, что радует.',
    note_en: 'A decluttering method: keep only what sparks joy.' },
  { id: 'mt_gtd', sphere: 'home', kind: 'Книга', kind_en: 'Book', title: 'Дэвид Аллен — «Как привести дела в порядок»', title_en: 'David Allen — Getting Things Done',
    note: 'Система GTD: выгрузить все дела из головы и перестать о них тревожиться.',
    note_en: 'The GTD system: get every task out of your head and stop worrying about it.' },
];

// Стадии роста дерева по общему уровню игрока.
export const STAGES = [
  { level: 0,  name: 'Семечко', en: 'Seed' },
  { level: 2,  name: 'Росток', en: 'Sprout' },
  { level: 5,  name: 'Саженец', en: 'Sapling' },
  { level: 9,  name: 'Молодое деревце', en: 'Young tree' },
  { level: 14, name: 'Крепкое дерево', en: 'Sturdy tree' },
  { level: 20, name: 'Раскидистое древо', en: 'Spreading tree' },
  { level: 28, name: 'Вековое древо', en: 'Ancient tree' },
  { level: 38, name: 'Древо мудрости', en: 'Tree of wisdom' },
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
