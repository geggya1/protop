import React from 'react';
import { Text, View } from 'react-native';

export default class ShellErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ padding: 24, gap: 8 }}>
        <Text>Modulen kunne ikke vises. Last siden på nytt.</Text>
      </View>
    );
  }
}
