-- ── Countries ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS countries (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code CHAR(2) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 999
);

INSERT INTO countries (name, code, sort_order) VALUES
  ('Canada', 'CA', 1),
  ('United States', 'US', 2),
  ('Afghanistan', 'AF', 999),
  ('Albania', 'AL', 999),
  ('Algeria', 'DZ', 999),
  ('Andorra', 'AD', 999),
  ('Angola', 'AO', 999),
  ('Antigua and Barbuda', 'AG', 999),
  ('Argentina', 'AR', 999),
  ('Armenia', 'AM', 999),
  ('Australia', 'AU', 10),
  ('Austria', 'AT', 999),
  ('Azerbaijan', 'AZ', 999),
  ('Bahamas', 'BS', 999),
  ('Bahrain', 'BH', 999),
  ('Bangladesh', 'BD', 999),
  ('Barbados', 'BB', 999),
  ('Belarus', 'BY', 999),
  ('Belgium', 'BE', 999),
  ('Belize', 'BZ', 999),
  ('Benin', 'BJ', 999),
  ('Bhutan', 'BT', 999),
  ('Bolivia', 'BO', 999),
  ('Bosnia and Herzegovina', 'BA', 999),
  ('Botswana', 'BW', 999),
  ('Brazil', 'BR', 999),
  ('Brunei', 'BN', 999),
  ('Bulgaria', 'BG', 999),
  ('Burkina Faso', 'BF', 999),
  ('Burundi', 'BI', 999),
  ('Cabo Verde', 'CV', 999),
  ('Cambodia', 'KH', 999),
  ('Cameroon', 'CM', 999),
  ('Central African Republic', 'CF', 999),
  ('Chad', 'TD', 999),
  ('Chile', 'CL', 999),
  ('China', 'CN', 999),
  ('Colombia', 'CO', 999),
  ('Comoros', 'KM', 999),
  ('Congo', 'CG', 999),
  ('Costa Rica', 'CR', 999),
  ('Croatia', 'HR', 999),
  ('Cuba', 'CU', 999),
  ('Cyprus', 'CY', 999),
  ('Czech Republic', 'CZ', 999),
  ('Denmark', 'DK', 999),
  ('Djibouti', 'DJ', 999),
  ('Dominica', 'DM', 999),
  ('Dominican Republic', 'DO', 999),
  ('Ecuador', 'EC', 999),
  ('Egypt', 'EG', 999),
  ('El Salvador', 'SV', 999),
  ('Equatorial Guinea', 'GQ', 999),
  ('Eritrea', 'ER', 999),
  ('Estonia', 'EE', 999),
  ('Eswatini', 'SZ', 999),
  ('Ethiopia', 'ET', 999),
  ('Fiji', 'FJ', 999),
  ('Finland', 'FI', 999),
  ('France', 'FR', 999),
  ('Gabon', 'GA', 999),
  ('Gambia', 'GM', 999),
  ('Georgia', 'GE', 999),
  ('Germany', 'DE', 999),
  ('Ghana', 'GH', 999),
  ('Greece', 'GR', 999),
  ('Grenada', 'GD', 999),
  ('Guatemala', 'GT', 999),
  ('Guinea', 'GN', 999),
  ('Guinea-Bissau', 'GW', 999),
  ('Guyana', 'GY', 999),
  ('Haiti', 'HT', 999),
  ('Honduras', 'HN', 999),
  ('Hungary', 'HU', 999),
  ('Iceland', 'IS', 999),
  ('India', 'IN', 999),
  ('Indonesia', 'ID', 999),
  ('Iran', 'IR', 999),
  ('Iraq', 'IQ', 999),
  ('Ireland', 'IE', 15),
  ('Israel', 'IL', 999),
  ('Italy', 'IT', 999),
  ('Jamaica', 'JM', 999),
  ('Japan', 'JP', 999),
  ('Jordan', 'JO', 999),
  ('Kazakhstan', 'KZ', 999),
  ('Kenya', 'KE', 999),
  ('Kiribati', 'KI', 999),
  ('Kuwait', 'KW', 999),
  ('Kyrgyzstan', 'KG', 999),
  ('Laos', 'LA', 999),
  ('Latvia', 'LV', 999),
  ('Lebanon', 'LB', 999),
  ('Lesotho', 'LS', 999),
  ('Liberia', 'LR', 999),
  ('Libya', 'LY', 999),
  ('Liechtenstein', 'LI', 999),
  ('Lithuania', 'LT', 999),
  ('Luxembourg', 'LU', 999),
  ('Madagascar', 'MG', 999),
  ('Malawi', 'MW', 999),
  ('Malaysia', 'MY', 999),
  ('Maldives', 'MV', 999),
  ('Mali', 'ML', 999),
  ('Malta', 'MT', 999),
  ('Marshall Islands', 'MH', 999),
  ('Mauritania', 'MR', 999),
  ('Mauritius', 'MU', 999),
  ('Mexico', 'MX', 5),
  ('Micronesia', 'FM', 999),
  ('Moldova', 'MD', 999),
  ('Monaco', 'MC', 999),
  ('Mongolia', 'MN', 999),
  ('Montenegro', 'ME', 999),
  ('Morocco', 'MA', 999),
  ('Mozambique', 'MZ', 999),
  ('Myanmar', 'MM', 999),
  ('Namibia', 'NA', 999),
  ('Nauru', 'NR', 999),
  ('Nepal', 'NP', 999),
  ('Netherlands', 'NL', 999),
  ('New Zealand', 'NZ', 11),
  ('Nicaragua', 'NI', 999),
  ('Niger', 'NE', 999),
  ('Nigeria', 'NG', 999),
  ('North Korea', 'KP', 999),
  ('North Macedonia', 'MK', 999),
  ('Norway', 'NO', 999),
  ('Oman', 'OM', 999),
  ('Pakistan', 'PK', 999),
  ('Palau', 'PW', 999),
  ('Panama', 'PA', 999),
  ('Papua New Guinea', 'PG', 999),
  ('Paraguay', 'PY', 999),
  ('Peru', 'PE', 999),
  ('Philippines', 'PH', 999),
  ('Poland', 'PL', 999),
  ('Portugal', 'PT', 999),
  ('Qatar', 'QA', 999),
  ('Romania', 'RO', 999),
  ('Russia', 'RU', 999),
  ('Rwanda', 'RW', 999),
  ('Saint Kitts and Nevis', 'KN', 999),
  ('Saint Lucia', 'LC', 999),
  ('Saint Vincent and the Grenadines', 'VC', 999),
  ('Samoa', 'WS', 999),
  ('San Marino', 'SM', 999),
  ('Sao Tome and Principe', 'ST', 999),
  ('Saudi Arabia', 'SA', 999),
  ('Senegal', 'SN', 999),
  ('Serbia', 'RS', 999),
  ('Seychelles', 'SC', 999),
  ('Sierra Leone', 'SL', 999),
  ('Singapore', 'SG', 999),
  ('Slovakia', 'SK', 999),
  ('Slovenia', 'SI', 999),
  ('Solomon Islands', 'SB', 999),
  ('Somalia', 'SO', 999),
  ('South Africa', 'ZA', 999),
  ('South Korea', 'KR', 999),
  ('South Sudan', 'SS', 999),
  ('Spain', 'ES', 999),
  ('Sri Lanka', 'LK', 999),
  ('Sudan', 'SD', 999),
  ('Suriname', 'SR', 999),
  ('Sweden', 'SE', 999),
  ('Switzerland', 'CH', 999),
  ('Syria', 'SY', 999),
  ('Taiwan', 'TW', 999),
  ('Tajikistan', 'TJ', 999),
  ('Tanzania', 'TZ', 999),
  ('Thailand', 'TH', 999),
  ('Timor-Leste', 'TL', 999),
  ('Togo', 'TG', 999),
  ('Tonga', 'TO', 999),
  ('Trinidad and Tobago', 'TT', 999),
  ('Tunisia', 'TN', 999),
  ('Turkey', 'TR', 999),
  ('Turkmenistan', 'TM', 999),
  ('Tuvalu', 'TV', 999),
  ('Uganda', 'UG', 999),
  ('Ukraine', 'UA', 999),
  ('United Arab Emirates', 'AE', 999),
  ('United Kingdom', 'GB', 12),
  ('Uruguay', 'UY', 999),
  ('Uzbekistan', 'UZ', 999),
  ('Vanuatu', 'VU', 999),
  ('Vatican City', 'VA', 999),
  ('Venezuela', 'VE', 999),
  ('Vietnam', 'VN', 999),
  ('Yemen', 'YE', 999),
  ('Zambia', 'ZM', 999),
  ('Zimbabwe', 'ZW', 999);

