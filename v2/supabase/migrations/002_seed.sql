-- Seed: перенос EMPLOYEES + SECTIONS + BASE_PATTERNS из хардкода JS
-- Это выполняется один раз при деплое. После этого данные живут только в БД.

-- ── Секции ────────────────────────────────────────────────────────────────────
INSERT INTO sections (key, label, color, sort_order) VALUES
  ('regular_support', 'Regular Support', 'blue',   1),
  ('vip_support',     'VIP Support',     'green',  2),
  ('management',      'Management',      'blue',   3),
  ('qa',              'QA',              'orange', 4);

-- ── Типы смен (перенос SHIFT_DEFS) ───────────────────────────────────────────
INSERT INTO shift_types (key, label, category, hours, win_start, win_end, is_night, is_extra, base_key, givable, legacy) VALUES
  -- Regular
  ('morning',       'День',            'Regular', 11, 9,  21, false, false, null,        true,  false),
  ('evening',       'Ночь',            'Regular', 11, 21, 33, true,  false, null,        true,  false),
  ('shift1200',     '12-00',           'Regular', 11, 12, 24, false, false, null,        true,  false),
  ('extra_morning', '+Доп День',       'Regular',  0, 9,  21, false, true,  'morning',   false, false),
  ('extra_evening', '+Доп Ночь',       'Regular',  0, 21, 33, true,  true,  'evening',   false, false),
  ('extra_1200',    '+Доп 12-00',      'Regular',  0, 12, 24, false, true,  'shift1200', false, false),
  -- VIP (исторически перевёрнутые имена: vip_morning=ночь, vip_evening=день)
  ('vip_evening',       'VIP День',       'VIP', 11, 9,  21, false, false, null,            true,  false),
  ('vip_morning',       'VIP Ночь',       'VIP', 11, 21, 33, true,  false, null,            true,  false),
  ('vip_1200',          'VIP 12-00',      'VIP', 11, 12, 24, false, false, null,            true,  false),
  ('extra_vip_evening', '+Доп VIP День',  'VIP',  0, 9,  21, false, true,  'vip_evening',   false, false),
  ('extra_vip_morning', '+Доп VIP Ночь',  'VIP',  0, 21, 33, true,  true,  'vip_morning',   false, false),
  ('extra_vip_1200',    '+Доп VIP 12-00', 'VIP',  0, 12, 24, false, true,  'vip_1200',      false, false),
  -- Supervisors
  ('super_day',      'Sup День', 'Sup', 11, 9,  21, false, false, null,        true,  false),
  ('super_night',    'Sup Ночь', 'Sup', 11, 21, 33, true,  false, null,        true,  false),
  ('super_day8',     'Sup 8ч',   'Sup',  8, 10, 19, false, false, null,        true,  false),
  ('extra_sup_day',  '+Доп Sup День', 'Sup', 0, 9,  21, false, true, 'super_day',  false, false),
  ('extra_sup_night','+Доп Sup Ночь', 'Sup', 0, 21, 33, true,  true, 'super_night',false, false),
  ('extra_sup_day8', '+Доп Sup 8ч',   'Sup', 0, 10, 19, false, true, 'super_day8', false, false),
  -- Other
  ('work8',    '8ч офис',        'Mgmt',  8, 9, 18, false, false, null, false, false),
  ('nk',       'НК',             'Other', 11, null, null, false, false, null, false, false),
  ('night',    'Ночь (легаси)',   'Other', 11, 21, 33, true, false, null, false, true),
  ('vacation', 'Отпуск',         'Other',  0, null, null, false, false, null, false, false),
  ('sick',     'Больничный',     'Other',  0, null, null, false, false, null, false, false),
  ('birthday', 'Выходной ДР',   'Other',  0, null, null, false, false, null, false, false),
  ('off',      'Выходной',       'Other',  0, null, null, false, false, null, false, false),
  ('dismissed','Уволен',         'Other',  0, null, null, false, false, null, false, false);

