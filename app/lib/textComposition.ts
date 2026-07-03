// Layout/draw helpers are context-agnostic: they run against a browser or a
// server-side (Skia) 2D context. See serverTextComposition.ts for server usage.
type CompatibleCanvasRenderingContext2D = CanvasRenderingContext2D & { filter?: string };

export const TARGET_WIDTH = 500;
export const TARGET_HEIGHT = 750;

const TEXT_AREA_RATIO = 0.33;
const TEXT_WIDTH_RATIO = 0.9;
const TEXT_VERTICAL_PADDING_RATIO = 0.1;
const GAME_FONT_RATIO = 0.48;
const STUDIO_FONT_RATIO = 0.24;
const STUDIO_OFFSET = 6;
const GAME_STUDIO_GAP = 8;
const MIN_GAME_FONT_RATIO = 0.3;
const MAX_GAME_LINES = 6;
const GAME_LINE_HEIGHT_RATIO = 0.92;
const STUDIO_LINE_HEIGHT_RATIO = 1.05;
const NOTCH_GAP = 32;
const NOTCH_FONT_RATIO = 0.5;
const NOTCH_MIN_SIZE = 10;
const SHADOW_TEXT_BLUR = 20;
const SINGLE_WORD_BOOST = 1.12;
const SINGLE_WORD_BOOST_STEP = 0.01;

export const TEXT_STYLE = {
  letterSpacing: 1,
  shadowColor: 'rgba(0, 0, 0, 1)',
  shadowBlur: 24,
  shadowOffsetX: 0,
  shadowOffsetY: 2,
  studioOpacity: 0.8,
};

export const BLOB_STYLE = {
  opacity: 0.2,
  blur: 60,
  yOffset: 50,
};

export type TextLayout = {
  textWidth: number;
  textHeight: number;
  studioNameY: number;
  gameNameY: number;
  gameNameTopY: number;
  gameNameText: string;
  leadingNotchText: string;
  gameNameLines: string[];
  gameNameFontSize: number;
  gameNameLineSizes: number[];
  gameNameLineHeights: number[];
  gameNameTextHeight: number;
  gameNameBlockHeight: number;
  notchFontSize: number;
  notchLineHeight: number;
  notchGap: number;
  notchBaselineY: number;
  studioNameText: string;
  studioLines: string[];
  studioFontSize: number;
  studioLineHeight: number;
  groupTopY: number;
  groupBottomY: number;
};

type TextLayoutOptions = {
  width?: number;
  height?: number;
  gameName: string;
  studioName: string;
  fontFamilyGame: string;
  fontFamilyStudio: string;
};

type MeasureFn = (text: string) => number;

function measureTextWithSpacing(
  ctx: CompatibleCanvasRenderingContext2D,
  text: string,
  spacing: number
): number {
  if (!text) return 0;
  if (text.length === 1) {
    return ctx.measureText(text).width;
  }
  let width = 0;
  for (const char of text) {
    width += ctx.measureText(char).width;
  }
  width += spacing * (text.length - 1);
  return width;
}

