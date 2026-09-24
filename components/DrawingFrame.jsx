/**
 * Ramme rundt en barnetegning — form og farge kan endres.
 */
import React, { useMemo } from 'react';
import { View, Image, Text, StyleSheet, Platform } from 'react-native';
import { normalizeFrame, frameColorHex } from '../src/utils/childDrawingMeta';

const WEB_CLIP = {
  flower: 'polygon(50% 0%, 61% 22%, 85% 15%, 78% 38%, 100% 50%, 78% 62%, 85% 85%, 61% 78%, 50% 100%, 39% 78%, 15% 85%, 22% 62%, 0% 50%, 22% 38%, 15% 15%, 39% 22%)',
  heart: 'path("M 50 92 C 20 70, 0 45, 0 28 C 0 10, 14 0, 28 0 C 38 0, 46 6, 50 16 C 54 6, 62 0, 72 0 C 86 0, 100 10, 100 28 C 100 45, 80 70, 50 92 Z")',
  scalloped: 'polygon(0% 6%, 8% 0%, 16% 6%, 24% 0%, 32% 6%, 40% 0%, 50% 6%, 60% 0%, 68% 6%, 76% 0%, 84% 6%, 92% 0%, 100% 6%, 100% 94%, 92% 100%, 84% 94%, 76% 100%, 68% 94%, 60% 100%, 50% 94%, 40% 100%, 32% 94%, 24% 100%, 16% 94%, 8% 100%, 0% 94%)',
  wavy: 'polygon(0% 10%, 10% 0%, 20% 10%, 30% 0%, 40% 10%, 50% 0%, 60% 10%, 70% 0%, 80% 10%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 80% 90%, 70% 100%, 60% 90%, 50% 100%, 40% 90%, 30% 100%, 20% 90%, 10% 100%, 0% 90%)',
};

function shapeStyle(shape, width, imgH, color) {
  const totalH = imgH + 24;
  switch (shape) {
    case 'oval':
      return {
        borderRadius: Math.max(width, imgH),
        overflow: 'hidden',
      };
    case 'circle':
      return {
        borderRadius: 9999,
        overflow: 'hidden',
        width: width + 24,
        height: width + 24,
      };
    case 'rounded':
      return { borderRadius: 18, overflow: 'hidden' };
    case 'arch':
      return {
        borderTopLeftRadius: width * 0.55,
        borderTopRightRadius: width * 0.55,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6,
        overflow: 'hidden',
      };
    case 'polaroid':
      return { borderRadius: 4, overflow: 'hidden' };
    case 'gallery':
      return { borderRadius: 2, overflow: 'hidden' };
    case 'flower':
    case 'heart':
    case 'scalloped':
    case 'wavy':
      if (Platform.OS === 'web' && WEB_CLIP[shape]) {
        return {
          overflow: 'hidden',
          clipPath: WEB_CLIP[shape],
          WebkitClipPath: WEB_CLIP[shape],
          backgroundColor: color,
        };
      }
      return {
        borderRadius: shape === 'heart' || shape === 'flower' ? 999 : 16,
        overflow: 'hidden',
      };
    case 'bear':
      return { borderRadius: 14, overflow: 'visible' };
    default:
      return { borderRadius: 3, overflow: 'hidden' };
  }
}

export default function DrawingFrame({
  imageUrl,
  frame,
  caption,
  width = 160,
  aspect = 1,
  style,
  compact = false,
}) {
  const f = useMemo(() => normalizeFrame(frame), [frame]);
  const color = f.colorHex || frameColorHex(f.colorId);
  const imgH = Math.max(48, Math.round(width / Math.max(0.5, aspect || 1)));
  const shape = f.shape;
  const isPolaroid = shape === 'polaroid';
  const isGallery = shape === 'gallery';
  const isCircle = shape === 'circle';
  const isOval = shape === 'oval';
  const isBear = shape === 'bear';
  const borderW = isPolaroid ? 8 : (isGallery ? 5 : (compact ? 7 : 11));
  const matPad = isGallery ? 14 : (isPolaroid ? 8 : 5);
  const outerShape = shapeStyle(shape, width, imgH, color);
  const innerRadius = isOval || isCircle
    ? 9999
    : (shape === 'rounded' || shape === 'bear' ? 10 : (shape === 'arch' ? width * 0.4 : 2));

  return (
    <View style={[styles.wrap, style]}>
      {isBear ? (
        <>
          <View style={[styles.ear, styles.earL, { backgroundColor: color }]} />
          <View style={[styles.ear, styles.earR, { backgroundColor: color }]} />
        </>
      ) : null}
      <View
        style={[
          styles.outer,
          {
            backgroundColor: color,
            padding: borderW,
            paddingBottom: isPolaroid ? borderW + (compact ? 18 : 26) : borderW,
            width: isCircle ? width + borderW * 2 : undefined,
            shadowColor: '#1a1208',
            shadowOpacity: 0.28,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          },
          outerShape,
        ]}
      >
        <View
          style={{
            backgroundColor: f.matColor || '#ffffff',
            padding: matPad,
            borderRadius: Math.max(0, innerRadius - 2),
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={{ uri: imageUrl }}
            style={{
              width: isCircle ? width : width,
              height: isCircle ? width : imgH,
              borderRadius: Math.max(0, innerRadius - 6),
              backgroundColor: '#fff',
            }}
            resizeMode="cover"
          />
        </View>
        {isPolaroid && caption ? (
          <Text style={styles.polaroidCap} numberOfLines={1}>{caption}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    position: 'relative',
  },
  outer: {
    alignSelf: 'flex-start',
  },
  ear: {
    position: 'absolute',
    top: -10,
    width: 28,
    height: 28,
    borderRadius: 14,
    zIndex: 0,
  },
  earL: { left: 10 },
  earR: { right: 10 },
  polaroidCap: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 12,
    color: '#3a3228',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
});
