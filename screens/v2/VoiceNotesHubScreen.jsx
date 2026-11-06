import { lazyScreen } from '../../src/ui/lazyScreen';
const NotesHubScreen = lazyScreen(() => import('./NotesHubScreen'), { name: 'NotesHubScreen' });

/** Tidligere egen modul — AI-notater ligger nå i Notater. */
export default function VoiceNotesHubScreen(props) {
  return <NotesHubScreen {...props} />;
}