function calculateLines(
  ctx: CompatibleCanvasRenderingContext2D,
  text: string,
  fontSize: number,
  maxLines: number,
  lineHeightRatio: number,
  textWidth: number,
  textHeight: number,
  measure: MeasureFn
) {
  const words = text.split(' ').filter(Boolean);
  const lineHeight = fontSize * lineHeightRatio;

  if (words.length <= 1) {
    const word = words[0] || '';
    const fits = measure(word) <= textWidth && lineHeight <= textHeight;
    return {
      lines: [word],
      lineHeight,
      totalHeight: lineHeight,
      fits,
    };
  }

  let bestLines: string[] = [];
  let bestFits = false;
  let bestLineCount = Number.POSITIVE_INFINITY;
  let bestMaxWidth = Number.POSITIVE_INFINITY;
  let bestVariance = Number.POSITIVE_INFINITY;
  let bestOverflow = Number.POSITIVE_INFINITY;

  const evaluate = (lines: string[]) => {
    const widths = lines.map((line) => measure(line));
    const maxWidth = Math.max(...widths);
    const totalHeight = lineHeight * lines.length;
    const fits = maxWidth <= textWidth && totalHeight <= textHeight;
    const avgWidth = widths.reduce((sum, w) => sum + w, 0) / widths.length;
    const variance = widths.reduce((sum, w) => sum + Math.abs(w - avgWidth), 0);
    const widthOverflow = Math.max(0, maxWidth - textWidth);
    const heightOverflow = Math.max(0, totalHeight - textHeight);
    const overflow = widthOverflow * 2 + heightOverflow;

    let better = false;
    if (fits && !bestFits) {
      better = true;
    } else if (fits === bestFits) {
      if (fits) {
        if (lines.length < bestLineCount) better = true;
        else if (lines.length === bestLineCount && maxWidth < bestMaxWidth) better = true;
        else if (lines.length === bestLineCount && maxWidth === bestMaxWidth && variance < bestVariance) better = true;
      } else {
        if (overflow < bestOverflow) better = true;
        else if (overflow === bestOverflow && variance < bestVariance) better = true;
      }
    }

    if (better) {
      bestFits = fits;
      bestLineCount = lines.length;
      bestMaxWidth = maxWidth;
      bestVariance = variance;
      bestOverflow = overflow;
      bestLines = lines;
    }
  };

  const enumerateSplits = (numLines: number) => {
    if (words.length < numLines) return;
    const acc: string[] = [];
    const recurse = (start: number, remaining: number) => {
      if (remaining === 1) {
        acc.push(words.slice(start).join(' '));
        evaluate([...acc]);
        acc.pop();
        return;
      }
      const lastStart = words.length - remaining + 1;
      for (let i = start + 1; i <= lastStart; i += 1) {
        acc.push(words.slice(start, i).join(' '));
        recurse(i, remaining - 1);
        acc.pop();
      }
    };
    recurse(0, numLines);
  };

  for (let n = 1; n <= maxLines; n += 1) {
    enumerateSplits(n);
  }

  const totalHeight = lineHeight * bestLines.length;
  const fits = bestLines.every((line) => measure(line) <= textWidth) && totalHeight <= textHeight;

  return { lines: bestLines, lineHeight, totalHeight, fits };
}

