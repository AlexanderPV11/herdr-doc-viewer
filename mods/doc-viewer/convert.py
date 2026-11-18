#!/usr/bin/env python3
"""doc-viewer backend. Stdlib only, except pypdfium2 for PDF pages.

  convert.py info <file>                      -> JSON describing the document
  convert.py page <file> <page> <scale> <png> -> renders one PDF page, prints {"w","h"}
  convert.py search <file> <query>            -> PDF matches [{page, rects:[[l,b,r,t]...]}] in points
"""
import sys, os, json, zipfile, csv, re
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
S = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
MAX_ROWS, MAX_COLS = 2000, 60


def out(o):
    sys.stdout.buffer.write(json.dumps(o, ensure_ascii=False).encode("utf-8"))


def docx(path):
    z = zipfile.ZipFile(path)
    body = ET.fromstring(z.read("word/document.xml")).find(W + "body")

    def runs(p):
        s = []
        for n in p.iter():
            if n.tag == W + "t":
                s.append(n.text or "")
            elif n.tag == W + "tab":
                s.append("    ")
            elif n.tag in (W + "br", W + "cr"):
                s.append("\n")
        return "".join(s)

    blocks = []
    for el in body:
        if el.tag == W + "p":
            ppr = el.find(W + "pPr")
            style, listed = "", False
            if ppr is not None:
                st = ppr.find(W + "pStyle")
                if st is not None:
                    style = st.get(W + "val", "")
                listed = ppr.find(W + "numPr") is not None
            text = runs(el)
            m = re.match(r"(?i)^(heading|titulo|título)\s*(\d)", style)
            if style.lower() == "title":
                blocks.append({"t": "h", "level": 1, "text": text})
            elif m:
                blocks.append({"t": "h", "level": min(int(m.group(2)), 4), "text": text})
            elif not text.strip():
                blocks.append({"t": "gap"})
            elif listed or "list" in style.lower():
                blocks.append({"t": "li", "text": text})
            else:
                blocks.append({"t": "p", "text": text})
        elif el.tag == W + "tbl":
            rows = []
            for tr in el.iter(W + "tr"):
                rows.append([" ".join(runs(p) for p in tc.iter(W + "p")).strip() for tc in tr.findall(W + "tc")])
            blocks.append({"t": "table", "rows": rows[:MAX_ROWS]})
    return {"kind": "doc", "blocks": blocks}


def col_index(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n - 1


def xlsx(path):
    z = zipfile.ZipFile(path)
    names = z.namelist()
    shared = []
    if "xl/sharedStrings.xml" in names:
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(S + "si"):
            shared.append("".join(t.text or "" for t in si.iter(S + "t")))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = []
    for sh in wb.iter(S + "sheet"):
        target = rels.get(sh.get(R + "id"), "").lstrip("/")
        part = target if target.startswith("xl/") else "xl/" + target
        rows, truncated = [], False
        if part in names:
            for row in ET.fromstring(z.read(part)).iter(S + "row"):
                if len(rows) >= MAX_ROWS:
                    truncated = True
                    break
                r = row.get("r")
                idx = int(r) - 1 if r else len(rows)
                while len(rows) < idx:
                    rows.append([])
                cells = []
                for c in row.findall(S + "c"):
                    ci = col_index(c.get("r")) if c.get("r") else len(cells)
                    if ci >= MAX_COLS:
                        continue
                    while len(cells) < ci:
                        cells.append("")
                    t, v = c.get("t"), c.find(S + "v")
                    if t == "s" and v is not None:
                        val = shared[int(v.text)]
                    elif t == "inlineStr":
                        val = "".join(x.text or "" for x in c.iter(S + "t"))
                    elif t == "b" and v is not None:
                        val = "TRUE" if v.text == "1" else "FALSE"
                    else:
                        val = v.text if v is not None and v.text is not None else ""
                    cells.append(val)
                rows.append(cells)
        sheets.append({"name": sh.get("name"), "rows": rows, "truncated": truncated})
    return {"kind": "sheets", "sheets": sheets}


def pptx(path):
    z = zipfile.ZipFile(path)
    names = sorted((n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
                   key=lambda n: int(re.search(r"(\d+)\.xml", n).group(1)))
    slides = []
    for n in names:
        paras = []
        for p in ET.fromstring(z.read(n)).iter(A + "p"):
            text = "".join(t.text or "" for t in p.iter(A + "t"))
            if text.strip():
                paras.append(text)
        slides.append(paras)
    return {"kind": "slides", "slides": slides}


def delimited(path):
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        sample = f.read(4096)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except Exception:
            dialect = csv.excel
        rows = []
        for i, r in enumerate(csv.reader(f, dialect)):
            if i >= MAX_ROWS:
                break
            rows.append(r[:MAX_COLS])
    return {"kind": "sheets", "sheets": [{"name": os.path.basename(path), "rows": rows, "truncated": len(rows) >= MAX_ROWS}]}


def pdf_info(path):
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(path)
    sizes = [list(pdf[i].get_size()) for i in range(len(pdf))]
    pdf.close()
    return {"kind": "pdf", "pages": sizes}


def pdf_page(path, page, scale, png):
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(path)
    img = pdf[page].render(scale=scale).to_pil()
    os.makedirs(os.path.dirname(png), exist_ok=True)
    img.save(png)
    pdf.close()
    out({"w": img.width, "h": img.height})


def pdf_search(path, query):
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(path)
    matches = []
    for i in range(len(pdf)):
        tp = pdf[i].get_textpage()
        finder = tp.search(query, match_case=False)
        while True:
            r = finder.get_next()
            if not r:
                break
            idx, count = r
            rects = []
            for j in range(idx, idx + count):
                b = tp.get_charbox(j)
                if b[2] - b[0] <= 0:
                    continue
                if rects and abs(b[1] - rects[-1][1]) < (b[3] - b[1]) * 0.6:
                    q = rects[-1]
                    rects[-1] = [min(q[0], b[0]), min(q[1], b[1]), max(q[2], b[2]), max(q[3], b[3])]
                else:
                    rects.append(list(b))
            matches.append({"page": i, "rects": rects})
            if len(matches) >= 1000:
                break
        if len(matches) >= 1000:
            break
    pdf.close()
    out({"matches": matches})


def main():
    mode, path = sys.argv[1], sys.argv[2]
    if mode == "search":
        return pdf_search(path, sys.argv[3])
    if mode == "page":
        return pdf_page(path, int(sys.argv[3]), float(sys.argv[4]), sys.argv[5])
    ext = os.path.splitext(path)[1].lower().lstrip(".")
    try:
        if ext == "pdf":
            out(pdf_info(path))
        elif ext in ("docx", "docm", "dotx"):
            out(docx(path))
        elif ext in ("xlsx", "xlsm"):
            out(xlsx(path))
        elif ext in ("pptx", "pptm"):
            out(pptx(path))
        elif ext in ("csv", "tsv"):
            out(delimited(path))
        elif ext in ("doc", "xls", "ppt"):
            out({"kind": "error", "message": "Formato antiguo (." + ext + "): guárdalo como ." + ext + "x para verlo"})
        else:
            out({"kind": "error", "message": "Formato no soportado: ." + ext})
    except Exception as e:
        out({"kind": "error", "message": "No se pudo leer el archivo: %s" % e})


main()
