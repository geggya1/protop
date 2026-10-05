// index.js
import React from 'react';
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import { Text, View, Pressable } from 'react-native';
import App from './App';
import { bootstrapAppearance } from './src/appearance/applyAppearance';

bootstrapAppearance();

const RELOAD_FLAG = 'protop_fs_assert_reload_v1';

function isFirestoreAssertError(error) {
  const msg = String(error?.message || error || '');
  return /FIRESTORE.*INTERNAL ASSERTION FAILED|Unexpected state \(ID:/i.test(msg);
}

/** One soft recovery after a Firestore client assert — avoids sticky white-screen on Safari. */
function tryRecoverFromFirestoreAssert(error) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (!isFirestoreAssertError(error)) return false;
  try {
    if (window.sessionStorage.getItem(RELOAD_FLAG) === '1') return false;
    window.sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    return false;
  }
  try {
    window.location.reload();
  } catch {
    return false;
  }
  return true;
}

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (tryRecoverFromFirestoreAssert(event?.error || event?.message)) {
      event.preventDefault?.();
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (tryRecoverFromFirestoreAssert(event?.reason)) {
      event.preventDefault?.();
    }
  });
  // Clear the one-shot flag after a healthy boot.
  setTimeout(() => {
    try { window.sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
  }, 8000);
}

/** Catch render crashes so web users see a message instead of a blank white page. */
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    tryRecoverFromFirestoreAssert(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const firestoreAssert = isFirestoreAssertError(this.state.error);
    return (
      <View style={{ flex: 1, padding: 24, backgroundColor: '#fff', justifyContent: 'center' }}>
        <Text style={{ fontWeight: '400', fontSize: 18, marginBottom: 8, color: '#b91c1c' }}>
          Noe gikk galt
        </Text>
        <Text style={{ fontSize: 14, color: '#111827' }}>
          {firestoreAssert
            ? 'Appen kom i en midlertidig feiltilstand (database). Last siden på nytt, så ordner det seg vanligvis.'
            : String(this.state.error?.message || this.state.error)}
        </Text>
        <Text style={{ marginTop: 12, fontSize: 13, color: '#6b7280' }}>
          Prøv å laste siden på nytt. Hvis det fortsetter, tøm nettleserdata for protop.no.
        </Text>
        {Platform.OS === 'web' ? (
          <Pressable
            onPress={() => {
              try { window.location.reload(); } catch { /* ignore */ }
            }}
            style={{
              marginTop: 18,
              alignSelf: 'flex-start',
              backgroundColor: '#2563eb',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '400' }}>Last siden på nytt</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
}

function Root() {
  return (
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
}

registerRootComponent(Root);