export function computeTextLayout(
  ctx: CompatibleCanvasRenderingContext2D,
  options: TextLayoutOptions
): TextLayout {
  const width = options.width ?? TARGET_WIDTH;
  const height = options.height ?? TARGET_HEIGHT;
  const textAreaHeight = Math.floor(height * TEXT_AREA_RATIO);
  const textWidth = Math.floor(width * TEXT_WIDTH_RATIO);
  const verticalPadding = Math.floor(textAreaHeight * TEXT_VERTICAL_PADDING_RATIO);
  const textHeight = textAreaHeight - verticalPadding * 2;

  let gameNameFontSize = Math.floor(textAreaHeight * GAME_FONT_RATIO);
  const studioFontSize = Math.floor(gameNameFontSize * STUDIO_FONT_RATIO);

  const rawGameNameText = options.gameName.trim().toUpperCase();
  const thePrefix = 'THE ';
  const livePrefix = 'LIVE ';
  const hasLeadingThe = rawGameNameText.startsWith(thePrefix) && rawGameNameText.length > thePrefix.length;
  const hasLeadingLive = rawGameNameText.startsWith(livePrefix) && rawGameNameText.length > livePrefix.length;
  const leadingNotchText = hasLeadingThe ? 'THE' : hasLeadingLive ? 'LIVE' : '';
  const leadingNotchPrefix = hasLeadingThe ? thePrefix : hasLeadingLive ? livePrefix : '';
  const gameNameText = leadingNotchPrefix
    ? rawGameNameText.slice(leadingNotchPrefix.length).trim()
    : rawGameNameText;

  const studioNameText = options.studioName.trim().toUpperCase();
  const studioNameY = height - verticalPadding - STUDIO_OFFSET;

  const studioLines: string[] = [];
  let studioLineHeight = studioFontSize * STUDIO_LINE_HEIGHT_RATIO;
  if (studioNameText) {
    ctx.font = `normal ${studioFontSize}px ${options.fontFamilyStudio}, Arial, sans-serif`;
    const words = studioNameText.split(' ').filter(Boolean);
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > textWidth && currentLine) {
        studioLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      studioLines.push(currentLine);
    }
    studioLineHeight = studioFontSize * STUDIO_LINE_HEIGHT_RATIO;
  }

  const studioBlockHeight = studioLines.length * studioLineHeight;
  const gameNameShift = -12;
  const gameNameY = studioLines.length
    ? studioNameY - studioBlockHeight - GAME_STUDIO_GAP + gameNameShift
    : studioNameY + gameNameShift;

  ctx.font = `bold ${gameNameFontSize}px ${options.fontFamilyGame}, Arial, sans-serif`;
  const measureGame = (text: string) =>
    measureTextWithSpacing(ctx, text, TEXT_STYLE.letterSpacing);

  const minFontSize = Math.floor(gameNameFontSize * MIN_GAME_FONT_RATIO);

  const computeLineMetrics = (lines: string[], fontSize: number, scales: number[]) => {
    const lineSizes = lines.map((_, index) => fontSize * scales[index]);
    const maxLineSize = lineSizes.length ? Math.max(...lineSizes) : fontSize;
    const uniformLineHeight = maxLineSize * GAME_LINE_HEIGHT_RATIO;
    const lineHeights = lines.map(() => uniformLineHeight);
    const widths = lines.map((line, index) => {
      ctx.font = `bold ${lineSizes[index]}px ${options.fontFamilyGame}, Arial, sans-serif`;
      return measureTextWithSpacing(ctx, line, TEXT_STYLE.letterSpacing);
    });
    const totalHeight = uniformLineHeight * lines.length;
    const maxWidth = widths.length ? Math.max(...widths) : 0;
    return { lineHeights, lineSizes, totalHeight, maxWidth };
  };

  const applySingleWordBoost = (lines: string[], fontSize: number) => {
    const wordCounts = lines.map((line) => line.trim().split(/\s+/).filter(Boolean).length);
    const hasSingle = wordCounts.some((count) => count === 1);
    const hasMulti = wordCounts.some((count) => count > 1);
    const shouldBoost = hasSingle && hasMulti;

    let boost = shouldBoost ? SINGLE_WORD_BOOST : 1;
    let scales = lines.map((_, index) => (wordCounts[index] === 1 && shouldBoost ? boost : 1));
    let metrics = computeLineMetrics(lines, fontSize, scales);

    while (shouldBoost && boost > 1 && (metrics.maxWidth > textWidth || metrics.totalHeight > textHeight)) {
      boost = Math.max(1, boost - SINGLE_WORD_BOOST_STEP);
      scales = lines.map((_, index) => (wordCounts[index] === 1 ? boost : 1));
      metrics = computeLineMetrics(lines, fontSize, scales);
    }

    return {
      scales,
      lineHeights: metrics.lineHeights,
      lineSizes: metrics.lineSizes,
      fits: metrics.maxWidth <= textWidth && metrics.totalHeight <= textHeight,
    };
  };

  let finalLines: string[] = [];
  let finalLineHeights: number[] = [];
  let finalLineSizes: number[] = [];

  for (let size = gameNameFontSize; size >= minFontSize; size -= 1) {
    ctx.font = `bold ${size}px ${options.fontFamilyGame}, Arial, sans-serif`;
    const result = calculateLines(
      ctx,
      gameNameText,
      size,
      MAX_GAME_LINES,
      GAME_LINE_HEIGHT_RATIO,
      textWidth,
      textHeight,
      measureGame
    );

    const boosted = applySingleWordBoost(result.lines, size);
    if (result.fits && boosted.fits) {
      gameNameFontSize = size;
      finalLines = result.lines;
      finalLineHeights = boosted.lineHeights;
      finalLineSizes = boosted.lineSizes;
      break;
    }

    if (size === minFontSize) {
      gameNameFontSize = size;
      finalLines = result.lines;
      finalLineHeights = boosted.lineHeights;
      finalLineSizes = boosted.lineSizes;
    }
  }

  const notchFontSize = Math.max(NOTCH_MIN_SIZE, Math.floor(gameNameFontSize * NOTCH_FONT_RATIO));
  const notchLineHeight = notchFontSize * GAME_LINE_HEIGHT_RATIO;
  const notchGap = leadingNotchText ? NOTCH_GAP : 0;
  const gameNameTextHeight = finalLineHeights.reduce((sum, value) => sum + value, 0);
  const gameNameBlockHeight =
    gameNameTextHeight + (leadingNotchText ? notchLineHeight + notchGap : 0);

  const gameNameTopY = gameNameY - gameNameTextHeight + (finalLineHeights[0] || 0);
  const gameNameBottomY = gameNameY;

  const studioTopY = studioLines.length
    ? studioNameY - (studioLines.length - 1) * studioLineHeight
    : gameNameTopY;
  const studioBottomY = studioLines.length ? studioNameY : gameNameBottomY;

  const firstLine = finalLines[0] || 'H';
  ctx.font = `bold ${finalLineSizes[0] || gameNameFontSize}px ${options.fontFamilyGame}, Arial, sans-serif`;
  const mainMetrics = ctx.measureText(firstLine);
  const mainAscent =
    mainMetrics.actualBoundingBoxAscent ?? (finalLineHeights[0] || 0) * 0.8;
  const mainDescent =
    mainMetrics.actualBoundingBoxDescent ?? (finalLineHeights[0] || 0) * 0.2;
  const mainTopY = gameNameTopY - mainAscent;

  let notchBaselineY = gameNameTopY;
  let notchTopY = mainTopY;
  if (leadingNotchText) {
    ctx.font = `bold ${notchFontSize}px ${options.fontFamilyGame}, Arial, sans-serif`;
    const notchMetrics = ctx.measureText(leadingNotchText);
    const notchAscent =
      notchMetrics.actualBoundingBoxAscent ?? notchLineHeight * 0.8;
    const notchDescent =
      notchMetrics.actualBoundingBoxDescent ?? notchLineHeight * 0.2;
    notchBaselineY = mainTopY + (finalLineHeights[0] || 0) * 0.15 - notchGap - notchDescent;
    notchTopY = notchBaselineY - notchAscent;
  }

  return {
    textWidth,
    textHeight,
    studioNameY,
    gameNameY,
    gameNameTopY,
    gameNameText,
    leadingNotchText,
    gameNameLines: finalLines,
    gameNameFontSize,
    gameNameLineSizes: finalLineSizes,
    gameNameLineHeights: finalLineHeights,
    gameNameTextHeight,
    gameNameBlockHeight,
    notchFontSize,
    notchLineHeight,
    notchGap,
    notchBaselineY,
    studioNameText,
    studioLines,
    studioFontSize,
    studioLineHeight,
    groupTopY: Math.min(mainTopY, studioTopY, notchTopY),
    groupBottomY: Math.max(gameNameBottomY, studioBottomY),
  };
}

