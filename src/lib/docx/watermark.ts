import {
  ImageRun,
  Paragraph,
  AlignmentType,
  HorizontalPositionAlign,
  VerticalPositionAlign,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  TextWrappingType,
  TextWrappingSide,
} from 'docx';
import { WATERMARK_PNG_BASE64 } from './watermark-data';

// Cached buffer — decoded once per cold start
let cachedBuffer: Buffer | null = null;
function getWatermarkBuffer(): Buffer {
  if (cachedBuffer) return cachedBuffer;
  cachedBuffer = Buffer.from(WATERMARK_PNG_BASE64, 'base64');
  return cachedBuffer;
}

/**
 * Build a paragraph containing the Richoz water-drop watermark, floating
 * behind the document content and centered on the A4 page.
 *
 * Place this paragraph inside a Header so it repeats on every page.
 */
export function buildWatermarkParagraph(): Paragraph {
  return new Paragraph({
    children: [
      new ImageRun({
        data: getWatermarkBuffer(),
        type: 'png',
        transformation: { width: 420, height: 496 },
        floating: {
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.PAGE,
            align: HorizontalPositionAlign.CENTER,
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PAGE,
            align: VerticalPositionAlign.CENTER,
          },
          wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
          behindDocument: true,
          allowOverlap: true,
        },
      }),
    ],
    alignment: AlignmentType.CENTER,
  });
}
