import React from 'react';
import { Pressable, Text, View } from 'react-native';

/**
 * Catches render crashes in a shell module and offers an in-place retry.
 * AppShell remounts this boundary when tab/moreSubView changes so one
 * failed module does not stick across navigation.
 */
export default class ShellErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const name = error?.name || 'Error';
    const message = error?.message || String(error);
    console.error('[ShellErrorBoundary]', name, message, info?.componentStack);
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const detail = this.state.error?.message || String(this.state.error);
    return (
      <View style={{ padding: 24, gap: 10 }} nativeID="shell-error-boundary">
        <Text style={{ fontSize: 16, fontWeight: '400', color: '#152033' }}>
          Modulen kunne ikke vises.
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '400', color: '#8B95A6' }}>
          En uventet feil stoppet visningen. Prøv igjen, eller last siden på nytt.
        </Text>
        {typeof __DEV__ !== 'undefined' && __DEV__ ? (
          <Text
            style={{ fontSize: 12, fontWeight: '400', color: '#B42318' }}
            nativeID="shell-error-detail"
          >
            {detail}
          </Text>
        ) : null}
        <Pressable
          onPress={this.retry}
          accessibilityRole="button"
          accessibilityLabel="Prøv igjen"
          nativeID="shell-error-retry"
          style={{
            alignSelf: 'flex-start',
            backgroundColor: '#2F6BDB',
            borderRadius: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '400' }}>Prøv igjen</Text>
        </Pressable>
      </View>
    );
  }
}
