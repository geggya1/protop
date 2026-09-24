import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { PIECE_GLYPH_BLACK } from '../src/utils/chessEngine';

/**
 * ♟ (U+265F) is an emoji-capable character. Without a text presentation
 * selector it often renders as a colorful/3D emoji that ignores Text color —
 * so white pawns stay black and look unlike the other 2D pieces.
 * U+FE0E forces monochrome text glyphs that the outline/fill styling can tint.
 */
const TEXT_VS = '\uFE0E';

function pieceGlyph(type) {
  const base = PIECE_GLYPH_BLACK[type];
  return base ? `${base}${TEXT_VS}` : '';
}

/** Prefer text-style emoji on web so color/outline apply consistently. */
const textGlyphStyle =
  Platform.OS === 'web'
    ? { fontVariantEmoji: 'text' }
    : null;

/**
 * Filled unicode glyphs with a hard dark outline for white pieces.
 * Open ♔-glyphs + light fill disappear on cream squares; a CSS stroke alone
 * is still too thin on mobile, so white pieces get offset silhouette layers.
 */
export default function ChessPieceGlyph({ type, color, size, style }) {
  const glyph = pieceGlyph(type);
  if (!glyph) return null;

  if (color === 'b') {
    return (
      <Text
        style={[
          styles.piece,
          styles.black,
          textGlyphStyle,
          { fontSize: size, lineHeight: size * 1.05 },
          style,
        ]}
      >
        {glyph}
      </Text>
    );
  }

  const o = Math.max(1.75, Math.round(size * 0.055));
  const offsets = [
    [-o, 0], [o, 0], [0, -o], [0, o],
    [-o, -o], [o, -o], [-o, o], [o, o],
  ];

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      {offsets.map(([x, y], i) => (
        <Text
          key={i}
          style={[
            styles.piece,
            styles.outline,
            textGlyphStyle,
            {
              fontSize: size,
              lineHeight: size * 1.05,
              transform: [{ translateX: x }, { translateY: y }],
            },
          ]}
        >
          {glyph}
        </Text>
      ))}
      <Text
        style={[
          styles.piece,
          styles.whiteFill,
          textGlyphStyle,
          { fontSize: size, lineHeight: size * 1.05 },
        ]}
      >
        {glyph}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  piece: {
    textAlign: 'center',
  },
  black: {
    color: '#0f172a',
    zIndex: 1,
  },
  outline: {
    position: 'absolute',
    color: '#0f172a',
  },
  whiteFill: {
    color: '#ffffff',
    zIndex: 1,
  },
});
