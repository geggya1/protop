import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * Slipp av filer må ligge på et ekte DOM-element. React Native Web
 * videresender ikke onDragOver/onDrop fra View, så slipp ellers blir ignorert.
 */
export default function FileDropZone({
  colors,
  onFiles,
  disabled = false,
  style,
  active = false,
  nativeID = 'agreement-file-drop',
  children,
}) {
  const [over, setOver] = useState(false);
  const hot = !disabled && (over || active);

  useEffect(() => {
    if (Platform.OS !== 'web' || disabled) return undefined;
    function allow(event) {
      if (event.dataTransfer?.types && Array.from(event.dataTransfer.types).includes('Files')) {
        event.preventDefault();
      }
    }
    window.addEventListener('dragover', allow);
    window.addEventListener('drop', allow);
    return () => {
      window.removeEventListener('dragover', allow);
      window.removeEventListener('drop', allow);
    };
  }, [disabled]);

  if (Platform.OS !== 'web') {
    return <View style={style}>{children}</View>;
  }

  const flat = StyleSheet.flatten(style) || {};
  return React.createElement(
    'div',
    {
      id: nativeID,
      onDragEnter: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) setOver(true);
      },
      onDragOver: (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
        if (!disabled) setOver(true);
      },
      onDragLeave: (event) => {
        event.preventDefault();
        const next = event.relatedTarget;
        if (next && event.currentTarget.contains(next)) return;
        setOver(false);
      },
      onDrop: (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        if (disabled) return;
        const list = Array.from(event.dataTransfer?.files || []);
        if (list.length) onFiles?.(list);
      },
      style: {
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        ...flat,
        borderColor: hot ? (colors?.brand || '#1d4ed8') : flat.borderColor,
        backgroundColor: hot ? '#e8f1ff' : flat.backgroundColor,
      },
    },
    children,
  );
}
