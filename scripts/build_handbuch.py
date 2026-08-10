"""Erzeugt aus den Markdown-Dateien in docs/ ein PDF-Handbuch.

Aufruf aus dem Wurzelverzeichnis des Repositories:

    python -m pip install reportlab
    python scripts/build_handbuch.py                 -> DevBoard-Handbuch.pdf
    python scripts/build_handbuch.py --sprint 1      -> DevBoard-Handbuch-Sprint-1.pdf

Die Sprint-Angabe erzeugt eine eigene Datei und vermerkt den Stand auf der
Titelseite. So bleiben aeltere Ausgaben daneben bestehen - man sieht, wie das
Handbuch mit dem Projekt gewachsen ist.

Ergebnis ist gitignored: Es laesst sich jederzeit aus den Markdown-Quellen neu
erzeugen und gehoert deshalb nicht ins Repository.
"""

import argparse

import re
import pathlib
import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

REPO = pathlib.Path(__file__).resolve().parent.parent

# --------------------------------------------------------------------------
# Schriften
#
# Die eingebauten PDF-Standardschriften koennen keine Pfeile und
# Kaestchen-Grafiken darstellen (die wuerden als schwarze Balken erscheinen).
# Deshalb echte TrueType-Schriften registrieren.
# --------------------------------------------------------------------------
SCHRIFT_KANDIDATEN = {
    "Text": [r"C:\Windows\Fonts\arial.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    "Text-Bold": [r"C:\Windows\Fonts\arialbd.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "Text-Italic": [r"C:\Windows\Fonts\ariali.ttf",
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"],
    "Mono": [r"C:\Windows\Fonts\consola.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
    "Mono-Bold": [r"C:\Windows\Fonts\consolab.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"],
}

for name, pfade in SCHRIFT_KANDIDATEN.items():
    for p in pfade:
        if pathlib.Path(p).exists():
            pdfmetrics.registerFont(TTFont(name, p))
            break
    else:
        raise SystemExit(
            f"Keine Schriftdatei fuer '{name}' gefunden. Gesucht in: {pfade}"
        )

pdfmetrics.registerFontFamily(
    "Text", normal="Text", bold="Text-Bold", italic="Text-Italic"
)

AKZENT = colors.HexColor("#0B6E4F")
GRAU = colors.HexColor("#666666")
CODE_BG = colors.HexColor("#F4F4F5")
LINIE = colors.HexColor("#D4D4D8")
KOPF_BG = colors.HexColor("#EFEFF1")

# --------------------------------------------------------------------------
# Stile
# --------------------------------------------------------------------------
basis = getSampleStyleSheet()

S = {
    "titel": ParagraphStyle(
        "titel", fontName="Text-Bold", fontSize=30, leading=36,
        alignment=TA_CENTER, textColor=AKZENT, spaceAfter=10,
    ),
    "untertitel": ParagraphStyle(
        "untertitel", fontName="Text", fontSize=14, leading=20,
        alignment=TA_CENTER, textColor=GRAU,
    ),
    "titelmeta": ParagraphStyle(
        "titelmeta", fontName="Text", fontSize=10, leading=16,
        alignment=TA_CENTER, textColor=GRAU,
    ),
    "h1": ParagraphStyle(
        "h1", fontName="Text-Bold", fontSize=20, leading=25,
        textColor=AKZENT, spaceBefore=0, spaceAfter=12,
    ),
    "h2": ParagraphStyle(
        "h2", fontName="Text-Bold", fontSize=14, leading=19,
        textColor=colors.HexColor("#18181B"), spaceBefore=16, spaceAfter=7,
    ),
    "h3": ParagraphStyle(
        "h3", fontName="Text-Bold", fontSize=11.5, leading=16,
        textColor=colors.HexColor("#3F3F46"), spaceBefore=12, spaceAfter=5,
    ),
    "h4": ParagraphStyle(
        "h4", fontName="Text-Bold", fontSize=10, leading=14,
        textColor=colors.HexColor("#52525B"), spaceBefore=10, spaceAfter=4,
    ),
    "text": ParagraphStyle(
        "text", fontName="Text", fontSize=9.5, leading=14.5,
        spaceAfter=7, textColor=colors.HexColor("#1F2933"),
    ),
    "liste": ParagraphStyle(
        "liste", fontName="Text", fontSize=9.5, leading=14.5,
        leftIndent=14, bulletIndent=4, spaceAfter=3,
        textColor=colors.HexColor("#1F2933"),
    ),
    "zitat": ParagraphStyle(
        "zitat", fontName="Text-Italic", fontSize=9.5, leading=14.5,
        leftIndent=12, borderPadding=(6, 6, 6, 10), spaceBefore=4, spaceAfter=8,
        textColor=colors.HexColor("#3F3F46"), backColor=colors.HexColor("#F7F7F8"),
    ),
    "code": ParagraphStyle(
        "code", fontName="Mono", fontSize=7.8, leading=10.5,
        textColor=colors.HexColor("#18181B"),
    ),
    "zelle": ParagraphStyle(
        "zelle", fontName="Text", fontSize=8.2, leading=11.5,
        textColor=colors.HexColor("#1F2933"),
    ),
    "zellekopf": ParagraphStyle(
        "zellekopf", fontName="Text-Bold", fontSize=8.2, leading=11.5,
        textColor=colors.HexColor("#18181B"),
    ),
}

TOC_STIL = [
    ParagraphStyle("toc0", fontName="Text-Bold", fontSize=10.5, leading=19,
                   textColor=AKZENT, spaceBefore=7),
    ParagraphStyle("toc1", fontName="Text", fontSize=9, leading=14,
                   leftIndent=16, textColor=colors.HexColor("#3F3F46")),
]

# --------------------------------------------------------------------------
# Inline-Formatierung
# --------------------------------------------------------------------------
ERSATZ = {"\u21d2": "\u2192"}  # ⇒ fehlt in allen verfuegbaren Schriften


def schuetzen(text: str) -> str:
    for alt, neu in ERSATZ.items():
        text = text.replace(alt, neu)
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(text: str) -> str:
    """Wandelt Markdown-Inline-Syntax in reportlab-Markup."""
    platzhalter: list[str] = []

    def parken(html: str) -> str:
        platzhalter.append(html)
        return f"\x00{len(platzhalter) - 1}\x00"

    # Inline-Code zuerst, damit darin nichts weiter interpretiert wird
    text = re.sub(
        r"`([^`]+)`",
        lambda m: parken(
            '<font face="Mono" size="8.4" backColor="#F0F0F2">'
            + schuetzen(m.group(1))
            + "</font>"
        ),
        text,
    )
    # Links
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda m: parken(
            f'<link href="{m.group(2)}" color="#0B6E4F">'
            f"<u>{schuetzen(m.group(1))}</u></link>"
        ),
        text,
    )

    text = schuetzen(text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"<i>\1</i>", text)

    for i, html in enumerate(platzhalter):
        text = text.replace(f"\x00{i}\x00", html)
    return text


def code_umbrechen(zeile: str, breite: int = 104) -> list[str]:
    if len(zeile) <= breite:
        return [zeile]
    teile, rest = [], zeile
    while len(rest) > breite:
        teile.append(rest[:breite])
        rest = rest[breite:]
    if rest:
        teile.append(rest)
    return teile


# --------------------------------------------------------------------------
# Markdown -> Flowables
# --------------------------------------------------------------------------
def tabelle_bauen(zeilen: list[str], nutzbreite: float):
    daten = []
    for i, z in enumerate(zeilen):
        if re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", z) and i == 1:
            continue
        felder = [f.strip() for f in z.strip().strip("|").split("|")]
        stil = S["zellekopf"] if i == 0 else S["zelle"]
        daten.append([Paragraph(inline(f), stil) for f in felder])

    if not daten:
        return None

    spalten = max(len(r) for r in daten)
    for r in daten:
        while len(r) < spalten:
            r.append(Paragraph("", S["zelle"]))

    t = Table(daten, colWidths=[nutzbreite / spalten] * spalten, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), KOPF_BG),
                ("GRID", (0, 0), (-1, -1), 0.4, LINIE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return t


def markdown_zu_flowables(md: str, nutzbreite: float, kapitel: str) -> list:
    zeilen = md.split("\n")
    out: list = []
    i = 0
    erste_h1_gesehen = False

    while i < len(zeilen):
        z = zeilen[i]

        # Codeblock
        if z.lstrip().startswith("```"):
            i += 1
            code: list[str] = []
            while i < len(zeilen) and not zeilen[i].lstrip().startswith("```"):
                code.extend(code_umbrechen(zeilen[i].rstrip()))
                i += 1
            i += 1
            inhalt = "<br/>".join(
                schuetzen(c).replace(" ", "&nbsp;") or "&nbsp;" for c in code
            )
            block = Table(
                [[Paragraph(inhalt, S["code"])]],
                colWidths=[nutzbreite],
            )
            block.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
                        ("BOX", (0, 0), (-1, -1), 0.4, LINIE),
                        ("LEFTPADDING", (0, 0), (-1, -1), 7),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                        ("TOPPADDING", (0, 0), (-1, -1), 6),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )
            out.append(Spacer(1, 3))
            out.append(block)
            out.append(Spacer(1, 8))
            continue

        # Tabelle
        if "|" in z and z.strip().startswith("|"):
            block: list[str] = []
            while i < len(zeilen) and zeilen[i].strip().startswith("|"):
                block.append(zeilen[i])
                i += 1
            t = tabelle_bauen(block, nutzbreite)
            if t is not None:
                out.append(Spacer(1, 3))
                out.append(t)
                out.append(Spacer(1, 9))
            continue

        # Trennlinie
        if re.match(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$", z):
            out.append(Spacer(1, 5))
            out.append(
                Table([[""]], colWidths=[nutzbreite], rowHeights=[0.6],
                      style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), LINIE)]))
            )
            out.append(Spacer(1, 9))
            i += 1
            continue

        # Ueberschriften
        m = re.match(r"^(#{1,6})\s+(.*)$", z)
        if m:
            tiefe, txt = len(m.group(1)), m.group(2).strip()
            if tiefe == 1:
                if not erste_h1_gesehen:
                    erste_h1_gesehen = True
                    p = Paragraph(inline(txt), S["h1"])
                    p.toc_eintrag = (0, kapitel)
                    out.append(p)
                else:
                    out.append(Paragraph(inline(txt), S["h2"]))
            elif tiefe == 2:
                p = Paragraph(inline(txt), S["h2"])
                p.toc_eintrag = (1, re.sub(r"[*`]", "", txt))
                out.append(p)
            elif tiefe == 3:
                out.append(Paragraph(inline(txt), S["h3"]))
            else:
                out.append(Paragraph(inline(txt), S["h4"]))
            i += 1
            continue

        # Zitat
        if z.lstrip().startswith(">"):
            block = []
            while i < len(zeilen) and zeilen[i].lstrip().startswith(">"):
                block.append(zeilen[i].lstrip()[1:].strip())
                i += 1
            out.append(Paragraph(inline(" ".join(block).strip()), S["zitat"]))
            continue

        # Liste
        m = re.match(r"^(\s*)([-*+]|\d+\.)\s+(.*)$", z)
        if m:
            einzug, marke, txt = m.group(1), m.group(2), m.group(3)
            i += 1
            # Fortsetzungszeilen einsammeln
            while (
                i < len(zeilen)
                and zeilen[i].strip()
                and not re.match(r"^(\s*)([-*+]|\d+\.)\s+", zeilen[i])
                and not re.match(r"^#{1,6}\s", zeilen[i])
                and not zeilen[i].lstrip().startswith("```")
                and not zeilen[i].strip().startswith("|")
            ):
                txt += " " + zeilen[i].strip()
                i += 1

            haken = ""
            mh = re.match(r"^\[([ xX])\]\s*(.*)$", txt)
            if mh:
                haken = "[x]" if mh.group(1).lower() == "x" else "[  ]"
                txt = mh.group(2)

            stil = ParagraphStyle(
                f"liste{len(einzug)}",
                parent=S["liste"],
                leftIndent=14 + len(einzug) * 6,
                bulletIndent=4 + len(einzug) * 6,
            )
            zeichen = haken if haken else ("\u2022" if marke in "-*+" else marke)
            out.append(Paragraph(inline(txt), stil, bulletText=zeichen))
            continue

        # Leerzeile
        if not z.strip():
            i += 1
            continue

        # Absatz
        absatz = [z.strip()]
        i += 1
        while (
            i < len(zeilen)
            and zeilen[i].strip()
            and not re.match(r"^#{1,6}\s", zeilen[i])
            and not zeilen[i].lstrip().startswith("```")
            and not zeilen[i].lstrip().startswith(">")
            and not zeilen[i].strip().startswith("|")
            and not re.match(r"^(\s*)([-*+]|\d+\.)\s+", zeilen[i])
            and not re.match(r"^\s*(-{3,}|\*{3,}|_{3,})\s*$", zeilen[i])
        ):
            absatz.append(zeilen[i].strip())
            i += 1
        out.append(Paragraph(inline(" ".join(absatz)), S["text"]))

    return out


