// GET /api/qr → the QR code (SVG) that goes on the door sign.
// It points to SITE_URL (or this site's own address) with ?src=door,
// so we can count how many people actually scanned at the door.
import QRCode from "qrcode";

export async function GET(request) {
  const base = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, "");
  const target = `${base}/?src=door`;
  const svg = await QRCode.toString(target, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#213520", light: "#FFFFFF" },
  });
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" },
  });
}