-- ── States / Provinces ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS states (
  id SERIAL PRIMARY KEY,
  country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  UNIQUE (country_id, code)
);

CREATE INDEX IF NOT EXISTS states_country_id ON states (country_id);

-- Canada
INSERT INTO states (country_id, name, code)
SELECT id, s.name, s.code FROM countries, (VALUES
  ('Alberta', 'AB'),
  ('British Columbia', 'BC'),
  ('Manitoba', 'MB'),
  ('New Brunswick', 'NB'),
  ('Newfoundland and Labrador', 'NL'),
  ('Northwest Territories', 'NT'),
  ('Nova Scotia', 'NS'),
  ('Nunavut', 'NU'),
  ('Ontario', 'ON'),
  ('Prince Edward Island', 'PE'),
  ('Quebec', 'QC'),
  ('Saskatchewan', 'SK'),
  ('Yukon', 'YT')
) AS s(name, code) WHERE countries.code = 'CA';

-- United States
INSERT INTO states (country_id, name, code)
SELECT id, s.name, s.code FROM countries, (VALUES
  ('Alabama', 'AL'), ('Alaska', 'AK'), ('Arizona', 'AZ'), ('Arkansas', 'AR'),
  ('California', 'CA'), ('Colorado', 'CO'), ('Connecticut', 'CT'), ('Delaware', 'DE'),
  ('District of Columbia', 'DC'), ('Florida', 'FL'), ('Georgia', 'GA'), ('Hawaii', 'HI'),
  ('Idaho', 'ID'), ('Illinois', 'IL'), ('Indiana', 'IN'), ('Iowa', 'IA'),
  ('Kansas', 'KS'), ('Kentucky', 'KY'), ('Louisiana', 'LA'), ('Maine', 'ME'),
  ('Maryland', 'MD'), ('Massachusetts', 'MA'), ('Michigan', 'MI'), ('Minnesota', 'MN'),
  ('Mississippi', 'MS'), ('Missouri', 'MO'), ('Montana', 'MT'), ('Nebraska', 'NE'),
  ('Nevada', 'NV'), ('New Hampshire', 'NH'), ('New Jersey', 'NJ'), ('New Mexico', 'NM'),
  ('New York', 'NY'), ('North Carolina', 'NC'), ('North Dakota', 'ND'), ('Ohio', 'OH'),
  ('Oklahoma', 'OK'), ('Oregon', 'OR'), ('Pennsylvania', 'PA'), ('Rhode Island', 'RI'),
  ('South Carolina', 'SC'), ('South Dakota', 'SD'), ('Tennessee', 'TN'), ('Texas', 'TX'),
  ('Utah', 'UT'), ('Vermont', 'VT'), ('Virginia', 'VA'), ('Washington', 'WA'),
  ('West Virginia', 'WV'), ('Wisconsin', 'WI'), ('Wyoming', 'WY')
) AS s(name, code) WHERE countries.code = 'US';