# --------------------------------------------------------------------------
# Dokumentvorlage
# --------------------------------------------------------------------------
class Handbuch(BaseDocTemplate):
    def __init__(self, pfad, **kw):
        super().__init__(pfad, pagesize=A4, **kw)
        rand_x, rand_o, rand_u = 2.0 * cm, 2.0 * cm, 2.0 * cm
        rahmen = Frame(
            rand_x, rand_u,
            A4[0] - 2 * rand_x, A4[1] - rand_o - rand_u,
            id="haupt", leftPadding=0, rightPadding=0,
            topPadding=0, bottomPadding=0,
        )
        self.addPageTemplates(
            [
                PageTemplate(id="titel", frames=[rahmen]),
                PageTemplate(id="inhalt", frames=[rahmen], onPage=self.fusszeile),
            ]
        )

    def fusszeile(self, canvas, doc):
        canvas.saveState()
        canvas.setFont("Text", 7.5)
        canvas.setFillColor(GRAU)
        canvas.drawString(2 * cm, 1.2 * cm, "DevBoard - Entwicklerhandbuch")
        canvas.drawRightString(A4[0] - 2 * cm, 1.2 * cm, str(doc.page))
        canvas.setStrokeColor(LINIE)
        canvas.setLineWidth(0.4)
        canvas.line(2 * cm, 1.55 * cm, A4[0] - 2 * cm, 1.55 * cm)
        canvas.restoreState()

    def afterFlowable(self, flowable):
        eintrag = getattr(flowable, "toc_eintrag", None)
        if eintrag is not None:
            self.notify("TOCEntry", (eintrag[0], eintrag[1], self.page))


