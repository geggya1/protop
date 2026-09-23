import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { getRecipeDisplayImageUrl } from '../../src/utils/recipeImages';

/** Thumbnail with optional «egen»-merke and star rating chip. */
export default function RecipeThumb({
  recipe,
  size = 56,
  style,
  showCustomBadge = true,
  ratingAvg = 0,
}) {
  const uri = getRecipeDisplayImageUrl(recipe);
  const isCustom = !!recipe?.isCustom;
  const showStars = Number(ratingAvg) > 0;

  return (
    <View style={[{ width: size, height: size }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius: size > 80 ? 16 : 14 }]}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: size > 80 ? 16 : 14 },
          ]}
        >
          <Text style={{ fontSize: Math.round(size * 0.46) }}>{recipe?.emoji || '🍽️'}</Text>
        </View>
      )}
      {showCustomBadge && isCustom ? (
        <View style={[styles.customBadge, size < 40 && styles.customBadgeSm]} accessibilityLabel="Egen oppskrift">
          <Ionicons name="person" size={size < 40 ? 8 : 10} color="#fff" />
        </View>
      ) : null}
      {showStars ? (
        <View style={[styles.starBadge, size < 40 && styles.starBadgeSm]}>
          <Ionicons name="star" size={size < 40 ? 8 : 9} color="#f59e0b" />
          <Text style={[styles.starTxt, size < 40 && styles.starTxtSm]}>
            {Number(ratingAvg).toFixed(1)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#f1f5f9' },
  fallback: {
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customBadge: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  customBadgeSm: { width: 14, height: 14, borderRadius: 7 },
  starBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    backgroundColor: colors.card,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  starBadgeSm: { paddingHorizontal: 3 },
  starTxt: { fontSize: 9, fontWeight: '800', color: colors.ink },
  starTxtSm: { fontSize: 8 },
});