-- ── Сотрудники ────────────────────────────────────────────────────────────────
-- Management
WITH s AS (SELECT id FROM sections WHERE key = 'management')
INSERT INTO employees (name, email, position, hired_at, section_id, sort_order) VALUES
  ('Oliver',    'vitaliy.oliver@velvix.org',     'Head',        '2022-10-24', (SELECT id FROM s), 0),
  ('Jordan',    'ayman.jordan@velvix.org',        'TL',          '2021-08-24', (SELECT id FROM s), 1),
  ('Naomi',     'nataliia.naomi@velvix.org',      'TL',          '2023-04-27', (SELECT id FROM s), 2),
  ('Matthew',   'viktor.matthew@velvix.org',      'TL',          '2023-03-30', (SELECT id FROM s), 3),
  ('Reed',      'vladyslav.reed@velvix.org',      'Complaints',  '2024-03-25', (SELECT id FROM s), 4),
  ('Jayden',    'ilia.jayden@velvix.org',          'Coach',       '2023-03-30', (SELECT id FROM s), 5),
  ('Anna',      'anna.carrot@velvix.org',          'Coach',       '2023-11-24', (SELECT id FROM s), 6),
  ('Nikita',    'nikita.lanaya@velvix.org',        'Analyst',     '2025-03-01', (SELECT id FROM s), 7);

-- Regular Support (Supervisors + agents)
WITH s AS (SELECT id FROM sections WHERE key = 'regular_support')
INSERT INTO employees (name, email, position, hired_at, section_id, sort_order) VALUES
  ('Curtis',   'kirill.curtis@velvix.org',          'Supervisor', '2024-03-25', (SELECT id FROM s), 0),
  ('Manuel',   'ruslan.manuel@velvix.org',           'Supervisor', '2024-04-08', (SELECT id FROM s), 1),
  ('Irma',     'janelle.irma@velvix.org',            'Supervisor', '2024-06-24', (SELECT id FROM s), 2),
  ('Solomon',  'ilia.solomon@velvix.org',             'Supervisor', '2023-06-30', (SELECT id FROM s), 3),
  ('Richard',  'ivan.richard@velvix.org',             'Supervisor', '2022-06-23', (SELECT id FROM s), 4),
  ('Toby',     'osman.toby@velvix.org',               'Supervisor', '2024-04-15', (SELECT id FROM s), 5),
  ('Will',     'rovshan.will@velvix.org',              'Support',    '2025-07-29', (SELECT id FROM s), 6),
  ('Bridget',  'elvira.as@velvix.org',                'Support',    '2025-12-08', (SELECT id FROM s), 7),
  ('Fletcher', 'sherzodjon.fletcher@velvix.org',      'Support',    '2025-07-22', (SELECT id FROM s), 8),
  ('Kenzo',    'nijat.kenzo@velvix.org',               'Support',    '2025-07-22', (SELECT id FROM s), 9),
  ('Nora',     'alina.ja@velvix.org',                  'Support',    '2025-10-20', (SELECT id FROM s), 10),
  ('Robert',   'adil.ab@velvix.org',                   'Support',    '2026-01-12', (SELECT id FROM s), 11),
  ('Charles',  'teymur.ab@velvix.org',                 'Support',    '2026-01-26', (SELECT id FROM s), 12),
  ('Earl',     'rashad.go@velvix.org',                 'Support',    '2026-01-12', (SELECT id FROM s), 13),
  ('Rudy',     'rufat.rudy@velvix.org',                'Support',    '2024-06-10', (SELECT id FROM s), 14),
  ('Bowen',    'ivan.bowen@velvix.org',                'Support',    '2024-05-27', (SELECT id FROM s), 15),
  ('Balfour',  'emin.nu@velvix.org',                   'Support',    '2025-10-20', (SELECT id FROM s), 16),
  ('Jonathan', 'dmitriy.be@velvix.org',                'Support',    '2025-11-17', (SELECT id FROM s), 17),
  ('Bill',     'artsiom.pu@velvix.org',                'Support',    '2026-01-12', (SELECT id FROM s), 18),
  ('Gross',    'ruslan.mi@velvix.org',                 'Support',    '2026-03-02', (SELECT id FROM s), 19),
  ('Meadow',   'assel.meadow@velvix.org',              'Support',    '2024-08-08', (SELECT id FROM s), 20),
  ('Norman',   'elvin.norman@velvix.org',              'Support',    '2024-01-29', (SELECT id FROM s), 21),
  ('Robin',    'mikita.ma@velvix.org',                 'Support',    '2025-12-08', (SELECT id FROM s), 22),
  ('Bob',      'maksym.k@velvix.org',                  'Support',    '2025-10-20', (SELECT id FROM s), 23),
  ('Lex',      'vladyslav.bi@velvix.org',              'Support',    '2026-01-12', (SELECT id FROM s), 24),
  ('Calvin',   'radik.mu@velvix.org',                  'Support',    '2026-03-02', (SELECT id FROM s), 25),
  ('Mike',     'stanislav.mike@velvix.org',             'Support',    '2023-08-28', (SELECT id FROM s), 26),
  ('Florence', 'banovsha.florence@velvix.org',          'Support',    '2024-01-29', (SELECT id FROM s), 27),
  ('Hardy',    'teymur.hardy@velvix.org',               'Support',    '2025-07-29', (SELECT id FROM s), 28),
  ('Murphy',   'viktor.bo@velvix.org',                  'Support',    '2025-11-17', (SELECT id FROM s), 29),
  ('Joseph',   'oleh.vy@velvix.org',                    'Support',    '2025-10-20', (SELECT id FROM s), 30);

