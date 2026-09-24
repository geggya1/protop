/** Bildekilder for barnetegninger-rom (RN require + web public path). */
import { Platform } from 'react-native';
import { getRoomScene } from './childDrawingMeta';

const BUNDLED = {
  'room-living.jpg': require('../../assets/child-drawings/room-living.jpg'),
  'room-bedroom.jpg': require('../../assets/child-drawings/room-bedroom.jpg'),
  'room-dining.jpg': require('../../assets/child-drawings/room-dining.jpg'),
  'room-hallway.jpg': require('../../assets/child-drawings/room-hallway.jpg'),
  'room-kids.jpg': require('../../assets/child-drawings/room-kids.jpg'),
  'room-office.jpg': require('../../assets/child-drawings/room-office.jpg'),
  'gallery-living.jpg': require('../../assets/child-drawings/gallery-living.jpg'),
  'gallery-bedroom.jpg': require('../../assets/child-drawings/gallery-bedroom.jpg'),
  'gallery-playroom.jpg': require('../../assets/child-drawings/gallery-playroom.jpg'),
  'gallery-stairs.jpg': require('../../assets/child-drawings/gallery-stairs.jpg'),
  'gallery-nook.jpg': require('../../assets/child-drawings/gallery-nook.jpg'),
};

/** Bump når rombilder / frameRect endres (web cache). */
export const ROOM_IMAGE_CACHE = '20260916e';

export function roomImageSource(sceneId) {
  const scene = getRoomScene(sceneId);
  const file = scene.file;
  if (Platform.OS === 'web') {
    return { uri: `/assets/child-drawings/${file}?v=${ROOM_IMAGE_CACHE}` };
  }
  return BUNDLED[file] || BUNDLED['room-living.jpg'];
}
