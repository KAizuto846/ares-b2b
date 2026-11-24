-- El POS es una función Premium del comercio: el plan premium gana el flag.
UPDATE planes SET flags = JSON_SET(flags, '$.pos', TRUE) WHERE clave = 'premium';
UPDATE planes SET flags = JSON_SET(flags, '$.pos', FALSE) WHERE clave = 'gratis';