-- VIP Support
WITH s AS (SELECT id FROM sections WHERE key = 'vip_support')
INSERT INTO employees (name, email, position, hired_at, section_id, sort_order) VALUES
  ('Adam',      'vadym.adam@velvix.org',           'VIP Sup',  '2023-08-17', (SELECT id FROM s), 0),
  ('Amelia',    'tamila.amelia@velvix.org',         'VIP Sup',  '2023-10-23', (SELECT id FROM s), 1),
  ('Lucas',     'vladimir.lucas@velvix.org',         'VIP Sup',  '2023-07-22', (SELECT id FROM s), 2),
  ('Scott',     'serghei.scott@velvix.org',          'VIP',      '2023-04-25', (SELECT id FROM s), 3),
  ('Tom',       'fuad.tom@velvix.org',               'VIP',      '2024-04-08', (SELECT id FROM s), 4),
  ('Simon',     'nurdaulet.simon@velvix.org',        'VIP',      '2023-12-04', (SELECT id FROM s), 5),
  ('Skylar',    'elnur.skylar@velvix.org',           'VIP',      '2024-11-11', (SELECT id FROM s), 6),
  ('Felicia',   'nigar.felicia@velvix.org',          'VIP',      '2024-11-25', (SELECT id FROM s), 7),
  ('Nolan',     'aliyar.ko@velvix.org',              'VIP',      '2025-10-20', (SELECT id FROM s), 8),
  ('Casper',    'ruslan.casper@velvix.org',          'VIP',      '2025-07-22', (SELECT id FROM s), 9),
  ('Elijah',    'alisher.elijah@velvix.org',         'VIP',      '2024-05-27', (SELECT id FROM s), 10),
  ('Holly',     'lolita.holly@velvix.org',           'VIP',      '2024-11-11', (SELECT id FROM s), 11),
  ('River',     'vladyslav.river@velvix.org',        'VIP',      '2024-03-25', (SELECT id FROM s), 12),
  ('Chadwick',  'temirlan.chadwick@velvix.org',      'VIP',      '2024-06-24', (SELECT id FROM s), 13),
  ('Fabio',     'daniil.fabio@velvix.org',           'VIP',      '2024-11-25', (SELECT id FROM s), 14),
  ('Plover',    'timur.plover@velvix.org',           'VIP',      '2024-09-16', (SELECT id FROM s), 15),
  ('Morgan',    'vladislav.morgan@velvix.org',       'VIP',      '2024-05-13', (SELECT id FROM s), 16),
  ('Reggie',    'maksym.reggie@velvix.org',          'VIP',      '2024-03-25', (SELECT id FROM s), 17),
  ('Wade',      'teymur.wade@velvix.org',            'VIP',      '2024-03-25', (SELECT id FROM s), 18),
  ('Ashton',    'matsvei.ashton@velvix.org',         'VIP',      '2024-11-25', (SELECT id FROM s), 19),
  ('Trinity',   'muslmat.trinity@velvix.org',        'VIP',      '2025-07-22', (SELECT id FROM s), 20),
  ('Christine', 'zuleykha.christine@velvix.org',     'VIP',      '2024-06-24', (SELECT id FROM s), 21),
  ('Isaac',     'azim.isaac@velvix.org',             'VIP',      '2024-01-15', (SELECT id FROM s), 22),
  ('Warren',    'vladimir.warren@velvix.org',        'VIP',      '2025-07-22', (SELECT id FROM s), 23),
  ('Alexia',    'sabina.ib@velvix.org',              'VIP',      '2024-01-29', (SELECT id FROM s), 24),
  ('Kiana',     'kateryna.kiana@velvix.org',         'VIP',      '2023-12-04', (SELECT id FROM s), 25),
  ('Denzel',    'emil.denzel@velvix.org',            'VIP',      '2024-02-26', (SELECT id FROM s), 26);

