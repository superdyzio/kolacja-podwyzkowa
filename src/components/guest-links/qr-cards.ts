import { qrMatrix, qrSvgPath, qrViewBox } from "@/lib/guest-links/qr";

// Client script of the card sheet (/o/<key>/karteczki, S-05): fills every `[data-qr="<url>"]` placeholder with the
// QR code of that URL as an inline SVG. Runs only in the organizer's browser — the server never builds QR codes
// (keeps every server request short) and never bundles `qrcode`.

const SVG_NS = "http://www.w3.org/2000/svg";

function qrSvg(text: string): SVGSVGElement {
  const matrix = qrMatrix(text);
  const viewBox = qrViewBox(matrix);
  const side = viewBox.split(" ")[2] ?? "0";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  // A white background keeps the quiet zone white even on tinted paper previews.
  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("width", side);
  background.setAttribute("height", side);
  background.setAttribute("fill", "#fff");
  const modules = document.createElementNS(SVG_NS, "path");
  modules.setAttribute("d", qrSvgPath(matrix));
  modules.setAttribute("fill", "#000");
  svg.append(background, modules);
  return svg;
}

export function fillQrCodes(root: ParentNode): void {
  for (const placeholder of root.querySelectorAll<HTMLElement>("[data-qr]")) {
    const text = placeholder.dataset.qr;
    if (!text) {
      continue;
    }
    try {
      placeholder.replaceChildren(qrSvg(text));
      placeholder.dataset.qrReady = "true";
    } catch {
      placeholder.textContent = "Nie udało się utworzyć kodu QR — użyj linku poniżej.";
    }
  }
}
