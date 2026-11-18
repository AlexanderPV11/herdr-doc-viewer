# herdr-doc-viewer

Dos extras para Herdr: el mod **doc-viewer** (visor de documentos) y un set de **iconos de archivo por tipo** para el panel Files y el Quick find.

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

---

# Iconos de archivo (Files y Quick find)

Iconos de trazo y color por tipo de archivo/carpeta (`package.json`, `.ts`, `.env`, `Dockerfile`, `src/`, `node_modules/`…).

Herdr no deja importar código de otro mod, así que el set se copia **dentro** de cada mod que lo use (y esos mods deben ser tus clones, porque los de Herdr son de solo lectura: `herdr-app do mod.clone '{"name":"files","as":"my-files"}'`).

Para un mod `<mod>` (por ejemplo `my-files` o `quick-find`):

1. Copia `file-icons/icons/` a `~/.config/herdr-app/mods/<mod>/icons/` y `file-icons/file-icons.js` a `~/.config/herdr-app/mods/<mod>/file-icons.js`.
2. En `file-icons.js` cambia `<TU-MOD>` por `<mod>` (línea `const P = ...`).
3. En el `main.js` del mod, importa `svg` de `gpui-kit` y la función:
   ```js
   import { iconFor } from "./file-icons.js";
   ```
4. Dibuja el icono donde está la fila del archivo (en `my-files`, reemplaza el icono fijo de archivo/carpeta):
   ```js
   .child((() => { const ic = iconFor(entry.name, entry.dir, open); return svg(ic.path).size(14).flex_none().text_color(ic.color); })())
   ```
   En `quick-find` (todo son archivos): `iconFor(r.path.split("/").pop(), false, false)`.
5. `herdr-app check ~/.config/herdr-app/mods/<mod>`.

Colores e iconos se editan en las tablas de `file-icons.js`; para un glyph nuevo añade un SVG a `icons/`.