-- QA
WITH s AS (SELECT id FROM sections WHERE key = 'qa')
INSERT INTO employees (name, email, position, hired_at, section_id, sort_order) VALUES
  ('Оксана',    'oksana.qa@velvix.org',       'QA Team Lead',  '2023-03-20', (SELECT id FROM s), 0),
  ('Аня',       'anna.va@velvix.org',          'QA Supervisor', '2023-04-04', (SELECT id FROM s), 1),
  ('Айгерим',   'aigerim.qa@velvix.org',       'QA Manager',    '2023-04-17', (SELECT id FROM s), 2),
  ('Анастасия', 'anastasia.qa@velvix.org',     'QA Manager',    '2023-01-18', (SELECT id FROM s), 3),
  ('Натия',     'natia.qa@velvix.org',         'QA Manager',    '2024-05-01', (SELECT id FROM s), 4),
  ('Сарвар',    'sarvar.qa@velvix.org',        'QA Manager',    '2024-07-08', (SELECT id FROM s), 5),
  ('Зумруд',    'zumrud.qa@velvix.org',        'QA Manager',    '2024-06-19', (SELECT id FROM s), 6),
  ('Roger',     'aliaksandr.roger@velvix.org', 'QA AI',         '2023-08-28', (SELECT id FROM s), 7);

-- ── Паттерны (BASE_PATTERNS из JS, cycleStart = 2026-06-01) ──────────────────
-- Паттерны 4-дневные (shift1200)
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['shift1200','off','off','shift1200'], 'seed'
FROM employees WHERE name IN ('Will', 'Bridget', 'Fletcher');

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['off','shift1200','shift1200','off'], 'seed'
FROM employees WHERE name IN ('Kenzo', 'Nora', 'Robert');

-- Паттерны 8-дневные (morning/evening)
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['morning','off','off','evening','evening','off','off','morning'], 'seed'
FROM employees WHERE name = 'Florence';

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['off','evening','evening','off','off','morning','morning','off'], 'seed'
FROM employees WHERE name IN ('Charles', 'Earl', 'Rudy', 'Bowen');

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['off','morning','morning','off','off','evening','evening','off'], 'seed'
FROM employees WHERE name IN ('Balfour', 'Jonathan', 'Bill', 'Gross', 'Meadow');

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['evening','off','off','morning','morning','off','off','evening'], 'seed'
FROM employees WHERE name IN ('Robin', 'Bob', 'Lex', 'Mike');

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['morning','off','off','evening','evening','off','off','morning'], 'seed'
FROM employees WHERE name IN ('Calvin', 'Hardy', 'Murphy', 'Joseph');

