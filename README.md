# Claro de luna: del pentagrama al piano

[Abrir la aplicación](https://f3rnandomorenoia.github.io/claro-de-luna-piano/)

Aplicación educativa para estudiar el primer movimiento de la Sonata para piano
n.º 14 de Beethoven. Permite seleccionar una posición de la partitura y muestra
las teclas exactas que deben tocarse, diferenciando ambas manos y conservando la
misma correspondencia de colores entre pentagrama y teclado.

## Desarrollo local

```bash
npm install
npm run dev
```

Para generar la versión estática:

```bash
npm run build:static
```

## Partitura

La aplicación utiliza una transcripción comunitaria Urtext del primer movimiento,
publicada con dedicación CC0. No es una edición institucional oficial.

## Guía para móvil

La página estática `public/movil/` se publica en `/claro-de-luna-piano/movil/` con el mismo despliegue de GitHub Pages. Muestra los 69 compases de la edición original, los 821 pasos en vertical, la leyenda, un modo con notas mantenidas y los dos PDF. Admite enlaces como `movil/#compas-9`.

Los recursos de cada compás se cargan al acercarse a ellos. No requiere cuentas ni servicios externos; el compás reciente se guarda solo en el navegador. Fuente y regeneración de recursos: `scripts/mobile-source/README.md`.
