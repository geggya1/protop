/**
 * Ikonsettene appen bruker. Metro sender `import { Ionicons } from '@expo/vector-icons'` hit
 * (metro.config.js), så bygget ikke tar med alle de rundt 20 ikonsettene og glyfkartene deres
 * (FontAwesome 5/6, MaterialIcons, Entypo …), som hovedinngangen til pakken laster.
 * Trenger appen et nytt sett, legg det til her.
 */
export { default as Ionicons } from '@expo/vector-icons/Ionicons';
export { default as MaterialCommunityIcons } from '@expo/vector-icons/MaterialCommunityIcons';
