-- Миграция: имена жён отдельным структурным полем (жён может быть несколько).
-- Раньше жёны склеивались в текст note («Супруга: …» / «Жёны: …») и не
-- попадали в публичные древа. Теперь хранятся массивом при муже.

ALTER TABLE persons ADD COLUMN IF NOT EXISTS spouse_names TEXT[];

-- Разовый перенос уже опубликованных данных из note в spouse_names.
UPDATE persons
SET spouse_names = (
    SELECT array_agg(btrim(x))
    FROM unnest(string_to_array(substring(note FROM 'Жёны: ([^.]+)'), ',')) AS x
    WHERE btrim(x) <> ''
)
WHERE spouse_names IS NULL AND note ~ 'Жёны: ';

UPDATE persons
SET spouse_names = ARRAY[btrim(substring(note FROM 'Супруга: ([^.]+)'))]
WHERE spouse_names IS NULL
  AND note ~ 'Супруга: '
  AND btrim(substring(note FROM 'Супруга: ([^.]+)')) <> '';
