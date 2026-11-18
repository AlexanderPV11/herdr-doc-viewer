# herdr-doc-viewer

Mod para [Herdr](https://herdr.dev) que abre documentos en una pestaña: **PDF, Word (.docx), Excel (.xlsx), CSV/TSV y PowerPoint (.pptx)**.

- **PDF:** todas las páginas en un solo scroll, zoom (`+` `-` `0`), saltos con PgUp/PgDn/Home/End.
- **Word:** títulos, párrafos, listas y tablas.
- **Excel / CSV:** pestañas por hoja, tabla con scroll (300 filas y botón para cargar más; tope 2000 filas × 60 columnas).
- **PowerPoint:** texto de cada diapositiva.
- **Buscador:** `Ctrl+F`, `Enter`/`F3` siguiente, `Shift+F3` anterior, `Esc` limpia. En PDF resalta las coincidencias sobre la página.

## Requisitos

- Python 3 en el PATH (`python`).
- Para PDF: `pip install pypdfium2`. El resto de formatos usa solo la librería estándar.

## Instalación

Copia `mods/doc-viewer/` a `~/.config/herdr-app/mods/doc-viewer/` y verifica:

```sh
herdr-app check ~/.config/herdr-app/mods/doc-viewer
```

## Uso

```sh
herdr-app do tab.new --mod doc-viewer --props '{"file":"C:/ruta/informe.pdf"}'
# con búsqueda inicial
herdr-app do tab.new --mod doc-viewer --props '{"file":"C:/ruta/informe.pdf","query":"texto"}'
```

Usa `/` en las rutas dentro del JSON.

### Abrir desde el panel Files

En un clon de `my-files`, dentro de `open(path)`, antes de abrir el visor de texto:

```js
if (!on && /\.(pdf|docx|docm|xlsx|xlsm|pptx|pptm|csv|tsv|doc|xls|ppt)$/i.test(path)) {
  run("tab.new", { name: path.split("/").pop(), mod: "doc-viewer", props: { file } });
  return;
}
```

## Límites

- `.doc`, `.xls` y `.ppt` antiguos no se leen (guárdalos como `.docx`/`.xlsx`/`.pptx`).
- Word y PowerPoint se muestran como texto (sin imágenes ni formato).
- Los PDF escaneados no tienen texto buscable.
- Las páginas de PDF se guardan en `~/.config/herdr-app/data/doc-viewer/` y no se limpian solas.