-- Australia
INSERT INTO states (country_id, name, code)
SELECT id, s.name, s.code FROM countries, (VALUES
  ('Australian Capital Territory', 'ACT'), ('New South Wales', 'NSW'),
  ('Northern Territory', 'NT'), ('Queensland', 'QLD'),
  ('South Australia', 'SA'), ('Tasmania', 'TAS'),
  ('Victoria', 'VIC'), ('Western Australia', 'WA')
) AS s(name, code) WHERE countries.code = 'AU';

-- United Kingdom
INSERT INTO states (country_id, name, code)
SELECT id, s.name, s.code FROM countries, (VALUES
  ('England', 'ENG'), ('Northern Ireland', 'NIR'),
  ('Scotland', 'SCT'), ('Wales', 'WLS')
) AS s(name, code) WHERE countries.code = 'GB';

-- New Zealand
INSERT INTO states (country_id, name, code)
SELECT id, s.name, s.code FROM countries, (VALUES
  ('Auckland', 'AUK'), ('Bay of Plenty', 'BOP'), ('Canterbury', 'CAN'),
  ('Gisborne', 'GIS'), ('Hawke''s Bay', 'HKB'), ('Manawatu-Whanganui', 'MWT'),
  ('Marlborough', 'MBH'), ('Nelson', 'NSN'), ('Northland', 'NTL'),
  ('Otago', 'OTA'), ('Southland', 'STL'), ('Taranaki', 'TKI'),
  ('Tasman', 'TAS'), ('Waikato', 'WKO'), ('Wellington', 'WGN'),
  ('West Coast', 'WTC')
) AS s(name, code) WHERE countries.code = 'NZ';

