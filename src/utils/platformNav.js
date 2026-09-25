import { CommonActions } from '@react-navigation/native';
import { platformHomeRoute } from './groupTypes';
import { canUsePlatformType } from './platformAccess';
import { auth } from '../../firebase';

/** Reset stack to the organisation switcher. */
export function goPlatformOverview(navigation) {
  if (!navigation) return;
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'FamilyOverview' }],
    }),
  );
}

/** Open the correct shell for a group type, replacing the stack so the other shell is not left mounted. */
export function openPlatformHome(navigation, groupOrType) {
  if (!navigation) return;
  const type = typeof groupOrType === 'string'
    ? groupOrType
    : groupOrType?.type;
  const name = canUsePlatformType(type, auth.currentUser)
    ? platformHomeRoute(type)
    : 'Home';
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name }],
    }),
  );
}
