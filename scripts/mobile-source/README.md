# Fuente de la guía móvil

Partitura y MIDI: Stewart Holmes, Mutopia-2007/02/11-276 (2007), a partir de Berners 1908, edición de A. Winterberger.

https://www.mutopiaproject.org/ftp/BeethovenLv/O27/moonlight/

Licencia: Creative Commons Attribution-ShareAlike 2.5: https://creativecommons.org/licenses/by-sa/2.5/

`moonlight-mutopia.pdf` es la edición que coincide con la foto original del usuario. La foto personal no forma parte del repositorio. `moonlight1.mid` contiene el primer movimiento. `notes.json` conserva sus eventos (tiempos racionales en negras); las notas ligadas no se vuelven a pulsar. La mano de cada evento refleja el track del MIDI y no se usa para atribuir manos en la interfaz.

La guía tiene 69 compases y 821 momentos de ataque. Se verificó el MIDI frente a la fuente anterior: esta tenía dos ataques adicionales de Mi4 (compases 9 y 46). La guía nueva usa el MIDI de Mutopia.

`../build-mobile-assets.py` regenera las 69 ilustraciones SVG y `public/movil/data.json`. Requiere Python con pypdf, pdfplumber y reportlab, y `pdftocairo` en PATH. Los pentagramas se extraen directamente del PDF como vectores; solo se recoloca la indicación que cruza el límite del primer compás para evitar palabras cortadas. No se reagrupan las voces.

Los dos PDF de `public/movil/pdf/` son las versiones aprobadas de la guía con partitura original, pasos verticales y leyenda de colores. Los recortes y la guía se distribuyen bajo la misma licencia CC BY-SA 2.5.
