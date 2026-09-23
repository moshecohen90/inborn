#!/usr/bin/env python3
"""Four real test documents for the acceptance run, each with a unique fact so a citation can be checked."""
import os, zipfile, io
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs")
os.makedirs(OUT, exist_ok=True)

FACTS = {
    1: "The Rakovsky turbine serial number is RK-4417.",
    2: "The Belmont warehouse roof was replaced in March 2019.",
    3: "The annual maintenance budget for the Halden plant is 284,000 euro.",
}

# ---------- 1. a 3-page PDF with a real text layer ----------
def pdf_text(path):
    def esc(s): return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    objs = []           # 1-indexed list of raw object bodies
    kids = []
    page_obj_first = 4  # 1 catalog, 2 pages, 3 font
    n_pages = len(FACTS)
    for i, (page, fact) in enumerate(sorted(FACTS.items())):
        kids.append(page_obj_first + i * 2)
    body_lines = []
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(("<< /Type /Pages /Kids [" + " ".join(f"{k} 0 R" for k in kids) + f"] /Count {n_pages} >>").encode())
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for i, (page, fact) in enumerate(sorted(FACTS.items())):
        pno = page_obj_first + i * 2
        cno = pno + 1
        objs.append((f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {cno} 0 R >>").encode())
        text = (f"BT /F1 20 Tf 60 760 Td (Inborn acceptance test document - page {page}) Tj ET\n"
                f"BT /F1 14 Tf 60 700 Td ({esc(fact)}) Tj ET\n"
                f"BT /F1 11 Tf 60 660 Td (This line exists only so the page has more than one sentence of text.) Tj ET\n")
        stream = text.encode()
        objs.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream")
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs)+1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    open(path, "wb").write(bytes(out))

# ---------- 2. a scanned-style PDF: one JPEG page, no text operators ----------
def pdf_scan(path):
    W, H = 1240, 1754
    img = Image.new("RGB", (W, H), (248, 246, 240))
    d = ImageDraw.Draw(img)
    try:
        f1 = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 44)
        f2 = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 30)
    except Exception:
        f1 = f2 = ImageFont.load_default()
    d.text((90, 150), "SCANNED PAGE - NO TEXT LAYER", fill=(20, 20, 20), font=f1)
    d.text((90, 260), "The Kessler valve inspection passed on 12 May 2021.", fill=(30, 30, 30), font=f2)
    d.text((90, 330), "This page is a photograph of text: extraction must report needs-OCR.", fill=(30, 30, 30), font=f2)
    img = img.rotate(0.4, expand=False, fillcolor=(248, 246, 240))
    jpg = io.BytesIO(); img.save(jpg, "JPEG", quality=70); jpg = jpg.getvalue()
    objs = []
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>")
    objs.append(b"<< /Type /XObject /Subtype /Image /Width " + str(W).encode() + b" /Height " + str(H).encode() +
                b" /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + str(len(jpg)).encode() + b" >>\nstream\n" + jpg + b"\nendstream")
    cs = b"q 595 0 0 842 0 0 cm /Im0 Do Q\n"
    objs.append(b"<< /Length " + str(len(cs)).encode() + b" >>\nstream\n" + cs + b"endstream")
    out = bytearray(b"%PDF-1.4\n"); offsets = []
    for i, o in enumerate(objs, start=1):
        offsets.append(len(out)); out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs)+1}\n".encode() + b"0000000000 65535 f \n"
    for off in offsets: out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    open(path, "wb").write(bytes(out))

# ---------- 3. DOCX ----------
def docx(path):
    paras = ["Inborn acceptance test - Word document",
             "The Novara depot holds exactly 1,742 spare bearings.",
             "The depot manager is named Ingrid Halvorsen.",
             "This paragraph pads the document so the index has more than one chunk to choose from." * 3]
    def p(t):
        t = t.replace("&", "&amp;").replace("<", "&lt;")
        return f'<w:p><w:r><w:t xml:space="preserve">{t}</w:t></w:r></w:p>'
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
           + "".join(p(x) for x in paras) + "</w:body></w:document>")
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="xml" ContentType="application/xml"/>'
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
          '</Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '</Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct); z.writestr("_rels/.rels", rels); z.writestr("word/document.xml", doc)

# ---------- 4. XLSX ----------
def xlsx(path):
    rows = [["Site", "Bearings", "Manager"],
            ["Novara", "1742", "Ingrid Halvorsen"],
            ["Halden", "903", "Tomas Ek"],
            ["Belmont", "441", "Dana Reyes"]]
    shared = []
    def sref(v):
        if v not in shared: shared.append(v)
        return shared.index(v)
    cells = []
    for r, row in enumerate(rows, start=1):
        cs = "".join(f'<c r="{chr(64+c)}{r}" t="s"><v>{sref(v)}</v></c>' for c, v in enumerate(row, start=1))
        cells.append(f'<row r="{r}">{cs}</row>')
    sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
             + "".join(cells) + "</sheetData></worksheet>")
    sst = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(shared)}" uniqueCount="{len(shared)}">'
           + "".join(f"<si><t>{v}</t></si>" for v in shared) + "</sst>")
    wb = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
          '<sheets><sheet name="Sites" sheetId="1" r:id="rId1"/></sheets></workbook>')
    wbrels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
              '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
              '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
              '</Relationships>')
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="xml" ContentType="application/xml"/>'
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
          '</Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct); z.writestr("_rels/.rels", rels)
        z.writestr("xl/workbook.xml", wb); z.writestr("xl/_rels/workbook.xml.rels", wbrels)
        z.writestr("xl/worksheets/sheet1.xml", sheet); z.writestr("xl/sharedStrings.xml", sst)

# ---------- 5. HTML ----------
def html(path):
    open(path, "w").write("""<!doctype html><html><head><title>Inborn acceptance HTML</title>
<style>body{font-family:sans-serif}</style><script>var x=1;</script></head><body>
<h1>Quarterly note</h1>
<p>The Arendal ferry carried 318,000 passengers in 2024.</p>
<p>The ferry's captain is Solveig Dahl.</p>
<!-- a comment that must not reach the index -->
<p>Padding paragraph so the extractor produces a usable chunk of prose rather than a single line.</p>
</body></html>""")

pdf_text(os.path.join(OUT, "turbine-report-3pages.pdf"))
pdf_scan(os.path.join(OUT, "scan-no-text-layer.pdf"))
docx(os.path.join(OUT, "novara-depot.docx"))
xlsx(os.path.join(OUT, "sites.xlsx"))
html(os.path.join(OUT, "quarterly-note.html"))
for f in sorted(os.listdir(OUT)):
    print(f, os.path.getsize(os.path.join(OUT, f)))