-- VIP 4-дневные (vip_1200)
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['off','off','vip_1200','vip_1200'], 'seed'
FROM employees WHERE name = 'Scott';

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['off','vip_1200','vip_1200','off'], 'seed'
FROM employees WHERE name IN ('Tom', 'Simon');

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['vip_1200','off','off','vip_1200'], 'seed'
FROM employees WHERE name IN ('Skylar', 'Felicia', 'Nolan');

-- VIP 8-дневные (vip_morning/vip_evening)
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['off','vip_morning','vip_morning','off','off','vip_evening','vip_evening','off'], 'seed'
FROM employees WHERE name IN ('Casper', 'Elijah', 'Holly', 'River');

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['off','vip_evening','vip_evening','off','off','vip_morning','vip_morning','off'], 'seed'
FROM employees WHERE name IN ('Chadwick', 'Fabio', 'Plover', 'Morgan', 'Reggie');

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['vip_morning','off','off','vip_evening','vip_evening','off','off','vip_morning'], 'seed'
FROM employees WHERE name IN ('Wade', 'Ashton', 'Christine', 'Isaac');

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['off','off','vip_evening','vip_evening','off','off','vip_morning','vip_morning'], 'seed'
FROM employees WHERE name = 'Trinity';

INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01', ARRAY['vip_evening','off','off','vip_morning','vip_morning','off','off','vip_evening'], 'seed'
FROM employees WHERE name IN ('Warren', 'Alexia', 'Kiana', 'Denzel');

-- Supervisors (12-дневный цикл — Команда 1: Irma/Solomon/Toby, Команда 2: Curtis/Manuel/Richard)
-- Команда 1 работает в позициях 0,1,4,5,8,9 из 12
-- Paттерн периодов: period0=[0,1]ночь, period1=[1]ночь, period2=[0]ночь
-- Irma(0): период0=день, период1=день, период2=ночь
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01',
  ARRAY['super_day','super_day','off','off','super_day','super_day','off','off','super_night','super_night','off','off'],
  'seed'
FROM employees WHERE name = 'Irma';

-- Solomon(1): период0=день, период1=ночь, период2=день
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01',
  ARRAY['super_day','super_day','off','off','super_night','super_night','off','off','super_day','super_day','off','off'],
  'seed'
FROM employees WHERE name = 'Solomon';

-- Toby(2): период0=ночь, период1=день, период2=день
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01',
  ARRAY['super_night','super_night','off','off','super_day','super_day','off','off','super_day','super_day','off','off'],
  'seed'
FROM employees WHERE name = 'Toby';

-- Команда 2 работает в позициях 2,3,6,7,10,11
-- Curtis(0): period0=день, period1=день, period2=ночь
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01',
  ARRAY['off','off','super_day','super_day','off','off','super_day','super_day','off','off','super_night','super_night'],
  'seed'
FROM employees WHERE name = 'Curtis';

-- Manuel(1): period0=день, period1=ночь, period2=день
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01',
  ARRAY['off','off','super_day','super_day','off','off','super_night','super_night','off','off','super_day','super_day'],
  'seed'
FROM employees WHERE name = 'Manuel';

-- Richard(2): period0=ночь, period1=день, period2=день
INSERT INTO shift_patterns (employee_id, cycle_start, pattern, created_by)
SELECT id, '2026-06-01',
  ARRAY['off','off','super_night','super_night','off','off','super_day','super_day','off','off','super_day','super_day'],
  'seed'
FROM employees WHERE name = 'Richard';

-- Adam — 8 персональных часов (VIP Sup с коротким графиком)
UPDATE employees SET hours = 8 WHERE name = 'Adam';
