import fs from 'fs';
const png = fs.readFileSync('public/templates/water-drop-watermark.png');
const b64 = png.toString('base64');
const out = `// AUTO-GENERATED from public/templates/water-drop-watermark.png by scripts/inline-watermark.mjs
// Inlined so the watermark is bundled with the Vercel serverless function (the public/ folder is not).
// Regenerate with: node scripts/inline-watermark.mjs
export const WATERMARK_PNG_BASE64 = '${b64}';
`;
fs.writeFileSync('src/lib/docx/watermark-data.ts', out);
console.log(`Wrote ${b64.length} chars (${(png.length / 1024).toFixed(0)} KB raw)`);