function drawTextWithSpacing(
  ctx: CompatibleCanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  spacing: number
) {
  if (!text) return;
  const totalWidth = measureTextWithSpacing(ctx, text, spacing);
  const startX = centerX - totalWidth / 2;
  ctx.save();
  ctx.textAlign = 'left';
  let currentX = startX;
  for (const char of text) {
    ctx.fillText(char, currentX, y);
    currentX += ctx.measureText(char).width + spacing;
  }
  ctx.restore();
}

export function drawBlobLayer(
  ctx: CompatibleCanvasRenderingContext2D,
  layout: TextLayout,
  options?: { width?: number; height?: number; applyBlur?: boolean }
) {
  const width = options?.width ?? TARGET_WIDTH;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(0, 0, 0, ${BLOB_STYLE.opacity})`;
  if (options?.applyBlur) {
    (ctx as unknown as { filter?: string }).filter = `blur(${BLOB_STYLE.blur}px)`;
  }
  ctx.beginPath();
  ctx.ellipse(
    width / 2,
    (layout.groupTopY + layout.groupBottomY) / 2 - BLOB_STYLE.yOffset,
    layout.textWidth / 2,
    Math.max(1, layout.groupBottomY - layout.groupTopY),
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  if (options?.applyBlur) {
    (ctx as unknown as { filter?: string }).filter = 'none';
  }
  ctx.restore();
}

export function drawTextLayer(
  ctx: CompatibleCanvasRenderingContext2D,
  layout: TextLayout,
  options: { width?: number; fontFamilyGame: string; fontFamilyStudio: string }
) {
  const width = options.width ?? TARGET_WIDTH;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'white';

  const drawBlurredDuplicate = (drawText: () => void) => {
    ctx.save();
    ctx.filter = `blur(${SHADOW_TEXT_BLUR}px)`;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    drawText();
    ctx.restore();
  };

  const baseStartY = layout.gameNameTopY;
  let currentY = baseStartY;

  const notchY = layout.notchBaselineY;
  const mainStartY = currentY;

  drawBlurredDuplicate(() => {
    if (layout.leadingNotchText) {
      ctx.font = `bold ${layout.notchFontSize}px ${options.fontFamilyGame}, Arial, sans-serif`;
      drawTextWithSpacing(ctx, layout.leadingNotchText, width / 2, notchY, TEXT_STYLE.letterSpacing);
    }
    let blurY = mainStartY;
    for (let i = 0; i < layout.gameNameLines.length; i += 1) {
      const line = layout.gameNameLines[i];
      if (!line) continue;
      ctx.font = `bold ${layout.gameNameLineSizes[i]}px ${options.fontFamilyGame}, Arial, sans-serif`;
      drawTextWithSpacing(ctx, line, width / 2, blurY, TEXT_STYLE.letterSpacing);
      blurY += layout.gameNameLineHeights[i];
    }
  });

  ctx.save();

  if (layout.leadingNotchText) {
    ctx.font = `bold ${layout.notchFontSize}px ${options.fontFamilyGame}, Arial, sans-serif`;
    drawTextWithSpacing(ctx, layout.leadingNotchText, width / 2, notchY, TEXT_STYLE.letterSpacing);
  }

  let currentMainY = mainStartY;
  for (let i = 0; i < layout.gameNameLines.length; i += 1) {
    const line = layout.gameNameLines[i];
    if (!line) continue;
    ctx.font = `bold ${layout.gameNameLineSizes[i]}px ${options.fontFamilyGame}, Arial, sans-serif`;
    drawTextWithSpacing(ctx, line, width / 2, currentMainY, TEXT_STYLE.letterSpacing);
    currentMainY += layout.gameNameLineHeights[i];
  }

  if (layout.studioLines.length > 0) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = `rgba(255, 255, 255, ${TEXT_STYLE.studioOpacity})`;
    ctx.font = `normal ${layout.studioFontSize}px ${options.fontFamilyStudio}, Arial, sans-serif`;
    let studioCurrentY =
      layout.studioNameY - (layout.studioLines.length - 1) * layout.studioLineHeight;

    for (const line of layout.studioLines) {
      ctx.fillText(line, width / 2, studioCurrentY);
      studioCurrentY += layout.studioLineHeight;
    }
  }
  ctx.restore();
}