# --------------------------------------------------------------------------
# Zusammenbau
# --------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sprint",
        type=int,
        default=None,
        help="Sprintnummer fuer Dateiname und Titelseite (z. B. 1)",
    )
    argumente = parser.parse_args()

    docs_pfad = REPO / "docs"
    dateien = [REPO / "README.md"] + sorted(docs_pfad.glob("*.md"))

    if argumente.sprint is None:
        ziel = REPO / "DevBoard-Handbuch.pdf"
        stand = None
    else:
        ziel = REPO / f"DevBoard-Handbuch-Sprint-{argumente.sprint}.pdf"
        stand = f"Stand: nach Sprint {argumente.sprint}"

    doc = Handbuch(str(ziel), title="DevBoard - Entwicklerhandbuch", author="Murat Yaglioglu")
    nutzbreite = A4[0] - 4 * cm

    story: list = []

    # --- Titelseite ---
    story.append(Spacer(1, 6 * cm))
    story.append(Paragraph("DevBoard", S["titel"]))
    story.append(Paragraph("Entwicklerhandbuch", S["untertitel"]))
    if stand:
        story.append(Spacer(1, 0.3 * cm))
        story.append(Paragraph(stand, S["untertitel"]))
    story.append(Spacer(1, 1.2 * cm))
    story.append(
        Table([[""]], colWidths=[6 * cm], rowHeights=[1.2],
              style=TableStyle([
                  ("BACKGROUND", (0, 0), (-1, -1), AKZENT),
                  ("ALIGN", (0, 0), (-1, -1), "CENTER"),
              ]), hAlign="CENTER")
    )
    story.append(Spacer(1, 1.2 * cm))
    story.append(
        Paragraph(
            "Architektur, Datenbank, API, Security, DevOps und Lernnotizen<br/>"
            "eines Fullstack-Projekts mit Next.js, NestJS und PostgreSQL",
            S["titelmeta"],
        )
    )
    story.append(Spacer(1, 2.5 * cm))
    heute = datetime.date.today().strftime("%d.%m.%Y")
    story.append(Paragraph(f"Murat Yaglioglu<br/>Stand: {heute}", S["titelmeta"]))
    story.append(Spacer(1, 0.6 * cm))
    story.append(
        Paragraph("github.com/MYaglioglu/devboard", S["titelmeta"])
    )
    story.append(PageBreak())

    # --- Inhaltsverzeichnis ---
    story.append(Paragraph("Inhalt", S["h1"]))
    toc = TableOfContents()
    toc.levelStyles = TOC_STIL
    toc.dotsMinLevel = 0
    story.append(toc)
    story.append(PageBreak())

    # --- Kapitel ---
    for nr, datei in enumerate(dateien):
        md = datei.read_text(encoding="utf-8")

        # Kapitelname aus der ersten H1-Ueberschrift der Datei, nicht aus dem
        # Dateinamen - sonst stehen englische Dateinamen ueber deutschen Kapiteln.
        m = re.search(r"^#\s+(.+)$", md, flags=re.MULTILINE)
        ueberschrift = m.group(1).strip() if m else datei.stem
        nummer = re.match(r"^(\d+)_", datei.stem)
        if datei.stem == "README":
            titel = "Überblick (README)"
        elif nummer:
            titel = f"{nummer.group(1)} · {ueberschrift}"
        else:
            titel = ueberschrift

        story.extend(markdown_zu_flowables(md, nutzbreite, titel))
        if nr < len(dateien) - 1:
            story.append(PageBreak())

    doc.multiBuild(story)
    print(f"Erzeugt: {ziel}  ({ziel.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
