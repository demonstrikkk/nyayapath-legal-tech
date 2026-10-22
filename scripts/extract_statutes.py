import os, sys
from pypdf import PdfReader

TEMP = os.environ["TEMP"]
out_dir = os.path.join(TEMP, "JollyLLM_statutes")
os.makedirs(out_dir, exist_ok=True)

for name in sys.argv[1:]:
    src = os.path.join(TEMP, name + ".pdf")
    r = PdfReader(src)
    text = "\n".join((p.extract_text() or "") for p in r.pages)
    dst = os.path.join(out_dir, name + ".txt")
    with open(dst, "w", encoding="utf-8") as f:
        f.write(text)
    print(name, "pages=", len(r.pages), "chars=", len(text), "->", dst)