-- Ireland
INSERT INTO states (country_id, name, code)
SELECT id, s.name, s.code FROM countries, (VALUES
  ('Carlow', 'CW'), ('Cavan', 'CN'), ('Clare', 'CE'), ('Cork', 'CO'),
  ('Donegal', 'DL'), ('Dublin', 'D'), ('Galway', 'G'), ('Kerry', 'KY'),
  ('Kildare', 'KE'), ('Kilkenny', 'KK'), ('Laois', 'LS'), ('Leitrim', 'LM'),
  ('Limerick', 'LK'), ('Longford', 'LD'), ('Louth', 'LH'), ('Mayo', 'MO'),
  ('Meath', 'MH'), ('Monaghan', 'MN'), ('Offaly', 'OY'), ('Roscommon', 'RN'),
  ('Sligo', 'SO'), ('Tipperary', 'TA'), ('Waterford', 'WD'), ('Westmeath', 'WH'),
  ('Wexford', 'WX'), ('Wicklow', 'WW')
) AS s(name, code) WHERE countries.code = 'IE';

-- ── Player number ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS player_number_seq START 10001 INCREMENT 1;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS player_number INTEGER UNIQUE DEFAULT nextval('player_number_seq'),
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country_id INTEGER REFERENCES countries(id),
  ADD COLUMN IF NOT EXISTS state_id INTEGER REFERENCES states(id);

-- Backfill player_number for existing users (in signup order)
UPDATE users SET player_number = nextval('player_number_seq')
WHERE player_number IS NULL;

-- Best-effort migration of existing country text → country_id
UPDATE users u
SET country_id = c.id
FROM countries c
WHERE u.country_id IS NULL
  AND u.country IS NOT NULL
  AND LOWER(TRIM(u.country)) = LOWER(c.name);

-- Best-effort migration of existing province_state text → state_id
UPDATE users u
SET state_id = s.id
FROM states s
WHERE u.state_id IS NULL
  AND u.province_state IS NOT NULL
  AND u.country_id = s.country_id
  AND LOWER(TRIM(u.province_state)) = LOWER(s.name);

CREATE INDEX IF NOT EXISTS users_player_number ON users (player_number);
