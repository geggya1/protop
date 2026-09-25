/**
 * Rom-scene der barnetegninger henger på veggen (fotomockup).
 * Photo-rom: tegningen fyller den tomme rammen i bildet (frameRect).
 * Galleri: dekorativ DrawingFrame på slot-punkt.
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ImageBackground,
} from 'react-native';
import DrawingFrame from './DrawingFrame';
import {
  normalizePlacement,
  getRoomScene,
  getFrameRect,
  coverImageBox,
  containImageBox,
  frameRectToViewStyle,
} from '../src/utils/childDrawingMeta';
import { roomImageSource } from '../src/utils/childDrawingRooms';

function MatDrawing({
  imageUrl,
  style,
  selected,
  onPress,
  accessibilityLabel,
}) {
  const body = (
    <View style={[styles.matSlot, selected && styles.matSelected]}>
      <Image
        source={{ uri: imageUrl }}
        style={styles.matImage}
        resizeMode="cover"
      />
    </View>
  );
  if (!onPress) {
    return (
      <View pointerEvents="none" style={[styles.matWrap, style]}>
        {body}
      </View>
    );
  }
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[styles.matWrap, style]}
      accessibilityLabel={accessibilityLabel}
    >
      {body}
    </TouchableOpacity>
  );
}

export default function LivingRoomWall({
  drawings = [],
  scene = 'living',
  selectedId = null,
  onSelect,
  /** Optional fixed height. Prefer square (aspectRatio 1) so the wall frame stays fully visible. */
  height = null,
  square = true,
  style,
  previewFrame = null,
  previewImageUrl = null,
  previewAspect = 1,
}) {
  const room = getRoomScene(scene);
  const bg = roomImageSource(scene);
  const frameRect = getFrameRect(scene);
  const useMat = room.kind === 'photo' && !!frameRect;
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  const onLayout = useCallback((e) => {
    const { width, height: h } = e.nativeEvent.layout;
    setLayout((prev) => (
      prev.width === width && prev.height === h ? prev : { width, height: h }
    ));
  }, []);

  const useContain = useMat && square && !height;
  const imageBox = useMemo(() => {
    if (!layout.width || !layout.height) return null;
    // Square viewport + square photo → identity mapping via cover.
    // Non-square: contain so the hanging frame is never cropped away.
    if (useContain || Math.abs(layout.width - layout.height) < 2) {
      return coverImageBox(layout.width, layout.height, 1);
    }
    return containImageBox(layout.width, layout.height, 1);
  }, [layout.width, layout.height, useContain]);

  const matStyle = useMemo(
    () => (useMat && imageBox ? frameRectToViewStyle(frameRect, imageBox) : null),
    [useMat, imageBox, frameRect],
  );

  const hung = useMemo(
    () => (drawings || [])
      .filter((d) => d && !d.deleted && (d.imageUrl || d.thumbUrl))
      .map((d) => ({
        ...d,
        placement: normalizePlacement({
          ...(d.placement || {}),
          scene: d.placement?.scene || scene,
        }),
      }))
      .filter((d) => d.placement.scene === scene),
    [drawings, scene],
  );

  // Photo mats only need the image URL; gallery preview also needs frame/placement.
  const showPreview = !!(previewImageUrl && (useMat || previewFrame));
  const bgResizeMode = (useMat && !(square && !height) && Math.abs((layout.width || 1) - (layout.height || 1)) >= 2)
    ? 'contain'
    : 'cover';

  const sizeStyle = height
    ? { height }
    : (square ? { width: '100%', aspectRatio: 1 } : { height: 320 });

  return (
    <View style={[styles.room, sizeStyle, style]} onLayout={onLayout}>
      <ImageBackground
        key={`bg-${scene}`}
        source={bg}
        style={styles.bg}
        imageStyle={styles.bgImage}
        resizeMode={bgResizeMode}
      >
        <View style={styles.scrim} pointerEvents="none" />

        {useMat && matStyle ? (
          <>
            {hung.map((d) => {
              const selected = selectedId === d.id;
              return (
                <MatDrawing
                  key={d.id}
                  imageUrl={d.thumbUrl || d.imageUrl}
                  style={[matStyle, { zIndex: selected ? 5 : 2 }]}
                  selected={selected}
                  onPress={() => onSelect?.(d)}
                  accessibilityLabel={d.title || 'Tegning'}
                />
              );
            })}
            {showPreview ? (
              <MatDrawing
                imageUrl={previewImageUrl}
                style={[matStyle, { zIndex: 6, opacity: 0.98 }]}
              />
            ) : null}
          </>
        ) : (
          <>
            {hung.map((d) => {
              const p = d.placement;
              const aspect = d.width && d.height ? d.width / d.height : 1;
              const baseW = Math.round(78 * (p.scale || 0.85));
              const selected = selectedId === d.id;
              return (
                <TouchableOpacity
                  key={d.id}
                  activeOpacity={0.9}
                  onPress={() => onSelect?.(d)}
                  style={[
                    styles.frameSlot,
                    {
                      left: `${p.x * 100}%`,
                      top: `${p.y * 100}%`,
                      transform: [{ translateX: -baseW / 2 }],
                      zIndex: selected ? 5 : 2,
                    },
                  ]}
                  accessibilityLabel={d.title || 'Tegning'}
                >
                  <View style={selected ? styles.selectedRing : null}>
                    <DrawingFrame
                      imageUrl={d.thumbUrl || d.imageUrl}
                      frame={d.frame}
                      caption={d.childName || d.title}
                      width={baseW}
                      aspect={aspect}
                      compact
                    />
                  </View>
                </TouchableOpacity>
              );
            })}

            {showPreview ? (
              <View
                pointerEvents="none"
                style={[
                  styles.frameSlot,
                  {
                    left: `${(previewFrame.placement?.x ?? room.slot.x) * 100}%`,
                    top: `${(previewFrame.placement?.y ?? room.slot.y) * 100}%`,
                    transform: [{
                      translateX: -Math.round(78 * (previewFrame.placement?.scale || room.slot.scale)) / 2,
                    }],
                    zIndex: 6,
                    opacity: 0.95,
                  },
                ]}
              >
                <DrawingFrame
                  imageUrl={previewImageUrl}
                  frame={previewFrame.frame}
                  width={Math.round(78 * (previewFrame.placement?.scale || room.slot.scale))}
                  aspect={previewAspect}
                  compact
                />
              </View>
            ) : null}
          </>
        )}

        <View style={styles.labelPill}>
          <Text style={styles.sceneLbl}>{room.label}</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

/** Miniatur for romvelger. */
export function RoomThumb({ sceneId, selected, onPress }) {
  const room = getRoomScene(sceneId);
  const bg = roomImageSource(sceneId);
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.thumb, selected && styles.thumbOn]}
      accessibilityRole="button"
      accessibilityLabel={room.label}
    >
      <Image source={bg} style={styles.thumbImg} resizeMode="cover" />
      <Text style={[styles.thumbLbl, selected && styles.thumbLblOn]} numberOfLines={1}>
        {room.label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  room: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(60,40,20,0.12)',
    backgroundColor: '#e8dfd2',
    position: 'relative',
  },
  bg: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  bgImage: {
    borderRadius: 16,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,12,6,0.04)',
  },
  frameSlot: {
    position: 'absolute',
  },
  matWrap: {
    position: 'absolute',
    overflow: 'hidden',
  },
  matSlot: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#f4f1ea',
  },
  matImage: {
    width: '100%',
    height: '100%',
  },
  matSelected: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  selectedRing: {
    borderRadius: 8,
    padding: 2,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  labelPill: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: 'rgba(30,20,12,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    zIndex: 8,
  },
  sceneLbl: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '400',
  },
  thumb: {
    width: 88,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  thumbOn: {
    borderColor: '#5C4033',
  },
  thumbImg: {
    width: '100%',
    height: 64,
  },
  thumbLbl: {
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 4,
    color: '#3a3228',
    fontWeight: '400',
  },
  thumbLblOn: {
    color: '#5C4033',
  },
});
